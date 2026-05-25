/**
 * session/sessionManager.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Core multi-tenant Baileys session manager.
 *
 * Responsibilities:
 *  - Maintain an in-memory registry of active Baileys sockets keyed by userId
 *  - Persist auth state per-user under `config.sessionsDir/<userId>/`
 *  - Emit QR codes (as Base64 PNG data URIs) to callers
 *  - Forward valid incoming messages to the Fastify webhook
 *  - Recover existing sessions on gateway startup (no logout on restart)
 *  - Gracefully destroy sockets on SIGTERM/SIGINT
 */

import {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  isJidBroadcast,
  isJidGroup,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import QRCode from 'qrcode';
import fs from 'fs';
import path from 'path';

import { config } from '../config/index.js';
import { silentLogger, logger } from '../utils/logger.js';
import { sendToFastifyWebhook } from '../utils/webhookClient.js';

// ─── In-memory session registry ──────────────────────────────────────────────
// Map<userId, { socket: WASocket, qrResolvers: Function[], status: string }>
const sessions = new Map();

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Returns the filesystem path for a user's Baileys auth state directory.
 * @param {string} userId
 */
function sessionDir(userId) {
  return path.join(config.sessionsDir, userId);
}

/**
 * Ensures the sessions root directory exists.
 */
function ensureSessionsRoot() {
  if (!fs.existsSync(config.sessionsDir)) {
    fs.mkdirSync(config.sessionsDir, { recursive: true });
    logger.info({ dir: config.sessionsDir }, '[SessionManager] Created sessions root directory');
  }
}

/**
 * Converts a raw QR string from Baileys into a Base64 PNG data URI.
 * @param {string} qrString
 * @returns {Promise<string>} data:image/png;base64,...
 */
async function qrToBase64(qrString) {
  return QRCode.toDataURL(qrString, { errorCorrectionLevel: 'M', margin: 2 });
}

// ─── Core session lifecycle ───────────────────────────────────────────────────

/**
 * Creates (or re-creates) a Baileys socket for the given userId.
 *
 * @param {string} userId
 * @param {{ onQr?: (base64: string) => void }} [opts]
 * @returns {Promise<void>}
 */
export async function createSession(userId, opts = {}) {
  const dir = sessionDir(userId);
  fs.mkdirSync(dir, { recursive: true });

  // If a socket already exists and is open, destroy it first
  if (sessions.has(userId)) {
    await destroySession(userId, false);
  }

  logger.info({ userId }, '[SessionManager] Initialising session');

  const { state, saveCreds } = await useMultiFileAuthState(dir);
  const { version } = await fetchLatestBaileysVersion();

  const socket = makeWASocket({
    version,
    auth: state,
    logger: silentLogger, // suppress ALL Baileys internal logs
    printQRInTerminal: false, // we handle QR ourselves
    markOnlineOnConnect: false,
    generateHighQualityLinkPreview: false,
    connectTimeoutMs: 30_000,
    defaultQueryTimeoutMs: 30_000,
  });

  // Store session metadata
  sessions.set(userId, {
    socket,
    status: 'connecting', // 'connecting' | 'qr' | 'open' | 'closed'
    qrBase64: null,
  });

  // ── Event: credentials updated ────────────────────────────────────────────
  socket.ev.on('creds.update', saveCreds);

  // ── Event: connection state changes ──────────────────────────────────────
  socket.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;
    const session = sessions.get(userId);
    if (!session) return;

    // New QR code received
    if (qr) {
      try {
        const base64 = await qrToBase64(qr);
        session.status = 'qr';
        session.qrBase64 = base64;
        logger.info({ userId }, '[SessionManager] QR code generated');

        // Call the optional onQr callback so the route handler can respond
        opts.onQr?.(base64);
      } catch (err) {
        logger.error({ userId, err: err.message }, '[SessionManager] Failed to generate QR');
      }
    }

    if (connection === 'open') {
      session.status = 'open';
      session.qrBase64 = null; // QR is no longer relevant
      logger.info({ userId }, '[SessionManager] Session connected (OPEN)');
    }

    if (connection === 'close') {
      session.status = 'closed';
      const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
      const loggedOut = reason === DisconnectReason.loggedOut;

      logger.warn({ userId, reason, loggedOut }, '[SessionManager] Connection closed');

      if (loggedOut) {
        // User explicitly logged out from their phone — purge local state
        logger.warn({ userId }, '[SessionManager] Logged out — removing session state');
        sessions.delete(userId);
        fs.rmSync(sessionDir(userId), { recursive: true, force: true });
      } else {
        // Transient disconnect (network, server restart, etc.) — auto-reconnect
        logger.info({ userId }, '[SessionManager] Transient disconnect — reconnecting in 3s');
        setTimeout(() => createSession(userId, opts), 3_000);
      }
    }
  });

  // ── Event: incoming messages ──────────────────────────────────────────────
  socket.ev.on('messages.upsert', async ({ messages, type }) => {
    // Only process 'notify' events (real incoming messages, not history sync)
    if (type !== 'notify') return;

    for (const msg of messages) {
      // ── State guards ────────────────────────────────────────────────────
      // 1. Skip messages sent by this bot itself
      if (msg.key.fromMe) continue;

      // 2. Skip group chats
      const remoteJid = msg.key.remoteJid ?? '';
      if (isJidGroup(remoteJid)) continue;

      // 3. Skip broadcast/status notifications
      if (isJidBroadcast(remoteJid)) continue;

      // 4. Skip non-text or empty messages
      const text =
        msg.message?.conversation ??
        msg.message?.extendedTextMessage?.text ??
        '';

      if (!text.trim()) continue;

      // Clean up sender: strip @s.whatsapp.net suffix
      const sender = remoteJid.replace('@s.whatsapp.net', '');

      logger.info({ userId, sender, preview: text.slice(0, 40) }, '[SessionManager] Incoming message');

      // Forward to Fastify webhook (non-blocking, retried internally)
      await sendToFastifyWebhook({ sender, message: text, userId });
    }
  });
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Starts a new session or returns the current QR/status.
 * Resolves with the current Base64 QR (if pending) or null (if already open).
 *
 * @param {string} userId
 * @returns {Promise<{ status: string, qrBase64: string | null }>}
 */
