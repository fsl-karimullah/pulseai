-- ═══════════════════════════════════════════════════════════════════════════
-- PulseAI — Migration 017: Credit-Based System
--
-- Jalankan SQL ini di:
-- https://supabase.com/dashboard/project/adgutsyloluwqdyicqrw/sql/new
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Tambah kolom `credits` dan `pdf_upload_limit` ke tabel subscriptions
-- ─────────────────────────────────────────────────────────────────────────────

alter table subscriptions
  add column if not exists credits          integer not null default 100,
  add column if not exists pdf_upload_limit integer not null default 3;

-- Set semua user yang sudah ada (free) ke 100 kredit dan 3 pdf limit
update subscriptions set credits = 100, pdf_upload_limit = 3
  where plan_type = 'free' and credits = 0;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Tabel credit_transactions — log semua perubahan kredit
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists credit_transactions (
  id          uuid         primary key default gen_random_uuid(),
  org_id      uuid         not null references organizations(id) on delete cascade,
  amount      integer      not null,        -- positif = kredit masuk, negatif = kredit keluar
  type        text         not null,        -- 'free_trial', 'subscription', 'topup', 'usage'
  description text,
  reference   text,                         -- order_id atau referensi eksternal
  created_at  timestamptz  not null default now()
);

create index if not exists credit_transactions_org_id_idx
  on credit_transactions (org_id);

alter table credit_transactions enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'credit_transactions'
      and policyname = 'Users can view own credit transactions'
  ) then
    create policy "Users can view own credit transactions"
      on credit_transactions for select to authenticated
      using (
        org_id in (
          select id from organizations where user_id = auth.uid()
        )
      );
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'credit_transactions'
      and policyname = 'Service role can manage credit transactions'
  ) then
    create policy "Service role can manage credit transactions"
      on credit_transactions for all to service_role
      using (true);
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Tabel credit_topups — payment orders khusus top-up kredit
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists credit_topups (
  id               uuid         primary key default gen_random_uuid(),
  order_id         text         unique not null,
  org_id           uuid         not null references organizations(id) on delete cascade,
  credits_purchased integer     not null,   -- jumlah kredit yang dibeli
  amount           integer      not null,   -- jumlah rupiah yang dibayar
  status           text         not null default 'pending',
  created_at       timestamptz  not null default now(),
  updated_at       timestamptz  not null default now()
);

create index if not exists credit_topups_org_id_idx
  on credit_topups (org_id);

alter table credit_topups enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'credit_topups'
      and policyname = 'Users can view own credit topups'
  ) then
    create policy "Users can view own credit topups"
      on credit_topups for select to authenticated
      using (
        org_id in (
          select id from organizations where user_id = auth.uid()
        )
      );
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'credit_topups'
      and policyname = 'Service role can manage credit topups'
  ) then
    create policy "Service role can manage credit topups"
      on credit_topups for all to service_role
      using (true);
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Update trigger handle_new_user
--    User baru mendapat 100 kredit gratis + pdf_upload_limit = 3
-- ─────────────────────────────────────────────────────────────────────────────

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

  -- Insert into subscriptions with 100 free credits
  insert into subscriptions (org_id, plan_type, status, chat_limit, credits, pdf_upload_limit)
  values (new_org_id, 'free', 'active', 100, 100, 3);

  -- Log free credit transaction
  insert into credit_transactions (org_id, amount, type, description)
  values (new_org_id, 100, 'free_trial', '100 kredit gratis untuk akun baru');

  return new;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. VERIFY — cek kolom dan tabel sudah ada
-- ─────────────────────────────────────────────────────────────────────────────

select column_name, data_type, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'subscriptions'
  and column_name in ('credits', 'pdf_upload_limit')
order by column_name;

select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('credit_transactions', 'credit_topups')
order by table_name;
