-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: Referral / Affiliate (Kode Kupon) System
-- Run this in: Supabase Dashboard → SQL Editor
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Table: referral_partners
--    Stores affiliate/mitra data. Each partner has a unique coupon code.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.referral_partners (
  id               UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  partner_name     TEXT         NOT NULL,
  referral_code    TEXT         UNIQUE NOT NULL,     -- e.g. 'AKADEMIUMKM' (always UPPERCASE)
  commission_rate  NUMERIC(5,4) NOT NULL DEFAULT 0.20, -- 20% of original package price
  discount_rate    NUMERIC(5,4) NOT NULL DEFAULT 0.10, -- 10% off for the buyer
  whatsapp_number  TEXT,                              -- for admin notifications / payouts
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Ensure code is always stored in UPPERCASE via constraint
ALTER TABLE public.referral_partners
  ADD CONSTRAINT referral_code_uppercase
  CHECK (referral_code = UPPER(referral_code));

-- Rates must be between 0 and 1 (percentages)
ALTER TABLE public.referral_partners
  ADD CONSTRAINT commission_rate_range CHECK (commission_rate BETWEEN 0 AND 1);
ALTER TABLE public.referral_partners
  ADD CONSTRAINT discount_rate_range CHECK (discount_rate BETWEEN 0 AND 1);

-- Index for fast lookup by code (used on every checkout validation)
CREATE INDEX IF NOT EXISTS idx_referral_partners_code ON public.referral_partners (referral_code);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Table: referral_logs
--    One row per successful paid order that used a referral code.
--    commission_amount is computed by the application layer and stored here.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.referral_logs (
  id                UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  partner_id        UUID         NOT NULL REFERENCES public.referral_partners (id) ON DELETE RESTRICT,
  buyer_tenant_id   TEXT         NOT NULL,   -- org_id of the purchasing organization
  package_price     NUMERIC      NOT NULL,   -- original price BEFORE discount
  commission_amount NUMERIC      NOT NULL,   -- package_price × commission_rate at time of purchase
  is_paid           BOOLEAN      NOT NULL DEFAULT FALSE, -- admin marks TRUE after manual payout
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Indexes for common admin queries
CREATE INDEX IF NOT EXISTS idx_referral_logs_partner   ON public.referral_logs (partner_id);
CREATE INDEX IF NOT EXISTS idx_referral_logs_tenant    ON public.referral_logs (buyer_tenant_id);
CREATE INDEX IF NOT EXISTS idx_referral_logs_is_paid   ON public.referral_logs (is_paid);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Alter: payment_orders
--    Add two new columns so orders can remember which referral code was used
--    and what the pre-discount price was.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.payment_orders
  ADD COLUMN IF NOT EXISTS referral_partner_id UUID REFERENCES public.referral_partners (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS original_amount     NUMERIC; -- price before referral discount

COMMENT ON COLUMN public.payment_orders.referral_partner_id IS
  'FK to referral_partners. NULL when no referral code was used.';
COMMENT ON COLUMN public.payment_orders.original_amount IS
  'Package list price before the referral discount was applied.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Row-Level Security (RLS)
--    referral_partners and referral_logs are admin-only tables.
--    The Fastify server accesses Supabase with the service_role key (bypasses RLS),
--    but enabling RLS here prevents accidental access from the anon/public key.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.referral_partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_logs     ENABLE ROW LEVEL SECURITY;

-- Allow the service role full access (used by Fastify backend)
CREATE POLICY "service_role_full_access_partners"
  ON public.referral_partners
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "service_role_full_access_logs"
  ON public.referral_logs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Seed: Example partner (optional — delete before production)
-- ─────────────────────────────────────────────────────────────────────────────
-- INSERT INTO public.referral_partners (partner_name, referral_code, commission_rate, discount_rate, whatsapp_number)
-- VALUES ('Akademi UMKM Digital', 'AKADEMIUMKM', 0.20, 0.10, '6281234567890');
