-- ═══════════════════════════════════════════════════════════════════════════
-- PulseAI — PENDING MIGRATIONS
-- Jalankan SQL ini di: https://supabase.com/dashboard/project/adgutsyloluwqdyicqrw/sql/new
-- ═══════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────────
-- MIGRATION 014: whatsapp_sessions
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists whatsapp_sessions (
  phone_number      text        primary key,
  org_id            uuid        not null references organizations(id) on delete cascade,
  phone_label       text        not null default 'default',
  gateway_user_id   text        not null,
  status            text        not null default 'DISCONNECTED'
                    check (status in ('CONNECTED', 'DISCONNECTED', 'CONNECTING', 'QR_PENDING')),
  connected_at      timestamptz,
  disconnected_at   timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create or replace trigger whatsapp_sessions_updated_at
  before update on whatsapp_sessions
  for each row
  execute function update_updated_at_column();

create index if not exists whatsapp_sessions_org_id_idx
  on whatsapp_sessions (org_id);

create index if not exists whatsapp_sessions_gateway_user_id_idx
  on whatsapp_sessions (gateway_user_id);

alter table whatsapp_sessions enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies where tablename = 'whatsapp_sessions' and policyname = 'Service role can manage whatsapp_sessions'
  ) then
    create policy "Service role can manage whatsapp_sessions"
      on whatsapp_sessions for all to service_role using (true);
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies where tablename = 'whatsapp_sessions' and policyname = 'Users can view own org whatsapp_sessions'
  ) then
    create policy "Users can view own org whatsapp_sessions"
      on whatsapp_sessions for select to authenticated
      using (
        org_id in (
          select id from organizations where user_id = auth.uid()
        )
      );
  end if;
end $$;

create or replace view whatsapp_sessions_summary with (security_invoker = on) as
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


-- ─────────────────────────────────────────────────────────────────────────────
-- MIGRATION 015: chat_logs
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists chat_logs (
  id                uuid         primary key default gen_random_uuid(),
  tenant_id         uuid         not null references organizations(id) on delete cascade,
  bot_number        text         not null,
  customer_number   text         not null,
  sender            text         not null check (sender in ('bot', 'customer')),
  message_text      text         not null,
  created_at        timestamptz  not null default now()
);

create index if not exists chat_logs_tenant_id_idx on chat_logs (tenant_id);
create index if not exists chat_logs_bot_customer_idx on chat_logs (bot_number, customer_number);

alter table chat_logs enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies where tablename = 'chat_logs' and policyname = 'Service role can manage chat_logs'
  ) then
    create policy "Service role can manage chat_logs"
      on chat_logs for all to service_role using (true);
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies where tablename = 'chat_logs' and policyname = 'Users can view own org chat_logs'
  ) then
    create policy "Users can view own org chat_logs"
      on chat_logs for select to authenticated
      using (
        tenant_id in (
          select id from organizations where user_id = auth.uid()
        )
      );
  end if;
end $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- MIGRATION 016: fix whatsapp_sessions_summary view
-- ─────────────────────────────────────────────────────────────────────────────

ALTER VIEW public.whatsapp_sessions_summary SET (security_invoker = on);


-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFY: cek tabel sudah terbuat
-- ─────────────────────────────────────────────────────────────────────────────
select table_name, table_type
from information_schema.tables
where table_schema = 'public'
  and table_name in ('whatsapp_sessions', 'chat_logs')
order by table_name;
