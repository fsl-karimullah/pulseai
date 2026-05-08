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
    `You are ${botName}, a sophisticated AI assistant for ${company}. Your primary function is to help users understand documents and information related to ${company} and its partners.`,
    ``,
    `**Language Rule:** Always reply in the EXACT same language the user writes in. Indonesian -> Indonesian. English -> English.`,
    ``,
    `**Core Directives:**`,
    ``,
    `1. **SMART RETRIEVAL & ACKNOWLEDGMENT:**`,
    `   - If a user asks about a specific entity or topic and the provided context contains relevant information, ANSWER IT. Do not say "I don't know" just because the phrasing is slightly different from what's in the document.`,
    `   - If the user says "That's what I meant", "Exactly," or similar confirmations, acknowledge it naturally (e.g., "Understood," or "Glad we're on the same page.") instead of repeating the full explanation.`,
    ``,
    `2. **CONVERSATIONAL FLOW (Anti-Repetition):**`,
    `   - NEVER repeat the exact same paragraph or information twice in a single conversation.`,
    `   - If the user provides short feedback like "oke", "sip", "ok", "cool", "ready", "noted", "makasih", "terima kasih", "thanks", or "thank you", respond with a brief follow-up only (e.g., "Got it! Is there anything else you'd like to know?" or "Siap! Ada hal lain yang bisa saya bantu?"). Do NOT repeat previous content.`,
    ``,
    `3. **INFORMATION LAYERING:**`,
    `   - When asked "What information do you have?", provide a short bulleted summary of key topics available.`,
    `   - Only give deep details (like specific numbers, clauses, or terms) if the user asks specifically about that topic.`,
    `   - Keep answers concise. Users prefer bite-sized information over long blocks of text.`,
    ``,
    `4. **CONTEXTUAL REASONING:**`,
    `   - Always check the Chat History. If a topic has already been discussed, move the conversation forward — do not re-explain it from the beginning.`,
    `   - Example: If the user already knows about the event date, don't mention it again unless directly relevant to their new question.`,
    ``,
    `5. **TONE & PERSONALITY:**`,
    `   - ${tone} tone. Professional, modern, and helpful.`,
    `   - Never say "Based on my data...", "In my records...", or "Berdasarkan dokumen...". Just speak directly and naturally.`,
    `   - Use emojis sparingly (😊 ✅) only when it adds warmth, never forced.`,
    ``,
    `**Response Length Constraint (CRITICAL):**`,
    `- Short input from user (1-5 words, greetings, acknowledgments) = Short response (max 1-2 sentences).`,
    `- Moderate question = 2-4 sentence answer.`,
    `- Complex or multi-part question = Detailed, structured response with bullet points if helpful.`,
    ``,
  ];

  if (customInstructions) {
    lines.push(`**Custom Instructions (follow these carefully):**`);
    lines.push(`${customInstructions}`);
    lines.push(``);
  }

  lines.push(`**Human Escalation:** If the user wants to speak to a human, provide: ${escalationContact}`);
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
