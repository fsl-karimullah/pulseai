import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { supabase } from '../config/supabase';
import { authenticate } from '../middleware/auth';

export default async function settingsRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/settings/bot
   * Fetches bot settings for the organization.
   */
  fastify.get('/settings/bot', { preHandler: [authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = (request as any).user?.id;

      // 1. Get the organization for THIS user
      const { data: org, error: orgError } = await supabase
        .from('organizations')
        .select('id')
        .eq('user_id', userId)
        .maybeSingle();
      
      if (orgError) throw orgError;
      if (!org) {
        return reply.status(404).send({ success: false, message: 'Organisasi tidak ditemukan. Silakan buat akun terlebih dahulu.' });
      }

      const orgId = org.id;

      // 2. Get the bot settings
      const { data: settingsData, error: settingsError } = await supabase
        .from('bot_settings')
        .select('*')
        .eq('org_id', orgId);

      if (settingsError) throw settingsError;

      // 3. Fallback: Create if not exists
      if (!settingsData || settingsData.length === 0) {
        const { data: newSettings, error: insertError } = await supabase
          .from('bot_settings')
          .insert({ org_id: orgId })
          .select();
        
        if (insertError) throw insertError;
        return reply.send({ success: true, data: newSettings?.[0] });
      }

      return reply.send({ success: true, data: settingsData[0] });
    } catch (error: any) {
      fastify.log.error(error, 'Failed to fetch bot settings');
      return reply.status(500).send({ success: false, message: error.message });
    }
  });

  /**
   * POST /api/settings/bot
   * Updates bot settings.
   */
  fastify.post('/settings/bot', { preHandler: [authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = (request as any).user?.id;
      const updates = request.body as any;

      const { data: org, error: orgError } = await supabase
        .from('organizations')
        .select('id')
        .eq('user_id', userId)
        .maybeSingle();
      
      if (orgError) throw orgError;
      if (!org) {
        return reply.status(404).send({ success: false, message: 'Organisasi tidak ditemukan' });
      }

      const orgId = org.id;

      const { data, error } = await supabase
        .from('bot_settings')
        .update(updates)
        .eq('org_id', orgId)
        .select();

      if (error) throw error;

      return reply.send({ success: true, data: data?.[0] });
    } catch (error: any) {
      fastify.log.error(error, 'Failed to update bot settings');
      return reply.status(500).send({ success: false, message: error.message });
    }
  });

  /**
   * GET /api/credits
   * Returns the current credit balance and recent transaction history.
   */
  fastify.get('/credits', { preHandler: [authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = (request as any).user?.id;

      const { data: org, error: orgError } = await supabase
        .from('organizations')
        .select('id')
        .eq('user_id', userId)
        .maybeSingle();

      if (orgError) throw orgError;
      if (!org) {
        return reply.status(404).send({ success: false, message: 'Organisasi tidak ditemukan.' });
      }

      const orgId = org.id;

      // Get current credits + plan
      const { data: sub, error: subError } = await supabase
        .from('subscriptions')
        .select('credits, plan_type')
        .eq('org_id', orgId)
        .maybeSingle();

      if (subError) throw subError;

      // Get last 10 transactions
      const { data: transactions } = await supabase
        .from('credit_transactions')
        .select('amount, type, description, created_at')
        .eq('org_id', orgId)
        .order('created_at', { ascending: false })
        .limit(10);

      return reply.send({
        success: true,
        data: {
          credits: sub?.credits ?? 0,
          plan_type: sub?.plan_type ?? 'free',
          pdf_credit_cost: 10,
          transactions: transactions ?? [],
        },
      });
    } catch (error: any) {
      fastify.log.error(error, 'Failed to fetch credits');
      return reply.status(500).send({ success: false, message: error.message });
    }
  });
}
