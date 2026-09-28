import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { supabase } from '../config/supabase';
import { authenticate } from '../middleware/auth';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BotProfile {
  id: string;
  org_id: string;
  project_id: string | null;
  profile_name: string;
  kb_project_ids: string[];
  bot_name: string | null;
  instructions: string | null;
  tone: string | null;
  is_active: boolean;
  admin_whatsapp: string | null;
  logo_url: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Helper ───────────────────────────────────────────────────────────────────

async function resolveOrgForUser(userId: string) {
  const { data: org } = await supabase
    .from('organizations')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();
  return org;
}

// ─── Route Plugin ─────────────────────────────────────────────────────────────

export default async function botProfilesRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/bot-profiles
   * Lists all Bot Profiles for the authenticated user's organization.
   * Each profile contains its name, KB sources, and bot configuration.
   */
  fastify.get('/bot-profiles', { preHandler: [authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = (request as any).user?.id;
    const org = await resolveOrgForUser(userId);
    if (!org) return reply.status(404).send({ success: false, message: 'Organisasi tidak ditemukan' });

    const { data, error } = await supabase
      .from('bot_settings')
      .select('id, org_id, project_id, profile_name, kb_project_ids, bot_name, instructions, tone, is_active, admin_whatsapp, logo_url, created_at, updated_at')
      .eq('org_id', org.id)
      .order('created_at', { ascending: true });

    if (error) {
      fastify.log.error(error, 'Failed to fetch bot profiles');
      return reply.status(500).send({ success: false, message: 'Gagal mengambil daftar Bot Profile' });
    }

    // Annotate each profile with channel counts (how many WA/widget channels use it)
    const enriched = await Promise.all((data || []).map(async (profile) => {
      const [{ count: waCount }, { count: widgetCount }] = await Promise.all([
        supabase.from('whatsapp_sessions').select('*', { count: 'exact', head: true }).eq('bot_settings_id', profile.id),
        supabase.from('widget_channels').select('*', { count: 'exact', head: true }).eq('bot_settings_id', profile.id),
      ]);
      return {
        ...profile,
        profile_name: profile.profile_name ?? 'Bot Utama',
        kb_project_ids: profile.kb_project_ids ?? [],
        whatsapp_channel_count: waCount ?? 0,
        widget_channel_count: widgetCount ?? 0,
      };
    }));

    return reply.send({ success: true, data: enriched });
  });

  /**
   * POST /api/bot-profiles
   * Creates a new Bot Profile for the organization.
   * Body: { profile_name, kb_project_ids?, bot_name?, instructions?, tone?, admin_whatsapp? }
   */
  fastify.post('/bot-profiles', { preHandler: [authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = (request as any).user?.id;
    const {
      profile_name,
      kb_project_ids = [],
      bot_name,
      instructions,
      tone,
      admin_whatsapp,
      logo_url,
    } = request.body as {
      profile_name?: string;
      kb_project_ids?: string[];
      bot_name?: string;
      instructions?: string;
      tone?: string;
      admin_whatsapp?: string;
      logo_url?: string;
    };

    if (!profile_name || !profile_name.trim()) {
      return reply.status(400).send({ success: false, message: 'Nama Bot Profile tidak boleh kosong' });
    }

    const org = await resolveOrgForUser(userId);
    if (!org) return reply.status(404).send({ success: false, message: 'Organisasi tidak ditemukan' });

    // Resolve default project for project_id fallback (backward compat)
    const { data: defaultProject } = await supabase
      .from('projects')
      .select('id')
      .eq('org_id', org.id)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    const { data: newProfile, error } = await supabase
      .from('bot_settings')
      .insert({
        org_id: org.id,
        project_id: defaultProject?.id ?? null,
        profile_name: profile_name.trim(),
        kb_project_ids: kb_project_ids,
        bot_name: bot_name?.trim() ?? null,
        instructions: instructions?.trim() ?? null,
        tone: tone ?? 'friendly',
        admin_whatsapp: admin_whatsapp?.trim() ?? null,
        logo_url: logo_url ?? null,
      })
      .select()
      .single();

    if (error) {
      fastify.log.error(error, 'Failed to create bot profile');
      return reply.status(500).send({ success: false, message: 'Gagal membuat Bot Profile' });
    }

    return reply.status(201).send({ success: true, data: newProfile });
  });

  /**
   * PATCH /api/bot-profiles/:id
   * Updates a Bot Profile. Supports partial updates.
   * Body: any subset of { profile_name, kb_project_ids, bot_name, instructions, tone, ... }
   */
  fastify.patch('/bot-profiles/:id', { preHandler: [authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = (request as any).user?.id;
    const { id } = request.params as { id: string };
    const updates = request.body as Record<string, any>;

    const org = await resolveOrgForUser(userId);
    if (!org) return reply.status(404).send({ success: false, message: 'Organisasi tidak ditemukan' });

    // Verify ownership — the profile must belong to this org
    const { data: existing } = await supabase
      .from('bot_settings')
      .select('id')
      .eq('id', id)
      .eq('org_id', org.id)
      .maybeSingle();

    if (!existing) return reply.status(404).send({ success: false, message: 'Bot Profile tidak ditemukan' });

    // Strip fields that must not be overwritten via this endpoint
    const { org_id: _orgId, id: _id, created_at: _ca, ...safeUpdates } = updates;

    const { data: updated, error } = await supabase
      .from('bot_settings')
      .update({ ...safeUpdates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      fastify.log.error(error, 'Failed to update bot profile');
      return reply.status(500).send({ success: false, message: 'Gagal memperbarui Bot Profile' });
    }

    return reply.send({ success: true, data: updated });
  });

  /**
   * DELETE /api/bot-profiles/:id
   * Deletes a Bot Profile. Refuses if channels still use this profile
   * (prevents orphaned channels from losing their bot config).
   */
  fastify.delete('/bot-profiles/:id', { preHandler: [authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = (request as any).user?.id;
    const { id } = request.params as { id: string };

    const org = await resolveOrgForUser(userId);
    if (!org) return reply.status(404).send({ success: false, message: 'Organisasi tidak ditemukan' });

    const { data: existing } = await supabase
      .from('bot_settings')
      .select('id, profile_name')
      .eq('id', id)
      .eq('org_id', org.id)
      .maybeSingle();

    if (!existing) return reply.status(404).send({ success: false, message: 'Bot Profile tidak ditemukan' });

    // Guard: refuse deletion if this is the last profile
    const { count: totalProfiles } = await supabase
      .from('bot_settings')
      .select('*', { count: 'exact', head: true })
      .eq('org_id', org.id);

    if ((totalProfiles ?? 0) <= 1) {
      return reply.status(409).send({
        success: false,
        message: 'Tidak bisa menghapus satu-satunya Bot Profile. Buat profile baru terlebih dahulu.',
      });
    }

    // Guard: refuse deletion if active channels still use this profile
    const [{ count: waCount }, { count: widgetCount }] = await Promise.all([
      supabase.from('whatsapp_sessions').select('*', { count: 'exact', head: true }).eq('bot_settings_id', id),
      supabase.from('widget_channels').select('*', { count: 'exact', head: true }).eq('bot_settings_id', id),
    ]);

    const blockers: string[] = [];
    if ((waCount ?? 0) > 0) blockers.push(`${waCount} nomor WhatsApp`);
    if ((widgetCount ?? 0) > 0) blockers.push(`${widgetCount} widget`);

    if (blockers.length > 0) {
      return reply.status(409).send({
        success: false,
        message: `Bot Profile "${existing.profile_name}" masih digunakan oleh ${blockers.join(' dan ')}. Pindahkan channel tersebut ke profile lain terlebih dahulu.`,
      });
    }

    const { error } = await supabase.from('bot_settings').delete().eq('id', id);
    if (error) {
      fastify.log.error(error, 'Failed to delete bot profile');
      return reply.status(500).send({ success: false, message: 'Gagal menghapus Bot Profile' });
    }

    return reply.send({ success: true, message: `Bot Profile "${existing.profile_name}" berhasil dihapus.` });
  });

  /**
   * POST /api/bot-profiles/:id/assign-channel
   * Assigns a WhatsApp channel or Widget channel to a Bot Profile.
   * Body: { channel_type: 'whatsapp' | 'widget', channel_id: string }
   */
  fastify.post('/bot-profiles/:id/assign-channel', { preHandler: [authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = (request as any).user?.id;
    const { id: profileId } = request.params as { id: string };
    const { channel_type, channel_id } = request.body as {
      channel_type: 'whatsapp' | 'widget';
      channel_id: string;
    };

    if (!channel_type || !channel_id) {
      return reply.status(400).send({ success: false, message: 'channel_type dan channel_id wajib diisi' });
    }

    const org = await resolveOrgForUser(userId);
    if (!org) return reply.status(404).send({ success: false, message: 'Organisasi tidak ditemukan' });

    // Verify profile belongs to this org
    const { data: profile } = await supabase
      .from('bot_settings')
      .select('id, kb_project_ids')
      .eq('id', profileId)
      .eq('org_id', org.id)
      .maybeSingle();

    if (!profile) return reply.status(404).send({ success: false, message: 'Bot Profile tidak ditemukan' });

    if (channel_type === 'whatsapp') {
      // Verify WA session belongs to this org
      const { data: session } = await supabase
        .from('whatsapp_sessions')
        .select('id, project_id')
        .eq('id', channel_id)
        .eq('org_id', org.id)
        .maybeSingle();

      if (!session) return reply.status(404).send({ success: false, message: 'Sesi WhatsApp tidak ditemukan' });

      // Assign: update bot_settings_id AND sync project_id to first KB project (for backward compat RAG fallback)
      const syncProjectId = (profile.kb_project_ids ?? [])[0] ?? session.project_id;
      const { error } = await supabase
        .from('whatsapp_sessions')
        .update({ bot_settings_id: profileId, project_id: syncProjectId })
        .eq('id', channel_id);

      if (error) {
        fastify.log.error(error, 'Failed to assign bot profile to WA session');
        return reply.status(500).send({ success: false, message: 'Gagal assign Bot Profile ke nomor WhatsApp' });
      }
    } else if (channel_type === 'widget') {
      const { data: widget } = await supabase
        .from('widget_channels')
        .select('id, project_id')
        .eq('id', channel_id)
        .eq('org_id', org.id)
        .maybeSingle();

      if (!widget) return reply.status(404).send({ success: false, message: 'Widget tidak ditemukan' });

      const syncProjectId = (profile.kb_project_ids ?? [])[0] ?? widget.project_id;
      const { error } = await supabase
        .from('widget_channels')
        .update({ bot_settings_id: profileId, project_id: syncProjectId })
        .eq('id', channel_id);

      if (error) {
        fastify.log.error(error, 'Failed to assign bot profile to widget');
        return reply.status(500).send({ success: false, message: 'Gagal assign Bot Profile ke widget' });
      }
    } else {
      return reply.status(400).send({ success: false, message: "channel_type harus 'whatsapp' atau 'widget'" });
    }

    return reply.send({ success: true, message: 'Bot Profile berhasil di-assign ke channel.' });
  });

  /**
   * GET /api/bot-profiles/by-channel
   * Resolves the Bot Profile for a specific channel.
   * Query params: channel_type ('whatsapp' | 'widget') + channel_id
   * Used by the frontend to show "Bot Profile yang aktif saat ini: ..."
   */
  fastify.get('/bot-profiles/by-channel', { preHandler: [authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { channel_type, channel_id } = request.query as {
      channel_type?: string;
      channel_id?: string;
    };

    if (!channel_type || !channel_id) {
      return reply.status(400).send({ success: false, message: 'channel_type dan channel_id wajib diisi' });
    }

    const table = channel_type === 'whatsapp' ? 'whatsapp_sessions' : 'widget_channels';
    const { data: channel } = await supabase
      .from(table)
      .select('bot_settings_id, bot_settings:bot_settings_id(id, profile_name, kb_project_ids, bot_name, tone)')
      .eq('id', channel_id)
      .maybeSingle();

    if (!channel) return reply.status(404).send({ success: false, message: 'Channel tidak ditemukan' });

    return reply.send({ success: true, data: channel });
  });
}
