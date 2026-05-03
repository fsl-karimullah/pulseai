import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    'Missing Supabase environment variables. Ensure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set in .env'
  );
}

/**
 * Server-side Supabase client using the Service Role key.
 * This bypasses Row Level Security — only use server-side, NEVER expose to the browser.
 */
export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
});

export type KnowledgeNode = {
  id?: string;
  org_id: string;
  title: string;
  content: string;
  embedding: number[];
  source_type: 'pdf' | 'url' | 'manual';
  source_url?: string | null;
  file_name?: string | null;
  chunk_index: number;
  total_chunks: number;
  metadata?: Record<string, unknown>;
  created_at?: string;
};

/**
 * Inserts an array of knowledge node chunks into the knowledge_nodes table.
 * Performs a bulk upsert for efficiency.
 */
export async function insertKnowledgeNodes(
  nodes: KnowledgeNode[]
): Promise<{ inserted: number }> {
  const { data, error } = await supabase
    .from('knowledge_nodes')
    .insert(nodes)
    .select('id');

  if (error) {
    throw new Error(`Supabase insert failed: ${error.message}`);
  }

  return { inserted: data?.length ?? 0 };
}
