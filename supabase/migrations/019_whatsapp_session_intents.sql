-- ═══════════════════════════════════════════════════════════════════════════
-- PulseAI — Migration 019: whatsapp_session_intents
--
-- Purpose:
--   Bridges the gap between "dashboard: klien memilih Project untuk nomor WA
--   baru" and "gateway: nomor WA baru diketahui setelah QR discan".
--
--   The dashboard talks to whatsapp-gateway DIRECTLY (not through this
--   server) to start pairing a new number, so by the time our webhook
--   (/whatsapp/incoming or /whatsapp/session-status) learns the actual
--   phone_number and can create the whatsapp_sessions row, it has lost
--   track of which project the client picked in the UI.
--
--   Flow:
--     1. Dashboard calls POST /api/whatsapp/session-intent BEFORE hitting
--        the gateway, recording {org_id, phone_label, project_id}.
--     2. Dashboard calls gateway /api/session/start as it already does.
--     3. When the gateway later reports the real phone_number (via
--        /whatsapp/incoming or /whatsapp/session-status), the server looks
--        up this table by (org_id, phone_label) to assign the correct
--        project_id to the new whatsapp_sessions row.
--     4. If no intent row exists (old flow, or number reconnecting),
--        falls back to the org's default project — nothing breaks for
--        numbers that already existed before this feature.
--
--   Run in Supabase Dashboard → SQL Editor → New Query
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists whatsapp_session_intents (
  id          uuid        primary key default gen_random_uuid(),
  org_id      uuid        not null references organizations(id) on delete cascade,
  phone_label text        not null,
  project_id  uuid        not null references projects(id) on delete cascade,
  created_at  timestamptz not null default now()
);

-- One pending intent per (org, phone_label) — a new "connect" click replaces
-- the previous intent for that same label rather than accumulating rows.
create unique index if not exists whatsapp_session_intents_org_label_uidx
  on whatsapp_session_intents (org_id, phone_label);

alter table whatsapp_session_intents enable row level security;

create policy "Users can view own org whatsapp_session_intents"
  on whatsapp_session_intents for select to authenticated
  using (org_id in (select id from organizations where user_id = auth.uid()));

create policy "Users can insert own org whatsapp_session_intents"
  on whatsapp_session_intents for insert to authenticated
  with check (org_id in (select id from organizations where user_id = auth.uid()));

create policy "Users can update own org whatsapp_session_intents"
  on whatsapp_session_intents for update to authenticated
  using (org_id in (select id from organizations where user_id = auth.uid()));

create policy "Service role can manage whatsapp_session_intents"
  on whatsapp_session_intents for all to service_role using (true);

-- ═══════════════════════════════════════════════════════════════════════════
-- Done. Purely additive — no existing table/column touched.
-- ═══════════════════════════════════════════════════════════════════════════
