-- ═══════════════════════════════════════════════════════════════════════════
-- PulseAI — Migration 022: Per-Org Custom Sender Email Domains
--
-- Lets each organization send HR emails (CV screening decisions, etc.) from
-- their own verified domain (e.g. hrd@berlcosmetics.com) instead of PulseAI's
-- shared noreply@pulseai.biz.id. Domain + DKIM/SPF verification is handled
-- via the Resend Domains API (one Resend account, many verified domains).
--
-- Jalankan SQL ini di:
-- https://supabase.com/dashboard/project/adgutsyloluwqdyicqrw/sql/new
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists email_domains (
  id                uuid        primary key default gen_random_uuid(),
  org_id            uuid        not null references organizations(id) on delete cascade,
  domain            text        not null,
  resend_domain_id  text        not null,
  from_email        text        not null,
  from_name         text,
  status            text        not null default 'pending', -- pending | verified | failed | temporary_failure | not_started
  records           jsonb,       -- DNS records Resend asked for (SPF/DKIM), shown to HR to add
  created_at        timestamptz not null default now(),
  verified_at       timestamptz,
  unique (org_id)
);

create index if not exists email_domains_org_id_idx on email_domains (org_id);

alter table email_domains enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'email_domains'
      and policyname = 'Users can view own email domain'
  ) then
    create policy "Users can view own email domain"
      on email_domains for select to authenticated
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
    where tablename = 'email_domains'
      and policyname = 'Service role can manage email domains'
  ) then
    create policy "Service role can manage email domains"
      on email_domains for all to service_role
      using (true);
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFY
-- ─────────────────────────────────────────────────────────────────────────────
select id, org_id, domain, from_email, status, created_at, verified_at
from email_domains
order by created_at desc
limit 20;
