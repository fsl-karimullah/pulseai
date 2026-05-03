-- Migration 002: RAG match function + leads table

-- 1. Similarity search function (called via supabase.rpc)
create or replace function match_knowledge_nodes(
  query_embedding vector(768),
  match_threshold float default 0.60,
  match_count int default 5
)
returns table (
  id uuid, title text, content text, source_type text, similarity float
)
language sql stable as $$
  select id, title, content, source_type,
         1 - (embedding <=> query_embedding) as similarity
  from   knowledge_nodes
  where  1 - (embedding <=> query_embedding) > match_threshold
  order  by embedding <=> query_embedding
  limit  match_count;
$$;

-- 2. Leads table
create table if not exists leads (
  id              uuid        primary key default gen_random_uuid(),
  name            text        not null,
  whatsapp        text        not null,
  conversation_id text,
  last_message    text,
  metadata        jsonb       not null default '{}',
  created_at      timestamptz not null default now()
);

alter table leads enable row level security;

create policy "Service role can manage leads"
  on leads for all to service_role using (true);
