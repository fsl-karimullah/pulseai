-- ═══════════════════════════════════════════════════════════════════════════
-- PulseAI — Supabase Migration: Multi-Tenant Isolation
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Add org_id to knowledge_nodes
alter table knowledge_nodes add column if not exists org_id uuid references organizations(id) on delete cascade;

-- 2. Add org_id to leads
alter table leads add column if not exists org_id uuid references organizations(id) on delete cascade;

-- 3. Add org_id to analytics_events
alter table analytics_events add column if not exists org_id uuid references organizations(id) on delete cascade;

-- 4. Backfill existing data to the first organization (for safety during migration)
do $$
declare
  first_org_id uuid;
begin
  select id into first_org_id from organizations order by created_at asc limit 1;
  
  if first_org_id is not null then
    update knowledge_nodes set org_id = first_org_id where org_id is null;
    update leads set org_id = first_org_id where org_id is null;
    update analytics_events set org_id = first_org_id where org_id is null;
  end if;
end $$;

-- 5. Update match_knowledge_nodes RPC to include org_id filtering
create or replace function match_knowledge_nodes(
  query_embedding vector(768),
  p_org_id uuid,
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
  where  org_id = p_org_id
    and  1 - (embedding <=> query_embedding) > match_threshold
  order  by embedding <=> query_embedding
  limit  match_count;
$$;

-- 6. Update RLS Policies

-- knowledge_nodes
drop policy if exists "Authenticated users can read knowledge nodes" on knowledge_nodes;
create policy "Users can view own organization knowledge"
  on knowledge_nodes for select
  using (
    org_id in (
      select id from organizations where user_id = auth.uid()
    )
  );

-- leads
drop policy if exists "Service role can manage leads" on leads;
create policy "Users can view own organization leads"
  on leads for select
  using (
    org_id in (
      select id from organizations where user_id = auth.uid()
    )
  );

create policy "Service role can do everything on leads"
  on leads for all to service_role using (true);

-- analytics_events
alter table analytics_events enable row level security;
create policy "Users can view own organization analytics"
  on analytics_events for select
  using (
    org_id in (
      select id from organizations where user_id = auth.uid()
    )
  );
