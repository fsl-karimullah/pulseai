-- ═══════════════════════════════════════════════════════════════════════════
-- PulseAI — Supabase Migration: knowledge_nodes table
-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor > New Query)
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Enable the pgvector extension (required for vector similarity search)
--    This is a one-time operation per database.
create extension if not exists vector;

-- 2. Create the knowledge_nodes table
--    Each row represents one chunk of a source document (PDF or URL).
--    text-embedding-004 produces 768-dimensional vectors.
create table if not exists knowledge_nodes (
  id            uuid        primary key default gen_random_uuid(),
  title         text        not null,
  content       text        not null,
  embedding     vector(768) not null,
  source_type   text        not null check (source_type in ('pdf', 'url', 'manual')),
  source_url    text,
  file_name     text,
  chunk_index   int         not null default 0,
  total_chunks  int         not null default 1,
  metadata      jsonb       not null default '{}',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- 3. Full-text search index on content
create index if not exists knowledge_nodes_content_fts
  on knowledge_nodes
  using gin (to_tsvector('english', content));

-- 4. IVFFlat index for fast approximate vector similarity search
--    Note: Run AFTER inserting at least a few thousand rows for best accuracy.
--    nlists = sqrt(number_of_rows) is a common heuristic.
create index if not exists knowledge_nodes_embedding_idx
  on knowledge_nodes
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- 5. Index on source_type for filtered queries
create index if not exists knowledge_nodes_source_type_idx
  on knowledge_nodes (source_type);

-- 6. Auto-update updated_at on row changes
create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create or replace trigger knowledge_nodes_updated_at
  before update on knowledge_nodes
  for each row
  execute function update_updated_at_column();

-- 7. Row Level Security (RLS)
--    Enable RLS — only the service role key can write; authenticated users can read.
alter table knowledge_nodes enable row level security;

-- Allow server (service role) to do everything (bypasses RLS automatically)

-- Allow authenticated frontend users to read knowledge nodes
create policy "Authenticated users can read knowledge nodes"
  on knowledge_nodes
  for select
  to authenticated
  using (true);

-- ── Helper function for similarity search (optional) ────────────────────────
-- Use this from your backend to do cosine-similarity lookups:
--
-- select id, title, content, chunk_index,
--        1 - (embedding <=> query_embedding::vector) as similarity
-- from   knowledge_nodes
-- where  1 - (embedding <=> query_embedding::vector) > 0.7
-- order  by embedding <=> query_embedding::vector
-- limit  5;

-- ═══════════════════════════════════════════════════════════════════════════
-- Done! Your knowledge_nodes table is ready.
-- ═══════════════════════════════════════════════════════════════════════════