export async function startSession(userId) {
  // If session already exists and is open, nothing to do
  const existing = sessions.get(userId);
  if (existing?.status === 'open') {
    return { status: 'open', qrBase64: null };
  }

  // If we are mid-connection and already have a QR, return it immediately
  if (existing?.status === 'qr' && existing.qrBase64) {
    return { status: 'qr', qrBase64: existing.qrBase64 };
  }

  // Otherwise, create a fresh session and wait for the first QR
  return new Promise((resolve) => {
    createSession(userId, {
      onQr: (base64) => {
        // Only resolve on the first QR emission
        resolve({ status: 'qr', qrBase64: base64 });
      },
    });

    // Safety timeout — resolve without QR if Baileys takes too long
    setTimeout(() => {
      const s = sessions.get(userId);
      if (s?.status === 'open') {
        resolve({ status: 'open', qrBase64: null });
      } else {
        resolve({ status: s?.status ?? 'connecting', qrBase64: s?.qrBase64 ?? null });
      }
    }, 25_000);
  });
}

/**
 * Returns live status of a session.
 * @param {string} userId
 * @returns {{ status: string, qrBase64: string | null } | null}
 */
export function getSessionStatus(userId) {
  const s = sessions.get(userId);
  if (!s) return null;
  return { status: s.status, qrBase64: s.qrBase64 };
}

/**
 * Gracefully closes a Baileys socket.
 * @param {string} userId
 * @param {boolean} [removeFromMap=true]
 */
export async function destroySession(userId, removeFromMap = true) {
  const session = sessions.get(userId);
  if (!session) return;

  try {
    await session.socket.logout();
  } catch {
    // socket.end() is the nuclear option if logout fails
    session.socket.end(undefined);
  } finally {
    if (removeFromMap) sessions.delete(userId);
    logger.info({ userId }, '[SessionManager] Session destroyed');
  }
}

/**
 * Sends a text message from the authenticated session to a recipient JID.
 * @param {string} userId
 * @param {string} recipientPhone  - e.g. "628123456789"
 * @param {string} text
 */
