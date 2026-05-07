import { GoogleGenerativeAI } from '@google/generative-ai';

const apiKey = process.env.GOOGLE_AI_API_KEY;

if (!apiKey) {
  throw new Error(
    'Missing GOOGLE_AI_API_KEY environment variable. Get your key from https://aistudio.google.com/apikey'
  );
}

const genAI = new GoogleGenerativeAI(apiKey);
const model = genAI.getGenerativeModel({ model: "text-embedding-004" });

/**
 * Generates an embedding vector for a single text string.
 * Returns a 768-dimensional float array.
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
    
    const embedding = result.embedding;
    return embedding.values;
  } catch (error: any) {
    console.error('[Embeddings] generation error:', error.message);
    throw new Error(`Embedding API failed: ${error.message}`);
  }
}

/**
 * Generates embeddings for multiple texts using the batch API.
 * This is much faster than individual calls and avoids Vercel timeouts.
 */
export async function generateEmbeddingsBatch(
  texts: string[]
): Promise<number[][]> {
  if (texts.length === 0) return [];

  try {
    // Google supports batching up to 100 items per request
    const BATCH_SIZE = 100;
    const results: number[][] = [];

    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
      const batch = texts.slice(i, i + BATCH_SIZE);
      const batchResult = await model.batchEmbedContents({
        requests: batch.map(text => ({
          content: { role: 'user', parts: [{ text }] },
          taskType: 'RETRIEVAL_DOCUMENT' as any,
        }))
      });

      const vectors = batchResult.embeddings.map(e => e.values);
      results.push(...vectors);
    }

    return results;
  } catch (error: any) {
    console.error('[Embeddings] batch generation error:', error.message);
    throw new Error(`Batch Embedding API failed: ${error.message}`);
  }
}
