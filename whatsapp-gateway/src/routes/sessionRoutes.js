/**
 * routes/sessionRoutes.js
 * ─────────────────────────────────────────────────────────────────────────────
 * HTTP controller routes for session creation, status, and message sending.
 */

import express from 'express';
import { startSession, getSessionStatus, sendMessage, destroySession, sendTypingIndicator } from '../session/sessionManager.js';

import { logger } from '../utils/logger.js';

const router = express.Router();

/**
 * GET /api/session/start?userId=XXXX
 * Initializes/gets QR code or connection status for a specific user ID.
 */
router.get('/start', async (req, res) => {
  const { userId } = req.query;

  if (!userId) {
    return res.status(400).json({
      success: false,
      message: "Missing 'userId' query parameter.",
    });
  }

  try {
    const sessionInfo = await startSession(userId);
    return res.json({
      success: true,
      userId,
      ...sessionInfo, // status: 'qr' | 'open', qrBase64: 'data:image/png;base64,...' | null
    });
  } catch (error) {
    logger.error({ userId, error: error.message }, '[SessionRoute] Start session failed');
    return res.status(500).json({
      success: false,
      message: 'Failed to initialize session.',
      error: error.message,
    });
  }
});

/**
 * GET /api/session/status?userId=XXXX
 * Checks current connection state of a specific session.
 */
router.get('/status', (req, res) => {
  const { userId } = req.query;

  if (!userId) {
    return res.status(400).json({
      success: false,
      message: "Missing 'userId' query parameter.",
    });
  }

  const session = getSessionStatus(userId);
  if (!session) {
    return res.status(404).json({
      success: false,
      userId,
      status: 'disconnected',
      qrBase64: null,
    });
  }

  return res.json({
    success: true,
    userId,
    status: session.status,
    qrBase64: session.qrBase64,
  });
});

/**
 * POST /api/session/send
 * Sends a WhatsApp message from a connected session.
 * Body: { userId: "XXXX", to: "628123456789", message: "Hello world", typingDurationMs: 2000 }
 */
router.post('/send', async (req, res) => {
  const { userId, to, message, typingDurationMs } = req.body;

  if (!userId || !to || !message) {
    return res.status(400).json({
      success: false,
      message: "Missing required body fields: 'userId', 'to', and 'message'.",
    });
  }

  try {
    await sendMessage(userId, to, message, typingDurationMs);
    return res.json({
      success: true,
      message: 'Message sent successfully.',
    });
  } catch (error) {
    logger.error({ userId, to, error: error.message }, '[SessionRoute] Failed to send message');
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * DELETE /api/session/logout?userId=XXXX
 * Logs out and removes local session state for a user.
 */
router.delete('/logout', async (req, res) => {
  const { userId } = req.query;

  if (!userId) {
    return res.status(400).json({
      success: false,
      message: "Missing 'userId' query parameter.",
    });
  }

  try {
    await destroySession(userId, true);
    return res.json({
      success: true,
      message: `Logged out and destroyed session for ${userId}.`,
    });
  } catch (error) {
    logger.error({ userId, error: error.message }, '[SessionRoute] Logout failed');
    return res.status(500).json({
      success: false,
      message: 'Failed to logout session.',
      error: error.message,
    });
  }
});

/**
 * POST /api/session/typing
 * Triggers a "composing" presence update for a given session and recipient.
 * Body: { userId: "XXXX", to: "628123456789", durationMs: 2000 }
 *
 * Called by the Fastify webhook server BEFORE sending the actual reply so the
 * end-user sees a realistic "typing..." indicator on their WhatsApp.
 */
router.post('/typing', async (req, res) => {
  const { userId, to, durationMs } = req.body;

  if (!userId || !to) {
    return res.status(400).json({
      success: false,
      message: "Missing required body fields: 'userId' and 'to'.",
    });
  }

  try {
    // Run presence update — this function awaits the full duration internally
    await sendTypingIndicator(userId, to, durationMs ?? 2_000);
    return res.json({ success: true, message: 'Typing indicator sent.' });
  } catch (error) {
    logger.error({ userId, to, error: error.message }, '[SessionRoute] Typing indicator failed');
    // Return 200 even on failure so the caller doesn’t retry — this is non-critical
    return res.json({ success: false, message: error.message });
  }
});

export default router;
