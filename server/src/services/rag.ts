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
  const embedding = await generateEmbedding(query);

  const { data, error } = await supabase.rpc('match_knowledge_nodes', {
    query_embedding: embedding,
    p_org_id: orgId,
    match_threshold: matchThreshold,
    match_count: matchCount,
  });

  if (error) {
    console.error('[RAG] retrieval error:', error.message);
    return [];
  }

  return (data as RetrievedChunk[]) ?? [];
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
