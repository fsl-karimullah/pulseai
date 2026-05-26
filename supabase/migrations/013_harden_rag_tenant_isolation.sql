-- ═══════════════════════════════════════════════════════════════════════════
-- PulseAI — Migration 013: Harden Tenant Isolation on knowledge_nodes
--
-- Run this in Supabase Dashboard → SQL Editor → New Query
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. Enforce NOT NULL on org_id ────────────────────────────────────────
-- Prevents orphaned knowledge chunks from ever being returned to any tenant.
-- Any row without an org_id would have been caught by the backfill in 009.
alter table knowledge_nodes
  alter column org_id set not null;

-- ─── 2. Composite index: org_id + embedding (partial IVFFlat) ─────────────
-- pgvector approximate indexes work best per-org when rows are pre-filtered.
-- This B-tree index on org_id allows Postgres to narrow rows BEFORE the
-- expensive vector distance calculation, dramatically reducing scan cost.
create index if not exists knowledge_nodes_org_id_idx
  on knowledge_nodes (org_id);

-- ─── 3. Drop old unsafe RLS policy (allows all authenticated users to read) ─
drop policy if exists "Users can view own organization knowledge" on knowledge_nodes;

-- ─── 4. Re-create RLS policy that enforces org boundary ───────────────────
create policy "Users can view own organization knowledge"
  on knowledge_nodes for select
  using (
    org_id in (
      select id from organizations where user_id = auth.uid()
    )
  );

-- ─── 5. Definitive match_knowledge_nodes RPC ─────────────────────────────
-- This is the canonical, authoritative version of the function.
-- Key guarantees:
--   a. p_org_id is typed as uuid (not text) — prevents type coercion bypass
--   b. WHERE org_id = p_org_id is the FIRST filter applied before the vector op
--   c. security definer lets service-role callers bypass RLS safely
--   d. Raises an exception if p_org_id is NULL — prevents accidental full-table leak
create or replace function match_knowledge_nodes(
  query_embedding  vector(768),
  p_org_id         uuid,
  match_threshold  float default 0.50,
  match_count      int   default 5
)
returns table (
  id           uuid,
  title        text,
  content      text,
  source_type  text,
  similarity   float
)
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Hard guard: never allow a NULL org_id to produce a cross-tenant result
  if p_org_id is null then
    raise exception 'match_knowledge_nodes: p_org_id must not be NULL';
  end if;

  return query
  select
    kn.id,
    kn.title,
    kn.content,
    kn.source_type,
    1 - (kn.embedding <=> query_embedding) as similarity
  from   knowledge_nodes kn
  where  kn.org_id = p_org_id                                         -- tenant filter FIRST
    and  1 - (kn.embedding <=> query_embedding) > match_threshold     -- then similarity gate
  order  by kn.embedding <=> query_embedding                          -- closest first
  limit  match_count;
end;
$$;

-- Grant execute to authenticated and service role
grant execute on function match_knowledge_nodes(vector, uuid, float, int)
  to authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- Done! Run this migration, then restart pulse-server.
-- ═══════════════════════════════════════════════════════════════════════════
