/**
 * utils/webhookClient.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Pre-configured Axios instance for forwarding messages to the
 * PulseAI Fastify API with automatic retry logic for 504/5xx errors.
 */

import axios from 'axios';
import axiosRetry from 'axios-retry';
import { config } from '../config/index.js';
import { logger } from './logger.js';

const webhookClient = axios.create({
  baseURL: config.fastifyWebhookUrl,
  timeout: config.webhook.timeoutMs,
  headers: {
    'Content-Type': 'application/json',
    // Shared secret so the Fastify API can verify the call is authentic
    'x-gateway-secret': config.gatewaySecret,
  },
});

axiosRetry(webhookClient, {
  retries: config.webhook.maxRetries,
  retryDelay: (retryCount) => {
    const delay = config.webhook.retryDelayMs * Math.pow(2, retryCount - 1); // exponential back-off
    logger.warn({ retryCount, delayMs: delay }, '[Webhook] Retrying after failure');
    return delay;
  },
  retryCondition: (error) => {
    // Retry on network errors AND on 429 / 5xx HTTP responses
    const status = error.response?.status;
    return axiosRetry.isNetworkError(error) || (status !== undefined && (status === 429 || status >= 500));
  },
  onRetry: (retryCount, error) => {
    logger.warn(
      { retryCount, status: error.response?.status, message: error.message },
      '[Webhook] Attempt failed — will retry'
    );
  },
});

/**
 * Sends an incoming WhatsApp message payload to the Fastify webhook.
 *
 * @param {{ sender: string, message: string, userId: string, phoneLabel: string, botNumber: string | null }} payload
 * @returns {Promise<void>}
 */
export async function sendToFastifyWebhook(payload) {
  try {
    await webhookClient.post('', payload); // baseURL is the full /whatsapp/incoming endpoint
    logger.info({ sender: payload.sender, userId: payload.userId, botNumber: payload.botNumber }, '[Webhook] Delivered successfully');
  } catch (error) {
    logger.error(
      {
        err: error.message,
        status: error.response?.status,
        sender: payload.sender,
        userId: payload.userId,
      },
      '[Webhook] FAILED — all retries exhausted'
    );
    // Do NOT rethrow — a webhook delivery failure should not crash the session
  }
}

/**
 * Pushes a session status update (CONNECTED / DISCONNECTED) to the Fastify server
 * so the whatsapp_sessions table stays in sync in real-time.
 *
 * @param {{ userId: string, phoneLabel: string, botNumber: string, status: string }} params
 * @returns {Promise<void>}
 */
export async function pushSessionStatus({ userId, phoneLabel, botNumber, status }) {
  if (!botNumber) return; // Can't push without the actual WA number

  try {
    // Derive the session-status URL from the same base, replacing the path
    const statusUrl = config.fastifyWebhookUrl.replace(/\/whatsapp\/incoming.*$/, '') + '/whatsapp/session-status';
    await webhookClient.post(statusUrl, { userId, phoneLabel, botNumber, status }, { baseURL: undefined });
    logger.info({ userId, phoneLabel, botNumber, status }, '[Webhook] Session status pushed');
  } catch (err) {
    // Non-fatal — the incoming message handler will upsert status on the next message
    logger.warn({ err: err.message, botNumber, status }, '[Webhook] Session status push failed (non-fatal)');
  }
}
