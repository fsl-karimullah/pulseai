import { GoogleGenerativeAI, type Content } from '@google/generative-ai';
import { supabase } from '../config/supabase';

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

async function fetchKnowledgeBaseTopics(orgId: string): Promise<string[]> {
  if (!orgId) return [];
  try {
    const { data, error } = await supabase
      .from('knowledge_nodes')
      .select('title')
      .eq('org_id', orgId)
      .limit(100);
      
    if (error || !data) return [];
    const uniqueTitles = Array.from(new Set(data.map((item: any) => item.title).filter(Boolean)));
    return uniqueTitles as string[];
  } catch (err) {
    console.error('[Gemini] Error fetching knowledge base topics:', err);
    return [];
  }
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
  isStreaming: boolean = false,
  topics: string[] = []
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
    `5. **STRICT RESPONSE LENGTH:**`,
    `   - Short/general input → 1–2 sentences maximum.`,
    `   - Specific question → 2–3 sentences.`,
    `   - Complex question → Use a maximum of 3 short bullet points. NEVER output long paragraphs.`,
    `   - ALWAYS prioritize extreme brevity and clarity over excessive details. Visitors reading a chat widget lose interest quickly if answers are too long.`,
    ``,
    `6. **RULE UNTUK PERTANYAAN KOMPOSISI/BAHAN:**`,
    `   - Jika user menanyakan komposisi, bahan dasar, atau kandungan dari produk yang tertera di [KNOWLEDGE BASE] (contoh: Niacinamide pada skincare, atau Bawang/Santan pada Rendang):`,
    `   - Kamu BOLEH menggunakan pengetahuan umum standar kamu untuk menjelaskan fungsi bahan tersebut secara singkat, ramah, dan edukatif.`,
    `   - **WAJIB SERTAKAN LINK PRODUK:** Di akhir penjelasan bahan, kamu harus menyertakan Link Marketplace/Halaman Checkout dari produk tersebut yang diambil dari [KNOWLEDGE BASE] agar customer bisa langsung membeli.`,
    `   - **OPTIONAL WHATSAPP FALLBACK:** Tambahkan ajakan ke WhatsApp (menggunakan Link WhatsApp Admin: ${escalationContact}) HANYA sebagai opsi tambahan jika mereka memiliki kondisi khusus (seperti alergi, kulit sensitif, atau ingin konsultasi lebih lanjut).`,
    `   - Contoh Pola Respon: "Halo Kak! Betul sekali, untuk produk [Nama Produk] mengandung [Bahan], yang fungsinya sangat bagus untuk [Manfaat Singkat]. Yuk, Kakak bisa langsung cek detail produk dan beli langsung di marketplace kami lewat link ini ya: [Masukkan Link Produk dari RAG]. Tapi kalau Kakak punya riwayat alergi khusus dan mau konsultasi lebih lanjut, silakan hubungi tim ahli kami di WhatsApp ya: [Masukkan Link WA Admin]"`,
    ``,
  ];

  if (topics.length > 0) {
    lines.push(`**Available Business Topics (Knowledge Base Index):**`);
    lines.push(`The business has official documentation strictly covering ONLY the following topics: [${topics.join(', ')}].`);
    lines.push(`- You must strictly validate what the business sells, offers, or does based ONLY on these topics and the provided context.`);
    lines.push(`- The business name is "${company}". Do NOT assume, speculate, or say that they sell products or services typical to this name (e.g. if the name is 'Berl Cosmetics' but the topics are about food, do NOT say you sell cosmetics).`);
    lines.push(`- If the user asks about a product, service, or topic that is not mentioned in these topics or in the provided context (e.g., "emas" / gold), you MUST state that the business does not sell or offer it.`);
    lines.push(``);
  } else {
    lines.push(`**BUSINESS IDENTITY & PRODUCTS (STRICT RULES):**`);
    lines.push(`- The business name is "${company}". Do NOT assume or say that they sell products or services typical to that name unless explicitly confirmed by the user or instructions.`);
    lines.push(`- If the user asks about any product or service (like "emas" / gold), state that the business does not sell or offer it unless you have explicit custom instructions.`);
    lines.push(``);
  }

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

  if (isStreaming) {
    lines.push(`**LEAD CAPTURE** — If the user:`);
    lines.push(`- Explicitly asks to speak with a human, agent, or representative`);
    lines.push(`- Asks about pricing, quotes, packages, or costs`);
    lines.push(`- Requests a demo, trial, or callback`);
    lines.push(`- Shows clear purchase intent or provides their contact details`);
    lines.push(`THEN append the exact text "|||LEAD|||" at the very end of your response.`);
    lines.push(``);
    lines.push(`**RESPONSE FORMAT** — respond with raw conversational text and markdown. Do NOT use JSON format.`);
  } else {
    lines.push(`**LEAD CAPTURE** — set "triggerLeadCapture": true ONLY if user:`);
    lines.push(`- Explicitly asks to speak with a human, agent, or representative`);
    lines.push(`- Asks about pricing, quotes, packages, or costs`);
    lines.push(`- Requests a demo, trial, or callback`);
    lines.push(`- Shows clear purchase intent or provides their contact details`);
    lines.push(``);
    lines.push(`**RESPONSE FORMAT** — respond with ONLY valid JSON, no markdown, no extra text:`);
    lines.push(`{"message": "your response here", "triggerLeadCapture": false}`);
  }

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
  const topics = await fetchKnowledgeBaseTopics(orgId);
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
      false,
      topics
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
        error.message?.includes('overloaded') ||
        error.message?.includes('unavailable');

      if (is503 && attempt < MAX_RETRIES) {
        const delayMs = attempt * 1000;
        console.warn(`[Gemini] Model overloaded. Retrying in ${delayMs}ms... (Attempt ${attempt}/${MAX_RETRIES})`);
        await new Promise(res => setTimeout(res, delayMs));
        continue;
      }

      console.error(`[Gemini] [Org: ${orgId}] Crash on attempt ${attempt}:`, error.message);
      break;
    }
  }

  console.error('[Gemini] All attempts failed. Last error:', lastError?.message);
  return {
    message: 'Maaf, saya sedang mengalami kendala jaringan. Silakan coba lagi sebentar.',
    triggerLeadCapture: false,
  };
}

