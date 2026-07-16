-- ═══════════════════════════════════════════════════════════════════════════
-- PulseAI — Migration 020: Fix Credits Default for Existing Users
--
-- Jalankan SQL ini di:
-- https://supabase.com/dashboard/project/adgutsyloluwqdyicqrw/sql/new
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Pastikan kolom credits ada (idempotent, tidak error jika sudah ada)
-- ─────────────────────────────────────────────────────────────────────────────
alter table subscriptions
  add column if not exists credits          integer not null default 100,
  add column if not exists pdf_upload_limit integer not null default 10;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Set semua user yang belum punya kredit ke 100 kredit default
--    (misalnya user lama yang dibuat sebelum migration 017)
-- ─────────────────────────────────────────────────────────────────────────────
update subscriptions
  set credits = 100
  where credits IS NULL or credits <= 0;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Update trigger handle_new_user
--    User baru mendapat 100 kredit gratis (1 PDF = 10 kredit → 10 upload)
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
  -- 1 PDF = 10 kredit → user bisa upload 10 PDF dengan kredit awal
  insert into subscriptions (org_id, plan_type, status, chat_limit, credits, pdf_upload_limit)
  values (new_org_id, 'free', 'active', 100, 100, 10);

  -- Log free credit transaction
  insert into credit_transactions (org_id, amount, type, description)
  values (new_org_id, 100, 'free_trial', '100 kredit gratis untuk akun baru (10 upload PDF)');

  return new;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Pastikan tabel credit_transactions ada
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists credit_transactions (
  id          uuid         primary key default gen_random_uuid(),
  org_id      uuid         not null references organizations(id) on delete cascade,
  amount      integer      not null,
  type        text         not null,
  description text,
  reference   text,
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
-- 5. VERIFY
-- ─────────────────────────────────────────────────────────────────────────────
select
  s.org_id,
  s.plan_type,
  s.credits,
  s.pdf_upload_limit
from subscriptions s
order by s.credits asc
limit 20;
