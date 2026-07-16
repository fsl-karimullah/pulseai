/**
 * emailDomains.ts — Fastify Route Plugin
 * ─────────────────────────────────────────────────────────────────────────────
 * Lets each organization verify their own sending domain (e.g. berlcosmetics.com)
 * via the Resend Domains API, so HR emails can go out as
 * "HRD Berl Cosmetics <hrd@berlcosmetics.com>" instead of PulseAI's shared
 * noreply@pulseai.biz.id. One Resend account, many verified domains — each
 * org's verified domain + chosen from-address is stored in `email_domains`
 * and picked up by cvScreening.ts's email-sending routes.
 *
 * Endpoints:
 *   GET    /api/email-domains         — current org's sender domain + live status
 *   POST   /api/email-domains         — register a new domain with Resend
 *   POST   /api/email-domains/verify  — re-check DNS/verification status
 *   DELETE /api/email-domains         — remove the domain, start over
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { supabase } from '../config/supabase';
import { authenticate } from '../middleware/auth';
import { resend } from '../config/email';

const DOMAIN_REGEX = /^(?!-)[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/;
const LOCAL_PART_REGEX = /^[A-Za-z0-9._%+-]+$/;

async function getOrgId(userId: string): Promise<string | null> {
  const { data: org } = await supabase
    .from('organizations')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();
  return org?.id ?? null;
}

export default async function emailDomainsRoutes(fastify: FastifyInstance) {
  // ─────────────────────────────────────────────────────────────────────────
  // GET /api/email-domains
  // ─────────────────────────────────────────────────────────────────────────
  fastify.get('/email-domains', { preHandler: [authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = (request as any).user?.id;
      const orgId = await getOrgId(userId);
      if (!orgId) return reply.status(404).send({ success: false, message: 'Organisasi tidak ditemukan.' });

      const { data, error } = await supabase
        .from('email_domains')
        .select('*')
        .eq('org_id', orgId)
        .maybeSingle();

      if (error) throw error;

      return reply.send({ success: true, data: data ?? null });
    } catch (err: any) {
      fastify.log.error(err, '[EmailDomains] GET failed');
      return reply.status(500).send({ success: false, message: err.message });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // POST /api/email-domains
  // Registers a domain with Resend and returns the DNS records to add.
  // ─────────────────────────────────────────────────────────────────────────
  fastify.post<{ Body: { domain: string; localPart: string; fromName?: string } }>(
    '/email-domains',
    { preHandler: [authenticate] },
    async (request, reply) => {
      try {
        const userId = (request as any).user?.id;
        const orgId = await getOrgId(userId);
        if (!orgId) return reply.status(404).send({ success: false, message: 'Organisasi tidak ditemukan.' });

        const domain = request.body.domain?.trim().toLowerCase();
        const localPart = request.body.localPart?.trim().toLowerCase();
        const fromName = request.body.fromName?.trim() || undefined;

        if (!domain || !DOMAIN_REGEX.test(domain)) {
          return reply.status(400).send({ success: false, message: 'Domain tidak valid. Contoh: berlcosmetics.com' });
        }
        if (!localPart || !LOCAL_PART_REGEX.test(localPart)) {
          return reply.status(400).send({ success: false, message: 'Bagian sebelum "@" tidak valid. Contoh: hrd' });
        }

        const { data: existing } = await supabase
          .from('email_domains')
          .select('id, resend_domain_id, status')
          .eq('org_id', orgId)
          .maybeSingle();

        if (existing?.status === 'verified') {
          return reply.status(409).send({
            success: false,
            message: 'Organisasi ini sudah memiliki domain terverifikasi. Hapus domain saat ini terlebih dahulu untuk menggantinya.',
          });
        }

        // Replacing an abandoned pending/failed attempt — best-effort cleanup.
        if (existing) {
          try {
            await resend.domains.remove(existing.resend_domain_id);
          } catch (cleanupErr) {
            fastify.log.warn(cleanupErr, '[EmailDomains] Failed to remove stale Resend domain (continuing)');
          }
          await supabase.from('email_domains').delete().eq('id', existing.id);
        }

        const { data: created, error: createError } = await resend.domains.create({ name: domain });

        if (createError || !created) {
          return reply.status(400).send({
            success: false,
            message: `Resend menolak domain ini: ${createError?.message ?? 'Unknown error'}`,
          });
        }

        const fromEmail = `${localPart}@${domain}`;

        const { data: saved, error: saveError } = await supabase
          .from('email_domains')
          .insert({
            org_id: orgId,
            domain,
            resend_domain_id: created.id,
            from_email: fromEmail,
            from_name: fromName,
            status: created.status,
            records: created.records,
          })
          .select('*')
          .single();

        if (saveError) throw saveError;

        return reply.status(201).send({ success: true, data: saved });
      } catch (err: any) {
        fastify.log.error(err, '[EmailDomains] POST failed');
        return reply.status(500).send({ success: false, message: err.message });
      }
    }
  );

  // ─────────────────────────────────────────────────────────────────────────
  // POST /api/email-domains/verify
  // Re-checks the domain against Resend after HR has added the DNS records.
  // ─────────────────────────────────────────────────────────────────────────
  fastify.post('/email-domains/verify', { preHandler: [authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = (request as any).user?.id;
      const orgId = await getOrgId(userId);
      if (!orgId) return reply.status(404).send({ success: false, message: 'Organisasi tidak ditemukan.' });

      const { data: existing } = await supabase
        .from('email_domains')
        .select('id, resend_domain_id')
        .eq('org_id', orgId)
        .maybeSingle();

      if (!existing) {
        return reply.status(404).send({ success: false, message: 'Belum ada domain yang didaftarkan.' });
      }

      // Ask Resend to re-check DNS, then fetch the fresh status + records.
      await resend.domains.verify(existing.resend_domain_id);
      const { data: refreshed, error: getError } = await resend.domains.get(existing.resend_domain_id);

      if (getError || !refreshed) {
        return reply.status(400).send({ success: false, message: `Gagal memeriksa status domain: ${getError?.message ?? 'Unknown error'}` });
      }

      const { data: updated, error: updateError } = await supabase
        .from('email_domains')
        .update({
          status: refreshed.status,
          records: refreshed.records,
          verified_at: refreshed.status === 'verified' ? new Date().toISOString() : null,
        })
        .eq('id', existing.id)
        .select('*')
        .single();

      if (updateError) throw updateError;

      return reply.send({ success: true, data: updated });
    } catch (err: any) {
      fastify.log.error(err, '[EmailDomains] verify failed');
      return reply.status(500).send({ success: false, message: err.message });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // DELETE /api/email-domains
  // ─────────────────────────────────────────────────────────────────────────
  fastify.delete('/email-domains', { preHandler: [authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = (request as any).user?.id;
      const orgId = await getOrgId(userId);
      if (!orgId) return reply.status(404).send({ success: false, message: 'Organisasi tidak ditemukan.' });

      const { data: existing } = await supabase
        .from('email_domains')
        .select('id, resend_domain_id')
        .eq('org_id', orgId)
        .maybeSingle();

      if (!existing) {
        return reply.send({ success: true, message: 'Tidak ada domain untuk dihapus.' });
      }

      try {
        await resend.domains.remove(existing.resend_domain_id);
      } catch (cleanupErr) {
        fastify.log.warn(cleanupErr, '[EmailDomains] Failed to remove Resend domain (continuing with local delete)');
      }

      const { error } = await supabase.from('email_domains').delete().eq('id', existing.id);
      if (error) throw error;

      return reply.send({ success: true, message: 'Domain dihapus. HR emails akan kembali menggunakan alamat default.' });
    } catch (err: any) {
      fastify.log.error(err, '[EmailDomains] DELETE failed');
      return reply.status(500).send({ success: false, message: err.message });
    }
  });
}
