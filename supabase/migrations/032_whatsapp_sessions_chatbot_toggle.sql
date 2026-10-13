-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 032: WhatsApp Sessions - Chatbot AI Toggle (Blast-Only Mode)
-- ───────────────────────────────────────────────────────────────────────────
-- WHAT THIS DOES:
--   Adds `is_chatbot_enabled` column to `whatsapp_sessions` table.
--   - true (default): AI chatbot otomatis merespons pesan masuk dari pelanggan.
--   - false: AI chatbot dinonaktifkan (Blast-Only mode). Pesan masuk tetap
--            dicatat di `chat_logs` untuk riwayat, tetapi AI tidak membalas.
--
-- RUN IN:
--   Supabase Dashboard → SQL Editor → New Query → Run
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE whatsapp_sessions 
ADD COLUMN IF NOT EXISTS is_chatbot_enabled BOOLEAN NOT NULL DEFAULT true;

-- Update existing records to true if any are null
UPDATE whatsapp_sessions 
SET is_chatbot_enabled = true 
WHERE is_chatbot_enabled IS NULL;

-- Optional index for quick filtering if needed
CREATE INDEX IF NOT EXISTS idx_whatsapp_sessions_chatbot_enabled 
ON whatsapp_sessions(is_chatbot_enabled);
