import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { supabase } from '../config/supabase';
import { authenticate } from '../middleware/auth';
import { sendTelegramMessage } from './telegram';

interface LeadBody {
  name: string;
  whatsapp: string;
  botName: string;
  conversationId?: string;
  lastMessage?: string;
  metadata?: Record<string, unknown>;
  history?: { role: string, content: string, timestamp?: string }[];
}

export default async function leadsRoutes(fastify: FastifyInstance) {
  /**
   * POST /api/leads
   * Saves a captured lead from the chat widget into Supabase.
   */
  fastify.post(
    '/leads',
    async (
      request: FastifyRequest<{ Body: LeadBody & { orgId?: string } }>,
      reply: FastifyReply
    ) => {
      const { name, whatsapp, orgId, botName, conversationId, lastMessage, metadata = {}, history } = request.body;

      if (!name?.trim() || !whatsapp?.trim()) {
        return reply.status(400).send({
          success: false,
          message: 'Nama dan WhatsApp wajib diisi.',
        });
      }

      // 1. Resolve org_id
      let resolvedOrgId = orgId;

      if (!resolvedOrgId) {
        const { data: settings } = await supabase
          .from('bot_settings')
          .select('org_id')
          .eq('bot_name', botName)
          .maybeSingle();
        resolvedOrgId = settings?.org_id;
      }

      if (!resolvedOrgId) {
        return reply.status(404).send({ success: false, message: 'Organisasi tidak ditemukan' });
      }

      const { data, error } = await supabase
        .from('leads')
        .insert({
          org_id: resolvedOrgId,
          name: name.trim(),
          whatsapp: whatsapp.trim(),
          conversation_id: conversationId ?? null,
          last_message: lastMessage ?? null,
          metadata,
        })
        .select('id')
        .single();

      if (error) {
        fastify.log.error(error, 'Lead insert failed');
        return reply.status(500).send({ success: false, message: 'Gagal menyimpan lead.' });
      }

      // Telemetry Log
      await supabase.from('analytics_events').insert({
        org_id: resolvedOrgId,
        event_type: 'lead_captured',
        metadata: {
          leadId: data.id,
          name,
          conversationId: conversationId ?? null
        }
      });

      fastify.log.info({ leadId: data.id, name }, 'Lead captured');

      // ── Save History to chat_logs ──────────────────────────────────────────
      if (history && history.length > 0) {
        try {
          const chatLogEntries = history
            .filter(m => m.content && m.content.trim() !== '')
            .map(m => ({
              tenant_id: resolvedOrgId,
              bot_number: 'Web Widget',
              customer_number: whatsapp.trim(),
              sender: m.role === 'bot' ? 'bot' : 'customer',
              message_text: m.content,
              created_at: m.timestamp || new Date().toISOString()
            }));

          if (chatLogEntries.length > 0) {
            await supabase.from('chat_logs').insert(chatLogEntries);
          }
        } catch (logErr) {
          fastify.log.warn({ logErr }, 'Failed to save chat logs for lead');
        }
      }

      // ── Telegram Notification (fire-and-forget) ─────────────────────────
      try {
        const { data: botCfg } = await supabase
          .from('bot_settings')
          .select('telegram_bot_token, telegram_chat_id, bot_name')
          .eq('org_id', resolvedOrgId)
          .maybeSingle();

        if (botCfg?.telegram_bot_token && botCfg?.telegram_chat_id) {
          const wib = new Date().toLocaleString('id-ID', {
            timeZone: 'Asia/Jakarta',
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit', hour12: false,
          });
          const msg =
            `🔔 <b>Lead Baru dari Widget!</b>\n\n` +
            `👤 Nama: <b>${name.trim()}</b>\n` +
            `📞 WhatsApp: <code>${whatsapp.trim()}</code>\n` +
            (lastMessage ? `💬 Pesan terakhir:\n<i>${lastMessage.slice(0, 200)}</i>\n` : '') +
            `🤖 Bot: ${botCfg.bot_name || 'Aria'}\n` +
            `🕒 ${wib} WIB\n\n` +
            `<i>(Riwayat obrolan lengkap dapat dilihat di Dashboard menu History Chat)</i>`;

          await sendTelegramMessage(
            botCfg.telegram_bot_token,
            botCfg.telegram_chat_id,
            msg
          );
        }
      } catch (tgErr) {
        // Non-fatal: jangan gagalkan lead capture karena error Telegram
        fastify.log.warn({ tgErr }, '[Telegram] Failed to send lead notification');
      }

      return reply.status(201).send({ success: true, leadId: data.id });
    }
  );

  /**
   * GET /api/leads
   * Fetches all captured leads for the authenticated organization.
   */
  fastify.get(
    '/leads',
    { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const userId = (request as any).user?.id;

        const { data: org } = await supabase
          .from('organizations')
          .select('id')
          .eq('user_id', userId)
          .maybeSingle();
        
        if (!org) {
          return reply.status(404).send({ success: false, message: 'Organisasi tidak ditemukan' });
        }

        const { data, error } = await supabase
          .from('leads')
          .select('*')
          .eq('org_id', org.id)
          .order('created_at', { ascending: false });

        if (error) {
          fastify.log.error(error, 'Failed to fetch leads');
          return reply.status(500).send({ success: false, message: 'Gagal mengambil data lead.' });
        }

        return reply.send({ success: true, data });
      } catch (error: any) {
        return reply.status(500).send({ success: false, message: error.message });
      }
    }
  );

  /**
   * DELETE /api/leads/:id
   */
  fastify.delete('/leads/:id', { preHandler: [authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: string };
      const userId = (request as any).user?.id;

      const { data: org } = await supabase
        .from('organizations')
        .select('id')
        .eq('user_id', userId)
        .maybeSingle();
      
      if (!org) {
        return reply.status(404).send({ success: false, message: 'Organisasi tidak ditemukan' });
      }

      const { error } = await supabase
        .from('leads')
        .delete()
        .eq('id', id)
        .eq('org_id', org.id); // Enforce ownership

      if (error) throw error;
      return reply.send({ success: true, message: 'Lead berhasil dihapus' });
    } catch (error: any) {
      fastify.log.error(error, 'Failed to delete lead');
      return reply.status(500).send({ success: false, message: error.message });
    }
  });

  /**
   * PUT /api/leads/:id
   */
  fastify.put('/leads/:id', { preHandler: [authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: string };
      const userId = (request as any).user?.id;
      const { name, whatsapp } = request.body as { name?: string; whatsapp?: string };

      const { data: org } = await supabase
        .from('organizations')
        .select('id')
        .eq('user_id', userId)
        .maybeSingle();
      
      if (!org) {
        return reply.status(404).send({ success: false, message: 'Organisasi tidak ditemukan' });
      }

      const updateData: any = {};
      if (name !== undefined) updateData.name = name;
      if (whatsapp !== undefined) updateData.whatsapp = whatsapp;

      if (Object.keys(updateData).length === 0) {
        return reply.status(400).send({ success: false, message: 'Tidak ada data untuk diperbarui' });
      }

      const { error } = await supabase
        .from('leads')
        .update(updateData)
        .eq('id', id)
        .eq('org_id', org.id);

      if (error) throw error;
      return reply.send({ success: true, message: 'Lead berhasil diperbarui' });
    } catch (error: any) {
      fastify.log.error(error, 'Failed to update lead');
      return reply.status(500).send({ success: false, message: error.message });
    }
  });
}
