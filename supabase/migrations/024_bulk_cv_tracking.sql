-- ═══════════════════════════════════════════════════════════════════════════
-- PulseAI — Migration 024: Bulk CV Tracking
--
-- Adds `bulk_session_id` to the existing `applicants` table so that HR can
-- trace which CV files were uploaded together in one bulk session.
-- Also adds `bulk_cv_limit` to subscriptions so premium plans can have a
-- higher per-request bulk upload cap than the default (10 for free, 30 for paid).
--
-- Jalankan SQL ini di:
-- https://supabase.com/dashboard/project/adgutsyloluwqdyicqrw/sql/new
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Add bulk_session_id to applicants
--    Nullable: single CV uploads leave this NULL.
--    Bulk uploads share the same UUID so HR can filter/view by session.
-- ─────────────────────────────────────────────────────────────────────────────
alter table applicants
  add column if not exists bulk_session_id uuid;

-- Partial index — only indexes rows that are part of a bulk session.
-- Keeps the index tiny; single-upload rows (NULL) are excluded entirely.
create index if not exists applicants_bulk_session_id_idx
  on applicants (bulk_session_id)
  where bulk_session_id is not null;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Add bulk_cv_limit to subscriptions
--    free     → 10  CV per bulk request (default)
--    paid     → 30  CV per bulk request (set by admin / payment webhook)
-- ─────────────────────────────────────────────────────────────────────────────
alter table subscriptions
  add column if not exists bulk_cv_limit integer not null default 10;

-- Give all existing paid subscribers the premium bulk limit immediately
update subscriptions
  set bulk_cv_limit = 30
  where plan_type != 'free';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Update handle_new_user trigger
--    New users start with bulk_cv_limit = 10 (free tier).
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  new_org_id uuid;
begin
  insert into organizations (user_id, name)
  values (new.id, 'My Organization')
  returning id into new_org_id;

  insert into subscriptions (org_id, plan_type, status, chat_limit, credits, pdf_upload_limit, bulk_cv_limit)
  values (new_org_id, 'free', 'active', 100, 100, 10, 10);

  insert into credit_transactions (org_id, amount, type, description)
  values (new_org_id, 100, 'free_trial', '100 kredit gratis untuk akun baru (10 upload PDF)');

  return new;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. VERIFY
-- ─────────────────────────────────────────────────────────────────────────────
select column_name, data_type, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'applicants'
  and column_name = 'bulk_session_id';

select column_name, data_type, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'subscriptions'
  and column_name = 'bulk_cv_limit';
