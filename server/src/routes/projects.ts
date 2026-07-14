import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { supabase } from '../config/supabase';
import { authenticate } from '../middleware/auth';

async function resolveOrgForUser(userId: string) {
  const { data: org } = await supabase
    .from('organizations')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();
  return org;
}

async function getProjectCounts(projectId: string) {
  const [{ data: kbRows }, { count: whatsappCount }, { count: widgetCount }] = await Promise.all([
    supabase.from('knowledge_nodes').select('title').eq('project_id', projectId),
    supabase.from('whatsapp_sessions').select('*', { count: 'exact', head: true }).eq('project_id', projectId),
    supabase.from('widget_channels').select('*', { count: 'exact', head: true }).eq('project_id', projectId),
  ]);

  // Count distinct DOCUMENTS, not raw chunks (one document = many knowledge_nodes rows).
  const knowledgeCount = new Set((kbRows || []).map((r) => r.title)).size;

  return {
    knowledge_count: knowledgeCount,
    whatsapp_count: whatsappCount ?? 0,
    widget_count: widgetCount ?? 0,
  };
}

export default async function projectsRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/projects
   * Lists all Projects for the authenticated user's organization, with
   * KB/channel counts for the dashboard cards.
   */
  fastify.get('/projects', { preHandler: [authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = (request as any).user?.id;
    const org = await resolveOrgForUser(userId);
    if (!org) {
      return reply.status(404).send({ success: false, message: 'Organisasi tidak ditemukan' });
    }

    const { data: projects, error } = await supabase
      .from('projects')
      .select('id, name, created_at')
      .eq('org_id', org.id)
      .order('created_at', { ascending: true });

    if (error) {
      fastify.log.error(error, 'Failed to fetch projects');
      return reply.status(500).send({ success: false, message: 'Gagal mengambil daftar project' });
    }

    const data = await Promise.all(
      (projects || []).map(async (p) => ({ ...p, ...(await getProjectCounts(p.id)) }))
    );

    return reply.send({ success: true, data });
  });

  /**
   * POST /api/projects
   * Creates a new Project for the authenticated user's organization, and
   * auto-provisions a bot_settings row for it (mirrors the org-creation
   * trigger, so BotSettingsPage has sensible defaults right away).
   * Body: { name }
   */
  fastify.post('/projects', { preHandler: [authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = (request as any).user?.id;
    const { name } = request.body as { name?: string };

    if (!name || !name.trim()) {
      return reply.status(400).send({ success: false, message: 'Nama project tidak boleh kosong' });
    }

    const org = await resolveOrgForUser(userId);
    if (!org) {
      return reply.status(404).send({ success: false, message: 'Organisasi tidak ditemukan' });
    }

    const { data: project, error } = await supabase
      .from('projects')
      .insert({ org_id: org.id, name: name.trim() })
      .select('id, name, created_at')
      .single();

    if (error) {
      fastify.log.error(error, 'Failed to create project');
      return reply.status(500).send({ success: false, message: 'Gagal membuat project' });
    }

    const { error: settingsError } = await supabase
      .from('bot_settings')
      .insert({ org_id: org.id, project_id: project.id });

    if (settingsError) {
      // Non-fatal — chat.ts/whatsapp.ts lazily create bot_settings on first
      // request if missing, so the project is still usable.
      fastify.log.warn({ err: settingsError.message, projectId: project.id }, 'Failed to auto-provision bot_settings for new project');
    }

    return reply.status(201).send({
      success: true,
      data: { ...project, knowledge_count: 0, whatsapp_count: 0, widget_count: 0 },
    });
  });

  /**
   * PATCH /api/projects/:id
   * Renames a Project. Body: { name }
   */
  fastify.patch('/projects/:id', { preHandler: [authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = (request as any).user?.id;
    const { id } = request.params as { id: string };
    const { name } = request.body as { name?: string };

    if (!name || !name.trim()) {
      return reply.status(400).send({ success: false, message: 'Nama project tidak boleh kosong' });
    }

    const org = await resolveOrgForUser(userId);
    if (!org) {
      return reply.status(404).send({ success: false, message: 'Organisasi tidak ditemukan' });
    }

    const { data: existing } = await supabase
      .from('projects')
      .select('id')
      .eq('id', id)
      .eq('org_id', org.id)
      .maybeSingle();

    if (!existing) {
      return reply.status(404).send({ success: false, message: 'Project tidak ditemukan' });
    }

    const { data: updated, error } = await supabase
      .from('projects')
      .update({ name: name.trim() })
      .eq('id', id)
      .select('id, name, created_at')
      .single();

    if (error) {
      fastify.log.error(error, 'Failed to rename project');
      return reply.status(500).send({ success: false, message: 'Gagal mengubah nama project' });
    }

    return reply.send({ success: true, data: updated });
  });

  /**
   * DELETE /api/projects/:id
   * Refuses to delete if: it's the org's only project, or it still has any
   * KB documents / WhatsApp numbers / widget channels attached — the client
   * must move or remove those first. bot_settings for the project cascades
   * automatically (FK ON DELETE CASCADE).
   */
  fastify.delete('/projects/:id', { preHandler: [authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = (request as any).user?.id;
    const { id } = request.params as { id: string };

    const org = await resolveOrgForUser(userId);
    if (!org) {
      return reply.status(404).send({ success: false, message: 'Organisasi tidak ditemukan' });
    }

    const { data: existing } = await supabase
      .from('projects')
      .select('id')
      .eq('id', id)
      .eq('org_id', org.id)
      .maybeSingle();

    if (!existing) {
      return reply.status(404).send({ success: false, message: 'Project tidak ditemukan' });
    }

    const { count: totalProjects } = await supabase
      .from('projects')
      .select('*', { count: 'exact', head: true })
      .eq('org_id', org.id);

    if ((totalProjects ?? 0) <= 1) {
      return reply.status(409).send({
        success: false,
        message: 'Tidak bisa menghapus satu-satunya Project. Setiap organisasi harus memiliki minimal 1 Project.',
      });
    }

    const counts = await getProjectCounts(id);
    const blockers: string[] = [];
    if (counts.knowledge_count > 0) blockers.push(`${counts.knowledge_count} dokumen Knowledge Base`);
    if (counts.whatsapp_count > 0) blockers.push(`${counts.whatsapp_count} nomor WhatsApp`);
    if (counts.widget_count > 0) blockers.push(`${counts.widget_count} widget`);

    if (blockers.length > 0) {
      return reply.status(409).send({
        success: false,
        message: `Project masih memiliki ${blockers.join(', ')}. Pindahkan atau hapus dulu sebelum menghapus project ini.`,
      });
    }

    const { error } = await supabase.from('projects').delete().eq('id', id);
    if (error) {
      fastify.log.error(error, 'Failed to delete project');
      return reply.status(500).send({ success: false, message: 'Gagal menghapus project' });
    }

    return reply.send({ success: true, message: 'Project berhasil dihapus.' });
  });
}