// ─────────────────────────────────────────────
// Stream export (for Edge Runtime)
// ─────────────────────────────────────────────

export async function generateChatResponseStream(
  userMessage: string,
  history: ChatMessage[],
  context: string,
  botName: string,
  company: string,
  tone: string = 'Professional',
  customInstructions: string = '',
  adminWhatsApp: string = '',
  orgId: string = ''
): Promise<AsyncGenerator<string, void, unknown>> {

  const intent = classifyIntent(userMessage);
  const indonesian = isLikelyIndonesian(userMessage);

  if (intent === 'closing') {
    return (async function* () {
      yield getRandomResponse(indonesian ? CLOSING_RESPONSES_ID : CLOSING_RESPONSES_EN);
    })();
  }

  if (intent === 'greeting') {
    return (async function* () {
      yield getRandomResponse(indonesian ? GREETING_RESPONSES_ID : GREETING_RESPONSES_EN);
    })();
  }

  const topics = await fetchKnowledgeBaseTopics(orgId);
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
      true, // isStreaming
      topics
    ),
    generationConfig: {
      temperature: intent === 'small_talk' ? 0.7 : 0.3,
      topP: 0.85,
    },
  });

  const geminiHistory: Content[] = history.slice(-6).map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  try {
    const chat = model.startChat({ history: geminiHistory });
    const resultStream = await chat.sendMessageStream(userMessage);
    
    return (async function* () {
      for await (const chunk of resultStream.stream) {
        const chunkText = chunk.text();
        yield chunkText;
      }
    })();
  } catch (error: any) {
    console.error('[Gemini Stream] Crash:', error.message);
    return (async function* () {
      yield 'Maaf, saya sedang mengalami kendala jaringan. Silakan coba lagi sebentar.';
    })();
  }
}