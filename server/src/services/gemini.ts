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
// Intent classifier
// ─────────────────────────────────────────────

type Intent = 'greeting' | 'closing' | 'small_talk' | 'question';

const GREETING_REGEX =
  /^(hi|halo|hello|hey|hai|hei|yo|howdy|greetings|good\s?(morning|afternoon|evening|night)|selamat\s?(pagi|siang|sore|malam)|apa\s?kabar|how are you|how'?s it going|what'?s up|sup)\s*[!?.]*$/i;

// CLOSING: exact short phrases only
const CLOSING_REGEX =
  /^(ok|oke|okay|okey|sip|siap|noted|got it|alright|alrite|understood|i see|ic|clear|roger|copy that|mantap|oke deh|oke siap|oke makasih|oke thanks|oke thank you|thanks?|thank you|makasih|terima kasih|thx|tq|no problem|no thanks|nope|nothing else|that'?s all|that'?s it|done|cukup|sudah|udah|sudah cukup|udah cukup|bye|goodbye|see you|sampai jumpa|dadah|selesai)\s*[!?.]*$/i;

const SMALL_TALK_REGEX =
  /^(what('?s| is) your name|siapa (nama|kamu)|kamu (siapa|apa)|who are you|are you (a |an )?(bot|ai|robot|human|real)|apa kamu (bot|ai|robot)|how (old|smart) are you|do you (have|understand|speak)|bisa bahasa|can you speak|nice|good|great|awesome|cool|wow|amazing|luar biasa|bagus|keren|hebat)\s*[!?.]*$/i;

function classifyIntent(message: string): Intent {
  const t = message.trim();
  if (GREETING_REGEX.test(t)) return 'greeting';
  if (CLOSING_REGEX.test(t)) return 'closing';
  if (SMALL_TALK_REGEX.test(t)) return 'small_talk';
  return 'question';
}

// ─────────────────────────────────────────────
// Hard-coded responses — bypass LLM entirely for greetings & closings
// This is the root fix: no LLM = no hallucinated content repeats
// ─────────────────────────────────────────────

function isLikelyIndonesian(message: string): boolean {
  return /\b(oke|sip|siap|makasih|terima kasih|sudah|udah|cukup|selesai|mantap|bagus|halo|hai)\b/i.test(message);
}

const CLOSING_RESPONSES_ID = [
  'Sama-sama! Semoga informasinya membantu 😊 Jangan ragu untuk bertanya lagi kalau ada yang dibutuhkan.',
  'Siap! Senang bisa membantu. Sampai jumpa lagi ya! 👋',
  'Oke, kalau ada pertanyaan lain jangan sungkan untuk balik lagi. Semoga harimu menyenangkan! 😊',
  'Terima kasih sudah bertanya! Semoga bermanfaat. Sampai jumpa! 👋',
];

const CLOSING_RESPONSES_EN = [
  "You're welcome! Feel free to reach out anytime 😊",
  'Glad I could help! Have a great day 👋',
  'Anytime! Come back if you need anything else.',
  "No problem at all! Hope that was helpful. See you! 😊",
];

const GREETING_RESPONSES_ID = [
  'Halo! Senang bertemu kamu 😊 Ada yang bisa saya bantu hari ini?',
  'Hai! Selamat datang. Ada yang ingin kamu tanyakan?',
  'Halo! Saya siap membantu. Mau tanya apa nih? 😊',
];

const GREETING_RESPONSES_EN = [
  "Hey there! 👋 Great to meet you. What can I help you with today?",
  "Hello! I'm here and ready to help. What's on your mind?",
  "Hi! Lovely to chat with you 😊 What would you like to know?",
];

function getRandomResponse(pool: string[]): string {
  return pool[Math.floor(Math.random() * pool.length)];
}

// ─────────────────────────────────────────────
// System prompt — only built for real questions
// ─────────────────────────────────────────────

const buildSystemPrompt = (
  botName: string,
  company: string,
  context: string,
  tone: string,
  customInstructions: string,
  adminWhatsApp?: string,
  intent?: Intent,
): string => {
  const hasContext = context && !context.includes('No relevant knowledge base articles found');
  
  let cleanWa = '';
  if (adminWhatsApp) {
    cleanWa = adminWhatsApp.replace(/\D/g, ''); // Strip non-digits
    if (cleanWa.startsWith('0')) {
      cleanWa = '62' + cleanWa.substring(1);
    }
  }
  const escalationContact = cleanWa
    ? `https://wa.me/${cleanWa}`
    : 'pulseaichat@gmail.com';

  const lines: string[] = [
    `**Role:** You are ${botName}, a warm and conversational AI assistant for ${company}.`,
    `You talk like a friendly, knowledgeable human — not a robot reading a manual.`,
    ``,
    `**Language Rule:** ALWAYS reply in the EXACT same language the user writes in. Indonesian → Indonesian. English → English.`,
    ``,
    `**PERSONALITY & TONE (${tone}):**`,
    `- Sound human and natural. Vary your sentence structure and openers.`,
    `- Use light emojis occasionally (😊 ✅) when they add warmth — never forced.`,
    `- NEVER say "Based on my data...", "According to documents...", or "Berdasarkan dokumen...". Speak naturally.`,
    ``,
    `**CRITICAL RULES:**`,
    ``,
    `1. **KNOWLEDGE BASE USAGE:** Only use the knowledge base when the user is clearly asking about a specific topic it covers. For general questions or small talk, answer from your own intelligence. Do NOT force knowledge base content into responses unprompted.`,
    ``,
    `2. **PRODUCT LINKS (IMPORTANT):** If the knowledge base contains a checkout link, URL, or "Product Link" for a specific product/menu item, you MUST include that exact link in your response when the user asks about or shows interest in that product. Format it nicely so the user can easily click and purchase/view it.`,
    ``,
    `3. **NEVER REPEAT YOURSELF:** Check the chat history carefully. If you already explained something, do NOT say it again. Move forward.`,
    ``,
    `4. **INFORMATION SUMMARY:** When asked "What information do you have?" or "Apa informasi yang kamu punya?", give a SHORT bulleted summary of available topics only. Do NOT dump all the details — wait for the user to ask about a specific topic.`,
    ``,
    `4. **RESPONSE LENGTH:**`,
    `   - Short/general input → max 2 sentences`,
    `   - Specific question → 2–4 sentences or bullets if needed`,
    `   - Complex question → structured answer`,
    ``,
  ];

  if (intent === 'small_talk') {
    lines.push(`**INTENT:** User is making small talk. Respond naturally and warmly. Do NOT reference documents.`);
    lines.push(``);
  }

  if (customInstructions) {
    lines.push(`**Custom Instructions:**`);
    lines.push(customInstructions);
    lines.push(``);
  }

  lines.push(`**Human Escalation:** If the user wants to speak to a human: ${escalationContact}`);
  lines.push(``);

  if (hasContext) {
    lines.push(`**Knowledge Base (use ONLY if directly relevant to the user's question):**`);
    lines.push(context);
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
// Main export
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

  const intent = classifyIntent(userMessage);
  const indonesian = isLikelyIndonesian(userMessage);

  // ── BYPASS the LLM entirely for greetings and closings ──
  // Root fix: LLM never sees "okay" / "halo" — can't hallucinate a summary
  if (intent === 'closing') {
    return {
      message: getRandomResponse(indonesian ? CLOSING_RESPONSES_ID : CLOSING_RESPONSES_EN),
      triggerLeadCapture: false,
    };
  }

  if (intent === 'greeting') {
    return {
      message: getRandomResponse(indonesian ? GREETING_RESPONSES_ID : GREETING_RESPONSES_EN),
      triggerLeadCapture: false,
    };
  }

  // ── Questions and small talk go to the model ──
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
    ),
    generationConfig: {
      responseMimeType: 'application/json',
      maxOutputTokens: 1200,
      temperature: intent === 'small_talk' ? 0.7 : 0.3,
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

      // Robust JSON extraction: handles truncation and trailing garbage
      const sanitizeJson = (text: string): GeminiResponse | null => {
        // 1. Try direct parse first (fastest path)
        try { return JSON.parse(text); } catch {}
        // 2. Extract first complete JSON object using brace depth counting
        let depth = 0, start = -1;
        for (let i = 0; i < text.length; i++) {
          if (text[i] === '{') { if (depth === 0) start = i; depth++; }
          else if (text[i] === '}') {
            depth--;
            if (depth === 0 && start !== -1) {
              try { return JSON.parse(text.slice(start, i + 1)); } catch {}
            }
          }
        }
        return null;
      };

      try {
        const parsed = sanitizeJson(raw);
        if (parsed) {
          return {
            message: parsed.message ?? 'Sorry, I could not generate a response.',
            triggerLeadCapture: parsed.triggerLeadCapture === true,
          };
        }
        // Last resort: return raw text
        console.warn(`[Gemini] [Org: ${orgId}] Could not parse JSON, returning raw text. Length: ${raw.length}`);
        return { message: raw, triggerLeadCapture: false };
      } catch {
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