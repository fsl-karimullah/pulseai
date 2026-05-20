/**
 * config/index.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Centralised, validated configuration loaded once at startup.
 * All other modules import from here — never from process.env directly.
 */

import 'dotenv/config';
import path from 'path';

function required(key) {
  const val = process.env[key];
  if (!val) {
    throw new Error(`[Config] Missing required environment variable: ${key}`);
  }
  return val;
}

export const config = {
  port: parseInt(process.env.PORT ?? '4000', 10),
  nodeEnv: process.env.NODE_ENV ?? 'production',
  isProduction: (process.env.NODE_ENV ?? 'production') === 'production',

  // Directory where per-user Baileys auth state is persisted
  sessionsDir: path.resolve(process.env.SESSIONS_DIR ?? './sessions'),

  // PulseAI Fastify webhook endpoint that receives incoming WA messages
  fastifyWebhookUrl: required('FASTIFY_WEBHOOK_URL'),

  // Shared secret for authenticating webhook calls
  gatewaySecret: process.env.GATEWAY_SECRET ?? '',

  // Pino log level — keep 'error' or 'silent' in production
  logLevel: process.env.LOG_LEVEL ?? 'error',

  // Axios retry config for the Fastify webhook target
  webhook: {
    timeoutMs: 10_000,      // 10s per attempt
    maxRetries: 3,          // 3 retries after initial failure
    retryDelayMs: 2_000,    // 2s base delay (exponential back-off applied)
  },
};
