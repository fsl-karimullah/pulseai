-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 028: Pulse Finance — Pencatatan Keuangan & Estimasi Pajak
-- ═══════════════════════════════════════════════════════════════════════════

-- Tabel utama transaksi keuangan
CREATE TABLE IF NOT EXISTS finance_transactions (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  type          TEXT        NOT NULL CHECK (type IN ('income', 'expense')),
  category      TEXT        NOT NULL,
  description   TEXT        NOT NULL,
  amount        NUMERIC(15,2) NOT NULL CHECK (amount > 0),
  date          DATE        NOT NULL DEFAULT CURRENT_DATE,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Kategori default pemasukan
-- 'Penjualan Produk', 'Jasa / Layanan', 'Investasi', 'Lainnya'

-- Kategori default pengeluaran
-- 'Gaji Karyawan', 'Sewa & Utilitas', 'Pemasaran', 'Pembelian Barang', 'Operasional', 'Pajak', 'Lainnya'

-- Index untuk query performa
CREATE INDEX IF NOT EXISTS finance_transactions_org_id_idx  ON finance_transactions(org_id);
CREATE INDEX IF NOT EXISTS finance_transactions_date_idx    ON finance_transactions(org_id, date DESC);
CREATE INDEX IF NOT EXISTS finance_transactions_type_idx    ON finance_transactions(org_id, type);

-- RLS: setiap org hanya bisa lihat data sendiri
ALTER TABLE finance_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "finance_transactions_org_isolation"
  ON finance_transactions
  FOR ALL
  USING (
    org_id IN (
      SELECT id FROM organizations WHERE user_id = auth.uid()
    )
  );

-- Trigger untuk update updated_at otomatis
CREATE OR REPLACE FUNCTION update_finance_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER finance_transactions_updated_at
  BEFORE UPDATE ON finance_transactions
  FOR EACH ROW
  EXECUTE FUNCTION update_finance_updated_at();

-- View ringkasan bulanan per org (untuk dashboard)
CREATE OR REPLACE VIEW finance_monthly_summary AS
SELECT
  org_id,
  DATE_TRUNC('month', date) AS month,
  SUM(CASE WHEN type = 'income'  THEN amount ELSE 0 END) AS total_income,
  SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) AS total_expense,
  SUM(CASE WHEN type = 'income'  THEN amount ELSE 0 END)
    - SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) AS net_profit,
  COUNT(*) AS transaction_count
FROM finance_transactions
GROUP BY org_id, DATE_TRUNC('month', date);
