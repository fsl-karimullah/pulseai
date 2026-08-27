-- Migration 029: Meta Embedded Signup

-- 1. Add columns to whatsapp_sessions
ALTER TABLE whatsapp_sessions 
ADD COLUMN IF NOT EXISTS platform text NOT NULL DEFAULT 'baileys' CHECK (platform IN ('baileys', 'meta')),
ADD COLUMN IF NOT EXISTS meta_waba_id text,
ADD COLUMN IF NOT EXISTS meta_phone_number_id text,
ADD COLUMN IF NOT EXISTS meta_access_token text;

-- 2. Update view whatsapp_sessions_summary
CREATE OR REPLACE VIEW whatsapp_sessions_summary WITH (security_invoker = on) AS
  SELECT
    ws.phone_number,
    ws.phone_label,
    ws.org_id,
    o.name as org_name,
    ws.status,
    ws.gateway_user_id,
    ws.connected_at,
    ws.disconnected_at,
    ws.updated_at,
    ws.platform,
    ws.meta_waba_id,
    ws.meta_phone_number_id
  FROM whatsapp_sessions ws
  JOIN organizations o ON o.id = ws.org_id;
