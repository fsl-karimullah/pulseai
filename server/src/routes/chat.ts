import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { retrieveContextByProject, buildContextBlock } from '../services/rag';
import { generateChatResponse, generateChatResponseStream, type ChatMessage } from '../services/gemini';
import { resolveDefaultProjectId } from '../services/projects';
import { supabase } from '../config/supabase';
import { aiQueue, aiQueueEvents } from '../config/redis';
interface ChatBody {
  message: string;
  history?: ChatMessage[];
  conversationId?: string;
  botName?: string;
  company?: string;
}

// ──────────────────────────────────────────────────────────────────────────
// Resolves bot_settings for a chat request. `bot_settings` is scoped per
// Project (one row per project). Callers may pass `projectId` directly
// (new widget embeds / dashboard-aware clients); if omitted, falls back to
// resolving `orgId` -> that org's default (oldest) project, so widget
// snippets already installed on client websites (which only send `orgId`)
// keep working unchanged.
// ──────────────────────────────────────────────────────────────────────────
async function resolveProjectSettings(orgId?: string, projectId?: string, botName?: string) {
  let resolvedProjectId = projectId;

  if (!resolvedProjectId && orgId) {
    resolvedProjectId = (await resolveDefaultProjectId(orgId)) ?? undefined;
  }

  let query = supabase.from('bot_settings').select('*');
  if (resolvedProjectId) {
    query = query.eq('project_id', resolvedProjectId);
  } else if (orgId) {
    query = query.eq('org_id', orgId);
  } else {
    query = query.eq('bot_name', botName);
  }

  let { data: settings } = await query.maybeSingle();

  if (!settings && resolvedProjectId && orgId) {
    // Auto-create settings if they don't exist for this project
    const { data: newSettings } = await supabase
      .from('bot_settings')
      .insert({ org_id: orgId, project_id: resolvedProjectId })
      .select()
      .single();
    if (newSettings) settings = newSettings;
  }

  return { settings, resolvedProjectId };
}

