import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { supabase } from '../config/supabase';
import { authenticate } from '../middleware/auth';
import { resolveDefaultProjectId } from '../services/projects';

export default async function knowledgeRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/knowledge
   * Fetches all ingested knowledge nodes for a Project belonging to the
   * authenticated organization. Query param `projectId` selects which
   * Project; defaults to the org's default project when omitted (keeps
   * older callers working unchanged).
   */
  fastify.get('/knowledge', { preHandler: [authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = (request as any).user?.id;
      const { projectId } = request.query as { projectId?: string };

      // 1. Get the organization for this user
      const { data: org, error: orgError } = await supabase
        .from('organizations')
        .select('id')
        .eq('user_id', userId)
        .maybeSingle();

      if (orgError) throw orgError;
      if (!org) {
        return reply.status(404).send({ success: false, message: 'Organization not found' });
      }

      // 2. Resolve + verify the Project belongs to this org
      let resolvedProjectId = projectId;
      if (resolvedProjectId) {
        const { data: project } = await supabase
          .from('projects')
          .select('id')
          .eq('id', resolvedProjectId)
          .eq('org_id', org.id)
          .maybeSingle();
        if (!project) {
          return reply.status(404).send({ success: false, message: 'Project tidak ditemukan' });
        }
      } else {
        resolvedProjectId = (await resolveDefaultProjectId(org.id)) ?? undefined;
      }

      if (!resolvedProjectId) {
        return reply.status(404).send({ success: false, message: 'Project tidak ditemukan' });
      }

      // 3. Fetch nodes for this project
      const { data, error } = await supabase
        .from('knowledge_nodes')
        .select('id, title, source_type, file_name, source_url, metadata, created_at')
        .eq('project_id', resolvedProjectId)
        .order('created_at', { ascending: false });

      if (error) {
        fastify.log.error(error, 'Failed to fetch knowledge nodes');
        return reply.status(500).send({ success: false, message: 'Failed to fetch knowledge' });
      }

      // Group chunks by title
      const docMap = new Map<string, any>();
      for (const node of data) {
        if (!docMap.has(node.title)) {
          docMap.set(node.title, {
            id: node.id,
            title: node.title,
            source_type: node.source_type,
            file_name: node.file_name,
            source_url: node.source_url,
            created_at: node.created_at,
            chunks: 1,
            total_words: node.metadata?.word_count || 0,
          });
        } else {
          const existing = docMap.get(node.title);
          existing.chunks += 1;
          existing.total_words += node.metadata?.word_count || 0;
        }
      }

      const groupedData = Array.from(docMap.values());
      return reply.send({ success: true, data: groupedData, projectId: resolvedProjectId });
    } catch (error: any) {
      fastify.log.error(error, 'Knowledge fetch error');
      return reply.status(500).send({ success: false, message: error.message });
    }
  });

  /**
   * DELETE /api/knowledge/:id
   * Deletes all knowledge nodes associated with the document title of the
   * given ID — scoped to the SAME project as that node, and only after
   * verifying the node belongs to the authenticated user's organization.
   */
  fastify.delete('/knowledge/:id', { preHandler: [authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = (request as any).user?.id;
      const { id } = request.params as { id: string };

      const { data: org } = await supabase
        .from('organizations')
        .select('id')
        .eq('user_id', userId)
        .maybeSingle();
      if (!org) {
        return reply.status(404).send({ success: false, message: 'Organization not found' });
      }

      // 1. Get the title/project/org for this node, and verify ownership
      const { data: node } = await supabase
        .from('knowledge_nodes')
        .select('title, project_id, org_id')
        .eq('id', id)
        .single();

      if (!node || node.org_id !== org.id) {
        return reply.status(404).send({ success: false, message: 'Document not found' });
      }

      // 2. Delete all nodes with this title WITHIN THE SAME PROJECT — never
      //    a bare title match, which could otherwise delete another
      //    project's (or another org's) document that happens to share a name.
      const { error } = await supabase
        .from('knowledge_nodes')
        .delete()
        .eq('title', node.title)
        .eq('project_id', node.project_id);

      if (error) throw error;

      return reply.send({ success: true, message: `Document "${node.title}" deleted successfully.` });
    } catch (error: any) {
      fastify.log.error(error, 'Failed to delete knowledge document');
      return reply.status(500).send({ success: false, message: error.message });
    }
  });
}
