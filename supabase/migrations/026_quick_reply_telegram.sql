-- ═══════════════════════════════════════════════════════════════════════════
-- PulseAI — Migration 026: Quick Reply Buttons + Telegram Integration
-- ═══════════════════════════════════════════════════════════════════════════

-- Add quick_replies column: array of strings stored as JSONB
ALTER TABLE bot_settings
ADD COLUMN IF NOT EXISTS quick_replies JSONB DEFAULT '[]'::jsonb;

-- Add Telegram notification columns
ALTER TABLE bot_settings
ADD COLUMN IF NOT EXISTS telegram_bot_token TEXT,
ADD COLUMN IF NOT EXISTS telegram_chat_id TEXT;

-- Index for quick lookups on telegram-enabled orgs
CREATE INDEX IF NOT EXISTS idx_bot_settings_telegram
  ON bot_settings (org_id)
  WHERE telegram_bot_token IS NOT NULL;
