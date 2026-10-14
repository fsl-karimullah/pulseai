import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    'Missing Supabase environment variables. Ensure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set in .env'
  );
}

/**
 * Cloud Supabase Client — used for Supabase Auth (token verification) and Storage (logos).
 */
export const supabaseAuth = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
});

/**
 * Database client — points to local PostgreSQL via PostgREST (http://127.0.0.1:8101)
 * when POSTGRES_REST_URL is configured, or falls back to Supabase Cloud if not set.
 */
const dbUrl = process.env.POSTGRES_REST_URL || supabaseUrl;
const dbKey = process.env.POSTGRES_SERVICE_KEY || supabaseKey;

export const supabaseDb = createClient(dbUrl, dbKey, {
  auth: { persistSession: false },
});

/**
 * Hybrid proxy: all database operations (.from, .rpc) route to local PostgreSQL on VPS,
 * while authentication (.auth) and file storage (.storage) route to Supabase Cloud.
 */
export const supabase = new Proxy(supabaseDb, {
  get(target, prop, receiver) {
    if (prop === 'auth') {
      return (supabaseAuth as any).auth;
    }
    if (prop === 'storage') {
      return (supabaseAuth as any).storage;
    }
    return Reflect.get(target, prop, receiver);
  },
}) as unknown as typeof supabaseDb;

export type KnowledgeNode = {
  id?: string;
  org_id: string;
  project_id: string;
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
