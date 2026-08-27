import { FastifyInstance } from 'fastify';
import { supabase } from '../config/supabase';
import { retrieveContextByProject, buildContextBlock } from '../services/rag';
import { generateChatResponse, type ChatMessage } from '../services/gemini';
import { resolveDefaultProjectId } from '../services/projects';
import axios from 'axios';
import { authenticate } from '../middleware/auth';
import { aiQueue } from '../config/redis';
// ──────────────────────────────────────────────────────────────────────────
// Resolves which Project a WhatsApp number (org_id + phoneLabel) belongs to.
//
//   1. Check whatsapp_session_intents — the dashboard writes a row here
//      (POST /whatsapp/session-intent) right before it asks the gateway to
//      start pairing a NEW number, recording which Project the client chose.
//      Consumed (deleted) once used, so a stale intent can't leak into a
//      future reconnect under the same label.
//   2. Fall back to the org's default (oldest) project — covers numbers
//      that existed before Projects existed, and any legacy/edge path.
// ──────────────────────────────────────────────────────────────────────────
async function resolveProjectId(orgId: string, phoneLabel: string, fallbackProjectId?: string | null): Promise<string | null> {
  const { data: intent } = await supabase
    .from('whatsapp_session_intents')
    .select('id, project_id')
    .eq('org_id', orgId)
    .eq('phone_label', phoneLabel)
    .maybeSingle();

  if (intent?.project_id) {
    // Consume it — this intent has now been applied to a real session.
    await supabase.from('whatsapp_session_intents').delete().eq('id', intent.id);
    return intent.project_id;
  }

  if (fallbackProjectId) {
    return fallbackProjectId;
  }

  return resolveDefaultProjectId(orgId);
}

// Helper to identify if a number is a WhatsApp Linked ID (LID)
function isLidNumber(num: string): boolean {
  // LIDs are long numeric strings (14–20 digits) that do NOT look like
  // Indonesian phone numbers (which always start with '62' or '0').
  // Examples of real LIDs: '220525532057759' (starts with '2'), '8xxxxxxxxxxxxxxx'
  if (num.length < 14) return false;                        // too short to be a LID
  if (num.startsWith('62') || num.startsWith('0')) return false; // looks like a real phone
  return true; // anything else this long is probably a LID
}

// Helper to extract phone number from message text or history
function extractIndonesianPhoneNumber(text: string): string | null {
  // Find all sequences that look like phone numbers
  // Matches: +62 8..., 628..., 08... with optional spaces/hyphens/parentheses
  const regex = /(?:\+?62|0)[0-9\-\s()]{8,20}/g;
  const matches = text.match(regex);
  if (!matches) return null;

  for (const match of matches) {
    // Clean all non-digit characters
    let cleaned = match.replace(/\D/g, '');
    
    // Normalize 08... to 628...
    if (cleaned.startsWith('0')) {
      cleaned = '62' + cleaned.substring(1);
    }
    
    // Validate length: Indonesian mobile numbers are usually 10-13 digits long (without country code)
    // Which means 12-15 digits long with '62' prefix.
    // Let's be flexible and allow 11 to 15 digits total.
    if (cleaned.startsWith('628') && cleaned.length >= 11 && cleaned.length <= 15) {
      return cleaned;
    }
  }
  
  return null;
}

