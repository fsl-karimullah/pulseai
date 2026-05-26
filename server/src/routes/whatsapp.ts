import { FastifyInstance } from 'fastify';
import { supabase } from '../config/supabase';
import { retrieveContext, buildContextBlock } from '../services/rag';
import { generateChatResponse, type ChatMessage } from '../services/gemini';
import axios from 'axios';

export default async function whatsappRoutes(fastify: FastifyInstance) {
  const gatewayUrl = process.env.WHATSAPP_GATEWAY_URL;

  // ──────────────────────────────────────────────────────────────────────────
  // POST /api/whatsapp/incoming
  //
  // Receives incoming WhatsApp messages from the Baileys Gateway.
  //
  // Payload: { sender, message, userId, phoneLabel, botNumber }
  //   sender     — visitor's WA number
  //   message    — visitor's text
  //   userId     — gateway session key (used ONLY for routing replies back)
  //   phoneLabel — named slot within that session (e.g. 'sales', 'default')
  //   botNumber  — actual WA phone number of the bot that received the chat
  //
  // Tenant Resolution Strategy (2-step, with fallback):
  //   1. Look up `whatsapp_sessions` WHERE phone_number = botNumber → get orgId
  //   2. If not found, register the mapping and fall back to userId as orgId
  //   3. Use `orgId` for ALL Supabase queries (settings, leads, RAG, analytics)
  //   4. Keep `userId` + `phoneLabel` solely for the gateway reply route
  // ──────────────────────────────────────────────────────────────────────────
  fastify.post('/whatsapp/incoming', async (request, reply) => {
    try {
      const {
        sender,
        message,
        userId,
        phoneLabel = 'default',
        botNumber,
      } = request.body as {
        sender: string;
        message: string;
        userId: string;
        phoneLabel?: string;
        botNumber?: string | null;
      };

      // ── Step 0: Basic input validation ─────────────────────────────────
      if (!sender || !message || !userId) {
        fastify.log.warn({ sender, userId, botNumber }, 'Incoming webhook missing required fields');
        return reply.status(400).send({ success: false, message: 'Missing required fields: sender, message, userId' });
      }

      const secret = request.headers['x-gateway-secret'];
      // Optional: validate `secret` against process.env.GATEWAY_SECRET here

      fastify.log.info(
        { sender, userId, phoneLabel, botNumber: botNumber ?? 'unknown', preview: message?.slice(0, 20) },
        'Received WhatsApp Webhook'
      );

      // ── Step 1: Resolve orgId from botNumber (tenant lookup) ───────────
      //
      // `userId` is the Baileys session key — it equals the org UUID when
      // the dashboard creates a session, but we look up `whatsapp_sessions`
      // as the authoritative source so multiple numbers can share one org.
      //
      let resolvedOrgId: string = userId; // safe fallback

      if (botNumber) {
        const { data: sessionRecord, error: lookupError } = await supabase
          .from('whatsapp_sessions')
          .select('org_id')
          .eq('phone_number', botNumber)
          .maybeSingle();

        if (lookupError) {
          // DB error — log and continue with userId fallback (non-fatal)
          fastify.log.warn(
            { botNumber, err: lookupError.message },
            '[Tenant] whatsapp_sessions lookup failed — falling back to userId'
          );
        } else if (sessionRecord?.org_id) {
          // ✅ Authoritative org found — use it
          resolvedOrgId = sessionRecord.org_id;
          fastify.log.info(
            { botNumber, resolvedOrgId },
            '[Tenant] Resolved orgId from whatsapp_sessions'
          );
        } else {
          // Phone number not yet registered — upsert it so future lookups work instantly.
          // We use userId as orgId since this is the bootstrapping path.
          fastify.log.info(
            { botNumber, userId, phoneLabel },
            '[Tenant] New bot number — registering in whatsapp_sessions'
          );
          await supabase.from('whatsapp_sessions').upsert(
            {
              phone_number:    botNumber,
              org_id:          userId,          // userId is the orgId when session was created from dashboard
              phone_label:     phoneLabel,
              gateway_user_id: userId,
              status:          'CONNECTED',
              connected_at:    new Date().toISOString(),
            },
            { onConflict: 'phone_number' }
          );
          resolvedOrgId = userId;
        }
      } else {
        // No botNumber in payload — gateway session pre-dates this feature.
        // Fall back to userId cleanly.
        fastify.log.warn(
          { userId, sender },
          '[Tenant] botNumber missing from payload — using userId as orgId (legacy path)'
        );
      }

      // ── Step 2: Mark session as CONNECTED (keep status fresh) ──────────
      // This is a no-op upsert if the row already exists with CONNECTED status.
      if (botNumber) {
        supabase.from('whatsapp_sessions').upsert(
          {
            phone_number:    botNumber,
            org_id:          resolvedOrgId,
            phone_label:     phoneLabel,
            gateway_user_id: userId,
            status:          'CONNECTED',
            connected_at:    new Date().toISOString(),
          },
          { onConflict: 'phone_number' }
        ).then(({ error }) => {
          if (error) fastify.log.warn({ err: error.message, botNumber }, 'Failed to update session status');
        });
      }

      // ── Step 3: Fetch bot settings for this org ─────────────────────────
      let { data: settings } = await supabase
        .from('bot_settings')
        .select('*')
        .eq('org_id', resolvedOrgId)
        .maybeSingle();

      if (!settings) {
        // Auto-create settings if they don't exist for this org
        const { data: newSettings, error: insertError } = await supabase
          .from('bot_settings')
          .insert({ org_id: resolvedOrgId })
          .select()
          .single();

        if (!insertError) {
          settings = newSettings;
        } else {
          fastify.log.warn({ resolvedOrgId, insertError }, 'Failed to create default bot settings');
          return reply.send({ success: false, message: 'Bot settings missing and could not be created' });
        }
      }

      const botName       = settings.bot_name || 'Aria';
      const company       = settings.company_name || 'PulseAI';
      const tone          = settings.tone || 'Professional';
      const instructions  = settings.custom_instructions || '';
      const adminWhatsApp = settings.admin_whatsapp || '';

      // ── Step 4: Paywall — check trial status ────────────────────────────
      const { data: orgData } = await supabase
        .from('organizations')
        .select('is_premium, trial_started_at')
        .eq('id', resolvedOrgId)
        .maybeSingle();

      const isPremium       = orgData?.is_premium ?? false;
      const trialStartedAt  = orgData?.trial_started_at ? new Date(orgData.trial_started_at) : new Date();
      const trialExpiryDate = new Date(trialStartedAt.getTime() + 30 * 24 * 60 * 60 * 1000);
      const isExpired       = !isPremium && new Date() > trialExpiryDate;

      if (isExpired) {
        fastify.log.warn({ resolvedOrgId, sender, phoneLabel }, 'Trial expired — blocking response');
        try {
          await axios.post(`${gatewayUrl}/api/session/send`, {
            userId,        // gateway session key — unchanged
            phoneLabel,
            to: sender,
            message: 'Mohon maaf bot sedang ditangguhkan',
          });
        } catch (err: any) {
          fastify.log.error({ err: err.message }, 'Failed to send expiration notice via Gateway');
        }
        return reply.send({ success: false, message: 'Trial expired. Upgrade required.' });
      }

      // ── Step 5: Load conversation history from leads ────────────────────
      const { data: lead } = await supabase
        .from('leads')
        .select('*')
        .eq('org_id', resolvedOrgId)    // ← scoped to this tenant
        .eq('whatsapp', sender)
        .maybeSingle();

      const history: ChatMessage[] = (lead?.metadata as any)?.history || [];

      // ── Step 6: RAG — tenant-scoped knowledge retrieval ─────────────────
      // retrieveContext enforces `WHERE org_id = resolvedOrgId` inside the
      // match_knowledge_nodes RPC, so only this tenant's documents are searched.
      const chunks  = await retrieveContext(message, resolvedOrgId, 5);
      const context = buildContextBlock(chunks);

      // ── Step 7: Generate AI response ────────────────────────────────────
      let { message: botReply, triggerLeadCapture } = await generateChatResponse(
        message,
        history,
        context,
        botName,
        company,
        tone,
        instructions,
        adminWhatsApp,
        resolvedOrgId
      );

      // ── Step 8: Persist lead + conversation history ──────────────────────
      const newHistory = [
        ...history,
        { role: 'user',      content: message  },
        { role: 'assistant', content: botReply },
      ].slice(-10); // cap at 10 turns to limit DB payload size

      const metadata = {
        ...(lead?.metadata as Record<string, any> || {}),
        history: newHistory,
        source: triggerLeadCapture
          ? 'whatsapp_handover'
          : ((lead?.metadata as any)?.source || 'whatsapp_chat'),
      };

      if (!lead) {
        await supabase.from('leads').insert({
          org_id:       resolvedOrgId,
          name:         'WhatsApp User',
          whatsapp:     sender,
          last_message: message,
          metadata,
        });
      } else {
        await supabase.from('leads')
          .update({ last_message: message, metadata })
          .eq('id', lead.id);
      }

      // ── Step 9: Hot-lead admin notification (human fallback) ─────────────
      if (triggerLeadCapture) {
        fastify.log.info({ sender, resolvedOrgId }, 'Lead capture triggered from WhatsApp');

        if (adminWhatsApp) {
          const adminNumbers = adminWhatsApp
            .split(/[,;]+/)
            .map((n: string) => n.trim())
            .filter(Boolean);

          for (const rawNum of adminNumbers) {
            let cleanAdminWa = rawNum.replace(/\D/g, '');
            if (cleanAdminWa.startsWith('0')) cleanAdminWa = '62' + cleanAdminWa.substring(1);

            if (cleanAdminWa && cleanAdminWa !== sender) {
              const now = new Date();
              const wibTimestamp = now.toLocaleString('id-ID', {
                timeZone: 'Asia/Jakarta',
                weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
                hour: '2-digit', minute: '2-digit', hour12: false,
              }) + ' WIB';

              const previewMessage = message.length > 200 ? message.slice(0, 200) + '...' : message;

              const adminMsg =
`🚨 *NOTIFIKASI HOT LEADS - ${company.toUpperCase()}* 🚨

Ada calon peserta yang butuh bantuan admin manusia segera!

👤 *Kontak Leads:*
   📱 WhatsApp: wa.me/${sender}

💬 *Pesan Terakhir:*
"_${previewMessage}_"

🕐 *Waktu:* ${wibTimestamp}

➡️ Silakan balas langsung ke nomor di atas ya Kak!`;

              try {
                // Reply uses userId (gateway key) + phoneLabel (socket identifier)
                // so the notification comes from the SAME bot number that received the lead
                await axios.post(`${gatewayUrl}/api/session/send`, {
                  userId,
                  phoneLabel,
                  to:      cleanAdminWa,
                  message: adminMsg,
                });
                fastify.log.info({ adminWa: cleanAdminWa, leadsWa: sender, botNumber }, 'Hot leads notification sent');
              } catch (err: any) {
                fastify.log.error({ err: err.message, adminWa: cleanAdminWa }, 'Failed to notify admin');
              }
            }
          }
        }

        botReply += `\n\n_(Info: Permintaan Anda telah diteruskan ke tim kami dan agen manusia akan segera membalas pesan ini ya Kak!)_`;
      }

      // ── Step 10: Branding watermark for free-tier orgs ──────────────────
      if (!isPremium) {
        botReply += `\n\n---\n🤖 Powered by PulseAI.biz.id - Buat Bot WA Tokomu Gratis Sekarang!`;
      }

      // ── Step 11: Send reply via Gateway ─────────────────────────────────
      // userId + phoneLabel = gateway socket routing (NOT the orgId).
      // The reply MUST go out from the same bot number (botNumber) that received the chat.
      const typingDurationMs = Math.min(botReply.length * 28, 4_000);
      try {
        await axios.post(`${gatewayUrl}/api/session/send`, {
          userId,       // gateway session key — routes to the correct Baileys socket
          phoneLabel,   // identifies the exact number slot within that session
          to: sender,
          message: botReply,
          typingDurationMs,
        });
        fastify.log.info({ sender, botNumber, resolvedOrgId }, 'Reply sent via WhatsApp Gateway');
      } catch (gatewayErr: any) {
        fastify.log.error({ err: gatewayErr.message }, 'Failed to send reply via Gateway');
      }

      return reply.send({ success: true, message: 'Webhook processed and replied' });
    } catch (error: any) {
      fastify.log.error(error, 'Error processing WhatsApp webhook');
      return reply.status(500).send({ success: false, message: 'Internal Server Error' });
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // POST /api/whatsapp/session-status
  //
  // Called by the whatsapp-gateway when a Baileys socket transitions to
  // CONNECTED or DISCONNECTED, so we can keep whatsapp_sessions in sync
  // even without an incoming message event.
  //
  // Body: { userId, phoneLabel, botNumber, status, gatewayUserId }
  // ──────────────────────────────────────────────────────────────────────────
  fastify.post('/whatsapp/session-status', async (request, reply) => {
    try {
      const {
        userId,
        phoneLabel = 'default',
        botNumber,
        status,
      } = request.body as {
        userId: string;
        phoneLabel?: string;
        botNumber: string;
        status: 'CONNECTED' | 'DISCONNECTED' | 'CONNECTING' | 'QR_PENDING';
      };

      if (!userId || !botNumber || !status) {
        return reply.status(400).send({ success: false, message: 'Missing required fields: userId, botNumber, status' });
      }

      const allowedStatuses = ['CONNECTED', 'DISCONNECTED', 'CONNECTING', 'QR_PENDING'];
      if (!allowedStatuses.includes(status)) {
        return reply.status(400).send({ success: false, message: `Invalid status. Must be one of: ${allowedStatuses.join(', ')}` });
      }

      const now = new Date().toISOString();
      const upsertPayload: Record<string, any> = {
        phone_number:    botNumber,
        org_id:          userId,
        phone_label:     phoneLabel,
        gateway_user_id: userId,
        status,
      };

      if (status === 'CONNECTED')    upsertPayload.connected_at    = now;
      if (status === 'DISCONNECTED') upsertPayload.disconnected_at = now;

      const { error } = await supabase
        .from('whatsapp_sessions')
        .upsert(upsertPayload, { onConflict: 'phone_number' });

      if (error) {
        fastify.log.error({ err: error.message, botNumber, status }, 'Failed to update session status');
        return reply.status(500).send({ success: false, message: 'Failed to update session status' });
      }

      fastify.log.info({ botNumber, userId, phoneLabel, status }, 'Session status updated');
      return reply.send({ success: true, message: `Session status updated to ${status}` });
    } catch (error: any) {
      fastify.log.error(error, 'Error updating session status');
      return reply.status(500).send({ success: false, message: 'Internal Server Error' });
    }
  });

  // Health check
  fastify.get('/whatsapp/incoming', async (_request, reply) => {
    return reply.send({ success: true, message: 'WhatsApp Webhook endpoint is active (use POST to send data)' });
  });
}
