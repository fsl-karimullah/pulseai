-- ═══════════════════════════════════════════════════════════════════════════
-- PulseAI — Migration 025: WhatsApp Notification Tracking
--
-- Adds tracking columns to the `applicants` table so HR can see when and
-- to which number a WhatsApp notification was sent for each applicant.
--
-- Jalankan SQL ini di:
-- https://supabase.com/dashboard/project/adgutsyloluwqdyicqrw/sql/new
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Add whatsapp_sent_at to applicants
--    Nullable: populated when HR successfully sends a WA notification.
--    NULL means no WA has been sent yet (safe to send).
-- ─────────────────────────────────────────────────────────────────────────────
alter table applicants
  add column if not exists whatsapp_sent_at timestamptz default null;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Add whatsapp_number_used to applicants
--    Stores the actual phone number used when sending the WA notification.
--    This is important because HR may have manually corrected the AI-extracted
--    number before sending — so we preserve the number that was actually used.
-- ─────────────────────────────────────────────────────────────────────────────
alter table applicants
  add column if not exists whatsapp_number_used text default null;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. VERIFY
-- ─────────────────────────────────────────────────────────────────────────────
select column_name, data_type, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'applicants'
  and column_name in ('whatsapp_sent_at', 'whatsapp_number_used');
