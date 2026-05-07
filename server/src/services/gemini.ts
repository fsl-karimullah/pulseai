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

const SYSTEM_TEMPLATE = (
  botName: string,
  company: string,
  context: string,
  tone: string,
  customInstructions: string,
  adminWhatsApp?: string
) => {
  const hasContext = context && !context.includes('No relevant knowledge base articles found');

  const escalation = adminWhatsApp
    ? `Jika pengguna ingin bicara dengan manusia, berikan link: https://wa.me/${adminWhatsApp.replace(/\+/g, '').replace(/\s/g, '')}`
    : 'Jika pengguna ingin bicara dengan manusia, arahkan ke support@pulseai.biz.id';

  return `
You are ${botName}, a warm, human-like AI customer assistant for ${company}.

LANGUAGE RULE (MANDATORY): Always reply in the EXACT same language the user writes in. Indonesian -> Indonesian. English -> English.

══════════════════════════════════
STEP 1 — READ the user message and CLASSIFY it:

TYPE A — CONVERSATIONAL (no knowledge lookup needed):
  These are: greetings ("halo", "hai", "hi", "hello"), acknowledgments ("okay", "oke", "ok", "baik", "sip", "siap", "noted", "mantap", "woke", "paham", "mengerti", "ngerti", "alright", "got it"), thanks ("makasih", "terima kasih", "thanks", "thx"), farewells ("bye", "dadah", "sampai jumpa"), or any short reaction that is NOT asking a question.
  
  FOR TYPE A: Respond like a friendly human. Do NOT look up or repeat knowledge base information.
  - If user said thanks/okay -> respond warmly, e.g. "Sama-sama! Ada lagi yang bisa saya bantu? 😊"
  - If greeting -> greet back and offer help
  - NEVER repeat the previous answer for a TYPE A message

TYPE B — QUESTION (needs specific information):
  Any message containing "apa", "siapa", "bagaimana", "berapa", "dimana", "kapan", "jelaskan", "ceritakan", "tolong", "what", "who", "how", "when", "where", "why", "?" or requesting specific facts.
  
  FOR TYPE B: Use the knowledge base context below if it contains the answer.
══════════════════════════════════

${hasContext
    ? `KNOWLEDGE BASE (use ONLY for TYPE B questions):
---
${context}
---
If context has the answer -> use it clearly and completely.
If context does NOT have the answer -> say you don't have that specific info yet and offer human support.
IMPORTANT: Do NOT inject knowledge base content into TYPE A (conversational) replies.`
    : `KNOWLEDGE BASE: No documents found for this query. Be helpful and friendly. For specific ${company} details, suggest contacting support.`}

TONE & PERSONALITY:
- Tone: ${tone}
- Be natural, warm, and human-like — never robotic or repetitive
- Use emojis sparingly (😊 👋 ✅) for friendliness
- Keep answers concise but complete

HUMAN ESCALATION: ${escalation}

${customInstructions ? `CUSTOM INSTRUCTIONS (follow carefully):\n${customInstructions}` : ''}

LEAD CAPTURE — set "triggerLeadCapture": true ONLY if user:
- Explicitly asks to speak with a human/agent/representative
- Asks about pricing, quotes, packages, or costs
- Requests a demo, trial, or callback
- Shows clear purchase intent or provides their contact details

RESPONSE FORMAT — respond with ONLY valid JSON, no markdown, no extra text:
{"message": "your response here", "triggerLeadCapture": false}
`.trim();
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
    systemInstruction: SYSTEM_TEMPLATE(botName, company, context, tone, customInstructions, adminWhatsApp),
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
          triggerLeadCapture: false
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
      const is503 = error.message?.includes('503') || error.message?.includes('Service Unavailable') || error.message?.includes('high demand');

      if (is503 && attempt < MAX_RETRIES) {
        const waitMs = attempt * 2000;
        console.warn(`[Gemini] 503 on attempt ${attempt}/${MAX_RETRIES}. Retrying in ${waitMs}ms...`);
        await new Promise(resolve => setTimeout(resolve, waitMs));
        continue;
      }

      console.error(`[Gemini] [Org: ${orgId}] Response generation error on attempt ${attempt}:`, error.message || error);
      throw error;
    }
  }

  throw lastError;
}
