import { supabase } from '../config/supabase';
import { generateEmbedding } from './embeddings';

export type RetrievedChunk = {
  id: string;
  title: string;
  content: string;
  source_type: string;
  similarity: number;
};

// ─── Shared helper ─────────────────────────────────────────────────────────────
async function getEmbedding(query: string): Promise<number[] | null> {
  try {
    const embedding = await generateEmbedding(query);
    if (!embedding || embedding.length === 0) {
      console.error('[RAG] Received empty embedding array — skipping retrieval');
      return null;
    }
    return embedding;
  } catch (err: any) {
    console.error('[RAG] Embedding generation failed:', err.message);
    return null;
  }
}

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
 */
export async function retrieveContext(
  query: string,
  orgId: string,
  matchCount = 5,
  matchThreshold = 0.50
): Promise<RetrievedChunk[]> {
  if (!orgId || typeof orgId !== 'string' || orgId.trim() === '') {
    console.error('[RAG] BLOCKED — orgId is missing or invalid. Refusing to query knowledge base.');
    return [];
  }

  try {
    console.log(`[RAG] Tenant-scoped retrieval | org: ${orgId.slice(0, 8)}… | query: "${query.slice(0, 50)}…"`);

    const embedding = await getEmbedding(query);
    if (!embedding) return [];

    console.log(`[RAG] Embedding ready (${embedding.length} dims) — searching org: ${orgId.slice(0, 8)}…`);

    const { data, error } = await supabase.rpc('match_knowledge_nodes', {
      query_embedding: embedding,
      p_org_id:        orgId,
    });

    if (error) {
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
 * Project-scoped search — filters `WHERE project_id = p_project_id`.
 * Channels (WhatsApp numbers, widgets) resolve to a project before calling
 * this, so a channel only ever reads its own project's KB documents.
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

    const embedding = await getEmbedding(query);
    if (!embedding) return [];

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
 * Multi-KB RAG retrieval — used when a Bot Profile has `kb_project_ids` set.
 *
 * Queries across MULTIPLE project knowledge bases simultaneously using a
 * single DB round-trip via the `match_knowledge_nodes_by_projects` RPC.
 * This is more efficient than N sequential single-project queries.
 *
 * Routing logic (optimized):
 *   - 0 valid IDs → fall back to org-wide search
 *   - 1 valid ID  → use single-project RPC (fastest path)
 *   - N valid IDs → use multi-project RPC with graceful fallback
 *
 * @param query      - The user's raw message text
 * @param projectIds - Array of project UUIDs from bot_settings.kb_project_ids
 * @param orgId      - Fallback org ID if projectIds is empty
 */
export async function retrieveContextByProjects(
  query: string,
  projectIds: string[],
  orgId: string,
  matchCount = 5,
  matchThreshold = 0.50
): Promise<RetrievedChunk[]> {
  const validIds = projectIds.filter((id) => id && typeof id === 'string' && id.trim() !== '');

  if (validIds.length === 0) {
    console.log(`[RAG] No kb_project_ids — falling back to org-wide search for org: ${orgId.slice(0, 8)}…`);
    return retrieveContext(query, orgId, matchCount, matchThreshold);
  }

  if (validIds.length === 1) {
    return retrieveContextByProject(query, validIds[0], matchCount, matchThreshold);
  }

  // Multiple projects — single DB round-trip
  try {
    console.log(`[RAG] Multi-KB retrieval | projects: [${validIds.map(id => id.slice(0, 8)).join(', ')}] | query: "${query.slice(0, 50)}…"`);

    const embedding = await getEmbedding(query);
    if (!embedding) return [];

    const { data, error } = await supabase.rpc('match_knowledge_nodes_by_projects', {
      query_embedding: embedding,
      p_project_ids:   validIds,
      match_count:     matchCount,
      match_threshold: matchThreshold,
    });

    if (error) {
      console.error(`[RAG] Multi-KB RPC error:`, error.message);
      console.warn('[RAG] Gracefully falling back to first project only');
      return retrieveContextByProject(query, validIds[0], matchCount, matchThreshold);
    }

    const results = (data as RetrievedChunk[]) ?? [];
    console.log(`[RAG] Multi-KB found ${results.length} chunk(s) across ${validIds.length} KBs`);
    return results;
  } catch (globalErr: any) {
    console.error('[RAG] Unexpected multi-KB retrieval error:', globalErr.message);
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
