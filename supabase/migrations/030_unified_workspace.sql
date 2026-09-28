-- ═══════════════════════════════════════════════════════════════════════════
-- 030_unified_workspace.sql
-- Unified Workspace Architecture — Bot Profiles + Multi-KB Channel Routing
-- ───────────────────────────────────────────────────────────────────────────
-- WHAT THIS DOES:
--   1. Adds `profile_name` column to bot_settings so each row = named "Bot Profile"
--   2. Adds `kb_project_ids` (uuid[]) to bot_settings so one Bot Profile can
--      draw knowledge from multiple Project/KB libraries simultaneously.
--   3. Adds `bot_settings_id` FK to whatsapp_sessions so each WA channel can
--      be assigned to a specific Bot Profile.
--   4. Adds `bot_settings_id` FK to widget_channels for the same reason.
--
-- BACKWARD COMPATIBILITY:
--   All new columns are nullable or have safe defaults, so existing rows and
--   all existing code paths continue to work unchanged.  The new multi-KB RAG
--   path kicks in only when kb_project_ids is non-empty; otherwise the code
--   falls back to the existing project_id single-KB path.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. bot_settings: add profile_name ──────────────────────────────────────
--    Lets users distinguish between multiple Bot Profiles in the UI.
ALTER TABLE bot_settings
  ADD COLUMN IF NOT EXISTS profile_name TEXT NOT NULL DEFAULT 'Bot Utama';

-- ── 2. bot_settings: add kb_project_ids ────────────────────────────────────
--    Array of project UUIDs whose knowledge_nodes this Bot Profile can query.
--    When empty/null, the system falls back to the single project_id on the
--    whatsapp_sessions / widget_channels row (backward compat).
ALTER TABLE bot_settings
  ADD COLUMN IF NOT EXISTS kb_project_ids UUID[] NOT NULL DEFAULT '{}';

-- ── 3. whatsapp_sessions: add bot_settings_id ──────────────────────────────
--    Links a WhatsApp channel to a specific Bot Profile.
--    NULL = legacy behaviour (use project_id-based lookup as before).
ALTER TABLE whatsapp_sessions
  ADD COLUMN IF NOT EXISTS bot_settings_id UUID REFERENCES bot_settings(id) ON DELETE SET NULL;

-- ── 4. widget_channels: add bot_settings_id ────────────────────────────────
--    Same concept for Web Widget channels.
ALTER TABLE widget_channels
  ADD COLUMN IF NOT EXISTS bot_settings_id UUID REFERENCES bot_settings(id) ON DELETE SET NULL;

-- ── 5. Index for fast bot-profile lookups from channel resolution ───────────
CREATE INDEX IF NOT EXISTS idx_whatsapp_sessions_bot_settings_id
  ON whatsapp_sessions (bot_settings_id)
  WHERE bot_settings_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_widget_channels_bot_settings_id
  ON widget_channels (bot_settings_id)
  WHERE bot_settings_id IS NOT NULL;

-- ── 6. Index for org-level Bot Profile listing ─────────────────────────────
CREATE INDEX IF NOT EXISTS idx_bot_settings_org_id
  ON bot_settings (org_id);

-- ── 7. RPC: match_knowledge_nodes_by_projects ──────────────────────────────
--    Multi-KB vector similarity search — filters by an ARRAY of project IDs.
--    Used by the new RAG path when kb_project_ids is non-empty.
CREATE OR REPLACE FUNCTION match_knowledge_nodes_by_projects(
  query_embedding vector(768),
  p_project_ids   uuid[],
  match_count     int DEFAULT 5,
  match_threshold float DEFAULT 0.50
)
RETURNS TABLE (
  id          uuid,
  title       text,
  content     text,
  source_type text,
  similarity  float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    kn.id,
    kn.title,
    kn.content,
    kn.source_type,
    1 - (kn.embedding <=> query_embedding) AS similarity
  FROM knowledge_nodes kn
  WHERE
    kn.project_id = ANY(p_project_ids)
    AND 1 - (kn.embedding <=> query_embedding) >= match_threshold
  ORDER BY kn.embedding <=> query_embedding
  LIMIT match_count;
$$;

-- ── 8. Grant execute to anon + authenticated (same as existing RPC grants) ──
GRANT EXECUTE ON FUNCTION match_knowledge_nodes_by_projects(vector, uuid[], int, float)
  TO anon, authenticated;

COMMIT;
