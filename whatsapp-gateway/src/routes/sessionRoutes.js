/**
 * routes/sessionRoutes.js
 * ─────────────────────────────────────────────────────────────────────────────
 * HTTP controller routes for multi-tenant, multi-number session management.
 *
 * All routes accept an optional `phoneLabel` parameter (defaults to 'default')
 * to identify which WhatsApp number slot is being referenced.
 * This ensures full backward-compatibility with any existing callers.
 */

import express from 'express';
import {
  startSession,
  getSessionStatus,
  listSessions,
  sendMessage,
  destroySession,
  sendTypingIndicator,
  getChatHistory,
} from '../session/sessionManager.js';

import { logger } from '../utils/logger.js';

const router = express.Router();

/**
 * GET /api/session/start?userId=XXXX&phoneLabel=sales
 *
 * Initializes a new WhatsApp connection slot (or returns existing QR/status).
 * `phoneLabel` identifies the number slot — e.g. 'default', 'sales', 'support'.
 * Defaults to 'default' for full backward compatibility.
 */
router.get('/start', async (req, res) => {
  const { userId, phoneLabel = 'default' } = req.query;

  if (!userId) {
    return res.status(400).json({
      success: false,
      message: "Missing 'userId' query parameter.",
    });
  }

  try {
    const sessionInfo = await startSession(userId, phoneLabel);
    return res.json({
      success: true,
      userId,
      ...sessionInfo, // { status, qrBase64, phoneLabel }
    });
  } catch (error) {
    logger.error({ userId, phoneLabel, error: error.message }, '[SessionRoute] Start session failed');
    return res.status(500).json({
      success: false,
      message: 'Failed to initialize session.',
      error: error.message,
    });
  }
});

/**
 * GET /api/session/status?userId=XXXX&phoneLabel=sales
 *
 * Checks current connection state of a specific number slot.
 */
router.get('/status', (req, res) => {
  const { userId, phoneLabel = 'default' } = req.query;

  if (!userId) {
    return res.status(400).json({
      success: false,
      message: "Missing 'userId' query parameter.",
    });
  }

  const session = getSessionStatus(userId, phoneLabel);
  if (!session) {
    return res.status(404).json({
      success: false,
      userId,
      phoneLabel,
      status: 'disconnected',
      qrBase64: null,
    });
  }

  return res.json({
    success: true,
    userId,
    ...session, // { status, qrBase64, phoneLabel, phoneNumber }
  });
});

/**
 * GET /api/session/list?userId=XXXX
 *
 * Lists all active WhatsApp number slots for an org.
 * Useful for the dashboard to display all connected numbers and their statuses.
 *
 * Response: { success: true, userId, count: N, sessions: [{ phoneLabel, status, phoneNumber }] }
 */
router.get('/list', (req, res) => {
  const { userId } = req.query;

  if (!userId) {
    return res.status(400).json({
      success: false,
      message: "Missing 'userId' query parameter.",
    });
  }

  const activeSessions = listSessions(userId);
  return res.json({
    success: true,
    userId,
    count: activeSessions.length,
    sessions: activeSessions,
  });
});

/**
 * POST /api/session/send
 *
 * Sends a WhatsApp message from a connected number slot.
 * Body: { userId, phoneLabel?, to, message, typingDurationMs? }
 *
 * `phoneLabel` defaults to 'default' — existing callers that omit it continue to work.
 */
router.post('/send', async (req, res) => {
  const { userId, phoneLabel = 'default', to, message, typingDurationMs } = req.body;

  if (!userId || !to || !message) {
    return res.status(400).json({
      success: false,
      message: "Missing required body fields: 'userId', 'to', and 'message'.",
    });
  }

  try {
    await sendMessage(userId, phoneLabel, to, message, typingDurationMs);
    return res.json({
      success: true,
      message: 'Message sent successfully.',
    });
  } catch (error) {
    logger.error({ userId, phoneLabel, to, error: error.message }, '[SessionRoute] Failed to send message');
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * DELETE /api/session/logout?userId=XXXX&phoneLabel=sales
 *
 * Logs out and removes local session state for a specific number slot.
 * Only that slot is removed — other slots for the same userId remain active.
 */
router.delete('/logout', async (req, res) => {
  const { userId, phoneLabel = 'default' } = req.query;

  if (!userId) {
    return res.status(400).json({
      success: false,
      message: "Missing 'userId' query parameter.",
    });
  }

  try {
    await destroySession(userId, phoneLabel, true, true);
    return res.json({
      success: true,
      message: `Logged out session '${phoneLabel}' for userId '${userId}'.`,
    });
  } catch (error) {
    logger.error({ userId, phoneLabel, error: error.message }, '[SessionRoute] Logout failed');
    return res.status(500).json({
      success: false,
      message: 'Failed to logout session.',
      error: error.message,
    });
  }
});

/**
 * POST /api/session/typing
 *
 * Sends a standalone "typing..." presence indicator for a given slot.
 * Body: { userId, phoneLabel?, to, durationMs? }
 */
router.post('/typing', async (req, res) => {
  const { userId, phoneLabel = 'default', to, durationMs } = req.body;

  if (!userId || !to) {
    return res.status(400).json({
      success: false,
      message: "Missing required body fields: 'userId' and 'to'.",
    });
  }

  try {
    await sendTypingIndicator(userId, phoneLabel, to, durationMs ?? 2_000);
    return res.json({ success: true, message: 'Typing indicator sent.' });
  } catch (error) {
    logger.error({ userId, phoneLabel, to, error: error.message }, '[SessionRoute] Typing indicator failed');
    // Return 200 even on failure — typing is non-critical and callers should not retry
    return res.json({ success: false, message: error.message });
  }
});

/**
 * GET /api/session/chat-history
 *
 * Retrieves the message history for a specific phone number of a user/tenant.
 * Query: { phone, tenantId, phoneLabel? }
 */
router.get('/chat-history', (req, res) => {
  const { phone, tenantId, phoneLabel = 'default' } = req.query;

  if (!phone || !tenantId) {
    return res.status(400).json({
      success: false,
      message: "Missing required query parameters: 'phone' and 'tenantId'.",
    });
  }

  try {
    const messages = getChatHistory(tenantId, phoneLabel, phone);
    return res.json({
      success: true,
      messages,
    });
  } catch (error) {
    logger.error({ tenantId, phoneLabel, phone, error: error.message }, '[SessionRoute] Get chat history failed');
    return res.status(404).json({
      success: false,
      message: error.message,
    });
  }
});

export default router;
