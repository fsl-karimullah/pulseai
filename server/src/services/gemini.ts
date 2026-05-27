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
  topics: string[] = [],
  hasValidPhone: boolean = true
): string => {
  const hasContext = context && !context.includes('No relevant knowledge base articles found');
  
  let cleanWa = '';
  if (adminWhatsApp) {
    const firstAdmin = adminWhatsApp.split(/[,;]+/)[0]?.trim() || '';
    cleanWa = firstAdmin.replace(/\D/g, ''); // Strip non-digits
    if (cleanWa.startsWith('0')) {
      cleanWa = '62' + cleanWa.substring(1);
    }
  }
  const escalationContact = cleanWa
    ? `https://wa.me/${cleanWa}`
    : 'pulseaichat@gmail.com';

  // ── Derive forbidden industry terms from the brand name that are absent from RAG topics
  // e.g. "Berl Cosmetics" → candidate forbidden terms: ["kosmetik", "kecantikan", "skincare", "makeup"]
  const BRAND_INDUSTRY_MAP: Record<string, string[]> = {
    cosmetic:  ['kosmetik', 'kecantikan', 'skincare', 'makeup', 'beauty', 'serum', 'moisturizer'],
    beauty:    ['kecantikan', 'kosmetik', 'skincare', 'makeup', 'serum'],
    fashion:   ['fashion', 'pakaian', 'baju', 'outfit', 'clothing'],
    food:      ['makanan', 'kuliner', 'restoran', 'menu', 'catering'],
    tech:      ['elektronik', 'gadget', 'laptop', 'smartphone'],
    gold:      ['emas', 'logam mulia', 'perhiasan', 'jewelry'],
    jewelry:   ['perhiasan', 'emas', 'cincin', 'kalung', 'gelang'],
    pharmacy:  ['obat', 'apotek', 'farmasi', 'suplemen'],
  };
  const companyLower = company.toLowerCase();
  const ragText = topics.join(' ').toLowerCase();
  const forbiddenTerms: string[] = [];
  for (const [keyword, terms] of Object.entries(BRAND_INDUSTRY_MAP)) {
    if (companyLower.includes(keyword)) {
      // Only forbid terms NOT found in the actual RAG topics
      for (const term of terms) {
        if (!ragText.includes(term)) {
          forbiddenTerms.push(term);
        }
      }
    }
  }

  const outOfScopeReply = `Mohon maaf Kak, saat ini ${company} tidak menyediakan produk tersebut. Kami hanya melayani produk dan informasi yang tertera pada katalog resmi kami. Ada yang bisa kami bantu terkait katalog yang tersedia? 😊`;

  const lines: string[] = [
    // ── ANTI-HALLUCINATION GATE — placed FIRST so it overrides everything below ──
    `⚠️ ABSOLUTE OVERRIDE — READ THIS FIRST BEFORE ANYTHING ELSE:`,
    `You are "${botName}", an AI Sales Assistant operating under MAXIMUM RESTRICTION MODE.`,
    ``,
    `INDEPENDENT IDENTITY RULE:`,
    `- You do NOT know what "${company}" sells until you read the [KNOWLEDGE BASE] section below.`,
    `- Do NOT use the business name "${company}" as a clue to guess the industry. The name is just a label.`,
    `- You must derive ALL knowledge of what this business sells SOLELY from the [KNOWLEDGE BASE] data provided below.`,
    ``,
    forbiddenTerms.length > 0
      ? `FORBIDDEN WORDS (these industry terms do NOT appear in the Knowledge Base, so this business does NOT sell them):
- You are STRICTLY FORBIDDEN from mentioning: ${forbiddenTerms.join(', ')}.
- If those words are not in the [KNOWLEDGE BASE] below, you have ZERO knowledge of them for this business.`
      : `SCOPE RULE: You may only discuss products and services that explicitly appear in the [KNOWLEDGE BASE] below.`,
    ``,
    `OUT-OF-SCOPE RULE (MANDATORY):`,
    `1. If the user asks for a product or service NOT listed in the [KNOWLEDGE BASE], politely explain that ${company} does not offer it, and offer what is available. Speak naturally, do NOT use robotic templates.`,
    `2. If the user asks a general knowledge question completely unrelated to ${company} (e.g., medical advice, random trivia), answer it briefly and warmly as a helpful human, then politely pivot back to asking if they need help with ${company}'s services.`,
    `3. If you CANNOT answer a question because the information is not in the [KNOWLEDGE BASE], you MUST politely offer to connect them to a human admin (${escalationContact}).`,
    ``,
    `── END OF OVERRIDE ──`,
    ``,
    // ── Normal persona ──
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
    `1. **KNOWLEDGE BASE USAGE:** Answer questions ONLY about topics explicitly present in the [KNOWLEDGE BASE] below. For general/small talk, reply naturally but never invent product or service details.`,
    ``,
    `2. **PRODUCT LINKS (IMPORTANT):** If the knowledge base contains a checkout link, URL, or "Product Link" for a specific product/menu item, you MUST include that exact link in your response when the user asks about or shows interest in that product.`,
    ``,
    `3. **NEVER REPEAT YOURSELF:** Check the chat history carefully. If you already explained something, do NOT say it again. Move forward.`,
    ``,
    `4. **INFORMATION SUMMARY:** When asked "What information do you have?" or "Apa informasi yang kamu punya?", give a SHORT bulleted summary of available topics only. Do NOT dump all the details.`,
    ``,
    `5. **STRICT RESPONSE LENGTH:**`,
    `   - Short/general input → 1–2 sentences maximum.`,
    `   - Specific question → 2–3 sentences.`,
    `   - Complex question → Use a maximum of 3 short bullet points. NEVER output long paragraphs.`,
    ``,
    `6. **RULE UNTUK PERTANYAAN KOMPOSISI/BAHAN:**`,
    `   - Jika user menanyakan komposisi atau bahan dari produk yang ADA di [KNOWLEDGE BASE], kamu BOLEH menjelaskan fungsinya secara singkat menggunakan pengetahuan umum.`,
    `   - WAJIB sertakan link produk dari [KNOWLEDGE BASE] di akhir penjelasan.`,
    `   - OPTIONAL: Tambahkan ajakan WhatsApp (${escalationContact}) hanya jika user punya kondisi khusus (alergi, dll).`,
    ``,
  ];

  if (topics.length > 0) {
    lines.push(`**Knowledge Base Topic Index (what this business actually sells/covers):**`);
    lines.push(`[${topics.join(', ')}]`);
    lines.push(`- This is the ONLY scope of this business. Anything outside this list = OUT-OF-SCOPE.`);
    lines.push(``);
  } else {
    lines.push(`**SCOPE:** No knowledge base uploaded yet. Do not assume any products or services. If asked about specific products, say the catalog is being updated.`);
    lines.push(``);
  }

  if (!hasValidPhone) {
    lines.push(`**HUMAN ESCALATION & LEAD CAPTURE RULE (CRITICAL)**`);
    lines.push(`The system currently DOES NOT know the user's phone number due to WhatsApp privacy settings.`);
    lines.push(`If the user explicitly asks to speak to a human/agent, OR agrees to your offer to connect to an admin:`);
    lines.push(`1. You MUST politely ask them to type their active WhatsApp phone number in the chat first.`);
    lines.push(`2. Do NOT set "triggerLeadCapture": true YET.`);
    lines.push(`3. ONLY set "triggerLeadCapture": true AFTER the user types their phone number in the chat.`);
    lines.push(``);
  } else {
    lines.push(`**LEAD CAPTURE** — set "triggerLeadCapture": true ONLY if user:`);
    lines.push(`- Explicitly asks to speak with a human, agent, or representative`);
    lines.push(`- Asks about pricing, quotes, packages, or costs`);
    lines.push(`- Requests a demo, trial, or callback`);
    lines.push(`- Shows clear purchase intent or provides their contact details`);
    lines.push(``);
  }

  if (isStreaming) {
    lines.push(`**RESPONSE FORMAT** — respond with raw conversational text and markdown. Do NOT use JSON format. If triggerLeadCapture is met, append "|||LEAD|||" at the end of the text.`);
  } else {
    lines.push(`**RESPONSE FORMAT** — respond strictly with valid JSON exactly matching this schema:`);
    lines.push(`{`);
    lines.push(`  "message": "your conversation response",`);
    lines.push(`  "triggerLeadCapture": boolean`);
    lines.push(`}`);
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

  if (!hasValidPhone) {
    lines.push(`**HUMAN ESCALATION & LEAD CAPTURE RULE (CRITICAL)**`);
    lines.push(`The system currently DOES NOT know the user's phone number due to WhatsApp privacy settings.`);
    lines.push(`If the user explicitly asks to speak to a human/agent, OR agrees to your offer to connect to an admin:`);
    lines.push(`1. You MUST politely ask them to type their active WhatsApp phone number in the chat first.`);
    lines.push(`2. Do NOT set "triggerLeadCapture": true YET.`);
    lines.push(`3. ONLY set "triggerLeadCapture": true AFTER the user types their phone number in the chat.`);
    lines.push(``);
  } else {
    lines.push(`**LEAD CAPTURE** — set "triggerLeadCapture": true ONLY if user:`);
    lines.push(`- Explicitly asks to speak with a human, agent, or representative`);
    lines.push(`- Asks about pricing, quotes, packages, or costs`);
    lines.push(`- Requests a demo, trial, or callback`);
    lines.push(`- Shows clear purchase intent or provides their contact details`);
    lines.push(``);
  }

  if (isStreaming) {
    lines.push(`**RESPONSE FORMAT** — respond with raw conversational text and markdown. Do NOT use JSON format. If triggerLeadCapture is met, append "|||LEAD|||" at the end of the text.`);
  } else {
    lines.push(`**RESPONSE FORMAT** — respond strictly with valid JSON exactly matching this schema:`);
    lines.push(`{`);
    lines.push(`  "message": "your conversation response",`);
    lines.push(`  "triggerLeadCapture": boolean`);
    lines.push(`}`);
  }

  return lines.join('\\n');
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
  orgId: string = '',
  hasValidPhone: boolean = true
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
  const modelsToTry = ['gemini-2.5-flash-lite', 'gemini-2.5-flash', 'gemini-3.1-flash-lite-preview'];

  // Keep last 6 messages — scrub any assistant turns that contain the company name
  // to prevent hallucinated brand responses from bleeding into the current session
  const companyScrubPattern = new RegExp(company.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
  const geminiHistory: Content[] = history
    .slice(-6)
    .filter((m) => {
      // Drop assistant messages that hallucinated company-specific industry claims
      // (i.e. any model turn that mentions the company name in a product claim context)
      if (m.role === 'assistant') {
        const lower = m.content.toLowerCase();
        // If the message mentions the company AND any forbidden/out-of-scope industry pattern, drop it
        const hasBrandName = companyScrubPattern.test(m.content);
        companyScrubPattern.lastIndex = 0; // reset regex state after test
        const hasInvalidClaim = /\b(menjual|kami jual|produk kami|kami di|kami menyediakan)\b/i.test(lower);
        if (hasBrandName && hasInvalidClaim) {
          console.warn(`[Gemini] [Org: ${orgId}] Scrubbed hallucinated history turn: "${m.content.slice(0, 80)}..."`);
          return false;
        }
      }
      return true;
    })
    .map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

  const MAX_RETRIES = 3;
  let lastError: any;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const currentModelName = modelsToTry[attempt - 1] || 'gemini-2.5-flash-lite';
    try {
      const requestOptions = process.env.GEMINI_BASE_URL
        ? { baseUrl: process.env.GEMINI_BASE_URL }
        : undefined;

      const model = genai.getGenerativeModel({
        model: currentModelName,
        systemInstruction: buildSystemPrompt(
          botName,
          company,
          context,
          tone,
          customInstructions,
          adminWhatsApp,
          intent,
          false,
          topics,
          hasValidPhone
        ),
        generationConfig: {
          responseMimeType: 'application/json',
          maxOutputTokens: 1200,
          temperature: intent === 'small_talk' ? 0.7 : 0.3,
          topP: 0.85,
        },
      }, requestOptions);

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
  let waLinkMessage = '';
  if (adminWhatsApp) {
    const firstAdmin = adminWhatsApp.split(/[,;]+/)[0]?.trim() || '';
    let cleanWa = firstAdmin.replace(/\D/g, ''); // Strip non-digits
    if (cleanWa.startsWith('0')) {
      cleanWa = '62' + cleanWa.substring(1);
    }
    if (cleanWa) {
      waLinkMessage = ` Hubungi kami langsung via WhatsApp di wa.me/${cleanWa} 😊`;
    }
  }
  return {
    message: `Maaf, asisten AI sedang sangat sibuk.${waLinkMessage || ' Silakan coba lagi sebentar.'}`,
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
  orgId: string = '',
  hasValidPhone: boolean = true
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
  const modelsToTry = ['gemini-2.5-flash-lite', 'gemini-2.5-flash', 'gemini-1.5-flash'];

  // Scrub hallucinated assistant turns (same logic as non-streaming path)
  const companyScrubPatternStream = new RegExp(company.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
  const geminiHistory: Content[] = history
    .slice(-6)
    .filter((m) => {
      if (m.role === 'assistant') {
        const lower = m.content.toLowerCase();
        const hasBrandName = companyScrubPatternStream.test(m.content);
        companyScrubPatternStream.lastIndex = 0;
        const hasInvalidClaim = /\b(menjual|kami jual|produk kami|kami di|kami menyediakan)\b/i.test(lower);
        if (hasBrandName && hasInvalidClaim) {
          console.warn(`[Gemini Stream] [Org: ${orgId}] Scrubbed hallucinated history turn.`);
          return false;
        }
      }
      return true;
    })
    .map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

  const STREAM_MAX_RETRIES = 3;

  for (let attempt = 1; attempt <= STREAM_MAX_RETRIES; attempt++) {
    const currentModelName = modelsToTry[attempt - 1] || 'gemini-2.5-flash-lite';
    try {
      const requestOptions = process.env.GEMINI_BASE_URL
        ? { baseUrl: process.env.GEMINI_BASE_URL }
        : undefined;

      const model = genai.getGenerativeModel({
        model: currentModelName,
        systemInstruction: buildSystemPrompt(
          botName,
          company,
          context,
          tone,
          customInstructions,
          adminWhatsApp,
          intent,
          true, // isStreaming
          topics,
          hasValidPhone
        ),
        generationConfig: {
          temperature: intent === 'small_talk' ? 0.7 : 0.3,
          topP: 0.85,
        },
      }, requestOptions);

      const chat = model.startChat({ history: geminiHistory });
      const resultStream = await chat.sendMessageStream(userMessage);

      // Validate that the stream actually yields at least one chunk before returning
      // to surface parse errors at this layer rather than leaking them to the caller
      return (async function* () {
        try {
          for await (const chunk of resultStream.stream) {
            yield chunk.text();
          }
        } catch (streamErr: any) {
          // If the stream breaks mid-way on the final attempt, yield the error message
          // On earlier attempts the outer loop handles it via the re-throw below
          console.error(`[Gemini Stream] Mid-stream error (attempt ${attempt}):`, streamErr.message);
          yield 'Maaf, saya sedang mengalami kendala jaringan. Silakan coba lagi sebentar.';
        }
      })();

    } catch (error: any) {
      const isTransient =
        error.message?.includes('Failed to parse stream') ||
        error.message?.includes('503') ||
        error.message?.includes('overloaded') ||
        error.message?.includes('unavailable') ||
        error.message?.includes('fetch failed') ||
        error.message?.includes('network');

      if (isTransient && attempt < STREAM_MAX_RETRIES) {
        const delayMs = attempt * 1200; // 1.2s, 2.4s
        console.warn(
          `[Gemini Stream] [Org: ${orgId}] Transient error on attempt ${attempt}/${STREAM_MAX_RETRIES}. Retrying in ${delayMs}ms...`,
          error.message
        );
        await new Promise((res) => setTimeout(res, delayMs));
        continue;
      }

      console.error(`[Gemini Stream] [Org: ${orgId}] All ${STREAM_MAX_RETRIES} attempts failed:`, error.message);
      let waLinkMessage = '';
      if (adminWhatsApp) {
        const firstAdmin = adminWhatsApp.split(/[,;]+/)[0]?.trim() || '';
        let cleanWa = firstAdmin.replace(/\D/g, ''); // Strip non-digits
        if (cleanWa.startsWith('0')) {
          cleanWa = '62' + cleanWa.substring(1);
        }
        if (cleanWa) {
          waLinkMessage = ` Hubungi kami langsung via WhatsApp di wa.me/${cleanWa} 😊`;
        }
      }
      return (async function* () {
        yield `Maaf, asisten AI sedang sangat sibuk.${waLinkMessage || ' Silakan coba lagi sebentar.'}`;
      })();
    }
  }

  // Unreachable but satisfies TypeScript's return type
  return (async function* () {
    let waLinkMessage = '';
    if (adminWhatsApp) {
      const firstAdmin = adminWhatsApp.split(/[,;]+/)[0]?.trim() || '';
      let cleanWa = firstAdmin.replace(/\D/g, '');
      if (cleanWa.startsWith('0')) {
        cleanWa = '62' + cleanWa.substring(1);
      }
      if (cleanWa) {
        waLinkMessage = ` Hubungi kami langsung via WhatsApp di wa.me/${cleanWa} 😊`;
      }
    }
    yield `Maaf, asisten AI sedang sangat sibuk.${waLinkMessage || ' Silakan coba lagi sebentar.'}`;
  })();
}