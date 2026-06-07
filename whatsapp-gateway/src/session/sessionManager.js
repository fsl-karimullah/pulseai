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

// Global flag to prevent session state purging during system shutdown/restarts
let isSystemShuttingDown = false;

// ─── Custom In-Memory Store for Baileys ──────────────────────────────────────
export function makeInMemoryStore({ logger }) {
  const store = {
    chats: {},
    messages: {},
    contacts: {},
    
    bind(ev) {
      ev.on('chats.set', ({ chats }) => {
        for (const chat of chats) {
          store.chats[chat.id] = { ...(store.chats[chat.id] || {}), ...chat };
        }
      });
      
      ev.on('chats.upsert', (newChats) => {
        for (const chat of newChats) {
          store.chats[chat.id] = { ...(store.chats[chat.id] || {}), ...chat };
        }
      });
      
      ev.on('chats.update', (updates) => {
        for (const update of updates) {
          if (store.chats[update.id]) {
            store.chats[update.id] = { ...store.chats[update.id], ...update };
          }
        }
      });

      ev.on('contacts.set', ({ contacts }) => {
        for (const contact of contacts) {
          store.contacts[contact.id] = { ...(store.contacts[contact.id] || {}), ...contact };
        }
      });
      
      ev.on('contacts.upsert', (newContacts) => {
        for (const contact of newContacts) {
          store.contacts[contact.id] = { ...(store.contacts[contact.id] || {}), ...contact };
        }
      });
      
      ev.on('contacts.update', (updates) => {
        for (const update of updates) {
          if (store.contacts[update.id]) {
            store.contacts[update.id] = { ...store.contacts[update.id], ...update };
          }
        }
      });

      ev.on('messages.set', ({ messages }) => {
        for (const msg of messages) {
          const jid = msg.key.remoteJid;
          if (!jid) continue;
          if (!store.messages[jid]) {
            store.messages[jid] = [];
          }
          const exists = store.messages[jid].some(m => m.key.id === msg.key.id);
          if (!exists) {
            store.messages[jid].push(msg);
          }
        }
      });

      ev.on('messages.upsert', ({ messages, type }) => {
        for (const msg of messages) {
          const jid = msg.key.remoteJid;
          if (!jid) continue;
          if (!store.messages[jid]) {
            store.messages[jid] = [];
          }
          const exists = store.messages[jid].some(m => m.key.id === msg.key.id);
          if (!exists) {
            store.messages[jid].push(msg);
          }
          if (store.messages[jid].length > 100) {
            store.messages[jid] = store.messages[jid].slice(-100);
          }
        }
      });

      ev.on('messages.update', (updates) => {
        for (const update of updates) {
          const jid = update.key.remoteJid;
          if (!jid || !store.messages[jid]) continue;
          const index = store.messages[jid].findIndex(m => m.key.id === update.key.id);
          if (index !== -1) {
            store.messages[jid][index] = { ...store.messages[jid][index], ...update.update };
          }
        }
      });
    },

    readFromFile(filePath) {
      if (fs.existsSync(filePath)) {
        try {
          const content = fs.readFileSync(filePath, 'utf-8');
          const data = JSON.parse(content);
          store.chats = data.chats || {};
          store.messages = data.messages || {};
          store.contacts = data.contacts || {};
        } catch (err) {
          if (logger) logger.error({ filePath, err: err.message }, '[InMemoryStore] Failed to read from file');
        }
      }
    },

    writeToFile(filePath) {
      try {
        const data = {
          chats: store.chats,
          messages: store.messages,
          contacts: store.contacts,
        };
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
      } catch (err) {
        if (logger) logger.error({ filePath, err: err.message }, '[InMemoryStore] Failed to write to file');
      }
    }
  };

  return store;
}

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

  // Initialize store and read from file if it exists
  const store = makeInMemoryStore({ logger: silentLogger });
  const storePath = path.join(dir, 'store.json');
  if (fs.existsSync(storePath)) {
    try {
      store.readFromFile(storePath);
      logger.info({ userId, phoneLabel }, '[SessionManager] Restored chat store from file');
    } catch (err) {
      logger.error({ userId, phoneLabel, err: err.message }, '[SessionManager] Failed to read store from file');
    }
  }

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

  // Bind store to socket events
  store.bind(socket.ev);

  // Setup periodic save
  const writeInterval = setInterval(() => {
    try {
      if (fs.existsSync(dir)) {
        store.writeToFile(storePath);
      }
    } catch (err) {
      logger.error({ userId, phoneLabel, err: err.message }, '[SessionManager] Failed to write store to file');
    }
  }, 10_000);

  // Store session metadata
  sessions.set(key, {
    userId,
    phoneLabel,
    socket,
    status: 'connecting',  // 'connecting' | 'qr' | 'open' | 'closed'
    qrBase64: null,
    phoneNumber: null,     // resolved once the socket successfully connects
    store,
    writeInterval,
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
      if (isSystemShuttingDown || socket._isGracefullyClosing) {
        logger.info({ userId, phoneLabel }, '[SessionManager] System shutting down — ignoring connection close');
        return;
      }
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

    const session = sessions.get(key);
    if (!session) return;

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

      // replyJid = full JID we must use to send a reply (may be @lid or @s.whatsapp.net)
      let replyJid = remoteJid;

      // For LID contacts (Multi-Device), remoteJid looks like '220525532057759@lid'.
      // Stripping non-digits gives a LID number (NOT a real phone), so we preserve the
      // full JID as `sender` so the Fastify server's isLidNumber() / getLeadPhoneNumber()
      // can detect it and gracefully handle the missing phone number scenario.
      //
      // For normal contacts, remoteJid looks like '6287826563458@s.whatsapp.net'.
      // Here we strip the suffix to get a clean numeric phone number.
      let sender;
      if (remoteJid.endsWith('@lid')) {
        // Multi-Device / LID contact — pass full JID so server can detect LID
        sender = remoteJid;
      } else {
        // Standard contact — extract clean phone number from JID
        sender = remoteJid.replace(/[^0-9]/g, '');
      }

      // botNumber is the actual WhatsApp phone number of this bot instance.
      // The Fastify server uses it to look up the owning tenant in whatsapp_sessions,
      // enabling multiple bot numbers to share the same org knowledge base.
      const botNumber = session.phoneNumber ?? null;

      logger.info({ userId, phoneLabel, botNumber, sender, replyJid, preview: text.slice(0, 40) }, '[SessionManager] Incoming message');

      // Forward to Fastify webhook — include both phoneLabel and botNumber.
      // botNumber lets the server resolve orgId via: SELECT org_id FROM whatsapp_sessions WHERE phone_number = botNumber
      // replyJid is the full JID (with @lid or @s.whatsapp.net) that must be used to send the reply back.
      await sendToFastifyWebhook({ sender, message: text, userId, phoneLabel, botNumber, replyJid });
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
 * Retrieves chat history from the session's store for a given recipient phone.
 *
 * @param {string} userId
 * @param {string} phoneLabel
 * @param {string} recipientPhone
 * @returns {Array} messages array
 */
export function getChatHistory(userId, phoneLabel = 'default', recipientPhone) {
  const key = buildKey(userId, phoneLabel);
  const session = sessions.get(key);
  if (!session) {
    throw new Error(`Session not found for userId '${userId}' and phoneLabel '${phoneLabel}'`);
  }

  if (!session.store) {
    throw new Error(`Store not initialized for session '${phoneLabel}'`);
  }

  const jid = recipientPhone.includes('@') ? recipientPhone : `${recipientPhone}@s.whatsapp.net`;
  const messages = session.store.messages[jid]?.toJSON() || session.store.messages[jid]?.array || [];
  return messages;
}

/**
 * Gracefully closes a single Baileys socket.
 *
 * @param {string} userId
 * @param {string} [phoneLabel='default']
 */
export async function destroySession(userId, phoneLabel = 'default', removeFromMap = true, isLogout = false) {
  const key = buildKey(userId, phoneLabel);
  const session = sessions.get(key);
  if (!session) return;

  // Capture phone number before we lose the session reference
  const botNumber = session.phoneNumber;

  // Clear save interval
  if (session.writeInterval) {
    clearInterval(session.writeInterval);
  }

  // Final save if store exists (only when NOT logging out — on logout we wipe the dir)
  if (session.store && !isLogout) {
    try {
      const dir = sessionDir(userId, phoneLabel);
      const storePath = path.join(dir, 'store.json');
      if (fs.existsSync(dir)) {
        session.store.writeToFile(storePath);
      }
    } catch (err) {
      logger.warn({ userId, phoneLabel, err: err.message }, '[SessionManager] Failed to save store on destroy');
    }
  }

  try {
    if (isLogout) {
      await session.socket.logout();
    } else {
      // Mark the socket as shutting down to prevent the connection.update close handler
      // from treating this as a real logout and purging session credentials on disk.
      session.socket._isGracefullyClosing = true;
      session.socket.end(undefined);
    }
  } catch {
    // socket.end() is the nuclear option when logout fails
    if (session.socket) {
      session.socket._isGracefullyClosing = true;
      session.socket.end(undefined);
    }
  } finally {
    if (removeFromMap) sessions.delete(key);
    logger.info({ userId, phoneLabel }, '[SessionManager] Session destroyed');

    // When performing a real logout, wipe local credentials and notify the server
    if (isLogout) {
      try {
        fs.rmSync(sessionDir(userId, phoneLabel), { recursive: true, force: true });
        logger.info({ userId, phoneLabel }, '[SessionManager] Session directory removed on logout');
      } catch (err) {
        logger.warn({ userId, phoneLabel, err: err.message }, '[SessionManager] Failed to remove session directory');
      }
      // Notify the Fastify server so the DB row status becomes DISCONNECTED
      if (botNumber) {
        pushSessionStatus({ userId, phoneLabel, botNumber, status: 'DISCONNECTED' });
      }
    }
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
  isSystemShuttingDown = true;
  const allSessions = [...sessions.values()];
  logger.info({ count: allSessions.length }, '[SessionManager] Destroying all sessions (graceful shutdown)');
  await Promise.allSettled(
    allSessions.map((session) => destroySession(session.userId, session.phoneLabel, true, false))
  );
}