function getLeadPhoneNumber(
  currentMessage: string,
  history: ChatMessage[],
  fallbackSender: string,
  existingPhone?: string | null
): string {
  // Combine all user messages from history and current message
  const userMessages = history
    .filter(m => m.role === 'user')
    .map(m => m.content)
    .concat(currentMessage);

  // Try to find a phone number in any of these messages, starting from the most recent
  for (let i = userMessages.length - 1; i >= 0; i--) {
    const phone = extractIndonesianPhoneNumber(userMessages[i]);
    if (phone) return phone;
  }

  // If no phone number is found in the chat, check if we have a valid (non-LID) phone number from the existing lead record
  if (existingPhone && !isLidNumber(existingPhone)) {
    return existingPhone;
  }

  // Fallback: use sender JID stripped of suffix
  let clean = fallbackSender.replace(/@(s\.whatsapp\.net|lid)$/, '');
  if (clean.startsWith('0')) {
    clean = '62' + clean.substring(1);
  }
  return clean;
}

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
        senderPn,   // Clean phone number from gateway (null for LID/multi-device contacts)
        pushName,   // WhatsApp profile name (fallback: WhatsApp User)
        message,
        userId,
        phoneLabel = 'default',
        botNumber,
        replyJid, // Full JID with @lid or @s.whatsapp.net suffix — use for sending replies
      } = request.body as {
        sender: string;
        senderPn?: string | null; // Authoritative phone number — always use this for leads.whatsapp when not null
        pushName?: string;
        message: string;
        userId: string;
        phoneLabel?: string;
        botNumber?: string | null;
        replyJid?: string; // May differ from sender when LIDs are involved
      };

      // ── Step 0: Basic input validation ─────────────────────────────────
      if (!sender || !message || !userId) {
        fastify.log.warn({ sender, userId, botNumber }, 'Incoming webhook missing required fields');
        return reply.status(400).send({ success: false, message: 'Missing required fields: sender, message, userId' });
      }

      // ── Step 0.5: Skip HRD bot auto-reply ─────────────────────────────
      // HRD numbers are strictly for outbound sending (CV Screening).
      // We don't want the AI chatbot to auto-reply to candidates here.
      if (phoneLabel === 'hrd') {
        fastify.log.info({ sender, phoneLabel }, 'Skipping AI auto-reply for HRD number');
        return reply.send({ success: true, message: 'Ignored (HRD number does not auto-reply)' });
      }

      // The address we actually send replies TO — use replyJid when provided (handles @lid contacts)
      // Falls back to raw sender if gateway didn't send replyJid (backward compat)
      const replyTo = replyJid || sender;

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
      let resolvedProjectId: string | null = null;

      if (botNumber) {
        const { data: sessionRecord, error: lookupError } = await supabase
          .from('whatsapp_sessions')
          .select('org_id, project_id')
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
          resolvedProjectId = sessionRecord.project_id ?? null;
          fastify.log.info(
            { botNumber, resolvedOrgId, resolvedProjectId },
            '[Tenant] Resolved orgId/projectId from whatsapp_sessions'
          );
        } else {
          // Phone number not yet registered — upsert it so future lookups work instantly.
          // We use userId as orgId since this is the bootstrapping path.
          resolvedProjectId = await resolveProjectId(userId, phoneLabel);
          fastify.log.info(
            { botNumber, userId, phoneLabel, resolvedProjectId },
            '[Tenant] New bot number — registering in whatsapp_sessions'
          );
          await supabase.from('whatsapp_sessions').upsert(
            {
              phone_number:    botNumber,
              org_id:          userId,          // userId is the orgId when session was created from dashboard
              project_id:      resolvedProjectId,
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

      // Safety net: any path that didn't resolve a project (e.g. lookup error
      // above) still falls back to the org's default project.
      if (!resolvedProjectId) {
        resolvedProjectId = await resolveProjectId(resolvedOrgId, phoneLabel);
      }

      // ── Step 1.5: Log incoming customer message ────────────────────────
      try {
        await supabase.from('chat_logs').insert({
          tenant_id: resolvedOrgId,
          bot_number: botNumber ?? '',
          customer_number: sender,
          sender: 'customer',
          message_text: message,
        });
      } catch (logErr: any) {
        fastify.log.warn({ err: logErr.message }, 'Failed to log customer message to chat_logs');
      }

      // ── Step 2: Mark session as CONNECTED (keep status fresh) ──────────
      // This is a no-op upsert if the row already exists with CONNECTED status.
      if (botNumber) {
        supabase.from('whatsapp_sessions').upsert(
          {
            phone_number:    botNumber,
            org_id:          resolvedOrgId,
            project_id:      resolvedProjectId,
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

      // ── Step 3: Fetch bot settings for this project ─────────────────────
      // bot_settings is now scoped per-project (1 row per project) instead
      // of per-org, so channels in different projects can carry different
      // bot personalities/appearance even within the same organization.
      let { data: settings } = await supabase
        .from('bot_settings')
        .select('*')
        .eq('project_id', resolvedProjectId)
        .maybeSingle();

      if (!settings) {
        // Auto-create settings if they don't exist for this project
        const { data: newSettings, error: insertError } = await supabase
          .from('bot_settings')
          .insert({ org_id: resolvedOrgId, project_id: resolvedProjectId })
          .select()
          .single();

        if (!insertError) {
          settings = newSettings;
        } else {
          fastify.log.warn({ resolvedOrgId, resolvedProjectId, insertError }, 'Failed to create default bot settings');
          return reply.send({ success: false, message: 'Bot settings missing and could not be created' });
        }
      }

      const botName       = settings.bot_name || 'Aria';
      const company       = settings.company_name || 'PulseAI';
      const tone          = settings.tone || 'Professional';
      const instructions  = settings.custom_instructions || '';
      const adminWhatsApp = settings.admin_whatsapp || '';

      // ── Step 4: Paywall — check subscription and credits ─────────────────
      const { data: sub } = await supabase
        .from('subscriptions')
        .select('plan_type, credits')
        .eq('org_id', resolvedOrgId)
        .maybeSingle();

      const isSubscriber = sub && sub.plan_type !== 'free';
      const currentCredits = sub?.credits ?? 0;

      if (!isSubscriber && currentCredits <= 0) {
        fastify.log.warn({ resolvedOrgId, sender, phoneLabel }, 'Credits exhausted — blocking response');
        try {
          await axios.post(`${gatewayUrl}/api/session/send`, {
            userId,
            phoneLabel,
            to: replyTo,
            message: 'Mohon maaf, kredit AI Anda telah habis. Silakan top-up untuk melanjutkan percakapan.',
          });

          // Log bot suspension message to chat_logs
          await supabase.from('chat_logs').insert({
            tenant_id: resolvedOrgId,
            bot_number: botNumber ?? '',
            customer_number: sender,
            sender: 'bot',
            message_text: 'Mohon maaf, kredit AI Anda telah habis.',
          });
        } catch (err: any) {
          fastify.log.error({ err: err.message }, 'Failed to send credit exhaustion notice via Gateway');
        }
        return reply.send({ success: false, message: 'Credits exhausted. Top-up required.' });
      }

      // ── Step 5: Load conversation history from leads ────────────────────
      const cleanSender = sender.replace(/@(s\.whatsapp\.net|lid)$/, '');
      const { data: lead } = await supabase
        .from('leads')
        .select('*')
        .eq('org_id', resolvedOrgId)    // ← scoped to this tenant
        .or(`whatsapp.eq.${cleanSender},metadata->>jid.eq.${cleanSender}`)
        .maybeSingle();

      const history: ChatMessage[] = (lead?.metadata as any)?.history || [];

      // ── Step 6: RAG — project-scoped knowledge retrieval ─────────────────
      // retrieveContextByProject enforces `WHERE project_id = resolvedProjectId`
      // inside the match_knowledge_nodes_by_project RPC, so this channel only
      // ever reads the Knowledge Base documents that belong to its own Project.
      const chunks  = await retrieveContextByProject(message, resolvedProjectId as string, 5);
      const context = buildContextBlock(chunks);

      // ── Step 7: Determine the authoritative phone number for this lead ──
      // Priority: senderPn (from gateway, always clean) > getLeadPhoneNumber() fallback
      // senderPn is set by the gateway ONLY for @s.whatsapp.net contacts (real phones).
      // For LID/multi-device contacts, senderPn is null and we fall back to heuristic extraction.
      const leadPhone = senderPn ?? getLeadPhoneNumber(message, history, cleanSender, lead?.whatsapp);
      const hasValidPhone = senderPn != null || !isLidNumber(leadPhone);

      fastify.log.info(
        { senderPn, leadPhone, hasValidPhone, sender },
        '[Lead] Resolved phone for lead storage'
      );

      // ── Step 8: Enqueue job to AI Worker ─────────────────────────────────
      await aiQueue.add('process-whatsapp', {
        type: 'whatsapp',
        data: {
          message,
          history,
          context,
          botName,
          company,
          tone,
          instructions,
          adminWhatsApp,
          resolvedOrgId,
          resolvedProjectId,
          hasValidPhone,
          isFirstMessage: history.length === 0,
          lead,
          cleanSender,
          botNumber,
          replyTo,
          userId,
          phoneLabel,
          sender,
          pushName,
          leadPhone,
          isSubscriber,
          currentCredits,
        }
      });

      return reply.code(202).send({ success: true, message: 'Webhook accepted and queued' });
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

      const { data: existingSession } = await supabase
        .from('whatsapp_sessions')
        .select('project_id')
        .eq('phone_number', botNumber)
        .maybeSingle();

      // Resolve project_id for this session.
      // Priority: 1. Dashboard Intent, 2. Existing Session Project, 3. Org Default
      const resolvedProjectId = await resolveProjectId(
        userId,
        phoneLabel,
        existingSession?.project_id
      );

      const now = new Date().toISOString();
      const upsertPayload: Record<string, any> = {
        phone_number:    botNumber,
        org_id:          userId,
        project_id:      resolvedProjectId,
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

  // ──────────────────────────────────────────────────────────────────────────
  // POST /api/whatsapp/session-intent
  //
  // Called by the dashboard right BEFORE it asks whatsapp-gateway to start
  // pairing a new number. Records which Project the client picked for this
  // phoneLabel, so that once the gateway reports back the real phone_number
  // (via /whatsapp/incoming or /whatsapp/session-status), the resulting
  // whatsapp_sessions row lands in the right project instead of always
  // falling back to the org's default project.
  //
  // Body: { phoneLabel, projectId }
  // Auth:  Bearer token (same user that owns the org)
  // ──────────────────────────────────────────────────────────────────────────
  fastify.post(
    '/whatsapp/session-intent',
    { preHandler: [authenticate] },
    async (request, reply) => {
      try {
        const userId = (request as any).user?.id;
        const { phoneLabel, projectId } = request.body as { phoneLabel?: string; projectId?: string };

        if (!phoneLabel || !projectId) {
          return reply.status(400).send({ success: false, message: 'Missing required fields: phoneLabel, projectId' });
        }

        const { data: org } = await supabase
          .from('organizations')
          .select('id')
          .eq('user_id', userId)
          .maybeSingle();

        if (!org) {
          return reply.status(404).send({ success: false, message: 'Organisasi tidak ditemukan' });
        }

        // Verify the chosen project actually belongs to this org.
        const { data: project } = await supabase
          .from('projects')
          .select('id')
          .eq('id', projectId)
          .eq('org_id', org.id)
          .maybeSingle();

        if (!project) {
          return reply.status(403).send({ success: false, message: 'Project tidak ditemukan atau bukan milik Anda' });
        }

        const { error } = await supabase
          .from('whatsapp_session_intents')
          .upsert(
            { org_id: org.id, phone_label: phoneLabel, project_id: projectId },
            { onConflict: 'org_id,phone_label' }
          );

        if (error) {
          fastify.log.error({ err: error.message, orgId: org.id, phoneLabel }, 'Failed to record session intent');
          return reply.status(500).send({ success: false, message: 'Gagal menyimpan pilihan project' });
        }

        return reply.send({ success: true, message: 'Session intent recorded' });
      } catch (error: any) {
        fastify.log.error(error, 'Error recording session intent');
        return reply.status(500).send({ success: false, message: 'Internal Server Error' });
      }
    }
  );

  // ──────────────────────────────────────────────────────────────────────────
  // GET /api/chats
  //
  // Retrieves chat logs history between a bot number and a customer number.
  // Ordered by created_at ASC. Only allows accessing chats of owned organizations.
  // ──────────────────────────────────────────────────────────────────────────
  fastify.get(
    '/chats',
    { preHandler: [authenticate] },
    async (request, reply) => {
      try {
        const userId = (request as any).user?.id;
        const { botNumber, customerNumber } = request.query as {
          botNumber?: string;
          customerNumber?: string;
        };

        if (!customerNumber) {
          return reply.status(400).send({
            success: false,
            message: "Missing required query parameter: 'customerNumber'.",
          });
        }

        // Verify the organization owns this botNumber (tenant isolation check)
        const { data: org } = await supabase
          .from('organizations')
          .select('id')
          .eq('user_id', userId)
          .maybeSingle();

        if (!org) {
          return reply.status(404).send({ success: false, message: 'Organisasi tidak ditemukan' });
        }

        // Determine which bot numbers to search
        // If botNumber is provided, verify it belongs to this org and use it directly.
        // If not provided, fetch ALL bot numbers for this org and search across all of them.
        let botNumbers: string[] = [];

        if (botNumber) {
          // Verify ownership
          const { data: sessionCheck } = await supabase
            .from('whatsapp_sessions')
            .select('org_id')
            .eq('phone_number', botNumber)
            .eq('org_id', org.id)
            .maybeSingle();

          if (!sessionCheck) {
            fastify.log.warn({ botNumber, orgId: org.id }, 'Unauthorized access attempt to chats');
            return reply.status(403).send({ success: false, message: 'Akses ditolak.' });
          }
          botNumbers = [botNumber];
        } else {
          // No botNumber supplied — get all bot numbers for this org
          const { data: sessions } = await supabase
            .from('whatsapp_sessions')
            .select('phone_number')
            .eq('org_id', org.id);

          botNumbers = (sessions || []).map((s: any) => s.phone_number).filter(Boolean);

          if (botNumbers.length === 0) {
            // No sessions at all for this org — return empty gracefully
            return reply.send({ success: true, messages: [] });
          }

          fastify.log.info(
            { orgId: org.id, botNumbers, customerNumber },
            '[Chats] botNumber not supplied — searching across all org sessions'
          );
        }

        // Look up lead to map phone number and original JID
        const cleanCust = customerNumber.replace(/@(s\.whatsapp\.net|lid)$/, '');
        const { data: leadDataRows } = await supabase
          .from('leads')
          .select('whatsapp, metadata')
          .eq('org_id', org.id)
          .or(`whatsapp.eq.${cleanCust},metadata->>jid.eq.${cleanCust}`);

        const identifiers = [customerNumber, cleanCust];
        if (leadDataRows && leadDataRows.length > 0) {
          for (const leadData of leadDataRows) {
            if (leadData.whatsapp) {
              identifiers.push(leadData.whatsapp);
              identifiers.push(leadData.whatsapp.replace(/@(s\.whatsapp\.net|lid)$/, ''));
            }
            const jid = (leadData.metadata as any)?.jid;
            if (jid) {
              identifiers.push(jid);
              identifiers.push(jid.replace(/@(s\.whatsapp\.net|lid)$/, ''));
            }
          }
        }

        // Build all identifier variants to search customer_number column
        const allIdentifiers = Array.from(new Set(
          identifiers.flatMap(id => [
            id,
            `${id}@s.whatsapp.net`,
            `${id}@lid`
          ])
        ));

        // CRITICAL: Apply ALL filters (.eq/.in) BEFORE calling .order()
        // Supabase JS v2: .order() returns PostgrestTransformBuilder which has no filter methods.
        // Pattern: filter chain → then order at the very end.
        let chatQuery: any = supabase
          .from('chat_logs')
          .select('*')
          .in('customer_number', allIdentifiers);

        if (botNumbers.length === 1) {
          chatQuery = chatQuery.eq('bot_number', botNumbers[0]);
        } else {
          chatQuery = chatQuery.in('bot_number', botNumbers);
        }

        // Order LAST — after all filters
        const { data, error } = await chatQuery.order('created_at', { ascending: true });

        if (error) {
          fastify.log.error(
            { code: error.code, msg: error.message, details: error.details, hint: error.hint, botNumbers, allIdentifiers },
            'Failed to fetch chat logs'
          );
          return reply.status(500).send({
            success: false,
            message: 'Gagal mengambil riwayat chat.',
          });
        }

        fastify.log.info({ count: (data || []).length, botNumbers, customerNumber }, '[Chats] Fetched successfully');
        return reply.send({
          success: true,
          messages: data || [],
        });
      } catch (error: any) {
        fastify.log.error(error, 'Error fetching chats');
        return reply.status(500).send({ success: false, message: 'Internal Server Error' });
      }
    }
  );

  // ──────────────────────────────────────────────────────────────────────────
  // GET /api/whatsapp-sessions
  //
  // Retrieves the list of WhatsApp sessions (bot numbers) registered for this
  // tenant. Optional query param `projectId` narrows the list to a single
  // Project; omitted keeps the old org-wide behavior.
  // ──────────────────────────────────────────────────────────────────────────
  fastify.get(
    '/whatsapp-sessions',
    { preHandler: [authenticate] },
    async (request, reply) => {
      try {
        const userId = (request as any).user?.id;
        const { projectId } = request.query as { projectId?: string };

        const { data: org } = await supabase
          .from('organizations')
          .select('id')
          .eq('user_id', userId)
          .maybeSingle();

        if (!org) {
          return reply.status(404).send({ success: false, message: 'Organisasi tidak ditemukan' });
        }

        let sessionsQuery = supabase.from('whatsapp_sessions').select('*').eq('org_id', org.id);
        if (projectId) {
          sessionsQuery = sessionsQuery.eq('project_id', projectId);
        }
        const { data: sessionsList, error } = await sessionsQuery;

        if (error) {
          fastify.log.error(error, 'Failed to fetch whatsapp sessions');
          return reply.status(500).send({ success: false, message: 'Gagal mengambil data WhatsApp sessions.' });
        }

        return reply.send({ success: true, sessions: sessionsList });
      } catch (error: any) {
        return reply.status(500).send({ success: false, message: error.message });
      }
    }
  );


  // ──────────────────────────────────────────────────────────────────────────
  // DELETE /api/whatsapp/disconnect
  //
  // Authenticated route called by the dashboard "Putuskan" button.
  // Reliably disconnects a WhatsApp session: calls the gateway to close the
  // Baileys socket AND updates the DB row — even if the socket is already gone.
  //
  // Query: { phoneLabel }
  // Auth:  Bearer token (same user that owns the org)
  // ──────────────────────────────────────────────────────────────────────────
  fastify.delete(
    '/whatsapp/disconnect',
    { preHandler: [authenticate] },
    async (request, reply) => {
      try {
        const userId = (request as any).user?.id;
        const { phoneLabel } = request.query as { phoneLabel?: string };

        if (!phoneLabel) {
          return reply.status(400).send({ success: false, message: "Missing required query parameter: 'phoneLabel'" });
        }

        // Resolve org for this authenticated user
        const { data: org } = await supabase
          .from('organizations')
          .select('id')
          .eq('user_id', userId)
          .maybeSingle();

        if (!org) {
          return reply.status(404).send({ success: false, message: 'Organisasi tidak ditemukan' });
        }

        const orgId = org.id;

        // Fetch the session record so we know the gateway_user_id and phone_number
        const { data: sessionRow } = await supabase
          .from('whatsapp_sessions')
          .select('phone_number, gateway_user_id, status')
          .eq('org_id', orgId)
          .eq('phone_label', phoneLabel)
          .maybeSingle();

        // Step 1: Tell the gateway to close the Baileys socket (best-effort — non-fatal)
        const gatewayUserId = sessionRow?.gateway_user_id ?? orgId;
        try {
          await axios.delete(`${gatewayUrl}/api/session/logout`, {
            params: { userId: gatewayUserId, phoneLabel },
          });
          fastify.log.info({ orgId, phoneLabel }, '[Disconnect] Gateway session closed');
        } catch (gwErr: any) {
          // Session may already be gone from gateway memory — that's fine, carry on
          fastify.log.warn(
            { err: gwErr.message, orgId, phoneLabel },
            '[Disconnect] Gateway logout call failed (non-fatal — will still update DB)'
          );
        }

        // Step 2: Always update the DB row to DISCONNECTED regardless of gateway result
        if (sessionRow?.phone_number) {
          await supabase
            .from('whatsapp_sessions')
            .update({
              status: 'DISCONNECTED',
              disconnected_at: new Date().toISOString(),
            })
            .eq('phone_number', sessionRow.phone_number);
          fastify.log.info({ orgId, phoneLabel, phone: sessionRow.phone_number }, '[Disconnect] DB row marked DISCONNECTED');
        } else {
          fastify.log.warn({ orgId, phoneLabel }, '[Disconnect] No session row found in DB — nothing to update');
        }

        return reply.send({ success: true, message: `Sesi '${phoneLabel}' berhasil diputuskan.` });
      } catch (error: any) {
        fastify.log.error(error, '[Disconnect] Error during disconnect');
        return reply.status(500).send({ success: false, message: 'Internal Server Error' });
      }
    }
  );

  // Health check
  fastify.get('/whatsapp/incoming', async (_request, reply) => {
    return reply.send({ success: true, message: 'WhatsApp Webhook endpoint is active (use POST to send data)' });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // META WHATSAPP CLOUD API WEBHOOK & OAUTH
  // ──────────────────────────────────────────────────────────────────────────

  // POST /api/whatsapp/meta/exchange-token - Embedded Signup OAuth Callback
  fastify.post('/whatsapp/meta/exchange-token', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const userId = (request as any).user?.id;
      const { code, phoneLabel = 'meta-official', projectId } = request.body as {
        code: string;
        phoneLabel?: string;
        projectId: string;
      };

      if (!code || !projectId) {
        return reply.status(400).send({ success: false, message: 'Missing required fields: code, projectId' });
      }

      // Verify org ownership
      const { data: org } = await supabase.from('organizations').select('id').eq('user_id', userId).maybeSingle();
      if (!org) return reply.status(404).send({ success: false, message: 'Organisasi tidak ditemukan' });

      const appId = process.env.FACEBOOK_APP_ID;
      const appSecret = process.env.FACEBOOK_APP_SECRET;

      if (!appId || !appSecret) {
        return reply.status(500).send({ success: false, message: 'Konfigurasi Meta App belum diatur di server.' });
      }

      // 1. Exchange OAuth code for System User Access Token
      const tokenRes = await axios.get(`https://graph.facebook.com/v26.0/oauth/access_token`, {
        params: {
          client_id: appId,
          client_secret: appSecret,
          code: code
        }
      });
      const systemUserAccessToken = tokenRes.data.access_token;

      // 2. Fetch the newly created WABA and Phone Numbers using the system token
      // First, get the business client's WABA
      const clientWabaRes = await axios.get(`https://graph.facebook.com/v26.0/me/client_whatsapp_business_accounts`, {
        headers: { Authorization: `Bearer ${systemUserAccessToken}` }
      });
      
      const wabaId = clientWabaRes.data.data?.[0]?.id;
      if (!wabaId) {
        return reply.status(400).send({ success: false, message: 'Gagal menemukan WhatsApp Business Account. Pastikan Anda menyelesaikan pendaftaran.' });
      }

      // Then get the phone numbers associated with this WABA
      const phoneRes = await axios.get(`https://graph.facebook.com/v26.0/${wabaId}/phone_numbers`, {
        headers: { Authorization: `Bearer ${systemUserAccessToken}` }
      });
      
      const phoneData = phoneRes.data.data?.[0];
      if (!phoneData) {
        return reply.status(400).send({ success: false, message: 'Gagal menemukan Nomor Telepon terdaftar.' });
      }

      const metaPhoneNumberId = phoneData.id;
      const displayPhoneNumber = phoneData.display_phone_number.replace(/\D/g, ''); // Extract just digits

      // 3. Upsert into whatsapp_sessions
      const { error } = await supabase.from('whatsapp_sessions').upsert({
        phone_number: displayPhoneNumber,
        org_id: org.id,
        project_id: projectId,
        phone_label: phoneLabel,
        gateway_user_id: userId,
        status: 'CONNECTED',
        platform: 'meta',
        meta_waba_id: wabaId,
        meta_phone_number_id: metaPhoneNumberId,
        meta_access_token: systemUserAccessToken,
        connected_at: new Date().toISOString()
      }, { onConflict: 'phone_number' });

      if (error) throw error;

      return reply.send({ success: true, message: 'WhatsApp Meta berhasil dihubungkan!', phone_number: displayPhoneNumber });

    } catch (error: any) {
      fastify.log.error(error.response?.data || error.message, 'Error exchanging Meta Token');
      return reply.status(500).send({ success: false, message: 'Terjadi kesalahan saat memproses otorisasi Meta.' });
    }
  });

  // GET /api/whatsapp/meta/webhook - Meta verification endpoint
  fastify.get('/whatsapp/meta/webhook', async (request, reply) => {
    const query = request.query as any;
    const mode = query['hub.mode'];
    const token = query['hub.verify_token'];
    const challenge = query['hub.challenge'];

    const verifyToken = process.env.META_VERIFY_TOKEN;

    if (mode && token) {
      if (mode === 'subscribe' && token === verifyToken) {
        fastify.log.info('Meta WhatsApp Webhook verified successfully.');
        // Meta expects the challenge to be returned as plain text (or raw string)
        return reply.type('text/plain').status(200).send(challenge);
      } else {
        fastify.log.warn('Meta WhatsApp Webhook verification failed.');
        return reply.status(403).send('Forbidden');
      }
    }
    
    return reply.status(400).send('Bad Request');
  });

  // POST /api/whatsapp/meta/webhook - Meta payload endpoint
  fastify.post('/whatsapp/meta/webhook', async (request, reply) => {
    const body = request.body as any;
    
    if (body.object === 'whatsapp_business_account') {
      try {
        const changes = body.entry?.[0]?.changes?.[0]?.value;
        if (!changes || !changes.messages || changes.messages.length === 0) {
          return reply.status(200).send('EVENT_RECEIVED');
        }
        
        const messageObj = changes.messages[0];
        if (messageObj.type !== 'text') {
          return reply.status(200).send('EVENT_RECEIVED');
        }

        const sender = messageObj.from;
        const pushName = changes.contacts?.[0]?.profile?.name || 'Customer';
        const messageText = messageObj.text.body;
        const botNumber = changes.metadata.display_phone_number.replace(/\D/g, '');
        const phoneNumberId = changes.metadata.phone_number_id;

        fastify.log.info({ sender, botNumber, message: messageText.slice(0, 20) }, 'Processing Meta Incoming Message');

        // ── Step 1: Resolve orgId from botNumber ───────────
        const { data: sessionRecord, error: lookupError } = await supabase
          .from('whatsapp_sessions')
          .select('org_id, project_id, phone_label, gateway_user_id, meta_access_token')
          .eq('phone_number', botNumber)
          .maybeSingle();

        if (!sessionRecord) {
          fastify.log.warn({ botNumber }, '[Meta] Unregistered bot number, ignoring message');
          return reply.status(200).send('EVENT_RECEIVED');
        }

        const resolvedOrgId = sessionRecord.org_id;
        const phoneLabel = sessionRecord.phone_label || 'meta';
        const userId = sessionRecord.gateway_user_id || resolvedOrgId;
        const resolvedProjectId = sessionRecord.project_id || await resolveDefaultProjectId(resolvedOrgId);

        // ── Step 1.5: Log incoming customer message ────────
        try {
          await supabase.from('chat_logs').insert({
            tenant_id: resolvedOrgId,
            bot_number: botNumber,
            customer_number: sender,
            sender: 'customer',
            message_text: messageText,
          });
        } catch (logErr: any) {
          fastify.log.warn({ err: logErr.message }, 'Failed to log Meta message to chat_logs');
        }

        // ── Step 2: Fetch bot settings ─────────────────────
        let { data: settings } = await supabase
          .from('bot_settings')
          .select('*')
          .eq('project_id', resolvedProjectId)
          .maybeSingle();

        if (!settings) {
          const { data: newSettings, error: insertError } = await supabase
            .from('bot_settings')
            .insert({ org_id: resolvedOrgId, project_id: resolvedProjectId })
            .select()
            .single();
          if (!insertError) settings = newSettings;
        }

        const botName       = settings?.bot_name || 'Aria';
        const company       = settings?.company_name || 'PulseAI';
        const tone          = settings?.tone || 'Professional';
        const instructions  = settings?.custom_instructions || '';
        const adminWhatsApp = settings?.admin_whatsapp || '';

        // ── Step 3: Paywall ─────────────────────────────────
        const { data: sub } = await supabase
          .from('subscriptions')
          .select('plan_type, credits')
          .eq('org_id', resolvedOrgId)
          .maybeSingle();

        const isSubscriber = sub && sub.plan_type !== 'free';
        const currentCredits = sub?.credits ?? 0;

        if (!isSubscriber && currentCredits <= 0) {
          fastify.log.warn({ resolvedOrgId, sender }, '[Meta] Credits exhausted — blocking response');
          // Send exhaustion notice via Meta API directly
          const token = sessionRecord.meta_access_token || process.env.META_ACCESS_TOKEN;
          if (token) {
            await axios.post(
              `https://graph.facebook.com/v26.0/${phoneNumberId}/messages`,
              {
                messaging_product: 'whatsapp',
                to: sender,
                type: 'text',
                text: { body: 'Mohon maaf, kredit AI Anda telah habis. Silakan top-up untuk melanjutkan percakapan.' }
              },
              { headers: { Authorization: `Bearer ${token}` } }
            ).catch(e => fastify.log.error(e.message, 'Failed sending Meta limit notice'));
          }
          return reply.status(200).send('EVENT_RECEIVED');
        }

        // ── Step 4: Conversation history ────────────────────
        const cleanSender = sender.replace(/@(s\.whatsapp\.net|lid)$/, '');
        const { data: lead } = await supabase
          .from('leads')
          .select('*')
          .eq('org_id', resolvedOrgId)
          .or(`whatsapp.eq.${cleanSender},metadata->>jid.eq.${cleanSender}`)
          .maybeSingle();

        const history: ChatMessage[] = (lead?.metadata as any)?.history || [];

        // ── Step 5: RAG ────────────────────────────────────
        const chunks  = await retrieveContextByProject(messageText, resolvedProjectId as string, 5);
        const context = buildContextBlock(chunks);

        const leadPhone = getLeadPhoneNumber(messageText, history, cleanSender, lead?.whatsapp);
        const hasValidPhone = !isLidNumber(leadPhone);

        // ── Step 6: Enqueue to AI Worker ───────────────────
        await aiQueue.add('process-whatsapp', {
          type: 'whatsapp',
          data: {
            message: messageText,
            history,
            context,
            botName,
            company,
            tone,
            instructions,
            adminWhatsApp,
            resolvedOrgId,
            resolvedProjectId,
            hasValidPhone,
            isFirstMessage: history.length === 0,
            lead,
            cleanSender,
            botNumber,
            replyTo: sender,
            userId,
            phoneLabel,
            sender,
            pushName,
            leadPhone,
            isSubscriber,
            currentCredits,
            platform: 'meta', // NEW FIELD
            metaPhoneNumberId: phoneNumberId, // NEW FIELD
            metaAccessToken: sessionRecord.meta_access_token // NEW FIELD
          }
        });

      } catch (err: any) {
        fastify.log.error({ err: err.message }, '[Meta Webhook] Error processing incoming payload');
      }

      return reply.status(200).send('EVENT_RECEIVED');
    } else {
      return reply.status(404).send('Not Found');
    }
  });
}
