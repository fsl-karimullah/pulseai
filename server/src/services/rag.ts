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
 * Embeds the user query, then performs a TENANT-SCOPED cosine-similarity
 * search against `knowledge_nodes` via the `match_knowledge_nodes` RPC.
 *
 * ⚠️  SECURITY NOTE:
 *   The `orgId` parameter is the hard boundary that isolates each tenant's
 *   knowledge base. The Supabase RPC enforces `WHERE org_id = p_org_id`
 *   at the SQL level. This function additionally validates `orgId` before
 *   ever hitting the database, so we fail fast with a clear error rather
 *   than risking a cross-tenant data leak.
 *
 * @param query          - The user's raw message text
 * @param orgId          - UUID of the organisation (tenant) that owns the session
 * @param matchCount     - Maximum number of chunks to return (default 5)
 * @param matchThreshold - Minimum cosine similarity score 0–1 (default 0.50)
 */
export async function retrieveContext(
  query: string,
  orgId: string,
  matchCount = 5,
  matchThreshold = 0.50
): Promise<RetrievedChunk[]> {
  // ── Guard: org isolation requires a valid orgId ──────────────────────────
  // Never fall through to the DB with a blank/undefined orgId — that would
  // either raise an RPC exception (good) or return no results silently (bad DX).
  if (!orgId || typeof orgId !== 'string' || orgId.trim() === '') {
    console.error('[RAG] BLOCKED — orgId is missing or invalid. Refusing to query knowledge base.');
    return [];
  }

  try {
    console.log(`[RAG] Tenant-scoped retrieval | org: ${orgId.slice(0, 8)}… | query: "${query.slice(0, 50)}…"`);

    // ── Step 1: Generate embedding for the user query ─────────────────────
    let embedding: number[];
    try {
      embedding = await generateEmbedding(query);
    } catch (embedErr: any) {
      console.error('[RAG] Embedding generation failed:', embedErr.message);
      // Fail gracefully — the chat will continue without RAG context
      return [];
    }

    if (!embedding || embedding.length === 0) {
      console.error('[RAG] Received empty embedding array — skipping retrieval');
      return [];
    }

    console.log(`[RAG] Embedding ready (${embedding.length} dims) — searching org: ${orgId.slice(0, 8)}…`);

    // ── Step 2: Tenant-scoped vector similarity search ────────────────────
    // The RPC function enforces `WHERE org_id = p_org_id` at the SQL level.
    // Passing p_org_id as a typed uuid parameter prevents any SQL injection
    // and ensures results are STRICTLY limited to this tenant's documents.
    // We omit optional match_threshold and match_count to bypass PostgreSQL
    // function overloading resolution ambiguity.
    const { data, error } = await supabase.rpc('match_knowledge_nodes', {
      query_embedding: embedding,
      p_org_id:        orgId,          // ← tenant boundary enforced here
    });

    if (error) {
      // If the RPC itself raises (e.g. null orgId guard in SQL), surface it clearly
      console.error(`[RAG] Supabase RPC error for org ${orgId.slice(0, 8)}…:`, error.message);
      return [];
    }

    const results = (data as RetrievedChunk[]) ?? [];
    console.log(`[RAG] Found ${results.length} chunk(s) for org ${orgId.slice(0, 8)}… (threshold: ${matchThreshold})`);

    return results;
  } catch (globalErr: any) {
    console.error('[RAG] Unexpected retrieval error:', globalErr.message);
    return [];
  }
}

/**
 * Same as retrieveContext, but scoped to a Project instead of an
 * Organization — calls match_knowledge_nodes_by_project, which filters
 * `WHERE project_id = p_project_id`. Channels (WhatsApp numbers, widgets)
 * now resolve to a project before calling this, so a channel only ever
 * reads the Knowledge Base documents that belong to its own project.
 */
export async function retrieveContextByProject(
  query: string,
  projectId: string,
  matchCount = 5,
  matchThreshold = 0.50
): Promise<RetrievedChunk[]> {
  if (!projectId || typeof projectId !== 'string' || projectId.trim() === '') {
    console.error('[RAG] BLOCKED — projectId is missing or invalid. Refusing to query knowledge base.');
    return [];
  }

  try {
    console.log(`[RAG] Project-scoped retrieval | project: ${projectId.slice(0, 8)}… | query: "${query.slice(0, 50)}…"`);

    let embedding: number[];
    try {
      embedding = await generateEmbedding(query);
    } catch (embedErr: any) {
      console.error('[RAG] Embedding generation failed:', embedErr.message);
      return [];
    }

    if (!embedding || embedding.length === 0) {
      console.error('[RAG] Received empty embedding array — skipping retrieval');
      return [];
    }

    const { data, error } = await supabase.rpc('match_knowledge_nodes_by_project', {
      query_embedding: embedding,
      p_project_id:    projectId,
    });

    if (error) {
      console.error(`[RAG] Supabase RPC error for project ${projectId.slice(0, 8)}…:`, error.message);
      return [];
    }

    const results = (data as RetrievedChunk[]) ?? [];
    console.log(`[RAG] Found ${results.length} chunk(s) for project ${projectId.slice(0, 8)}… (threshold: ${matchThreshold})`);

    return results;
  } catch (globalErr: any) {
    console.error('[RAG] Unexpected retrieval error:', globalErr.message);
    return [];
  }
}

/**
 * Formats retrieved chunks into a readable context block for the LLM prompt.
 */
export function buildContextBlock(chunks: RetrievedChunk[]): string {
  if (chunks.length === 0) return 'No relevant knowledge base articles found.';
  return chunks
    .map((c, i) => `[Source ${i + 1} — ${c.title}]\n${c.content}`)
    .join('\n\n---\n\n');
}
