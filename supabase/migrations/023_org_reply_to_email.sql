-- ═══════════════════════════════════════════════════════════════════════════
-- PulseAI — Migration 023: Organization Reply-To Email
--
-- HR emails (CV screening decisions, etc.) are sent from the shared
-- noreply@pulseai.biz.id address (per-org custom domains hit Resend's
-- free-plan 1-domain cap — see email_domains from migration 022, kept as a
-- dormant future upgrade path). This column lets each org register their
-- REAL contact email (e.g. hrd@berlcosmetics.com) as the Reply-To header —
-- no domain verification needed for Reply-To, so candidates who hit "reply"
-- reach the actual company, not a dead noreply inbox.
--
-- Jalankan SQL ini di:
-- https://supabase.com/dashboard/project/adgutsyloluwqdyicqrw/sql/new
-- ═══════════════════════════════════════════════════════════════════════════

alter table organizations
  add column if not exists reply_to_email text;

-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFY
-- ─────────────────────────────────────────────────────────────────────────────
select id, name, reply_to_email
from organizations
order by created_at desc
limit 20;
