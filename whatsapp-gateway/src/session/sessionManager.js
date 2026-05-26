/**
 * session/sessionManager.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Core multi-tenant, multi-number Baileys session manager.
 *
 * Responsibilities:
 *  - Maintain an in-memory registry keyed by `${userId}:${phoneLabel}`
 *  - Support multiple WhatsApp numbers per org (multi-instance per tenant)
 *  - Persist auth state under `config.sessionsDir/<userId>/<phoneLabel>/`
 *  - Emit QR codes (as Base64 PNG data URIs) to callers
 *  - Forward valid incoming messages to the Fastify webhook (with phoneLabel)
 *  - Recover all sessions on gateway startup (no logout on restart)
 *  - Gracefully destroy all sockets on SIGTERM/SIGINT
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
import { sendToFastifyWebhook, pushSessionStatus } from '../utils/webhookClient.js';

// ─── In-memory session registry ──────────────────────────────────────────────
// Map<`${userId}:${phoneLabel}`, SessionEntry>
// SessionEntry = { userId, phoneLabel, socket, status, qrBase64, phoneNumber }
const sessions = new Map();

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Builds the composite session map key.
 * @param {string} userId
 * @param {string} phoneLabel
 * @returns {string}
 */
function buildKey(userId, phoneLabel) {
  return `${userId}:${phoneLabel}`;
}

/**
 * Returns the filesystem path for a session's Baileys auth state directory.
 * Structure: <sessionsDir>/<userId>/<phoneLabel>/
 * @param {string} userId
 * @param {string} phoneLabel
 * @returns {string}
 */
