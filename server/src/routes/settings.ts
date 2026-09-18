import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { supabase } from '../config/supabase';
import { authenticate } from '../middleware/auth';

export default async function settingsRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/settings/bot
   * Fetches bot settings for the organization or specific project.
   */
  fastify.get('/settings/bot', { preHandler: [authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = (request as any).user?.id;
      const { projectId } = request.query as { projectId?: string };

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

      // 2. Get the bot settings scoped by project_id or org_id
      let query = supabase.from('bot_settings').select('*');
      if (projectId) {
        query = query.eq('project_id', projectId);
      } else {
        query = query.eq('org_id', orgId);
      }

      const { data: settingsData, error: settingsError } = await query;
      if (settingsError) throw settingsError;

      // 3. Fallback: Create if not exists
      if (!settingsData || settingsData.length === 0) {
        const insertPayload: any = { org_id: orgId };
        if (projectId) insertPayload.project_id = projectId;

        const { data: newSettings, error: insertError } = await supabase
          .from('bot_settings')
          .insert(insertPayload)
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
   * Updates bot settings per project or org.
   */
  fastify.post('/settings/bot', { preHandler: [authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = (request as any).user?.id;
      const { projectId, ...updates } = request.body as any;

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

      let targetProjectId = projectId;
      if (!targetProjectId) {
        // Find default project for org
        const { data: defaultProject } = await supabase
          .from('projects')
          .select('id')
          .eq('org_id', orgId)
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle();
        targetProjectId = defaultProject?.id;
      }

      let data;
      if (targetProjectId) {
        const { data: existing } = await supabase
          .from('bot_settings')
          .select('id')
          .eq('project_id', targetProjectId)
          .maybeSingle();

        if (existing) {
          const res = await supabase
            .from('bot_settings')
            .update({ ...updates, updated_at: new Date().toISOString() })
            .eq('project_id', targetProjectId)
            .select();
          data = res.data;
          if (res.error) throw res.error;
        } else {
          const res = await supabase
            .from('bot_settings')
            .insert({ org_id: orgId, project_id: targetProjectId, ...updates })
            .select();
          data = res.data;
          if (res.error) throw res.error;
        }
      } else {
        const res = await supabase
          .from('bot_settings')
          .update(updates)
          .eq('org_id', orgId)
          .select();
        data = res.data;
        if (res.error) throw res.error;
      }

      return reply.send({ success: true, data: data?.[0] });
    } catch (error: any) {
      fastify.log.error(error, 'Failed to update bot settings');
      return reply.status(500).send({ success: false, message: error.message });
    }
  });

  /**
   * POST /api/settings/upload-logo
   * Direct file upload for bot logo.
   */
  fastify.post('/settings/upload-logo', { preHandler: [authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const file = await request.file();
      if (!file) {
        return reply.status(400).send({ success: false, message: 'Tidak ada file yang diunggah' });
      }

      const buffer = await file.toBuffer();
      const ext = file.filename.split('.').pop() || 'png';
      const fileName = `logo-${Date.now()}-${Math.random().toString(36).substring(2, 7)}.${ext}`;

      // Try uploading to Supabase Storage bucket 'logos'
      let { error: uploadError } = await supabase.storage
        .from('logos')
        .upload(fileName, buffer, {
          contentType: file.mimetype,
          upsert: true
        });

      if (uploadError) {
        // Try creating bucket if it doesn't exist
        await supabase.storage.createBucket('logos', { public: true }).catch(() => {});
        const retry = await supabase.storage
          .from('logos')
          .upload(fileName, buffer, { contentType: file.mimetype, upsert: true });
        uploadError = retry.error;
      }

      if (uploadError) {
        // Fallback to base64 data URL if storage bucket fails
        const base64 = `data:${file.mimetype};base64,${buffer.toString('base64')}`;
        return reply.send({ success: true, url: base64 });
      }

      const { data: publicUrlData } = supabase.storage.from('logos').getPublicUrl(fileName);
      return reply.send({ success: true, url: publicUrlData.publicUrl });

    } catch (err: any) {
      fastify.log.error(err, 'Failed to upload bot logo');
      return reply.status(500).send({ success: false, message: err.message || 'Gagal mengunggah logo.' });
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
