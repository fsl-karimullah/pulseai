-- ═══════════════════════════════════════════════════════════════════════════
-- PulseAI — Migration 014: whatsapp_sessions — Multi-Number per Tenant
--
-- Purpose:
--   Maps every connected WhatsApp bot number to its owning tenant (org).
--   This is the authoritative source for: "Who owns this phone number?"
--   The Fastify webhook uses it to resolve orgId from botNumber, enabling
--   one tenant to have many WA numbers sharing the same knowledge base.
--
-- Run in Supabase Dashboard → SQL Editor → New Query
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. Create the whatsapp_sessions table ────────────────────────────────
create table if not exists whatsapp_sessions (
  -- The actual WhatsApp phone number of the bot (e.g. "6281234567890").
  -- Primary key because one number can only belong to one org at a time.
  phone_number      text        primary key,

  -- Owning organisation (tenant). FK to organizations ensures referential integrity.
  org_id            uuid        not null references organizations(id) on delete cascade,

  -- Human-readable label set by the dashboard (e.g. 'default', 'sales', 'support').
  -- Mirrors the phoneLabel used in the whatsapp-gateway session key.
  phone_label       text        not null default 'default',

  -- Gateway session key (userId used in the Baileys socket Map).
  -- Stored here so the server can reconstruct gateway routing without extra lookups.
  gateway_user_id   text        not null,

  -- Connection status — kept in sync by the Fastify webhook on each event.
  status            text        not null default 'DISCONNECTED'
                    check (status in ('CONNECTED', 'DISCONNECTED', 'CONNECTING', 'QR_PENDING')),

  -- Timestamps for auditability and dashboard display
  connected_at      timestamptz,
  disconnected_at   timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ─── 2. Auto-update updated_at ────────────────────────────────────────────
create or replace trigger whatsapp_sessions_updated_at
  before update on whatsapp_sessions
  for each row
  execute function update_updated_at_column();

-- ─── 3. Indexes ───────────────────────────────────────────────────────────
-- Primary key on phone_number already creates a unique B-tree index.
-- Extra index for dashboard queries: "show all numbers for org X"
create index if not exists whatsapp_sessions_org_id_idx
  on whatsapp_sessions (org_id);

create index if not exists whatsapp_sessions_gateway_user_id_idx
  on whatsapp_sessions (gateway_user_id);

-- ─── 4. Row Level Security ────────────────────────────────────────────────
alter table whatsapp_sessions enable row level security;

-- Service role (backend) can do everything
create policy "Service role can manage whatsapp_sessions"
  on whatsapp_sessions for all to service_role using (true);

-- Authenticated users (dashboard) can only see their own org's sessions
create policy "Users can view own org whatsapp_sessions"
  on whatsapp_sessions for select to authenticated
  using (
    org_id in (
      select id from organizations where user_id = auth.uid()
    )
  );

-- ─── 5. Helper view for the dashboard ────────────────────────────────────
-- Returns all connected sessions with org name for the admin panel.
create or replace view whatsapp_sessions_summary as
  select
    ws.phone_number,
    ws.phone_label,
    ws.org_id,
    o.name   as org_name,
    ws.status,
    ws.gateway_user_id,
    ws.connected_at,
    ws.disconnected_at,
    ws.updated_at
  from  whatsapp_sessions ws
  join  organizations o on o.id = ws.org_id;

-- ═══════════════════════════════════════════════════════════════════════════
-- Done! Run migration, then deploy pulse-server and whatsapp-gateway.
-- ═══════════════════════════════════════════════════════════════════════════
