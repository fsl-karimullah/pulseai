import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { supabase } from '../config/supabase';
import { authenticate } from '../middleware/auth';

export default async function analyticsRoutes(fastify: FastifyInstance) {
  fastify.get('/analytics', { preHandler: [authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = (request as any).user?.id;

      // 0. Get the organization for THIS user
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

      // 1. Fetch analytics events for this org
      const { data: events } = await supabase
        .from('analytics_events')
        .select('*')
        .eq('org_id', orgId)
        .order('created_at', { ascending: false })
        .limit(1000);

      const evts = events || [];

      // 2. Fetch total leads & knowledge docs for this org
      const { count: leadsCount } = await supabase
        .from('leads')
        .select('*', { count: 'exact', head: true })
        .eq('org_id', orgId);
      
      const { data: nodesData } = await supabase
        .from('knowledge_nodes')
        .select('title')
        .eq('org_id', orgId);

      const docsCount = nodesData ? new Set(nodesData.map((n) => n.title)).size : 0;

      // 2.5. Fetch Missed Opportunities (Negative Feedback)
      const { data: negativeFeedbacks } = await supabase
        .from('chat_feedbacks')
        .select('message_content, created_at, reason')
        .eq('org_id', orgId)
        .eq('is_positive', false)
        .order('created_at', { ascending: false })
        .limit(5);

      // 3. Compute Conversation Metrics
      const chatEvents = evts.filter(e => e.event_type === 'chat_message');
      
      const uniqueConversations = new Set(chatEvents.map(e => e.metadata?.conversationId).filter(Boolean));
      const totalConversations = uniqueConversations.size;

      // Today's conversations
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);
      const todayChats = chatEvents.filter(e => new Date(e.created_at) >= startOfToday);
      const todayConversationsCount = new Set(todayChats.map(e => e.metadata?.conversationId).filter(Boolean)).size;

      // Weekly Data (last 7 days volume)
      const weeklyData = [0, 0, 0, 0, 0, 0, 0];
      const now = new Date();
      chatEvents.forEach(e => {
        const d = new Date(e.created_at);
        const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 3600 * 24));
        if (diffDays >= 0 && diffDays < 7) {
          // Store in reverse (index 6 is today, 5 is yesterday, etc)
          weeklyData[6 - diffDays]++;
        }
      });

      // Response Times & Escalation
      const totalDuration = chatEvents.reduce((acc, e) => acc + (Number(e.metadata?.durationMs) || 0), 0);
      const avgResponseMs = chatEvents.length > 0 ? Math.round(totalDuration / chatEvents.length) : 0;
      const avgResponseStr = avgResponseMs > 0 ? (avgResponseMs / 1000).toFixed(1) + 's' : '0s';

      const escalations = chatEvents.filter(e => e.metadata?.triggerLeadCapture).length;
      const escalationRate = chatEvents.length > 0 ? (escalations / chatEvents.length) * 100 : 0;
      const resolutionRate = 100 - escalationRate;

      // 4. Format Recent Activity
      const recentActivity = evts.slice(0, 5).map((e, index) => {
        let text = 'Aktivitas sistem';
        let type = 'activity';
        if (e.event_type === 'chat_message') {
          text = `Bot membalas percakapan (durasi ${e.metadata?.durationMs || 0}ms)`;
          type = 'bot';
        } else if (e.event_type === 'lead_captured') {
          text = `Lead ditangkap: ${e.metadata?.name || 'Anonim'}`;
          type = 'lead';
        } else if (e.event_type === 'document_ingested') {
          text = `Dokumen diunggah: ${e.metadata?.title || 'Tanpa Judul'}`;
          type = 'doc';
        }

        // naive relative time
        const diffMs = Date.now() - new Date(e.created_at).getTime();
        const diffMins = Math.floor(diffMs / 60000);
        let timeStr = diffMins < 60 ? `${diffMins}m yang lalu` : `${Math.floor(diffMins/60)}j yang lalu`;
        if (diffMins === 0) timeStr = 'Baru saja';

        return { id: e.id || index, type, text, time: timeStr };
      });

      // Funnel metrics
      const widgetOpenEvents = evts.filter(e => e.event_type === 'widget_opened');
      const funnel = {
        widgetOpens: widgetOpenEvents.length,
        totalChats: totalConversations,
        totalLeads: leadsCount ?? 0,
      };

      // 5. Build Dashboard Response
      return reply.send({
        success: true,
        header: {
          todayConversations: todayConversationsCount,
          uptime: '99.9%',
          avgResponse: avgResponseStr,
        },
        metrics: [
          { id: 'conversations', title: 'Total Percakapan', value: totalConversations.toString(), change: +5.2, label: 'vs bulan lalu' },
          { id: 'leads', title: 'Leads Ditangkap', value: (leadsCount ?? 0).toString(), change: +12.7, label: 'vs bulan lalu' },
          { id: 'knowledge', title: 'Dokumen Pengetahuan', value: docsCount.toString(), change: 0, label: 'vs bulan lalu' },
          { id: 'resolution', title: 'Tingkat Resolusi', value: resolutionRate.toFixed(1) + '%', change: +1.2, label: 'vs bulan lalu' },
        ],
        weeklyData,
        funnel,
        missedOpportunities: negativeFeedbacks || [],
        recentActivity,
        performance: [
          { label: 'Waktu Respons Rata-rata', value: avgResponseStr, sub: 'per pesan', bar: Math.min(100, (avgResponseMs / 5000) * 100) },
          { label: 'Resolusi Otomatis', value: resolutionRate.toFixed(1) + '%', sub: `${totalConversations} sesi`, bar: resolutionRate },
          { label: 'Tingkat Eskalasi', value: escalationRate.toFixed(1) + '%', sub: `${escalations} handoff`, bar: escalationRate },
          { label: 'Dokumen Diunggah', value: docsCount.toString(), sub: 'basis pengetahuan', bar: 100 },
        ]
      });

    } catch (err) {
      fastify.log.error(err, 'Analytics error');
      return reply.status(500).send({ success: false, message: 'Gagal memuat analitik' });
    }
  });

  // POST endpoint to track widget_opened
  fastify.post('/analytics/event', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { orgId, eventType, metadata } = request.body as any;
      if (!orgId || !eventType) return reply.status(400).send({ success: false });

      await supabase.from('analytics_events').insert([{
        org_id: orgId,
        event_type: eventType,
        metadata: metadata || {}
      }]);

      return reply.send({ success: true });
    } catch (err) {
      fastify.log.error(err, 'Event error');
      return reply.status(500).send({ success: false });
    }
  });
}
