-- ═══════════════════════════════════════════════════════════════════════════
-- PulseAI — Migration 027: Widget V2 Features (Proactive, Follow-up, Feedback)
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Add Proactive and Follow-up configurations to bot_settings
ALTER TABLE bot_settings
ADD COLUMN IF NOT EXISTS proactive_delay INT DEFAULT 0, -- seconds (0 means disabled)
ADD COLUMN IF NOT EXISTS followup_delay INT DEFAULT 0; -- minutes (0 means disabled)

-- 2. Create table for Chat Feedbacks (RLHF)
CREATE TABLE IF NOT EXISTS chat_feedbacks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL,
  message_content TEXT NOT NULL,
  is_positive BOOLEAN NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for feedbacks
CREATE INDEX IF NOT EXISTS idx_chat_feedbacks_org_id ON chat_feedbacks (org_id);

-- RLS for chat_feedbacks
ALTER TABLE chat_feedbacks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage chat_feedbacks"
  ON chat_feedbacks FOR ALL TO service_role USING (true);

CREATE POLICY "Users can view own org chat_feedbacks"
  ON chat_feedbacks FOR SELECT TO authenticated
  USING (
    org_id IN (
      SELECT id FROM organizations WHERE user_id = auth.uid()
    )
  );
