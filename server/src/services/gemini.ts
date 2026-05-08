import { GoogleGenerativeAI, type Content } from '@google/generative-ai';

const apiKey = process.env.GOOGLE_AI_API_KEY;
if (!apiKey) {
  console.error('[Gemini] CRITICAL: GOOGLE_AI_API_KEY is missing in environment variables.');
}
const genai = new GoogleGenerativeAI(apiKey || 'MISSING_KEY');

export type ChatMessage = { role: 'user' | 'assistant'; content: string };

export type GeminiResponse = {
  message: string;
  triggerLeadCapture: boolean;
};

const buildSystemPrompt = (
  botName: string,
  company: string,
  context: string,
  tone: string,
  customInstructions: string,
  adminWhatsApp?: string
): string => {
  const hasContext = context && !context.includes('No relevant knowledge base articles found');
  const ragContext = hasContext ? context : 'No specific documents are available for this query.';
  const escalationContact = adminWhatsApp
    ? `https://wa.me/${adminWhatsApp.replace(/\+/g, '').replace(/\s/g, '')}`
    : 'support@pulseai.biz.id';

  const lines: string[] = [
    `**Role:**`,
    `You are ${botName}, a highly intelligent and conversational business assistant for ${company}. Your goal is to provide accurate information based on provided documents while maintaining a natural, human-like conversation flow.`,
    ``,
    `**Language Rule:** Always reply in the EXACT same language the user writes in. Indonesian -> Indonesian. English -> English.`,
    ``,
    `**Operational Protocols:**`,
    ``,
    `1. **INTENT ANALYSIS:**`,
    `   - Before responding, analyze the user's input.`,
    `   - If the user provides a short acknowledgment, greeting, or feedback (e.g., "ok", "oke", "cool", "thanks", "makasih", "sip", "baik", "noted", "halo", "hai", "hello", "bye", "sampai jumpa"), DO NOT repeat document information. Respond with a brief, warm, polite conversational reply like: "Sama-sama! Ada lagi yang bisa saya bantu? 😊" or "Siap! Kalau ada pertanyaan lain, saya di sini."`,
    `   - NEVER repeat the previous answer when the user's message is an acknowledgment or reaction.`,
    ``,
    `2. **KNOWLEDGE RETRIEVAL & RAG USAGE:**`,
    `   - Use the provided context ONLY when the user asks a specific question or seeks information.`,
    `   - If the user asks "What information do you have?", provide a concise high-level summary. Do not dump the entire document content.`,
    `   - If the user's intent is ambiguous, ask for clarification instead of guessing and providing irrelevant data.`,
    ``,
    `3. **CONVERSATIONAL MEMORY:**`,
    `   - Refer to the chat history to avoid redundancy. If you have already explained a topic, do not explain it again from scratch unless the user asks for more detail or clarification.`,
    `   - Maintain a ${tone} tone — direct, efficient, and insightful.`,
    ``,
    `4. **CONSTRAINTS:**`,
    `   - No robot-talk (e.g., avoid "Based on the documents provided...", "According to the context...", "Berdasarkan dokumen..."). Just answer naturally.`,
    `   - If the information is not in the context, say naturally: "Maaf, saya belum punya detail spesifik itu." then offer to connect with human support.`,
    `   - Keep responses concise to save tokens and respect the user's time.`,
    `   - If the user wants to speak to a human, provide: ${escalationContact}`,
  ];

  if (customInstructions) {
    lines.push(``);
    lines.push(`5. **CUSTOM INSTRUCTIONS (follow these above all else after language rule):**`);
    lines.push(`   ${customInstructions}`);
  }

  lines.push(``);
  lines.push(`**Current Context (RAG):**`);
  lines.push(ragContext);
  lines.push(``);
  lines.push(`**LEAD CAPTURE** — set "triggerLeadCapture": true ONLY if user:`);
  lines.push(`- Explicitly asks to speak with a human, agent, or representative`);
  lines.push(`- Asks about pricing, quotes, packages, or costs`);
  lines.push(`- Requests a demo, trial, or callback`);
  lines.push(`- Shows clear purchase intent or provides their contact details`);
  lines.push(``);
  lines.push(`**RESPONSE FORMAT** — respond with ONLY valid JSON, no markdown, no extra text:`);
  lines.push(`{"message": "your response here", "triggerLeadCapture": false}`);

  return lines.join('\n');
};

/**
 * Calls Gemini with retrieved RAG context and conversation history.
 */
export async function generateChatResponse(
  userMessage: string,
  history: ChatMessage[],
  context: string,
  botName: string,
  company: string,
  tone: string = 'Professional',
  customInstructions: string = '',
  adminWhatsApp: string = '',
  orgId: string = ''
): Promise<GeminiResponse> {
  const model = genai.getGenerativeModel({
    model: 'gemini-2.5-flash-lite',
    systemInstruction: buildSystemPrompt(botName, company, context, tone, customInstructions, adminWhatsApp),
    generationConfig: {
      responseMimeType: 'application/json',
      maxOutputTokens: 600,
      temperature: 0.3,
      topP: 0.85,
    },
  });

  // Keep last 6 messages for context (3 pairs), trim older history to save tokens
  const geminiHistory: Content[] = history.slice(-6).map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  const MAX_RETRIES = 3;
  let lastError: any;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const chat = model.startChat({ history: geminiHistory });
      const result = await chat.sendMessage(userMessage);

      // Safety check: ensure we have a valid response candidate
      if (!result.response.candidates || result.response.candidates.length === 0) {
        console.warn('[Gemini] No candidates returned. Response may have been blocked by safety filters.');
        return {
          message: 'Maaf, saya tidak dapat merespon pesan tersebut. Silakan coba pertanyaan lain.',
          triggerLeadCapture: false,
        };
      }

      const raw = result.response.text().trim();

      try {
        const parsed = JSON.parse(raw) as GeminiResponse;
        return {
          message: parsed.message ?? 'Sorry, I could not generate a response.',
          triggerLeadCapture: parsed.triggerLeadCapture === true,
        };
      } catch {
        const match = raw.match(/\{[\s\S]*\}/);
        if (match) {
          const parsed = JSON.parse(match[0]) as GeminiResponse;
          return { message: parsed.message ?? raw, triggerLeadCapture: false };
        }
        return { message: raw, triggerLeadCapture: false };
      }
    } catch (error: any) {
      lastError = error;
      const is503 =
        error.message?.includes('503') ||
        error.message?.includes('Service Unavailable') ||
        error.message?.includes('high demand');

      if (is503 && attempt < MAX_RETRIES) {
        const waitMs = attempt * 2000;
        console.warn(`[Gemini] 503 on attempt ${attempt}/${MAX_RETRIES}. Retrying in ${waitMs}ms...`);
        await new Promise((resolve) => setTimeout(resolve, waitMs));
        continue;
      }

      console.error(`[Gemini] [Org: ${orgId}] Error on attempt ${attempt}:`, error.message || error);
      throw error;
    }
  }

  throw lastError;
}
