import axios from 'axios';
import type { ChatMessage, GeminiResponse } from './gemini';

const deepseekApiKey = process.env.DEEPSEEK_API_KEY;
const deepseekBaseUrl = (process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com').replace(/\/+$/, '');
const deepseekModel = process.env.DEEPSEEK_MODEL || 'deepseek-chat';

/**
 * Robust JSON extraction from raw model response
 */
function sanitizeJson(text: string): GeminiResponse | null {
  try {
    return JSON.parse(text);
  } catch {
    // try markdown block strip
    const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (match) {
      try {
        return JSON.parse(match[1]);
      } catch {}
    }

    // brace depth extraction
    let depth = 0;
    let start = -1;
    for (let i = 0; i < text.length; i++) {
      if (text[i] === '{') {
        if (depth === 0) start = i;
        depth++;
      } else if (text[i] === '}') {
        depth--;
        if (depth === 0 && start !== -1) {
          try {
            return JSON.parse(text.slice(start, i + 1));
          } catch {}
        }
      }
    }
  }
  return null;
}

export async function callDeepSeekChat(
  systemPrompt: string,
  history: ChatMessage[],
  userMessage: string,
  temperature: number = 0.3
): Promise<GeminiResponse> {
  const apiKey = process.env.DEEPSEEK_API_KEY || deepseekApiKey;
  if (!apiKey) {
    throw new Error('DEEPSEEK_API_KEY is not configured in environment variables.');
  }

  // Format messages into OpenAI/DeepSeek chat completion format
  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: systemPrompt },
  ];

  // Append recent history (last 6 messages)
  for (const h of history.slice(-6)) {
    messages.push({
      role: h.role === 'assistant' ? 'assistant' : 'user',
      content: h.content,
    });
  }

  // Current user message
  messages.push({ role: 'user', content: userMessage });

  const url = `${deepseekBaseUrl}/chat/completions`;

  const response = await axios.post(
    url,
    {
      model: process.env.DEEPSEEK_MODEL || deepseekModel,
      messages,
      temperature,
      response_format: { type: 'json_object' },
      max_tokens: 1200,
    },
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      timeout: 30000, // 30s timeout
    }
  );

  const raw = response.data?.choices?.[0]?.message?.content?.trim() || '';
  const parsed = sanitizeJson(raw);

  if (parsed) {
    return {
      message: parsed.message ?? 'Maaf, saya tidak dapat merespon saat ini.',
      triggerLeadCapture: parsed.triggerLeadCapture === true,
      checkoutDetected: parsed.checkoutDetected === true,
      checkoutAmount: typeof parsed.checkoutAmount === 'number' ? parsed.checkoutAmount : 0,
      checkoutDescription: parsed.checkoutDescription || '',
      customerName: parsed.customerName || '',
    };
  }

  return {
    message: raw,
    triggerLeadCapture: false,
    checkoutDetected: false,
  };
}

/**
 * Streaming version for DeepSeek
 */
export async function* streamDeepSeekChat(
  systemPrompt: string,
  history: ChatMessage[],
  userMessage: string
): AsyncGenerator<string, void, unknown> {
  const apiKey = process.env.DEEPSEEK_API_KEY || deepseekApiKey;
  if (!apiKey) {
    throw new Error('DEEPSEEK_API_KEY is not configured in environment variables.');
  }

  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: systemPrompt },
  ];

  for (const h of history.slice(-6)) {
    messages.push({
      role: h.role === 'assistant' ? 'assistant' : 'user',
      content: h.content,
    });
  }

  messages.push({ role: 'user', content: userMessage });

  const url = `${deepseekBaseUrl}/chat/completions`;

  const response = await axios.post(
    url,
    {
      model: process.env.DEEPSEEK_MODEL || deepseekModel,
      messages,
      stream: true,
      temperature: 0.3,
    },
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      responseType: 'stream',
      timeout: 30000,
    }
  );

  const stream = response.data;
  let buffer = '';

  for await (const chunk of stream) {
    buffer += chunk.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed === 'data: [DONE]') continue;
      if (trimmed.startsWith('data: ')) {
        try {
          const json = JSON.parse(trimmed.slice(6));
          const delta = json.choices?.[0]?.delta?.content;
          if (delta) yield delta;
        } catch {}
      }
    }
  }
}
