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

// ─────────────────────────────────────────────
// Intent classifiers — run BEFORE hitting the model
// ─────────────────────────────────────────────

const GREETING_PATTERNS = [
  /^(hi|halo|hello|hey|hai|hei|yo|howdy|greetings|good\s?(morning|afternoon|evening|night)|selamat\s?(pagi|siang|sore|malam)|apa\s?kabar|how are you|how's it going|what'?s up|sup)\s*[!?.]*$/i,
];

const CLOSING_PATTERNS = [
  /^(ok|oke|okay|okey|sip|siap|noted|got it|alright|alrite|understood|i see|ic|clear|roger|copy that|mantap|oke deh|oke siap|oke makasih|oke thanks|oke thank you|thanks?|thank you|makasih|terima kasih|thx|tq|no problem|no thanks|nope|nothing else|that'?s all|that'?s it|done|cukup|sudah|udah|sudah cukup|udah cukup|bye|goodbye|see you|sampai jumpa|dadah|selesai)\s*[!?.]*$/i,
];

const SMALL_TALK_PATTERNS = [
  /^(what('?s| is) your name|siapa (nama|kamu)|kamu (siapa|apa)|who are you|are you (a |an )?(bot|ai|robot|human|real)|apa kamu (bot|ai|robot)|how (old|smart) are you|do you (have|understand|speak)|bisa bahasa|can you speak)/i,
  /^(nice|good|great|awesome|cool|wow|amazing|luar biasa|bagus|keren|hebat|mantap)\s*[!?.]*$/i,
];

function classifyIntent(message: string): 'greeting' | 'closing' | 'small_talk' | 'question' {
  const trimmed = message.trim();
  if (GREETING_PATTERNS.some((p) => p.test(trimmed))) return 'greeting';
  if (CLOSING_PATTERNS.some((p) => p.test(trimmed))) return 'closing';
  if (SMALL_TALK_PATTERNS.some((p) => p.test(trimmed))) return 'small_talk';
  return 'question';
}

// ─────────────────────────────────────────────
// System prompt builder
// ─────────────────────────────────────────────

const buildSystemPrompt = (
  botName: string,
  company: string,
  context: string,
  tone: string,
  customInstructions: string,
  adminWhatsApp?: string,
  intent?: string,
  lastBotMessage?: string
): string => {
  const hasContext = context && !context.includes('No relevant knowledge base articles found');
  const ragContext = hasContext ? context : null;
  const escalationContact = adminWhatsApp
    ? `https://wa.me/${adminWhatsApp.replace(/\+/g, '').replace(/\s/g, '')}`
    : 'pulseaichat@gmail.com';

  const lines: string[] = [
    `**Role:**`,
    `You are ${botName}, a warm and conversational AI assistant for ${company}. You talk like a friendly, knowledgeable human — not a robot reading a manual.`,
    ``,
    `**Language Rule:** ALWAYS reply in the EXACT same language the user writes in. If they write Indonesian, reply in Indonesian. If English, reply in English. Match their language automatically.`,
    ``,
    `**PERSONALITY & TONE (${tone}):**`,
    `- Sound human and natural. Use contractions ("I'm", "you'll", "that's"). Vary your sentence structure.`,
    `- Never start every reply the same way. Rotate between different openers.`,
    `- Use light emojis occasionally (😊 ✅ 👋) when they add warmth — but don't force them.`,
    `- Never say "Based on my data...", "According to my documents...", or "Berdasarkan dokumen...".`,
    ``,
    `**CRITICAL BEHAVIOR RULES:**`,
    ``,
    `1. **GREETINGS:** When a user greets you (halo, hi, hey, good morning, etc.), respond warmly and naturally like a human would. Ask how you can help. Do NOT just echo their greeting back. Example: User says "Halo" → You say "Halo! Senang bisa ngobrol dengan kamu 😊 Ada yang bisa saya bantu hari ini?"`,
    ``,
    `2. **CLOSING / ACKNOWLEDGMENTS:** When a user says "ok", "oke", "thanks", "makasih", "noted", "siap", "bye", "that's all", "cukup", etc. — this means the conversation is wrapping up or they acknowledged your last message. Respond with a SHORT, warm closing like "Sama-sama! Semoga membantu 😊 Jangan ragu balik lagi kalau ada pertanyaan!" or "You're welcome! Feel free to reach out anytime." Do NOT repeat any information you already gave. Do NOT bring up topics from earlier.`,
    ``,
    `3. **NEVER REPEAT YOURSELF:** Check the conversation history. If you already said something, do not say it again. Move the conversation forward.`,
    ``,
    `4. **ONLY USE RAG WHEN RELEVANT:** Only reference the knowledge base if the user is clearly asking about a topic it covers. For greetings, small talk, acknowledgments, and general questions — answer naturally from your own intelligence. Do NOT force RAG content into every response.`,
    ``,
    `5. **RESPONSE LENGTH:**`,
    `   - 1–5 word input (greetings, "ok", "thanks") → max 1–2 sentences`,
    `   - General question → 2–4 sentences`,
    `   - Specific / complex question → structured answer with bullets if helpful`,
    ``,
    `6. **INFORMATION LAYERING:** When asked "What information do you have?", give a SHORT bulleted summary of available topics. Give details only when specifically asked.`,
    ``,
    `7. **CONTEXTUAL MEMORY:** Use chat history to avoid re-explaining things. If you already covered a topic, reference it briefly and move on.`,
    ``,
  ];

  // Inject intent-specific hint for the model
  if (intent === 'greeting') {
    lines.push(`**INTENT HINT:** The user is greeting you. Respond warmly and ask how you can help. Do NOT reference any documents or knowledge base.`);
    lines.push(``);
  } else if (intent === 'closing') {
    lines.push(`**INTENT HINT:** The user is wrapping up or acknowledging your last message. Give a brief, warm sign-off. Do NOT repeat any prior content.`);
    if (lastBotMessage) {
      lines.push(`**Your last message was:** "${lastBotMessage.slice(0, 200)}..."`);
      lines.push(`Do NOT repeat or summarize this. Just say goodbye warmly.`);
    }
    lines.push(``);
  } else if (intent === 'small_talk') {
    lines.push(`**INTENT HINT:** The user is making small talk. Respond naturally and conversationally. No need to reference documents.`);
    lines.push(``);
  }

  if (customInstructions) {
    lines.push(`**Custom Instructions (follow carefully):**`);
    lines.push(customInstructions);
    lines.push(``);
  }

  lines.push(`**Human Escalation:** If the user wants to speak to a human, provide: ${escalationContact}`);
  lines.push(``);

  // Only include RAG context for actual questions
  if (ragContext && intent === 'question') {
    lines.push(`**Knowledge Base (use ONLY if directly relevant to the user's question):**`);
    lines.push(ragContext);
    lines.push(``);
  } else if (intent === 'question') {
    lines.push(`**Knowledge Base:** No specific documents available. Answer from general knowledge or let the user know you don't have that info.`);
    lines.push(``);
  }

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

// ─────────────────────────────────────────────
// Main chat function
// ─────────────────────────────────────────────

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

  // Classify what the user is actually doing
  const intent = classifyIntent(userMessage);

  // Grab last bot message to prevent repetition on closing
  const lastBotMessage = [...history].reverse().find((m) => m.role === 'assistant')?.content ?? '';

  const model = genai.getGenerativeModel({
    model: 'gemini-2.5-flash-lite',
    systemInstruction: buildSystemPrompt(
      botName,
      company,
      context,
      tone,
      customInstructions,
      adminWhatsApp,
      intent,
      lastBotMessage
    ),
    generationConfig: {
      responseMimeType: 'application/json',
      maxOutputTokens: intent === 'greeting' || intent === 'closing' ? 150 : 600,
      temperature: intent === 'greeting' || intent === 'closing' || intent === 'small_talk' ? 0.7 : 0.3,
      topP: 0.85,
    },
  });

  // Keep last 6 messages for context (3 pairs)
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

      if (!result.response.candidates || result.response.candidates.length === 0) {
        console.warn('[Gemini] No candidates returned. Possibly blocked by safety filters.');
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