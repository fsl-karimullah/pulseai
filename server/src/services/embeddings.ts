import { GoogleGenerativeAI } from '@google/generative-ai';

const apiKey = process.env.GOOGLE_AI_API_KEY;
if (!apiKey) {
  throw new Error(
    'Missing GOOGLE_AI_API_KEY environment variable. Get your key from https://aistudio.google.com/apikey'
  );
}

const genAI = new GoogleGenerativeAI(apiKey);
const requestOptions = process.env.GEMINI_BASE_URL
  ? { baseUrl: process.env.GEMINI_BASE_URL }
  : undefined;
// gemini-embedding-001 is the recommended replacement for the deprecated
// text-embedding-004 model. It uses the default v1beta endpoint and
// produces 3072-dimensional vectors, matching our Supabase vector(3072) schema.
const model = genAI.getGenerativeModel({ model: 'gemini-embedding-001' }, requestOptions);

/**
 * Generates an embedding vector for a single text string.
 * Returns a 3072-dimensional float array (gemini-embedding-001).
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const result = await model.embedContent({
      content: { role: 'user', parts: [{ text }] },
      taskType: 'RETRIEVAL_QUERY' as any,
    });

    if (!result || !result.embedding) {
      throw new Error('Google Embedding API returned an empty result.');
    }

    return result.embedding.values;
  } catch (error: any) {
    console.error('[Embeddings] generation error:', error.message);
    throw new Error(`Embedding API failed: ${error.message}`);
  }
}

/**
 * Generates embeddings for multiple texts using the batch API.
 * Much faster than individual calls — avoids Vercel timeouts.
 */
export async function generateEmbeddingsBatch(
  texts: string[]
): Promise<number[][]> {
  if (texts.length === 0) return [];

  try {
    const BATCH_SIZE = 100;
    const results: number[][] = [];

    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
      const batch = texts.slice(i, i + BATCH_SIZE);

      const batchResult = await model.batchEmbedContents({
        requests: batch.map((text) => ({
          content: { role: 'user', parts: [{ text }] },
          taskType: 'RETRIEVAL_DOCUMENT' as any,
        })),
      });

      const vectors = batchResult.embeddings.map((e) => e.values);
      results.push(...vectors);
    }

    return results;
  } catch (error: any) {
    console.error('[Embeddings] batch generation error:', error.message);
    throw new Error(`Batch Embedding API failed: ${error.message}`);
  }
}