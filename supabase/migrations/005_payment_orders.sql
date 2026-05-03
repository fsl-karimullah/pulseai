-- ═══════════════════════════════════════════════════════════════════════════
-- PulseAI — Supabase Migration: Payment Orders tracking
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists payment_orders (
  id uuid primary key default gen_random_uuid(),
  order_id text unique not null,
  org_id uuid not null references organizations(id),
  plan_type text not null,
  amount int not null,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table payment_orders enable row level security;

-- Users can view their own orders
create policy "Users can view own orders"
  on payment_orders for select
  using (
    org_id in (
      select id from organizations where user_id = auth.uid()
    )
  );
