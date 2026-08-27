import { Worker, Job } from 'bullmq';
import { redisConnection, AI_QUEUE_NAME } from '../config/redis';
import { generateChatResponse, type ChatMessage } from '../services/gemini';
import { supabase } from '../config/supabase';
import axios from 'axios';

const gatewayUrl = process.env.WHATSAPP_GATEWAY_URL;

export const aiWorker = new Worker(AI_QUEUE_NAME, async (job: Job) => {
  const { type, data } = job.data;

  if (type === 'chat') {
    // For Web Widget Chat
    const {
      message,
      history,
      context,
      resolvedBotName,
      resolvedCompany,
      tone,
      instructions,
      adminWhatsApp,
      resolvedOrgId,
      resolvedProjectId
    } = data;

    const { message: botReply, triggerLeadCapture } = await generateChatResponse(
      message,
      history,
      context,
      resolvedBotName,
      resolvedCompany,
      tone,
      instructions,
      adminWhatsApp,
      resolvedOrgId,
      true, // hasValidPhone
      false, // isFirstMessage
      resolvedProjectId
    );

    return { botReply, triggerLeadCapture };
  } 
  
  else if (type === 'whatsapp') {
    // For WhatsApp Gateway
    const {
      message,
      history,
      context,
      botName,
      company,
      tone,
      instructions,
      adminWhatsApp,
      resolvedOrgId,
      hasValidPhone,
      isFirstMessage,
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
      resolvedProjectId
    } = data;

    let { message: botReply, triggerLeadCapture } = await generateChatResponse(
      message,
      history,
      context,
      botName,
      company,
      tone,
      instructions,
      adminWhatsApp,
      resolvedOrgId,
      hasValidPhone,
      isFirstMessage,
      resolvedProjectId
    );

    if (!hasValidPhone) {
      triggerLeadCapture = false;
    }

    // Persist lead + conversation history
    const newHistory = [
      ...history,
      { role: 'user', content: message },
      { role: 'assistant', content: botReply },
    ].slice(-10);

    const metadata = {
      ...(lead?.metadata as Record<string, any> || {}),
      history: newHistory,
      jid: cleanSender,
      bot_number: botNumber ?? (lead?.metadata as any)?.bot_number ?? null,
      source: triggerLeadCapture ? 'whatsapp_handover' : ((lead?.metadata as any)?.source || 'whatsapp_chat'),
      last_active: new Date().toISOString(),
    };

    try {
      if (!lead) {
        await supabase.from('leads').insert({
          org_id: resolvedOrgId,
          name: pushName || 'WhatsApp User',
          whatsapp: leadPhone,
          last_message: message,
          metadata,
        });
      } else {
        await supabase.from('leads')
          .update({ 
            whatsapp: leadPhone,
            last_message: message, 
            metadata 
          })
          .eq('id', lead.id);
      }

      // Hot-lead admin notification
      if (triggerLeadCapture) {
        if (adminWhatsApp) {
          const adminNumbers = adminWhatsApp.split(/[,;]+/).map((n: string) => n.trim()).filter(Boolean);
          for (const rawNum of adminNumbers) {
            let cleanAdminWa = rawNum.replace(/\D/g, '');
            if (cleanAdminWa.startsWith('0')) cleanAdminWa = '62' + cleanAdminWa.substring(1);

            if (cleanAdminWa && cleanAdminWa !== cleanSender) {
              const now = new Date();
              const wibTimestamp = now.toLocaleString('id-ID', {
                timeZone: 'Asia/Jakarta',
                weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
                hour: '2-digit', minute: '2-digit', hour12: false,
              }) + ' WIB';

              const previewMessage = message.length > 200 ? message.slice(0, 200) + '...' : message;
              const displayContact = hasValidPhone
                ? `📱 WhatsApp: wa.me/${leadPhone}`
                : `📱 Multi-device (LID) — tidak ada nomor HP.\n   JID: ${replyTo}\n   ⚠️ Tidak bisa dibuka via wa.me`;

              const adminMsg = `🚨 *NOTIFIKASI HOT LEADS - ${company.toUpperCase()}* 🚨\n\nAda calon peserta yang butuh bantuan admin manusia segera!\n\n👤 *Kontak Leads:*\n   ${displayContact}\n\n💬 *Pesan Terakhir:*\n"_${previewMessage}_"\n\n🕐 *Waktu:* ${wibTimestamp}\n\n➡️ Silakan balas langsung ke nomor di atas ya Kak!`;

              if (data.platform === 'meta') {
                if (process.env.META_ACCESS_TOKEN) {
                  await axios.post(
                    `https://graph.facebook.com/v26.0/${data.metaPhoneNumberId}/messages`,
                    {
                      messaging_product: 'whatsapp',
                      to: cleanAdminWa,
                      type: 'text',
                      text: { body: adminMsg }
                    },
                    { headers: { Authorization: `Bearer ${process.env.META_ACCESS_TOKEN}` } }
                  );
                }
              } else {
                await axios.post(`${gatewayUrl}/api/session/send`, {
                  userId,
                  phoneLabel,
                  to: cleanAdminWa,
                  message: adminMsg,
                });
              }
            }
          }
        }
        botReply += `\n\n_(Info: Permintaan Anda telah diteruskan ke tim kami dan agen manusia akan segera membalas pesan ini ya Kak!)_`;
      }

      if (!isSubscriber) {
        botReply += `\n\n---\n🤖 Powered by PulseAI.biz.id - Buat Bot WA Tokomu Gratis Sekarang!`;
      }

      const typingDurationMs = Math.min(botReply.length * 28, 4_000);
      
      // Call Gateway or Meta API
      if (data.platform === 'meta') {
        if (process.env.META_ACCESS_TOKEN) {
          // Delay to simulate typing (optional for meta, but keeps timing similar)
          await new Promise(res => setTimeout(res, 500));
          await axios.post(
            `https://graph.facebook.com/v26.0/${data.metaPhoneNumberId}/messages`,
            {
              messaging_product: 'whatsapp',
              to: replyTo,
              type: 'text',
              text: { body: botReply }
            },
            { headers: { Authorization: `Bearer ${process.env.META_ACCESS_TOKEN}` } }
          );
        } else {
          console.warn('[AI Worker] META_ACCESS_TOKEN is missing');
        }
      } else {
        await axios.post(`${gatewayUrl}/api/session/send`, {
          userId,
          phoneLabel,
          to: replyTo,
          message: botReply,
          typingDurationMs,
        });
      }

      // Log outbound message
      await supabase.from('chat_logs').insert({
        tenant_id: resolvedOrgId,
        bot_number: botNumber ?? '',
        customer_number: sender,
        sender: 'bot',
        message_text: botReply,
      });

      // Deduct credits
      if (!isSubscriber) {
        const newCredits = Math.max(0, currentCredits - 1);
        await supabase.from('subscriptions').update({ credits: newCredits }).eq('org_id', resolvedOrgId);
        await supabase.from('credit_transactions').insert({
          org_id: resolvedOrgId,
          amount: -1,
          type: 'usage',
          description: 'AI Chatbot — 1 pesan balasan (WhatsApp)',
        });
      }

    } catch (err: any) {
      console.error('[AI Worker] DB/Gateway Error for WhatsApp:', err.message);
      if (err.isAxiosError) throw err; // let BullMQ retry if it's an API fail
    }

    return { success: true };
  }
}, {
  connection: redisConnection,
  concurrency: 5,
});

aiWorker.on('failed', (job, err) => {
  console.error(`[AI Worker] Job ${job?.id} failed:`, err.message);
});

aiWorker.on('completed', (job) => {
  console.log(`[AI Worker] Job ${job.id} completed successfully.`);
});
