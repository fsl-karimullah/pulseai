/**
 * routes/referral.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Referral / Affiliate (Kode Kupon) routes for PulseAI.
 *
 * Public endpoint (no auth required — called from checkout UI before login):
 *   GET /api/referral/validate?code=AKADEMIUMKM
 *
 * Authenticated admin-only endpoints:
 *   GET  /api/referral/partners          — list all partners + totals
 *   POST /api/referral/partners          — create a new partner
 *   GET  /api/referral/logs              — list all commission logs
 *   PUT  /api/referral/logs/:id/mark-paid — mark a commission as paid
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { authenticate } from '../middleware/auth';
import { supabase } from '../config/supabase';
import { findPartnerByCode } from '../services/referralService';

export default async function referralRoutes(fastify: FastifyInstance) {

  // ──────────────────────────────────────────────────────────────────────────
  // GET /api/referral/validate?code=KODE
  //
  // Public — called by the frontend checkout form to verify a coupon code.
  // Returns discount_rate so the UI can show the discounted price to the user.
  // Does NOT expose commission_rate (internal partner data).
  // ──────────────────────────────────────────────────────────────────────────
  fastify.get('/referral/validate', async (request: FastifyRequest, reply: FastifyReply) => {
    const { code } = request.query as { code?: string };

    if (!code || !code.trim()) {
      return reply.status(400).send({
        valid: false,
        message: 'Parameter "code" wajib diisi.',
      });
    }

    try {
      const partner = await findPartnerByCode(code);

      if (!partner) {
        return reply.status(404).send({
          valid: false,
          message: 'Kode referral tidak valid atau sudah tidak aktif.',
        });
      }

      return reply.send({
        valid: true,
        partner_id:    partner.id,
        partner_name:  partner.partner_name,
        discount_rate: partner.discount_rate,
        // Do NOT expose commission_rate — that is internal partner data
      });
    } catch (err: any) {
      fastify.log.error({ err: err.message, code }, '[Referral] Validate failed');
      return reply.status(500).send({ valid: false, message: 'Terjadi kesalahan server.' });
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // GET /api/referral/partners  (Admin only)
  //
  // Returns all partners with aggregated commission totals.
  // ──────────────────────────────────────────────────────────────────────────
  fastify.get(
    '/referral/partners',
    { preHandler: [authenticate] },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { data, error } = await supabase
          .from('referral_partners')
          .select(`
            id,
            partner_name,
            referral_code,
            commission_rate,
            discount_rate,
            whatsapp_number,
            created_at,
            referral_logs (
              commission_amount,
              is_paid
            )
          `)
          .order('created_at', { ascending: false });

        if (error) throw error;

        // Aggregate totals per partner
        const enriched = (data ?? []).map((p: any) => {
          const logs: any[] = p.referral_logs ?? [];
          const totalCommission = logs.reduce((sum: number, l: any) => sum + Number(l.commission_amount), 0);
          const pendingCommission = logs
            .filter((l: any) => !l.is_paid)
            .reduce((sum: number, l: any) => sum + Number(l.commission_amount), 0);

          return {
            id:                 p.id,
            partner_name:       p.partner_name,
            referral_code:      p.referral_code,
            commission_rate:    p.commission_rate,
            discount_rate:      p.discount_rate,
            whatsapp_number:    p.whatsapp_number,
            created_at:         p.created_at,
            total_sales:        logs.length,
            total_commission:   Math.round(totalCommission * 100) / 100,
            pending_commission: Math.round(pendingCommission * 100) / 100,
          };
        });

        return reply.send({ success: true, data: enriched });
      } catch (err: any) {
        fastify.log.error({ err: err.message }, '[Referral] List partners failed');
        return reply.status(500).send({ success: false, message: err.message });
      }
    }
  );

  // ──────────────────────────────────────────────────────────────────────────
  // POST /api/referral/partners  (Admin only)
  //
  // Creates a new referral partner / affiliate.
  // Body: { partner_name, referral_code, commission_rate?, discount_rate?, whatsapp_number? }
  // ──────────────────────────────────────────────────────────────────────────
  fastify.post(
    '/referral/partners',
    { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const {
        partner_name,
        referral_code,
        commission_rate = 0.20,
        discount_rate = 0.10,
        whatsapp_number,
      } = request.body as {
        partner_name: string;
        referral_code: string;
        commission_rate?: number;
        discount_rate?: number;
        whatsapp_number?: string;
      };

      if (!partner_name || !referral_code) {
        return reply.status(400).send({
          success: false,
          message: 'Field "partner_name" dan "referral_code" wajib diisi.',
        });
      }

      // Normalise code to uppercase before storing
      const code = referral_code.trim().toUpperCase();

      // Validate rates are sensible (0–1 range)
      if (commission_rate < 0 || commission_rate > 1 || discount_rate < 0 || discount_rate > 1) {
        return reply.status(400).send({
          success: false,
          message: 'commission_rate dan discount_rate harus berada di antara 0 dan 1.',
        });
      }

      try {
        const { data, error } = await supabase
          .from('referral_partners')
          .insert({
            partner_name,
            referral_code: code,
            commission_rate,
            discount_rate,
            whatsapp_number: whatsapp_number ?? null,
          })
          .select()
          .single();

        if (error) {
          // Unique constraint violation — code already exists
          if (error.code === '23505') {
            return reply.status(409).send({
              success: false,
              message: `Kode referral "${code}" sudah digunakan oleh partner lain.`,
            });
          }
          throw error;
        }

        fastify.log.info({ code, partner_name }, '[Referral] New partner created');
        return reply.status(201).send({ success: true, data });
      } catch (err: any) {
        fastify.log.error({ err: err.message }, '[Referral] Create partner failed');
        return reply.status(500).send({ success: false, message: err.message });
      }
    }
  );

  // ──────────────────────────────────────────────────────────────────────────
  // GET /api/referral/logs  (Admin only)
  //
  // Returns all commission logs, joined with partner info, ordered newest first.
  // ──────────────────────────────────────────────────────────────────────────
  fastify.get(
    '/referral/logs',
    { preHandler: [authenticate] },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { data, error } = await supabase
          .from('referral_logs')
          .select(`
            id,
            buyer_tenant_id,
            package_price,
            commission_amount,
            is_paid,
            created_at,
            referral_partners (
              partner_name,
              referral_code,
              whatsapp_number
            )
          `)
          .order('created_at', { ascending: false });

        if (error) throw error;

        return reply.send({ success: true, data: data ?? [] });
      } catch (err: any) {
        fastify.log.error({ err: err.message }, '[Referral] List logs failed');
        return reply.status(500).send({ success: false, message: err.message });
      }
    }
  );

  // ──────────────────────────────────────────────────────────────────────────
  // PUT /api/referral/logs/:id/mark-paid  (Admin only)
  //
  // Marks a specific commission log as paid (manual admin action).
  // ──────────────────────────────────────────────────────────────────────────
  fastify.put(
    '/referral/logs/:id/mark-paid',
    { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };

      try {
        const { data, error } = await supabase
          .from('referral_logs')
          .update({ is_paid: true })
          .eq('id', id)
          .select()
          .single();

        if (error) throw error;
        if (!data) {
          return reply.status(404).send({ success: false, message: 'Log komisi tidak ditemukan.' });
        }

        fastify.log.info({ logId: id }, '[Referral] Commission marked as paid');
        return reply.send({ success: true, data });
      } catch (err: any) {
        fastify.log.error({ err: err.message, logId: id }, '[Referral] Mark-paid failed');
        return reply.status(500).send({ success: false, message: err.message });
      }
    }
  );
}
