-- ═══════════════════════════════════════════════════════════════════════════
-- PulseAI — Migration 015: chat_logs — Message History Logging
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists chat_logs (
  id                uuid         primary key default gen_random_uuid(),
  tenant_id         uuid         not null references organizations(id) on delete cascade,
  bot_number        text         not null,
  customer_number   text         not null,
  sender            text         not null check (sender in ('bot', 'customer')),
  message_text      text         not null,
  created_at        timestamptz  not null default now()
);

-- Extra indexes for performance
create index if not exists chat_logs_tenant_id_idx on chat_logs (tenant_id);
create index if not exists chat_logs_bot_customer_idx on chat_logs (bot_number, customer_number);

-- Row Level Security
alter table chat_logs enable row level security;

-- Service role can manage chat_logs
create policy "Service role can manage chat_logs"
  on chat_logs for all to service_role using (true);

-- Authenticated users (dashboard) can view their own org's chat logs
create policy "Users can view own org chat_logs"
  on chat_logs for select to authenticated
  using (
    tenant_id in (
      select id from organizations where user_id = auth.uid()
    )
  );
