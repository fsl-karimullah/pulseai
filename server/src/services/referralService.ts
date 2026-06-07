/**
 * services/referralService.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Data layer for the Referral / Affiliate (Kupon) system.
 *
 * Responsibilities:
 *  - Look up a partner by referral code (case-insensitive)
 *  - Record a commission log after a successful payment
 *
 * All Supabase interactions are isolated here so the route layer stays thin.
 */

import { supabase } from '../config/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ReferralPartner {
  id: string;
  partner_name: string;
  referral_code: string;
  commission_rate: number; // e.g. 0.20 = 20%
  discount_rate: number;   // e.g. 0.10 = 10%
  whatsapp_number: string | null;
  created_at: string;
}

export interface LogReferralParams {
  partnerId: string;
  buyerTenantId: string;
  packagePrice: number;      // Original price BEFORE discount
  commissionRate: number;    // The partner's commission rate at the time of purchase
}

// ─── Service Functions ────────────────────────────────────────────────────────

/**
 * Looks up a referral partner by code (always normalised to UPPERCASE).
 *
 * @param rawCode  The raw string entered by the user (any casing)
 * @returns        The partner row, or null if not found
 */
export async function findPartnerByCode(rawCode: string): Promise<ReferralPartner | null> {
  const code = rawCode.trim().toUpperCase();

  const { data, error } = await supabase
    .from('referral_partners')
    .select('id, partner_name, referral_code, commission_rate, discount_rate, whatsapp_number, created_at')
    .eq('referral_code', code)
    .maybeSingle();

  if (error) {
    // Propagate so the route can return a 500 with structured context
    throw new Error(`[ReferralService] DB lookup failed: ${error.message}`);
  }

  return data ?? null;
}

/**
 * Inserts a new row into `referral_logs` after a payment is confirmed.
 * commission_amount is calculated here (single source of truth).
 *
 * @param params  LogReferralParams
 */
export async function logReferralCommission(params: LogReferralParams): Promise<void> {
  const { partnerId, buyerTenantId, packagePrice, commissionRate } = params;

  // Round to 2 decimal places to avoid floating-point drift in currency
  const commissionAmount = Math.round(packagePrice * commissionRate * 100) / 100;

  const { error } = await supabase.from('referral_logs').insert({
    partner_id:        partnerId,
    buyer_tenant_id:   buyerTenantId,
    package_price:     packagePrice,
    commission_amount: commissionAmount,
    is_paid:           false,
  });

  if (error) {
    // Non-fatal for the payment flow — caller decides how to handle
    throw new Error(`[ReferralService] Failed to log commission: ${error.message}`);
  }
}
