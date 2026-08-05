import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { supabase } from '../config/supabase';
import { authenticate } from '../middleware/auth';

// ── Helper: Send a message via Telegram Bot API ──────────────────────────────
export async function sendTelegramMessage(
  botToken: string,
  chatId: string,
  text: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
      }),
    });
    const json = (await res.json()) as { ok: boolean; description?: string };
    if (!json.ok) {
      return { ok: false, error: json.description ?? 'Unknown Telegram error' };
    }
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err.message ?? 'Network error' };
  }
}

// ── Helper: Format WIB timestamp ─────────────────────────────────────────────
function formatWIB(date: Date): string {
  return date.toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }) + ' WIB';
}

export default async function telegramRoutes(fastify: FastifyInstance) {
  /**
   * POST /api/telegram/test
   * Send a test message to verify token + chatId configuration.
   * Requires authentication (admin only).
   */
  fastify.post(
    '/telegram/test',
    { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const userId = (request as any).user?.id;
        const { botToken, chatId } = request.body as {
          botToken?: string;
          chatId?: string;
        };

        // Verify the user owns an org
        const { data: org } = await supabase
          .from('organizations')
          .select('id, name')
          .eq('user_id', userId)
          .maybeSingle();

        if (!org) {
          return reply.status(404).send({ success: false, message: 'Organisasi tidak ditemukan.' });
        }

        let finalToken = botToken?.trim();
        let finalChatId = chatId?.trim();

        if (!finalToken || !finalChatId) {
          const { data: dbSettings } = await supabase
            .from('bot_settings')
            .select('telegram_bot_token, telegram_chat_id')
            .eq('org_id', org.id)
            .maybeSingle();
            
          if (!finalToken) finalToken = dbSettings?.telegram_bot_token || '';
          if (!finalChatId) finalChatId = dbSettings?.telegram_chat_id || '';
        }

        if (!finalToken || !finalChatId) {
          return reply.status(400).send({
            success: false,
            message: 'Konfigurasi Telegram belum lengkap (token atau chat ID kosong).',
          });
        }

        const testMessage =
          `🤖 <b>PulseAI — Test Notifikasi</b>\n\n` +
          `✅ Koneksi Telegram berhasil dikonfigurasi!\n\n` +
          `📌 Organisasi: <b>${org.name || 'PulseAI'}</b>\n` +
          `🕒 Waktu: ${formatWIB(new Date())}\n\n` +
          `Anda akan menerima notifikasi di sini setiap ada lead baru dari widget chatbot.`;

        const result = await sendTelegramMessage(finalToken, finalChatId, testMessage);

        if (!result.ok) {
          return reply.status(400).send({
            success: false,
            message: `Gagal mengirim pesan Telegram: ${result.error}`,
          });
        }

        return reply.send({ success: true, message: 'Pesan test berhasil dikirim ke Telegram!' });
      } catch (error: any) {
        fastify.log.error(error, 'Telegram test failed');
        return reply.status(500).send({ success: false, message: error.message });
      }
    }
  );

  /**
   * POST /api/telegram/save
   * Save / update Telegram config for the authenticated org's bot settings.
   */
  fastify.post(
    '/telegram/save',
    { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const userId = (request as any).user?.id;
        const { botToken, chatId } = request.body as {
          botToken?: string;
          chatId?: string;
        };

        const { data: org } = await supabase
          .from('organizations')
          .select('id')
          .eq('user_id', userId)
          .maybeSingle();

        if (!org) {
          return reply.status(404).send({ success: false, message: 'Organisasi tidak ditemukan.' });
        }

        const { error } = await supabase
          .from('bot_settings')
          .update({
            telegram_bot_token: botToken?.trim() || null,
            telegram_chat_id: chatId?.trim() || null,
          })
          .eq('org_id', org.id);

        if (error) throw error;

        return reply.send({ success: true, message: 'Konfigurasi Telegram berhasil disimpan.' });
      } catch (error: any) {
        fastify.log.error(error, 'Telegram save failed');
        return reply.status(500).send({ success: false, message: error.message });
      }
    }
  );

  /**
   * GET /api/telegram/config
   * Get Telegram config for the authenticated org (masked token for security).
   */
  fastify.get(
    '/telegram/config',
    { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const userId = (request as any).user?.id;

        const { data: org } = await supabase
          .from('organizations')
          .select('id')
          .eq('user_id', userId)
          .maybeSingle();

        if (!org) {
          return reply.status(404).send({ success: false, message: 'Organisasi tidak ditemukan.' });
        }

        const { data: settings } = await supabase
          .from('bot_settings')
          .select('telegram_bot_token, telegram_chat_id')
          .eq('org_id', org.id)
          .maybeSingle();

        // Mask the bot token for security — only show last 6 chars
        const rawToken = settings?.telegram_bot_token || '';
        const maskedToken = rawToken.length > 6
          ? '••••••••••' + rawToken.slice(-6)
          : rawToken;

        return reply.send({
          success: true,
          data: {
            hasBotToken: !!rawToken,
            maskedToken,
            chatId: settings?.telegram_chat_id || '',
          },
        });
      } catch (error: any) {
        fastify.log.error(error, 'Telegram config fetch failed');
        return reply.status(500).send({ success: false, message: error.message });
      }
    }
  );
}