function sessionDir(userId, phoneLabel) {
  return path.join(config.sessionsDir, userId, phoneLabel);
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
 * Creates (or re-creates) a Baileys socket for a given userId + phoneLabel pair.
 *
 * @param {string} userId
 * @param {string} [phoneLabel='default']  - Human label, e.g. 'sales', 'support', 'default'
 * @param {{ onQr?: (base64: string) => void }} [opts]
 * @returns {Promise<void>}
 */
export async function createSession(userId, phoneLabel = 'default', opts = {}) {
  const key = buildKey(userId, phoneLabel);
  const dir = sessionDir(userId, phoneLabel);
  fs.mkdirSync(dir, { recursive: true });

  // If a socket already exists, destroy it cleanly before re-creating
  if (sessions.has(key)) {
    await destroySession(userId, phoneLabel, false);
  }

  logger.info({ userId, phoneLabel, key }, '[SessionManager] Initialising session');

  const { state, saveCreds } = await useMultiFileAuthState(dir);
  const { version } = await fetchLatestBaileysVersion();

  const socket = makeWASocket({
    version,
    auth: state,
    logger: silentLogger,           // suppress ALL Baileys internal logs
    printQRInTerminal: false,        // we handle QR ourselves
    markOnlineOnConnect: false,
    generateHighQualityLinkPreview: false,
    connectTimeoutMs: 30_000,
    defaultQueryTimeoutMs: 30_000,
  });

  // Store session metadata
  sessions.set(key, {
    userId,
    phoneLabel,
    socket,
    status: 'connecting',  // 'connecting' | 'qr' | 'open' | 'closed'
    qrBase64: null,
    phoneNumber: null,     // resolved once the socket successfully connects
  });

  // ── Event: credentials updated ────────────────────────────────────────────
  socket.ev.on('creds.update', saveCreds);

  // ── Event: connection state changes ──────────────────────────────────────
  socket.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;
    const session = sessions.get(key);
    if (!session) return;

    // New QR code received
    if (qr) {
      try {
        const base64 = await qrToBase64(qr);
        session.status = 'qr';
        session.qrBase64 = base64;
        logger.info({ userId, phoneLabel }, '[SessionManager] QR code generated');

        // Invoke the optional onQr callback so the HTTP handler can respond
        opts.onQr?.(base64);
      } catch (err) {
        logger.error({ userId, phoneLabel, err: err.message }, '[SessionManager] Failed to generate QR');
      }
    }

    if (connection === 'open') {
      session.status = 'open';
      session.qrBase64 = null;

      // Resolve the actual connected phone number from the Baileys socket user object
      session.phoneNumber = socket.user?.id?.split(':')[0] ?? null;
      logger.info({ userId, phoneLabel, phoneNumber: session.phoneNumber }, '[SessionManager] Session connected (OPEN)');

      // Notify the Fastify server so whatsapp_sessions.status becomes 'CONNECTED'
      pushSessionStatus({ userId, phoneLabel, botNumber: session.phoneNumber, status: 'CONNECTED' });
    }

    if (connection === 'close') {
      session.status = 'closed';
      const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
      const loggedOut = reason === DisconnectReason.loggedOut;

      logger.warn({ userId, phoneLabel, reason, loggedOut }, '[SessionManager] Connection closed');

      if (loggedOut) {
        // User explicitly logged out — notify server, then purge local state
        pushSessionStatus({ userId, phoneLabel, botNumber: session.phoneNumber, status: 'DISCONNECTED' });
        logger.warn({ userId, phoneLabel }, '[SessionManager] Logged out — removing session state');
        sessions.delete(key);
        fs.rmSync(sessionDir(userId, phoneLabel), { recursive: true, force: true });
      } else {
        // Transient disconnect — notify server then auto-reconnect
        pushSessionStatus({ userId, phoneLabel, botNumber: session.phoneNumber, status: 'DISCONNECTED' });
        logger.info({ userId, phoneLabel }, '[SessionManager] Transient disconnect — reconnecting in 3s');
        setTimeout(() => createSession(userId, phoneLabel, opts), 3_000);
      }
    }
  });

  // ── Event: incoming messages ──────────────────────────────────────────────
  socket.ev.on('messages.upsert', async ({ messages, type }) => {
    // Only process 'notify' type (real-time incoming messages, not history sync)
    if (type !== 'notify') return;

    for (const msg of messages) {
      // ── Guards — skip messages we should not process ─────────────────────
      // 1. Skip messages sent by this bot itself (prevents echo/loop)
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

      // botNumber is the actual WhatsApp phone number of this bot instance.
      // The Fastify server uses it to look up the owning tenant in whatsapp_sessions,
      // enabling multiple bot numbers to share the same org knowledge base.
      const botNumber = session.phoneNumber ?? null;

      logger.info({ userId, phoneLabel, botNumber, sender, preview: text.slice(0, 40) }, '[SessionManager] Incoming message');

      // Forward to Fastify webhook — include both phoneLabel and botNumber.
      // botNumber lets the server resolve orgId via: SELECT org_id FROM whatsapp_sessions WHERE phone_number = botNumber
      await sendToFastifyWebhook({ sender, message: text, userId, phoneLabel, botNumber });
    }
  });
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Starts a new session or returns the current QR/status for a given number slot.
 *
 * @param {string} userId
 * @param {string} [phoneLabel='default']
 * @returns {Promise<{ status: string, qrBase64: string | null, phoneLabel: string }>}
 */
export async function startSession(userId, phoneLabel = 'default') {
  const key = buildKey(userId, phoneLabel);
  const existing = sessions.get(key);

  if (existing?.status === 'open') {
    return { status: 'open', qrBase64: null, phoneLabel };
  }

  if (existing?.status === 'qr' && existing.qrBase64) {
    return { status: 'qr', qrBase64: existing.qrBase64, phoneLabel };
  }

  // Otherwise, create a fresh session and wait for the first QR
  return new Promise((resolve) => {
    createSession(userId, phoneLabel, {
      onQr: (base64) => {
        resolve({ status: 'qr', qrBase64: base64, phoneLabel });
      },
    });

    // Safety timeout — resolve without QR if Baileys takes too long
    setTimeout(() => {
      const s = sessions.get(key);
      if (s?.status === 'open') {
        resolve({ status: 'open', qrBase64: null, phoneLabel });
      } else {
        resolve({ status: s?.status ?? 'connecting', qrBase64: s?.qrBase64 ?? null, phoneLabel });
      }
    }, 25_000);
  });
}

