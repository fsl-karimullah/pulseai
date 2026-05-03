-- ═══════════════════════════════════════════════════════════════════════════
-- PulseAI — Supabase Migration: Organizations & Subscriptions
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Create Organizations Table
create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'My Organization',
  created_at timestamptz not null default now()
);

alter table organizations enable row level security;

-- Users can read and update their own organization
create policy "Users can view own organization"
  on organizations for select
  using (auth.uid() = user_id);

create policy "Users can update own organization"
  on organizations for update
  using (auth.uid() = user_id);

-- 2. Create Subscriptions Table
create table if not exists subscriptions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  plan_type text not null default 'free',
  status text not null default 'active',
  chat_limit int not null default 100,
  created_at timestamptz not null default now()
);

alter table subscriptions enable row level security;

-- Users can read their own subscription (via organization user_id)
create policy "Users can view own subscription"
  on subscriptions for select
  using (
    org_id in (
      select id from organizations where user_id = auth.uid()
    )
  );

-- 3. Create Trigger to Auto-Provision Org and Subscription
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  new_org_id uuid;
begin
  -- Insert into organizations
  insert into organizations (user_id, name)
  values (new.id, 'My Organization')
  returning id into new_org_id;

  -- Insert into subscriptions
  insert into subscriptions (org_id, plan_type, status, chat_limit)
  values (new_org_id, 'free', 'active', 100);

  return new;
end;
$$;

-- Trigger to call handle_new_user on sign up
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
