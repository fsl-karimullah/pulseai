-- ═══════════════════════════════════════════════════════════════════════════
-- PulseAI — Migration 021: Applicant Email Tracking
--
-- Adds a timestamp column so the CV Screening UI can show whether HR has
-- already sent the AI-drafted decision email to a candidate, preventing
-- accidental duplicate sends.
--
-- Jalankan SQL ini di:
-- https://supabase.com/dashboard/project/adgutsyloluwqdyicqrw/sql/new
-- ═══════════════════════════════════════════════════════════════════════════

alter table applicants
  add column if not exists email_sent_at timestamptz;

-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFY
-- ─────────────────────────────────────────────────────────────────────────────
select id, name, email, status, email_sent_at
from applicants
order by created_at desc
limit 20;
