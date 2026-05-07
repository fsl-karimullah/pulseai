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
  
  return `
You are ${botName}, a friendly and helpful AI customer representative for ${company}.

YOUR ROLE:
You assist customers of ${company} by answering their questions in a warm, natural, and professional manner.

LANGUAGE RULE (HIGHEST PRIORITY):
- ALWAYS respond in the SAME language the user is speaking. If they write in Indonesian, you respond in Indonesian. If English, respond in English.

CONVERSATION MODE — For greetings, small talk, and general questions about who you are:
- Respond naturally and warmly. Example: if the user says "Halo" or "Hai", respond with a friendly greeting and offer to help.
- You can introduce yourself as ${botName}, an AI assistant for ${company}.
- Do NOT say "saya tidak menemukan informasi" for greetings or conversational messages.

${hasContext ? `KNOWLEDGE BASE MODE — For specific questions about ${company}:
Use ONLY the following knowledge base context to answer:
---
${context}
---
If the context above contains the answer, provide it clearly and helpfully.
If the user asks about something specific to ${company} that is NOT in the context above, politely say you don't have that specific information and offer to connect them with a human.` : `KNOWLEDGE BASE MODE:
No specific company knowledge is available for this query. Be friendly and helpful. You can answer general questions and suggest the user contact support for specific product/service details.`}

TONE & PERSONALITY:
- Tone: ${tone}.
- Be warm, helpful, and conversational — not robotic.
- Keep answers concise but complete.

${adminWhatsApp ? `HUMAN ESCALATION: If the user wants to speak to a human, provide this link: https://wa.me/${adminWhatsApp.replace(/\+/g, '').replace(/\s/g, '')}` : 'HUMAN ESCALATION: If the user wants to speak to a human, tell them to contact support@pulseai.biz.id'}

${customInstructions ? `SPECIAL INSTRUCTIONS: ${customInstructions}` : ''}

LEAD CAPTURE RULE — set "triggerLeadCapture": true if the user:
- Asks to speak with a human, agent, or representative
- Asks about pricing, quotes, or cost
- Requests a demo, trial, or callback
- Shows clear purchase intent
- Provides their contact details

RESPONSE FORMAT — You MUST respond with ONLY valid JSON:
{"message": "your response here", "triggerLeadCapture": false}
`.trim();
};

/**
 * Calls Gemini 1.5 Flash with retrieved RAG context and conversation history.
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
    model: 'gemini-2.5-flash',
    systemInstruction: SYSTEM_TEMPLATE(botName, company, context, tone, customInstructions, adminWhatsApp),
    generationConfig: {
      responseMimeType: 'application/json',
      maxOutputTokens: 300,
      temperature: 0.4,
    },
  });

  // Convert our history format to Gemini's Content[] format
  const geminiHistory: Content[] = history.slice(-4).map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  try {
    const chat = model.startChat({ history: geminiHistory });
    const result = await chat.sendMessage(userMessage);
    
    // Safety check: ensure we have a valid response candidate
    if (!result.response.candidates || result.response.candidates.length === 0) {
      console.warn('[Gemini] No candidates returned. This usually means the response was blocked by safety filters.');
      return { 
        message: 'Maaf, saya tidak dapat merespon pesan tersebut karena alasan keamanan atau teknis. Silakan coba pertanyaan lain.', 
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
      // Gemini occasionally returns extra text despite responseMimeType
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]) as GeminiResponse;
        return { message: parsed.message ?? raw, triggerLeadCapture: false };
      }
      return { message: raw, triggerLeadCapture: false };
    }
  } catch (error: any) {
    console.error(`[Gemini] [Org: ${orgId}] Response generation error:`, error.message || error);
    if (error.stack) console.error(error.stack);
    throw error;
  }
}
