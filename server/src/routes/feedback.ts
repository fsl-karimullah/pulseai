import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { supabase } from '../config/supabase';

interface FeedbackBody {
  orgId: string;
  sessionId: string;
  messageContent: string;
  isPositive: boolean;
  reason?: string;
}

export default async function feedbackRoutes(fastify: FastifyInstance) {
  fastify.post('/feedback', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { orgId, sessionId, messageContent, isPositive, reason } = request.body as FeedbackBody;

      if (!orgId || !sessionId || !messageContent) {
        return reply.status(400).send({ success: false, message: 'Missing required fields' });
      }

      const { error } = await supabase
        .from('chat_feedbacks')
        .insert([{
          org_id: orgId,
          session_id: sessionId,
          message_content: messageContent,
          is_positive: isPositive,
          reason: reason || null
        }]);

      if (error) throw error;

      return reply.send({ success: true });
    } catch (err) {
      fastify.log.error(err, 'Feedback error');
      return reply.status(500).send({ success: false, message: 'Gagal mengirim feedback' });
    }
  });
}
