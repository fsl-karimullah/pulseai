import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { supabase } from '../config/supabase';
import { authenticate } from '../middleware/auth';

interface LeadBody {
  name: string;
  whatsapp: string;
  botName: string;
  conversationId?: string;
  lastMessage?: string;
  metadata?: Record<string, unknown>;
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
      const { name, whatsapp, orgId, botName, conversationId, lastMessage, metadata = {} } = request.body;

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
}
