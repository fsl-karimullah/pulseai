-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 031: Finance Checkout Pending-Approval System
-- ───────────────────────────────────────────────────────────────────────────
-- WHAT THIS DOES:
--   1. Adds `status` column: 'approved' (default/manual) | 'pending' (from bot/checkout)
--   2. Adds `source` column: 'manual' | 'bot' | 'checkout'
--   3. Adds `customer_name` for checkout context (who ordered)
--   4. Adds `customer_contact` for checkout context (phone/wa)
--   5. Adds `approved_at` timestamp when admin approves
--
-- BACKWARD COMPATIBILITY:
--   Existing manual transactions default to status='approved', source='manual'
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. Status kolom: approved = aktif di keuangan, pending = menunggu verifikasi
ALTER TABLE finance_transactions
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'approved'
  CHECK (status IN ('approved', 'pending', 'rejected'));

-- ── 2. Source: darimana transaksi ini berasal
ALTER TABLE finance_transactions
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual'
  CHECK (source IN ('manual', 'bot', 'checkout'));

-- ── 3. Informasi pembeli (dari bot checkout)
ALTER TABLE finance_transactions
  ADD COLUMN IF NOT EXISTS customer_name TEXT;

ALTER TABLE finance_transactions
  ADD COLUMN IF NOT EXISTS customer_contact TEXT;

-- ── 4. Timestamp persetujuan admin
ALTER TABLE finance_transactions
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;

-- ── 5. Update summary view untuk hanya hitung transaksi APPROVED
CREATE OR REPLACE VIEW finance_monthly_summary AS
SELECT
  org_id,
  DATE_TRUNC('month', date) AS month,
  SUM(CASE WHEN type = 'income'  AND status = 'approved' THEN amount ELSE 0 END) AS total_income,
  SUM(CASE WHEN type = 'expense' AND status = 'approved' THEN amount ELSE 0 END) AS total_expense,
  SUM(CASE WHEN type = 'income'  AND status = 'approved' THEN amount ELSE 0 END)
    - SUM(CASE WHEN type = 'expense' AND status = 'approved' THEN amount ELSE 0 END) AS net_profit,
  COUNT(*) FILTER (WHERE status = 'approved') AS transaction_count,
  COUNT(*) FILTER (WHERE status = 'pending') AS pending_count
FROM finance_transactions
GROUP BY org_id, DATE_TRUNC('month', date);

-- ── 6. Index for fast pending lookups
CREATE INDEX IF NOT EXISTS finance_transactions_status_idx
  ON finance_transactions (org_id, status)
  WHERE status = 'pending';

-- ── 7. Index for source lookups
CREATE INDEX IF NOT EXISTS finance_transactions_source_idx
  ON finance_transactions (org_id, source);

COMMIT;
