import { supabase } from '../config/supabase';
import { generateEmbedding } from './embeddings';

export type RetrievedChunk = {
  id: string;
  title: string;
  content: string;
  source_type: string;
  similarity: number;
};

/**
 * Embeds the user query, then performs cosine-similarity search
 * against knowledge_nodes via the match_knowledge_nodes RPC function.
 */
export async function retrieveContext(
  query: string,
  orgId: string,
  matchCount = 5,
  matchThreshold = 0.30
): Promise<RetrievedChunk[]> {
  try {
    console.log(`[RAG] Starting retrieval for Org: ${orgId}, Query: "${query.slice(0, 50)}..."`);
    
    // 1. Generate Embedding
    let embedding: number[];
    try {
      embedding = await generateEmbedding(query);
    } catch (embedErr: any) {
      console.error('[RAG] Embedding generation failed:', embedErr.message);
      // Fallback: return empty so the chat can at least continue without context
      return [];
    }

    if (!embedding || embedding.length === 0) {
      console.error('[RAG] Received empty embedding array');
      return [];
    }

    console.log(`[RAG] Embedding generated successfully (${embedding.length} dims)`);

    // 2. Search Supabase
    const { data, error } = await supabase.rpc('match_knowledge_nodes', {
      query_embedding: embedding,
      p_org_id: orgId,
      match_threshold: matchThreshold,
      match_count: matchCount,
    });

    if (error) {
      console.error('[RAG] Supabase RPC error:', error.message);
      return [];
    }

    const results = (data as RetrievedChunk[]) ?? [];
    console.log(`[RAG] Search complete. Found ${results.length} relevant chunks.`);
    
    return results;
  } catch (globalErr: any) {
    console.error('[RAG] Global retrieval crash:', globalErr.message);
    return [];
  }
}

/**
 * Formats retrieved chunks into a readable context block for the LLM.
 */
export function buildContextBlock(chunks: RetrievedChunk[]): string {
  if (chunks.length === 0) return 'No relevant knowledge base articles found.';
  return chunks
    .map((c, i) => `[Source ${i + 1} — ${c.title}]\n${c.content}`)
    .join('\n\n---\n\n');
}
