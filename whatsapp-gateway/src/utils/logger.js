/**
 * utils/logger.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Singleton Pino logger shared across the entire gateway.
 * Level is driven by LOG_LEVEL env var (default: 'error' in prod).
 * Baileys itself is silenced by passing this logger with level 'silent'.
 */

import pino from 'pino';
import { config } from '../config/index.js';

export const logger = pino({
  level: config.logLevel,
  ...(config.isProduction
    ? {}
    : {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
        },
      }),
});

/**
 * A completely silent logger to pass into Baileys so its internal
 * verbose output never reaches VPS stdout/stderr.
 */
export const silentLogger = pino({ level: 'silent' });
