import { GoogleGenerativeAI } from '@google/generative-ai';

const apiKey = process.env.GOOGLE_AI_API_KEY;

if (!apiKey) {
  throw new Error(
    'Missing GOOGLE_AI_API_KEY environment variable. Get your key from https://aistudio.google.com/apikey'
  );
}

const genAI = new GoogleGenerativeAI(apiKey);
const model = genAI.getGenerativeModel({ model: "gemini-embedding-001" });

/**
 * Generates an embedding vector for a single text string.
 * Returns a 768-dimensional float array.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const result = await model.embedContent({
      content: { role: 'user', parts: [{ text }] },
    });
    const embedding = result.embedding;
    return embedding.values;
  } catch (error: any) {
    console.error('[Embeddings] generation error:', error.message);
    throw new Error(`Embedding API failed: ${error.message}`);
  }
}

/**
 * Generates embeddings for multiple texts with rate-limit safety.
 * Batches requests with a small delay between them to avoid quota errors.
 */
export async function generateEmbeddingsBatch(
  texts: string[],
  delayMs = 200
): Promise<number[][]> {
  const results: number[][] = [];

  for (let i = 0; i < texts.length; i++) {
    const embedding = await generateEmbedding(texts[i]);
    results.push(embedding);

    // Polite delay between requests to stay within rate limits
    if (i < texts.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  return results;
}