/**
 * Returns live status of a single session.
 *
 * @param {string} userId
 * @param {string} [phoneLabel='default']
 * @returns {{ status: string, qrBase64: string | null, phoneLabel: string, phoneNumber: string | null } | null}
 */
export function getSessionStatus(userId, phoneLabel = 'default') {
  const s = sessions.get(buildKey(userId, phoneLabel));
  if (!s) return null;
  return {
    status: s.status,
    qrBase64: s.qrBase64,
    phoneLabel: s.phoneLabel,
    phoneNumber: s.phoneNumber ?? null,
  };
}

/**
 * Lists all active sessions belonging to a specific userId (org).
 * Useful for the dashboard to show all connected WA numbers.
 *
 * @param {string} userId
 * @returns {Array<{ phoneLabel: string, status: string, phoneNumber: string | null }>}
 */
export function listSessions(userId) {
  const result = [];
  for (const [, session] of sessions.entries()) {
    if (session.userId === userId) {
      result.push({
        phoneLabel: session.phoneLabel,
        status: session.status,
        phoneNumber: session.phoneNumber ?? null,
      });
    }
  }
  return result;
}

/**
 * Gracefully closes a single Baileys socket.
 *
 * @param {string} userId
 * @param {string} [phoneLabel='default']
 * @param {boolean} [removeFromMap=true]
 */
export async function destroySession(userId, phoneLabel = 'default', removeFromMap = true) {
  const key = buildKey(userId, phoneLabel);
  const session = sessions.get(key);
  if (!session) return;

  try {
    await session.socket.logout();
  } catch {
    // socket.end() is the nuclear option when logout fails
    session.socket.end(undefined);
  } finally {
    if (removeFromMap) sessions.delete(key);
    logger.info({ userId, phoneLabel }, '[SessionManager] Session destroyed');
  }
}

/**
 * Sends a text message from the authenticated session to a recipient JID.
 * Optionally simulates a typing indicator before sending for a human-like feel.
 *
 * @param {string} userId
 * @param {string} phoneLabel          - Which WA number slot to send from
 * @param {string} recipientPhone      - e.g. "628123456789"
 * @param {string} text
 * @param {number} [typingDurationMs]  - optional composing duration in ms
 */
export async function sendMessage(userId, phoneLabel = 'default', recipientPhone, text, typingDurationMs = null) {
  const session = sessions.get(buildKey(userId, phoneLabel));
  if (!session || session.status !== 'open') {
    throw new Error(`Session for userId '${userId}' / phoneLabel '${phoneLabel}' is not connected.`);
  }

  const jid = recipientPhone.includes('@') ? recipientPhone : `${recipientPhone}@s.whatsapp.net`;

  if (typingDurationMs && typingDurationMs > 0) {
    const clampedDuration = Math.min(Math.max(typingDurationMs, 500), 4_000);
    try {
      // Step 1: Subscribe to the contact's presence channel.
      // MANDATORY — Baileys silently drops sendPresenceUpdate without this.
      await session.socket.presenceSubscribe(jid);

      // Step 2: Give WA server ~300ms to register the subscription
      await new Promise((resolve) => setTimeout(resolve, 300));

      // Step 3: Send "composing" (typing...) indicator
      await session.socket.sendPresenceUpdate('composing', jid);
      logger.info({ userId, phoneLabel, recipient: recipientPhone, durationMs: clampedDuration }, '[SessionManager] Typing simulation started');

      // Step 4: Hold for the typing duration
      await new Promise((resolve) => setTimeout(resolve, clampedDuration));

      // Step 5: Send the actual message
      await session.socket.sendMessage(jid, { text });

      // Step 6: Clear the typing indicator (reset presence to 'available')
      await session.socket.sendPresenceUpdate('available', jid);
      logger.info({ userId, phoneLabel, recipient: recipientPhone }, '[SessionManager] Message sent with typing simulation');
      return;
    } catch (err) {
      logger.warn({ userId, phoneLabel, err: err.message }, '[SessionManager] Typing simulation failed (non-fatal) — falling back to direct send');
    }
  }

  // Direct send (no typing simulation requested, or simulation failed)
  await session.socket.sendMessage(jid, { text });
  logger.info({ userId, phoneLabel, recipient: recipientPhone }, '[SessionManager] Message sent');
}

