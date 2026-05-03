import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { supabase } from '../config/supabase';
import { authenticate } from '../middleware/auth';

export default async function knowledgeRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/knowledge
   * Fetches all ingested knowledge nodes from Supabase for the authenticated organization.
   */
  fastify.get('/knowledge', { preHandler: [authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = (request as any).user?.id;

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

      // 2. Fetch nodes for this organization
      const { data, error } = await supabase
        .from('knowledge_nodes')
        .select('id, title, source_type, file_name, source_url, metadata, created_at')
        .eq('org_id', org.id)
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
      return reply.send({ success: true, data: groupedData });
    } catch (error: any) {
      fastify.log.error(error, 'Knowledge fetch error');
      return reply.status(500).send({ success: false, message: error.message });
    }
  });

  /**
   * DELETE /api/knowledge/:id
   * Deletes all knowledge nodes associated with the document title of the given ID.
   */
  fastify.delete('/knowledge/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: string };

      // 1. Get the title for this ID
      const { data: node } = await supabase
        .from('knowledge_nodes')
        .select('title')
        .eq('id', id)
        .single();

      if (!node) {
        return reply.status(404).send({ success: false, message: 'Document not found' });
      }

      // 2. Delete all nodes with this title
      const { error } = await supabase
        .from('knowledge_nodes')
        .delete()
        .eq('title', node.title);

      if (error) throw error;

      return reply.send({ success: true, message: `Document "${node.title}" deleted successfully.` });
    } catch (error: any) {
      fastify.log.error(error, 'Failed to delete knowledge document');
      return reply.status(500).send({ success: false, message: error.message });
    }
  });
}
