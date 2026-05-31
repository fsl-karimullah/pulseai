import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { retrieveContext, buildContextBlock } from '../services/rag';
import { generateChatResponse, generateChatResponseStream, type ChatMessage } from '../services/gemini';
import { supabase } from '../config/supabase';

interface ChatBody {
  message: string;
  history?: ChatMessage[];
  conversationId?: string;
  botName?: string;
  company?: string;
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
      request: FastifyRequest<{ Body: ChatBody & { orgId?: string } }>,
      reply: FastifyReply
    ) => {
      const {
        message,
        history = [],
        conversationId,
        orgId,
        botName = 'Aria',
        company = 'PulseAI',
      } = request.body;

      if (!message?.trim()) {
        return reply.status(400).send({ success: false, message: 'message is required.' });
      }

      fastify.log.info({ conversationId, orgId, message: message.slice(0, 80) }, 'Chat request');

      // 0 — Get organization from bot settings
      let query = supabase.from('bot_settings').select('*');
      
      if (orgId) {
        query = query.eq('org_id', orgId);
      } else {
        query = query.eq('bot_name', botName);
      }

      let { data: settings } = await query.maybeSingle();

      if (!settings && orgId) {
        // Auto-create settings if they don't exist for this Org
        const { data: newSettings, error: insertError } = await supabase
          .from('bot_settings')
          .insert({ org_id: orgId })
          .select()
          .single();
        
        if (!insertError) {
          settings = newSettings;
        }
      }

      if (!settings) {
        return reply.status(404).send({ success: false, message: 'Bot configuration not found.' });
      }

      const resolvedOrgId = settings.org_id;
      const resolvedBotName = settings.bot_name || botName || 'Aria';
      const resolvedCompany = settings.company_name || company || 'PulseAI';
      const tone = settings.tone || 'Professional';
      const instructions = settings.custom_instructions || '';
      const adminWhatsApp = settings.admin_whatsapp || '';

      // 1 — RAG: retrieve relevant chunks for THIS organization
      fastify.log.info({ orgId: resolvedOrgId, query: message.slice(0, 60) }, '[RAG] Starting retrieval');
      const chunks = await retrieveContext(message, resolvedOrgId, 5);
      fastify.log.info({ chunksFound: chunks.length, orgId: resolvedOrgId }, '[RAG] context retrieved');
      const context = buildContextBlock(chunks);

      // 2 — Generate response
      const startTime = performance.now();
      try {
        const { message: botReply, triggerLeadCapture } = await generateChatResponse(
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
        const durationMs = Math.round(performance.now() - startTime);

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
      request: FastifyRequest<{ Body: ChatBody & { orgId?: string } }>,
      reply: FastifyReply
    ) => {
      const {
        message,
        history = [],
        conversationId,
        orgId,
        botName = 'Aria',
        company = 'PulseAI',
      } = request.body;

      if (!message?.trim()) {
        return reply.status(400).send({ success: false, message: 'message is required.' });
      }

      let query = supabase.from('bot_settings').select('*');
      if (orgId) {
        query = query.eq('org_id', orgId);
      } else {
        query = query.eq('bot_name', botName);
      }
      let { data: settings } = await query.maybeSingle();

      if (!settings && orgId) {
        const { data: newSettings } = await supabase
          .from('bot_settings')
          .insert({ org_id: orgId })
          .select()
          .single();
        if (newSettings) settings = newSettings;
      }

      if (!settings) {
        return reply.status(404).send({ success: false, message: 'Bot configuration not found.' });
      }

      const resolvedOrgId = settings.org_id;
      const resolvedBotName = settings.bot_name || botName || 'Aria';
      const resolvedCompany = settings.company_name || company || 'PulseAI';
      const tone = settings.tone || 'Professional';
      const instructions = settings.custom_instructions || '';
      const adminWhatsApp = settings.admin_whatsapp || '';

      const chunks = await retrieveContext(message, resolvedOrgId, 5);
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
