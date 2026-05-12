export const config = {
  runtime: 'edge',
};

import { retrieveContext, buildContextBlock } from '../src/services/rag';
import { generateChatResponseStream, type ChatMessage } from '../src/services/gemini';
import { supabase } from '../src/config/supabase';

interface ChatBody {
  message: string;
  history?: ChatMessage[];
  conversationId?: string;
  botName?: string;
  company?: string;
  orgId?: string;
}

export default async function handler(req: Request) {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ success: false, message: 'Method Not Allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = (await req.json()) as ChatBody;
    const {
      message,
      history = [],
      conversationId,
      orgId,
      botName = 'Aria',
      company = 'PulseAI',
    } = body;

    if (!message?.trim()) {
      return new Response(JSON.stringify({ success: false, message: 'message is required.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    // 0 — Get organization from bot settings
    let query = supabase.from('bot_settings').select('*');
    if (orgId) {
      query = query.eq('org_id', orgId);
    } else {
      query = query.eq('bot_name', botName);
    }
    let { data: settings } = await query.maybeSingle();

    if (!settings && orgId) {
      const { data: newSettings } = await supabase
        .from('bot_settings')
        .insert({ org_id: orgId })
        .select()
        .single();
      if (newSettings) settings = newSettings;
    }

    if (!settings) {
      return new Response(JSON.stringify({ success: false, message: 'Bot configuration not found.' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    const resolvedOrgId = settings.org_id;
    const resolvedBotName = settings.bot_name || botName || 'Aria';
    const resolvedCompany = settings.company_name || company || 'PulseAI';
    const tone = settings.tone || 'Professional';
    const instructions = settings.custom_instructions || '';
    const adminWhatsApp = settings.admin_whatsapp || '';

    // 1 — RAG
    const chunks = await retrieveContext(message, resolvedOrgId, 5);
    const context = buildContextBlock(chunks);

    // 2 — Streaming Response
    const stream = await generateChatResponseStream(
      message,
      history,
      context,
      resolvedBotName,
      resolvedCompany,
      tone,
      instructions,
      adminWhatsApp,
      resolvedOrgId
    );

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: chunk })}\n\n`));
          }
          // After finishing the stream, send metadata (triggerLeadCapture, etc.)
          // We don't have lead capture in stream right now, so default to false
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                done: true,
                triggerLeadCapture: false,
                sources: chunks.map((c) => ({ title: c.title, similarity: c.similarity })),
              })}\n\n`
            )
          );
        } catch (err: any) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ error: err.message })}\n\n`)
          );
        } finally {
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, message: 'Internal Server Error', error: err.message }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      }
    );
  }
}
