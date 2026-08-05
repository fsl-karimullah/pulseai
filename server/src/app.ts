import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import ingestRoutes from './routes/ingest';
import chatRoutes from './routes/chat';
import leadsRoutes from './routes/leads';
import analyticsRoutes from './routes/analytics';
import widgetRoutes from './routes/widget';
import paymentsRoutes from './routes/payments';
import settingsRoutes from './routes/settings';
import knowledgeRoutes from './routes/knowledge';
import whatsappRoutes from './routes/whatsapp';
import referralRoutes from './routes/referral';
import cvScreeningRoutes from './routes/cvScreening';
import projectsRoutes from './routes/projects';
import widgetChannelsRoutes from './routes/widgetChannels';
import emailDomainsRoutes from './routes/emailDomains';
import telegramRoutes from './routes/telegram';
import feedbackRoutes from './routes/feedback';

const MAX_FILE_SIZE_MB = 50;

export async function createServer() {
  const isDev = process.env.NODE_ENV === 'development' && !process.env.VERCEL;

  const server = Fastify({
    logger: isDev ? {
      transport: {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
      }
    } : true,
    bodyLimit: 10 * 1024 * 1024, // 10MB to support base64 image uploads in chat
  });

  // ── Plugins ──────────────────────────────────────────────────────────────
  await server.register(cors, {
    origin: (origin, cb) => cb(null, true), 
    methods: ['GET', 'POST', 'OPTIONS', 'DELETE', 'PUT'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: false,
  });

  await server.register(multipart, {
    limits: {
      fileSize: MAX_FILE_SIZE_MB * 1024 * 1024, // 50 MB total
      files: 30,   // Up to 30 for bulk CV upload (premium: 30, free: 10 — enforced at route level)
      fields: 10,
    },
  });

  // ── Routes ───────────────────────────────────────────────────────────────
  await server.register(ingestRoutes,    { prefix: '/api' });
  await server.register(chatRoutes,      { prefix: '/api' });
  await server.register(leadsRoutes,     { prefix: '/api' });
  await server.register(analyticsRoutes, { prefix: '/api' });
  await server.register(widgetRoutes,    { prefix: '/api' });
  await server.register(paymentsRoutes,  { prefix: '/api' });
  await server.register(settingsRoutes,  { prefix: '/api' });
  await server.register(knowledgeRoutes, { prefix: '/api' });
  await server.register(whatsappRoutes,    { prefix: '/api' });
  await server.register(referralRoutes,    { prefix: '/api' });
  await server.register(cvScreeningRoutes, { prefix: '/api' });
  await server.register(projectsRoutes,       { prefix: '/api' });
  await server.register(widgetChannelsRoutes, { prefix: '/api' });
  await server.register(emailDomainsRoutes,   { prefix: '/api' });
  await server.register(telegramRoutes,        { prefix: '/api' });
  await server.register(feedbackRoutes,        { prefix: '/api' });

  // Root health check
  server.get('/', async () => ({
    service: 'PulseAI Ingest API',
    version: '1.0.0',
    status: 'running',
    timestamp: new Date().toISOString(),
  }));

  // ── Global Error Handler ──────────────────────────────────────────────────
  server.setErrorHandler((error, _request, reply) => {
    server.log.error(error);

    const err = error as { statusCode?: number; message?: string; stack?: string };
    const statusCode = err.statusCode ?? 500;
    const message =
      process.env.NODE_ENV === 'development'
        ? err.message ?? 'Unknown error'
        : statusCode >= 500
        ? 'An internal server error occurred.'
        : err.message ?? 'An error occurred';

    return reply.status(statusCode).send({
      success: false,
      message,
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    });
  });

  return server;
}
