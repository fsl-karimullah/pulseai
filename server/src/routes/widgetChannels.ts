import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { supabase } from '../config/supabase';
import { authenticate } from '../middleware/auth';

async function resolveOwnedProject(userId: string, projectId: string) {
  const { data: org } = await supabase
    .from('organizations')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();
  if (!org) return null;

  const { data: project } = await supabase
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .eq('org_id', org.id)
    .maybeSingle();

  return project ? { orgId: org.id, projectId: project.id } : null;
}

export default async function widgetChannelsRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/projects/:projectId/widget-channels
   * Lists website widget embeds registered under a Project.
   */
  fastify.get(
    '/projects/:projectId/widget-channels',
    { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = (request as any).user?.id;
      const { projectId } = request.params as { projectId: string };

      const owned = await resolveOwnedProject(userId, projectId);
      if (!owned) {
        return reply.status(404).send({ success: false, message: 'Project tidak ditemukan' });
      }

      const { data, error } = await supabase
        .from('widget_channels')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: true });

      if (error) {
        fastify.log.error(error, 'Failed to fetch widget channels');
        return reply.status(500).send({ success: false, message: 'Gagal mengambil daftar widget' });
      }

      return reply.send({ success: true, data, orgId: owned.orgId });
    }
  );

  /**
   * POST /api/projects/:projectId/widget-channels
   * Registers a new widget embed instance under a Project.
   * Body: { name?, domain? }
   */
  fastify.post(
    '/projects/:projectId/widget-channels',
    { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = (request as any).user?.id;
      const { projectId } = request.params as { projectId: string };
      const { name, domain } = request.body as { name?: string; domain?: string };

      const owned = await resolveOwnedProject(userId, projectId);
      if (!owned) {
        return reply.status(404).send({ success: false, message: 'Project tidak ditemukan' });
      }

      const { data, error } = await supabase
        .from('widget_channels')
        .insert({
          project_id: projectId,
          name: name?.trim() || 'Website Widget',
          domain: domain?.trim() || null,
        })
        .select()
        .single();

      if (error) {
        fastify.log.error(error, 'Failed to create widget channel');
        return reply.status(500).send({ success: false, message: 'Gagal membuat widget' });
      }

      return reply.status(201).send({ success: true, data });
    }
  );

  /**
   * DELETE /api/widget-channels/:id
   */
  fastify.delete(
    '/widget-channels/:id',
    { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = (request as any).user?.id;
      const { id } = request.params as { id: string };

      const { data: org } = await supabase
        .from('organizations')
        .select('id')
        .eq('user_id', userId)
        .maybeSingle();
      if (!org) {
        return reply.status(404).send({ success: false, message: 'Organisasi tidak ditemukan' });
      }

      // Ownership check: the widget channel's project must belong to this org.
      const { data: channel } = await supabase
        .from('widget_channels')
        .select('id, project_id')
        .eq('id', id)
        .maybeSingle();

      if (!channel) {
        return reply.status(404).send({ success: false, message: 'Widget tidak ditemukan' });
      }

      const { data: project } = await supabase
        .from('projects')
        .select('id')
        .eq('id', channel.project_id)
        .eq('org_id', org.id)
        .maybeSingle();

      if (!project) {
        return reply.status(404).send({ success: false, message: 'Widget tidak ditemukan' });
      }

      const { error } = await supabase.from('widget_channels').delete().eq('id', id);
      if (error) {
        fastify.log.error(error, 'Failed to delete widget channel');
        return reply.status(500).send({ success: false, message: 'Gagal menghapus widget' });
      }

      return reply.send({ success: true, message: 'Widget berhasil dihapus.' });
    }
  );
}
