import type { FastifyRequest, FastifyReply } from 'fastify';
import { supabase } from '../config/supabase';

export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  try {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.status(401).send({ success: false, message: 'Missing or invalid token' });
    }

    const token = authHeader.split(' ')[1];
    
    // Verify token with Supabase
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      console.error('[authenticate] Supabase rejected token:', error?.message, error?.status, error?.name);
      return reply.status(401).send({ success: false, message: 'Unauthorized' });
    }

    // Attach user to request
    (request as any).user = user;
  } catch (error) {
    return reply.status(401).send({ success: false, message: 'Authentication failed' });
  }
}
