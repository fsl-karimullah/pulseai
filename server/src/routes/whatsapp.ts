import { FastifyInstance } from 'fastify';
import { supabase } from '../config/supabase';
import { retrieveContext, buildContextBlock } from '../services/rag';
import { generateChatResponse } from '../services/gemini';
import axios from 'axios';

export default async function whatsappRoutes(fastify: FastifyInstance) {
  
  // Endpoint to receive incoming WhatsApp messages from the Gateway
  fastify.post('/whatsapp/incoming', async (request, reply) => {
    try {
      const { sender, message, userId } = request.body as { sender: string; message: string; userId: string };
      
      const secret = request.headers['x-gateway-secret'];
      // Optional: Validate gateway secret here
      
      fastify.log.info({ sender, userId, preview: message?.slice(0, 20) }, 'Received WhatsApp Webhook');

      // 1. Fetch bot settings for this user/org
      let { data: settings } = await supabase
        .from('bot_settings')
        .select('*')
        .eq('org_id', userId)
        .maybeSingle();

      if (!settings) {
        // Auto-create settings if they don't exist for this Org
        const { data: newSettings, error: insertError } = await supabase
          .from('bot_settings')
          .insert({ org_id: userId })
          .select()
          .single();
        
        if (!insertError) {
          settings = newSettings;
        } else {
          fastify.log.warn({ userId, insertError }, 'Failed to create default bot settings');
          return reply.send({ success: false, message: 'Bot settings missing and could not be created' });
        }
      }

      const botName = settings.bot_name || 'Aria';
      const company = settings.company_name || 'PulseAI';
      const tone = settings.tone || 'Professional';
      const instructions = settings.custom_instructions || '';
      const adminWhatsApp = settings.admin_whatsapp || '';

      // Check Trial Status (Paywall Guard)
      const { data: orgData } = await supabase
        .from('organizations')
        .select('is_premium, trial_started_at')
        .eq('id', userId)
        .maybeSingle();

      const isPremium = orgData?.is_premium ?? false;
      const trialStartedAt = orgData?.trial_started_at ? new Date(orgData.trial_started_at) : new Date();
      const trialDays = 30;
      const trialExpiryDate = new Date(trialStartedAt.getTime() + trialDays * 24 * 60 * 60 * 1000);
      const isExpired = !isPremium && new Date() > trialExpiryDate;

      if (isExpired) {
        fastify.log.warn({ userId, sender }, 'Trial expired. Blocking WhatsApp response.');
        // Send a polite fallback message to the user
        try {
          await axios.post('http://localhost:4000/api/session/send', {
            userId,
            to: sender,
            message: 'Mohon maaf bot sedang ditangguhkan'
          });
        } catch (err: any) {
          fastify.log.error({ err: err.message }, 'Failed to send expiration notice via Gateway');
        }
        return reply.send({ success: false, message: 'Trial expired. Upgrade required.' });
      }

      // 2. RAG: retrieve relevant knowledge chunks
      const chunks = await retrieveContext(message, userId, 5);
      const context = buildContextBlock(chunks);

      // 3. Generate response using Gemini
      let { message: botReply, triggerLeadCapture } = await generateChatResponse(
        message,
        [], // WhatsApp doesn't send history yet (could implement DB-backed history later)
        context,
        botName,
        company,
        tone,
        instructions,
        adminWhatsApp,
        userId
      );

      // 4. Handle Handover / Lead Capture
      if (triggerLeadCapture) {
        fastify.log.info({ sender }, 'Lead capture triggered from WhatsApp');
        
        // Check if lead already exists to avoid duplicates
        const { data: existingLead } = await supabase
          .from('leads')
          .select('id')
          .eq('org_id', userId)
          .eq('whatsapp', sender)
          .maybeSingle();

        if (!existingLead) {
          await supabase.from('leads').insert({
            org_id: userId,
            name: `WhatsApp User`,
            whatsapp: sender,
            last_message: message,
            metadata: { source: 'whatsapp_handover' }
          });
        } else {
          await supabase.from('leads')
            .update({ last_message: message, updated_at: new Date().toISOString() })
            .eq('id', existingLead.id);
        }

        // Notify Admin via WhatsApp
        if (adminWhatsApp) {
          let cleanAdminWa = adminWhatsApp.replace(/\D/g, '');
          if (cleanAdminWa.startsWith('0')) cleanAdminWa = '62' + cleanAdminWa.substring(1);

          if (cleanAdminWa && cleanAdminWa !== sender) {
            const adminMsg = `🚨 *PulseAI Handover Request*\n\nUser: wa.me/${sender}\nLast Message: "${message}"\n\nSilakan hubungi user ini segera.`;
            try {
              await axios.post('http://localhost:4000/api/session/send', {
                userId,
                to: cleanAdminWa,
                message: adminMsg
              });
            } catch (err: any) {
              fastify.log.error({ err: err.message }, 'Failed to notify admin via WhatsApp');
            }
          }
        }

        // Append note to the user's reply
        botReply += `\n\n_(Info: Permintaan Anda telah diteruskan ke tim kami dan agen manusia akan segera membalas pesan ini ya Kak!)_`;
      }

      // 5. Forced Branding Watermark Injection
      if (!isPremium) {
        botReply += `\n\n---\n🤖 Powered by PulseAI.biz.id - Buat Bot WA Tokomu Gratis Sekarang!`;
      }

      // 6. Send the reply back via the WhatsApp Gateway
      try {
        await axios.post('http://localhost:4000/api/session/send', {
          userId,
          to: sender,
          message: botReply
        });
        fastify.log.info({ sender }, 'Successfully replied via WhatsApp Gateway');
      } catch (gatewayErr: any) {
        fastify.log.error({ err: gatewayErr.message }, 'Failed to send reply via Gateway');
      }
      
      return reply.send({ success: true, message: 'Webhook processed and replied' });
    } catch (error: any) {
      fastify.log.error(error, 'Error processing WhatsApp webhook');
      return reply.status(500).send({ success: false, message: 'Internal Server Error' });
    }
  });

  fastify.get('/whatsapp/incoming', async (request, reply) => {
    return reply.send({ success: true, message: 'WhatsApp Webhook endpoint is active (use POST to send data)' });
  });
}
