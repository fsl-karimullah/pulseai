import { GoogleGenerativeAI, type Content } from '@google/generative-ai';

const genai = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY!);

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
) => `
You are ${botName}, a dedicated AI customer representative for ${company}.

STRICT COMPLIANCE RULES:
1. USE THE PROVIDED KNOWLEDGE BASE CONTEXT below to answer questions about specific details, products, or company info.
2. HANDLING GREETINGS & IDENTITY: You MAY respond naturally to general greetings and questions about who you are or what you can do (e.g., "Siapa anda?", "Data apa yang anda punya?"). Explain that you are an AI assistant trained on the company's knowledge base to help with their inquiries.
3. KNOWLEDGE LIMIT: If the user asks a specific question about company details (like prices, specific dates, or policies) that is NOT in the context, say "Maaf, saya tidak menemukan informasi spesifik tersebut di data kami." and then offer to connect them to a human representative.
4. YOUR IDENTITY: You are an employee of ${company}. Never refer to yourself as a general AI service or mention "PulseAI" unless that is specifically the company name provided.

PERSONALITY & TONE:
- Tone: ${tone}.
- CONCISENESS: Answer the user's questions clearly and helpfully. You can use appropriate greetings and pleasantries to sound natural and friendly, but keep your answers focused and avoid unnecessary fluff.
- LANGUAGE: If the user speaks Indonesian, you MUST respond in Indonesian.
- Be helpful and proactive. If you find the answer in the context, explain it clearly.

ADMIN/HUMAN ESCALATION:
- If asked for an admin, human, agent, or if you can't answer, YOU MUST provide the contact link.
${adminWhatsApp ? `- ADMIN CONTACT: https://wa.me/${adminWhatsApp.replace(/\+/g, '').replace(/\s/g, '')}` : '- If you cannot answer, tell them to contact support at support@pulseai.biz.id'}

${customInstructions ? `SPECIAL INSTRUCTIONS: ${customInstructions}` : ''}

KNOWLEDGE BASE CONTEXT (MANDATORY DATA SOURCE):
${context}

LEAD CAPTURE RULE — set "triggerLeadCapture": true if the user:
- Asks to speak with a human, agent, or representative
- Asks about pricing, quotes, or cost
- Requests a demo, trial, or callback
- Shows clear purchase intent
- Provides their contact details

You MUST respond with ONLY valid JSON:
{"message": "your response here", "triggerLeadCapture": false}
`.trim();

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
    model: 'gemini-1.5-flash',
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