export default async function chatRoutes(fastify: FastifyInstance) {
  /**
   * POST /api/chat
   *
   * 1. Retrieves relevant knowledge chunks via vector similarity (RAG)
   * 2. Calls Gemini 1.5 Flash with context + conversation history
   * 3. Returns bot reply + triggerLeadCapture flag
   */
  fastify.post(
    '/chat',
    async (
      request: FastifyRequest<{ Body: ChatBody & { orgId?: string; projectId?: string } }>,
      reply: FastifyReply
    ) => {
      const {
        message,
        history = [],
        conversationId,
        orgId,
        projectId,
        botName = 'Aria',
        company = 'PulseAI',
      } = request.body;

      if (!message?.trim()) {
        return reply.status(400).send({ success: false, message: 'message is required.' });
      }

      fastify.log.info({ conversationId, orgId, projectId, message: message.slice(0, 80) }, 'Chat request');

      // 0 — Resolve the Project (and its bot_settings) for this request
      const { settings } = await resolveProjectSettings(orgId, projectId, botName);

      if (!settings) {
        return reply.status(404).send({ success: false, message: 'Bot configuration not found.' });
      }

      const resolvedOrgId = settings.org_id;
      const resolvedProjectId = settings.project_id;
      const resolvedBotName = settings.bot_name || botName || 'Aria';
      const resolvedCompany = settings.company_name || company || 'PulseAI';
      const tone = settings.tone || 'Professional';
      const instructions = settings.custom_instructions || '';
      const adminWhatsApp = settings.admin_whatsapp || '';

      // ── Credit Check: hanya untuk free user. Subscriber = unlimited chat ──
      if (resolvedOrgId) {
        const { data: sub } = await supabase
          .from('subscriptions')
          .select('plan_type, credits')
          .eq('org_id', resolvedOrgId)
          .maybeSingle();

        const isSubscriber = sub && sub.plan_type !== 'free';
        if (!isSubscriber) {
          const currentCredits = sub?.credits ?? 0;
          if (currentCredits <= 0) {
            return reply.status(402).send({
              success: false,
              message: 'Kredit Anda habis. Silakan top-up kredit atau berlangganan untuk melanjutkan.',
              code: 'CREDITS_EXHAUSTED',
            });
          }
        }
      }

      // 1 — RAG: retrieve relevant chunks for THIS project only
      fastify.log.info({ projectId: resolvedProjectId, query: message.slice(0, 60) }, '[RAG] Starting retrieval');
      const chunks = await retrieveContextByProject(message, resolvedProjectId, 5);
      fastify.log.info({ chunksFound: chunks.length, projectId: resolvedProjectId }, '[RAG] context retrieved');
      const context = buildContextBlock(chunks);

      // 2 — Generate response via Queue
      const startTime = performance.now();
      try {
        const job = await aiQueue.add('process-chat', {
          type: 'chat',
          data: {
            message,
            history,
            context,
            resolvedBotName,
            resolvedCompany,
            tone,
            instructions,
            adminWhatsApp,
            resolvedOrgId
          }
        });

        const { botReply, triggerLeadCapture } = await job.waitUntilFinished(aiQueueEvents);
        
        const durationMs = Math.round(performance.now() - startTime);

        // ── Deduct 1 credit: HANYA untuk free user, subscriber gratis ─────────
        if (resolvedOrgId) {
          try {
            const { data: sub } = await supabase
              .from('subscriptions')
              .select('plan_type, credits')
              .eq('org_id', resolvedOrgId)
              .maybeSingle();

            const isSubscriber = sub && sub.plan_type !== 'free';
            if (!isSubscriber) {
              const newCredits = Math.max(0, (sub?.credits ?? 0) - 1);
              await supabase
                .from('subscriptions')
                .update({ credits: newCredits })
                .eq('org_id', resolvedOrgId);

              await supabase.from('credit_transactions').insert({
                org_id: resolvedOrgId,
                amount: -1,
                type: 'usage',
                description: 'AI Chatbot — 1 pesan balasan',
                reference: conversationId || null,
              });
            }
          } catch (creditErr) {
            // Non-fatal: jangan gagalkan chat karena error kredit
            fastify.log.warn({ creditErr }, '[Credits] Failed to deduct chat credit');
          }
        }

        // Telemetry Log (Safe Wrapper)
        try {
          await supabase.from('analytics_events').insert({
            org_id: resolvedOrgId,
            event_type: 'chat_message',
            metadata: {
              conversationId,
              botName,
              durationMs,
              sourcesCount: chunks.length,
              triggerLeadCapture,
            }
          });
        } catch (err) {
          fastify.log.warn({ err }, 'Failed to log telemetry');
        }

        fastify.log.info({ triggerLeadCapture, sources: chunks.length, durationMs }, 'Chat response');

        return reply.send({
          success: true,
          message: botReply,
          triggerLeadCapture,
          sources: chunks.map((c) => ({ title: c.title, similarity: c.similarity })),
        });
      } catch (error: any) {
        fastify.log.error({ err: error, orgId: resolvedOrgId }, 'Chat processing failed');
        return reply.status(500).send({ 
          success: false, 
          message: 'Gagal memproses percakapan. Silakan coba lagi nanti.',
          error: error.message 
        });
      }
    }
  );

  /**
   * POST /api/chat-stream
   * Streaming version for local Fastify (matches Vercel Edge function)
   */
  fastify.post(
    '/chat-stream',
    async (
      request: FastifyRequest<{ Body: ChatBody & { orgId?: string; projectId?: string } }>,
      reply: FastifyReply
    ) => {
      const {
        message,
        history = [],
        conversationId,
        orgId,
        projectId,
        botName = 'Aria',
        company = 'PulseAI',
      } = request.body;

      if (!message?.trim()) {
        return reply.status(400).send({ success: false, message: 'message is required.' });
      }

      const { settings } = await resolveProjectSettings(orgId, projectId, botName);

      if (!settings) {
        return reply.status(404).send({ success: false, message: 'Bot configuration not found.' });
      }

      const resolvedOrgId = settings.org_id;
      const resolvedProjectId = settings.project_id;
      const resolvedBotName = settings.bot_name || botName || 'Aria';
      const resolvedCompany = settings.company_name || company || 'PulseAI';
      const tone = settings.tone || 'Professional';
      const instructions = settings.custom_instructions || '';
      const adminWhatsApp = settings.admin_whatsapp || '';

      // ── Credit Check untuk stream endpoint (hanya free user) ────────────────
      if (resolvedOrgId) {
        const { data: sub } = await supabase
          .from('subscriptions')
          .select('plan_type, credits')
          .eq('org_id', resolvedOrgId)
          .maybeSingle();

        const isSubscriber = sub && sub.plan_type !== 'free';
        if (!isSubscriber) {
          const currentCredits = sub?.credits ?? 0;
          if (currentCredits <= 0) {
            return reply.status(402).send({
              success: false,
              message: 'Kredit Anda habis. Silakan top-up kredit atau berlangganan untuk melanjutkan.',
              code: 'CREDITS_EXHAUSTED',
            });
          }
        }
      }

      const chunks = await retrieveContextByProject(message, resolvedProjectId, 5);
      const context = buildContextBlock(chunks);

      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      });

      try {
        const stream = await generateChatResponseStream(
          message,
          history,
          context,
          resolvedBotName,
          resolvedCompany,
          tone,
          instructions,
          adminWhatsApp,
          resolvedOrgId
        );

        for await (const chunk of stream) {
          reply.raw.write(`data: ${JSON.stringify({ text: chunk })}\n\n`);
        }

        // ── Deduct 1 credit after successful stream (hanya free user) ─────────
        if (resolvedOrgId) {
          try {
            const { data: sub } = await supabase
              .from('subscriptions')
              .select('plan_type, credits')
              .eq('org_id', resolvedOrgId)
              .maybeSingle();

            const isSubscriber = sub && sub.plan_type !== 'free';
            if (!isSubscriber) {
              const newCredits = Math.max(0, (sub?.credits ?? 0) - 1);
              await supabase
                .from('subscriptions')
                .update({ credits: newCredits })
                .eq('org_id', resolvedOrgId);

              await supabase.from('credit_transactions').insert({
                org_id: resolvedOrgId,
                amount: -1,
                type: 'usage',
                description: 'AI Chatbot Stream — 1 pesan balasan',
                reference: conversationId || null,
              });
            }
          } catch (creditErr) {
            fastify.log.warn({ creditErr }, '[Credits] Failed to deduct stream credit');
          }
        }

        reply.raw.write(
          `data: ${JSON.stringify({
            done: true,
            triggerLeadCapture: false,
            sources: chunks.map((c) => ({ title: c.title, similarity: c.similarity })),
          })}\n\n`
        );
      } catch (err: any) {
        reply.raw.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
      } finally {
        reply.raw.end();
      }
    }
  );
}