/**
 * Sends a standalone "typing..." presence indicator without sending a message.
 *
 * @param {string} userId
 * @param {string} [phoneLabel='default']
 * @param {string} recipientPhone
 * @param {number} [durationMs=2000]
 */
export async function sendTypingIndicator(userId, phoneLabel = 'default', recipientPhone, durationMs = 2_000) {
  const session = sessions.get(buildKey(userId, phoneLabel));
  if (!session || session.status !== 'open') return;

  const jid = recipientPhone.includes('@')
    ? recipientPhone
    : `${recipientPhone}@s.whatsapp.net`;

  const clampedDuration = Math.min(Math.max(durationMs, 500), 4_000);

  try {
    await session.socket.presenceSubscribe(jid);
    await new Promise((resolve) => setTimeout(resolve, 300));
    await session.socket.sendPresenceUpdate('composing', jid);
    logger.info({ userId, phoneLabel, recipient: recipientPhone, durationMs: clampedDuration }, '[SessionManager] Typing indicator started');

    await new Promise((resolve) => setTimeout(resolve, clampedDuration));

    await session.socket.sendPresenceUpdate('available', jid);
    logger.info({ userId, phoneLabel, recipient: recipientPhone }, '[SessionManager] Typing indicator stopped');
  } catch (err) {
    logger.warn({ userId, phoneLabel, err: err.message }, '[SessionManager] Typing indicator failed (non-fatal)');
  }
}

/**
 * Restores all existing sessions from disk on gateway startup.
 * Walks a two-level directory: <sessionsDir>/<userId>/<phoneLabel>/
 * This prevents users from being logged out after a VPS reboot.
 */
export async function restoreAllSessions() {
  ensureSessionsRoot();

  let userDirs;
  try {
    userDirs = fs.readdirSync(config.sessionsDir, { withFileTypes: true }).filter((e) => e.isDirectory());
  } catch {
    return;
  }

  if (userDirs.length === 0) {
    logger.info('[SessionManager] No existing sessions to restore');
    return;
  }

  let totalRestored = 0;

  for (const userDir of userDirs) {
    const userId = userDir.name;
    const userPath = path.join(config.sessionsDir, userId);

    let phoneDirs;
    try {
      phoneDirs = fs.readdirSync(userPath, { withFileTypes: true }).filter((e) => e.isDirectory());
    } catch {
      continue;
    }

    for (const phoneDir of phoneDirs) {
      const phoneLabel = phoneDir.name;
      // Only restore if creds.json exists (i.e. previously authenticated)
      const credsPath = path.join(userPath, phoneLabel, 'creds.json');
      if (!fs.existsSync(credsPath)) continue;

      totalRestored++;
      createSession(userId, phoneLabel).catch((err) =>
        logger.error({ userId, phoneLabel, err: err.message }, '[SessionManager] Failed to restore session')
      );
    }
  }

  logger.info({ count: totalRestored }, '[SessionManager] Restoring existing sessions');
}

/**
 * Gracefully destroys ALL active sessions. Called on SIGTERM/SIGINT.
 */
export async function destroyAllSessions() {
  const allSessions = [...sessions.values()];
  logger.info({ count: allSessions.length }, '[SessionManager] Destroying all sessions (graceful shutdown)');
  await Promise.allSettled(
    allSessions.map((session) => destroySession(session.userId, session.phoneLabel, true))
  );
}