export async function sendMessage(userId, recipientPhone, text) {
  const session = sessions.get(userId);
  if (!session || session.status !== 'open') {
    throw new Error(`Session for userId '${userId}' is not connected.`);
  }
  const jid = recipientPhone.includes('@') ? recipientPhone : `${recipientPhone}@s.whatsapp.net`;
  await session.socket.sendMessage(jid, { text });
  logger.info({ userId, recipient: recipientPhone }, '[SessionManager] Message sent');
}

/**
 * Sends a "typing..." presence indicator to a recipient, then waits for a
 * natural-feeling delay before the caller sends the actual message.
 *
 * ⚠️  Baileys REQUIRES presenceSubscribe(jid) to be called first — without it,
 *     sendPresenceUpdate is silently ignored by the WA server.
 *
 * Delay is capped at 4 000 ms so long replies don't feel awkward.
 *
 * @param {string} userId
 * @param {string} recipientPhone  - e.g. "628123456789"
 * @param {number} [durationMs=2000] - how long to show "composing"
 */
export async function sendTypingIndicator(userId, recipientPhone, durationMs = 2_000) {
  const session = sessions.get(userId);
  if (!session || session.status !== 'open') return; // fail-safe: skip if disconnected

  const jid = recipientPhone.includes('@')
    ? recipientPhone
    : `${recipientPhone}@s.whatsapp.net`;

  // Clamp between 500 ms and 4 000 ms for a realistic feel
  const clampedDuration = Math.min(Math.max(durationMs, 500), 4_000);

  try {
    // Step 1: Subscribe to the contact's presence channel.
    // This is MANDATORY — Baileys silently drops sendPresenceUpdate
    // if the presence channel hasn't been opened first.
    await session.socket.presenceSubscribe(jid);

    // Step 2: Give WA server ~300ms to register the subscription
    await new Promise((resolve) => setTimeout(resolve, 300));

    // Step 3: Send "composing" (typing...) indicator
    await session.socket.sendPresenceUpdate('composing', jid);
    logger.info({ userId, recipient: recipientPhone, durationMs: clampedDuration }, '[SessionManager] Typing indicator started');

    // Step 4: Hold for the natural typing duration
    await new Promise((resolve) => setTimeout(resolve, clampedDuration));

    // Step 5: Clear the typing indicator
    await session.socket.sendPresenceUpdate('paused', jid);
    logger.info({ userId, recipient: recipientPhone }, '[SessionManager] Typing indicator stopped');
  } catch (err) {
    // Non-critical — do NOT let a presence failure block the actual reply
    logger.warn({ userId, err: err.message }, '[SessionManager] Typing indicator failed (non-fatal)');
  }
}

/**
 * Restore all existing sessions from disk on gateway startup.
 * This prevents users from being logged out after a VPS reboot.
 */
export async function restoreAllSessions() {
  ensureSessionsRoot();
  let entries;
  try {
    entries = fs.readdirSync(config.sessionsDir, { withFileTypes: true });
  } catch {
    return;
  }

  const userIds = entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name);

  if (userIds.length === 0) {
    logger.info('[SessionManager] No existing sessions to restore');
    return;
  }

  logger.info({ count: userIds.length }, '[SessionManager] Restoring existing sessions');

  for (const userId of userIds) {
    // Check if creds.json exists (i.e. previously authenticated)
    const credsPath = path.join(sessionDir(userId), 'creds.json');
    if (!fs.existsSync(credsPath)) continue;

    // Restore silently — no QR callback needed (user already logged in)
    createSession(userId).catch((err) =>
      logger.error({ userId, err: err.message }, '[SessionManager] Failed to restore session')
    );
  }
}

/**
 * Gracefully destroys ALL active sessions. Called on SIGTERM/SIGINT.
 */
export async function destroyAllSessions() {
  const userIds = [...sessions.keys()];
  logger.info({ count: userIds.length }, '[SessionManager] Destroying all sessions (graceful shutdown)');
  await Promise.allSettled(userIds.map((id) => destroySession(id, true)));
}
