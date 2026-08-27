import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { supabase } from '../config/supabase';

// In-memory cache for public stats to prevent database overload
let statsCache: {
  users: number;
  messages: number;
  leads: number;
  lastUpdated: number;
} | null = null;

const CACHE_DURATION_MS = 30 * 1000; // 30 seconds

export default async function publicStatsRoutes(fastify: FastifyInstance) {
  fastify.get('/public/stats', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const now = Date.now();
      
      // Return cached data if valid
      if (statsCache && (now - statsCache.lastUpdated < CACHE_DURATION_MS)) {
        return reply.send({
          success: true,
          data: {
            users: statsCache.users,
            messages: statsCache.messages,
            leads: statsCache.leads,
          }
        });
      }

      // 1. Count Organizations (Users/Businesses)
      const { count: usersCount, error: usersError } = await supabase
        .from('organizations')
        .select('*', { count: 'exact', head: true });

      if (usersError) throw usersError;

      // 2. Count AI Messages Processed (from chat_logs where sender = 'ai')
      const { count: messagesCount, error: messagesError } = await supabase
        .from('chat_logs')
        .select('*', { count: 'exact', head: true })
        .eq('sender', 'ai');

      if (messagesError) throw messagesError;

      // 3. Count Leads Captured
      const { count: leadsCount, error: leadsError } = await supabase
        .from('leads')
        .select('*', { count: 'exact', head: true });

      if (leadsError) throw leadsError;

      const finalUsers = usersCount || 0;
      const finalMessages = messagesCount || 0;
      const finalLeads = leadsCount || 0;

      // Update Cache
      statsCache = {
        users: finalUsers,
        messages: finalMessages,
        leads: finalLeads,
        lastUpdated: now
      };

      return reply.send({
        success: true,
        data: {
          users: finalUsers,
          messages: finalMessages,
          leads: finalLeads
        }
      });

    } catch (error) {
      console.error('Error fetching public stats:', error);
      
      if (statsCache) {
        return reply.send({
          success: true,
          data: {
            users: statsCache.users,
            messages: statsCache.messages,
            leads: statsCache.leads,
          },
          stale: true
        });
      }

      return reply.status(500).send({
        success: false,
        message: 'Gagal memuat statistik.'
      });
    }
  });
}
