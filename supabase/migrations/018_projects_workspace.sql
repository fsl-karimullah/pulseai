-- ═══════════════════════════════════════════════════════════════════════════
-- PulseAI — Migration 018: Projects / Workspace layer
--
-- Purpose:
--   Introduces `Project` as a grouping layer BETWEEN `organizations` (the
--   billing/account tenant, unchanged) and the existing channel/KB tables.
--
--     organizations (1 per user, unchanged)
--       └─ projects (NEW — many per org)
--            ├─ knowledge_nodes  (project_id added, org_id KEPT)
--            ├─ whatsapp_sessions (project_id added, org_id KEPT)
--            ├─ bot_settings      (project_id added, org_id KEPT) — bot
--            │     personality/appearance becomes per-project instead of
--            │     per-org, since a project ("Toko Utama", "Cabang Bandung")
--            │     is the new unit that owns a distinct bot identity.
--            └─ widget_channels (NEW — bookkeeping table for 1+ website
--                  widget instances per project, mirrors whatsapp_sessions)
--
--   Backward compatibility:
--     - org_id columns are NOT removed or renamed anywhere. Existing RLS
--       policies and application code that still filter by org_id keep
--       working unchanged.
--     - The existing `match_knowledge_nodes(query_embedding, p_org_id, ...)`
--       RPC is left completely untouched. A NEW function
--       `match_knowledge_nodes_by_project(query_embedding, p_project_id, ...)`
--       is added alongside it. Application code (rag.ts) will be switched
--       over to the new function in a separate, later change — so this
--       migration alone cannot break the running app.
--     - Every existing client gets exactly one auto-created "default"
--       project (named after their existing organization) containing ALL
--       of their existing KB documents, WA numbers, and bot settings.
--
--   Run in Supabase Dashboard → SQL Editor → New Query
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. projects table ─────────────────────────────────────────────────────
create table if not exists projects (
  id         uuid        primary key default gen_random_uuid(),
  org_id     uuid        not null references organizations(id) on delete cascade,
  name       text        not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists projects_org_id_idx on projects (org_id);

create or replace trigger projects_updated_at
  before update on projects
  for each row
  execute function update_updated_at_column();

alter table projects enable row level security;

create policy "Users can view own org projects"
  on projects for select to authenticated
  using (org_id in (select id from organizations where user_id = auth.uid()));

create policy "Users can insert own org projects"
  on projects for insert to authenticated
  with check (org_id in (select id from organizations where user_id = auth.uid()));

create policy "Users can update own org projects"
  on projects for update to authenticated
  using (org_id in (select id from organizations where user_id = auth.uid()));

create policy "Users can delete own org projects"
  on projects for delete to authenticated
  using (org_id in (select id from organizations where user_id = auth.uid()));

create policy "Service role can manage projects"
  on projects for all to service_role using (true);

-- ─── 2. Backfill: one default project per existing organization ───────────
-- Named after the organization itself, so existing clients recognize it
-- immediately in the dashboard.
insert into projects (org_id, name)
select o.id, o.name
from organizations o
where not exists (select 1 from projects p where p.org_id = o.id);

-- Defensive dedupe: guarantee at most one project per org before anything
-- downstream (widget_channels, knowledge_nodes, whatsapp_sessions,
-- bot_settings) joins against `projects` on org_id. Keeps the OLDEST row
-- per org_id (earliest created_at, tie-broken by id) and drops any extras.
-- This is a no-op if projects is already 1:1 with organizations.
delete from projects p
using projects p2
where p.org_id = p2.org_id
  and (p.created_at, p.id) > (p2.created_at, p2.id);

-- Auto-provision a default project for BRAND NEW orgs going forward too,
-- so every organization always has at least one project from now on.
create or replace function public.handle_new_org_project()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into projects (org_id, name)
  values (new.id, new.name);
  return new;
end;
$$;

create trigger on_org_created_project
  after insert on organizations
  for each row execute procedure public.handle_new_org_project();

-- ─── 3. widget_channels table (NEW — website widget instances) ────────────
-- Identity/bookkeeping table for 1+ widget embeds per project, mirroring
-- the existing whatsapp_sessions pattern. Appearance/behavior (color,
-- logo, bot name, tone, instructions) stays centralized in bot_settings
-- at the PROJECT level — all widget instances in a project share it,
-- exactly like all WA numbers in a project already share bot_settings.
create table if not exists widget_channels (
  id         uuid        primary key default gen_random_uuid(),
  project_id uuid        not null references projects(id) on delete cascade,
  name       text        not null default 'Website Widget',
  domain     text,
  is_active  boolean     not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists widget_channels_project_id_idx on widget_channels (project_id);

create or replace trigger widget_channels_updated_at
  before update on widget_channels
  for each row
  execute function update_updated_at_column();

alter table widget_channels enable row level security;

create policy "Users can view own project widget_channels"
  on widget_channels for select to authenticated
  using (
    project_id in (
      select p.id from projects p
      join organizations o on o.id = p.org_id
      where o.user_id = auth.uid()
    )
  );

create policy "Users can insert own project widget_channels"
  on widget_channels for insert to authenticated
  with check (
    project_id in (
      select p.id from projects p
      join organizations o on o.id = p.org_id
      where o.user_id = auth.uid()
    )
  );

create policy "Users can update own project widget_channels"
  on widget_channels for update to authenticated
  using (
    project_id in (
      select p.id from projects p
      join organizations o on o.id = p.org_id
      where o.user_id = auth.uid()
    )
  );

create policy "Users can delete own project widget_channels"
  on widget_channels for delete to authenticated
  using (
    project_id in (
      select p.id from projects p
      join organizations o on o.id = p.org_id
      where o.user_id = auth.uid()
    )
  );

create policy "Service role can manage widget_channels"
  on widget_channels for all to service_role using (true);

-- Backfill: give every default project exactly one widget_channel row,
-- so existing widget embeds keep resolving to "a" channel once the
-- dashboard UI switches to listing channels instead of a single widget.
insert into widget_channels (project_id, name)
select p.id, 'Website Widget'
from projects p
where not exists (select 1 from widget_channels wc where wc.project_id = p.id);

-- ─── 4. project_id on knowledge_nodes ──────────────────────────────────────
alter table knowledge_nodes add column if not exists project_id uuid references projects(id) on delete cascade;

update knowledge_nodes kn
set project_id = p.id
from projects p
where kn.project_id is null
  and p.org_id = kn.org_id;

-- Safe because step 2 guarantees exactly one project per org at this point.
alter table knowledge_nodes alter column project_id set not null;
create index if not exists knowledge_nodes_project_id_idx on knowledge_nodes (project_id);

-- ─── 5. project_id on whatsapp_sessions ────────────────────────────────────
alter table whatsapp_sessions add column if not exists project_id uuid references projects(id) on delete cascade;

update whatsapp_sessions ws
set project_id = p.id
from projects p
where ws.project_id is null
  and p.org_id = ws.org_id;

alter table whatsapp_sessions alter column project_id set not null;
create index if not exists whatsapp_sessions_project_id_idx on whatsapp_sessions (project_id);

-- ─── 6. project_id on bot_settings ─────────────────────────────────────────
alter table bot_settings add column if not exists project_id uuid references projects(id) on delete cascade;

update bot_settings bs
set project_id = p.id
from projects p
where bs.project_id is null
  and p.org_id = bs.org_id;

-- Defensive dedupe: guarantee at most one bot_settings row per project
-- before enforcing uniqueness below. Keeps the MOST RECENTLY UPDATED row
-- per project_id (tie-broken by id) and drops any extras — this is a
-- no-op if bot_settings is already 1:1 with projects.
delete from bot_settings bs
using bot_settings bs2
where bs.project_id = bs2.project_id
  and (bs.updated_at, bs.id) < (bs2.updated_at, bs2.id);

alter table bot_settings alter column project_id set not null;

-- One bot_settings row per project (mirrors today's one-per-org invariant).
create unique index if not exists bot_settings_project_id_uidx on bot_settings (project_id);

-- ─── 7. New project-scoped RAG RPC (additive — old org-scoped RPC untouched) ─
create or replace function match_knowledge_nodes_by_project(
  query_embedding  vector(768),
  p_project_id     uuid,
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
  if p_project_id is null then
    raise exception 'match_knowledge_nodes_by_project: p_project_id must not be NULL';
  end if;

  return query
  select
    kn.id,
    kn.title,
    kn.content,
    kn.source_type,
    1 - (kn.embedding <=> query_embedding) as similarity
  from   knowledge_nodes kn
  where  kn.project_id = p_project_id
    and  1 - (kn.embedding <=> query_embedding) > match_threshold
  order  by kn.embedding <=> query_embedding
  limit  match_count;
end;
$$;

grant execute on function match_knowledge_nodes_by_project(vector, uuid, float, int)
  to authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- Done. Existing org-scoped code paths are untouched and keep working.
-- Application code must be updated separately (Langkah 2/3) to start
-- resolving/writing project_id and calling match_knowledge_nodes_by_project.
-- ═══════════════════════════════════════════════════════════════════════════
