/**
 * server.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Main entry point for the PulseAI Unofficial WhatsApp Gateway.
 * Configures Express, middleware, routes, graceful shutdown, and session recovery.
 */

import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';

import { config } from './config/index.js';
import { logger } from './utils/logger.js';
import sessionRoutes from './routes/sessionRoutes.js';
import { restoreAllSessions, destroyAllSessions, getChatHistory } from './session/sessionManager.js';

const app = express();

// ─── Middleware ──────────────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({ origin: true, credentials: true })); // Allow all origins for now
app.use(express.json());

// Trust first proxy if deploying behind reverse proxies (Nginx, Cloudflare, Vercel)
app.set('trust proxy', 1);

// Global Rate Limiter
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per window
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again later.',
  },
});
app.use('/api', limiter);

// ─── Routes ──────────────────────────────────────────────────────────────────
app.use('/api/session', sessionRoutes);

// Direct internal chat history endpoint
app.get('/api/chat-history', (req, res) => {
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
    logger.error({ tenantId, phoneLabel, phone, error: error.message }, '[Server] Get chat history failed');
    return res.status(404).json({
      success: false,
      message: error.message,
    });
  }
});

// Health Check Route
app.get('/health', (req, res) => {
  res.json({
    success: true,
    status: 'healthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// Global Fallback Error Handler
app.use((err, req, res, next) => {
  logger.error({ err: err.message, stack: err.stack }, '[Server] Unhandled request error');
  res.status(500).json({
    success: false,
    message: 'An internal server error occurred.',
  });
});

// ─── Startup ─────────────────────────────────────────────────────────────────
if (!process.env.VERCEL) {
  const server = app.listen(config.port, async () => {
    logger.info({ port: config.port, env: config.nodeEnv }, '[Server] PulseAI WhatsApp Gateway running');

    // Recover active user sessions from storage on boot (no session loss on reboot)
    try {
      await restoreAllSessions();
    } catch (err) {
      logger.error({ err: err.message }, '[Server] Session recovery failed');
    }
  });

  // ─── Graceful Shutdown ───────────────────────────────────────────────────────
  let isShuttingDown = false;

  async function handleShutdown(signal) {
    if (isShuttingDown) return;
    isShuttingDown = true;

    logger.warn({ signal }, '[Server] Shutdown signal received. Closing resources...');

    // 1. Stop accepting new HTTP requests
    server.close(() => {
      logger.info('[Server] HTTP server closed.');
    });

    // 2. Close and logout active WhatsApp socket connections gracefully
    try {
      await destroyAllSessions();
    } catch (err) {
      logger.error({ err: err.message }, '[Server] Error during session destruction');
    }

    logger.info('[Server] Graceful shutdown completed. Exiting.');
    process.exit(0);
  }

  process.on('SIGTERM', () => handleShutdown('SIGTERM'));
  process.on('SIGINT', () => handleShutdown('SIGINT'));
}

export default app;
