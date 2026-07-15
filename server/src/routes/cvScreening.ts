/**
 * cvScreening.ts — Fastify Route Plugin
 * ─────────────────────────────────────────────────────────────────────────────
 * Registers all /api/v1/jobs/* endpoints for the AI CV Screening feature.
 *
 * Endpoints:
 *   POST /api/v1/jobs/:jobId/apply        — Upload CV, run AI screening, save result
 *   GET  /api/v1/jobs                     — List all job vacancies for the org
 *   POST /api/v1/jobs                     — Create a new job vacancy
 *   GET  /api/v1/jobs/:jobId/applicants   — List all applicants for a vacancy
 *   PATCH /api/v1/jobs/:jobId/applicants/:applicantId/status — Override HR decision
 *
 * Architecture follows the existing codebase pattern:
 *   - Fastify route plugin (async function exported as default)
 *   - `authenticate` middleware for protected endpoints
 *   - `supabase` client from config/supabase.ts
 *   - Service function `analyzeCVWithGemini` from services/cvScreeningService.ts
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { supabase } from '../config/supabase';
import { authenticate } from '../middleware/auth';
import {
  analyzeCVWithGemini,
  buildStatusEmailTemplate,
  fillCompanyNamePlaceholder,
  getStatusEmailBanner,
  type ApplicantStatus,
} from '../services/cvScreeningService';
import { sendEmail, sendBatchEmails, type SendEmailParams } from '../services/emailService';
import { buildOrgSenderDisplay } from '../config/email';

// ─── Max file size for CV uploads (separate from the global limit in app.ts) ──
const MAX_CV_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

// Resend's Batch Email API accepts at most 100 emails per call.
const EMAIL_BATCH_SIZE = 100;

/**
 * A short, transparent footer appended to every decision email — names the
 * company the candidate actually applied to (even though the technical
 * sender is a shared platform address) and gives a real way to reach them.
 * This is standard practice for multi-tenant ATS platforms (Greenhouse,
 * Lever, etc.) and reads as more trustworthy than an unexplained noreply
 * address with no contact path.
 */
function buildTrustFooter(replyToEmail?: string | null): string {
  const contactLine = replyToEmail
    ? `Ada pertanyaan? Balas email ini atau hubungi kami langsung di ${replyToEmail}.`
    : 'Ada pertanyaan? Balas email ini dan tim kami akan menghubungi Anda kembali.';

  return `\n\n---\nEmail ini dikirim sehubungan dengan lamaran Anda di [Nama Perusahaan], melalui sistem rekrutmen PulseAI.\n${contactLine}`;
}

/**
 * Builds the final subject/body/banner for a decision email — shared by the
 * single-send and bulk-send endpoints so both always compute content the
 * same way (AI draft when the status hasn't been overridden, a status-
 * accurate fallback template otherwise, with the company name placeholder
 * filled in, a trust footer, and a clear decision banner attached).
 */
function buildApplicantEmailContent(
  applicant: { name: string; status: ApplicantStatus; analysis_result?: any },
  jobTitle: string,
  orgName?: string | null,
  replyToEmail?: string | null
): Pick<SendEmailParams, 'subject' | 'body' | 'statusLabel' | 'statusColor'> {
  const statusMatchesAiDraft = applicant.analysis_result?.rekomendasi_status === applicant.status;

  let subject = statusMatchesAiDraft ? applicant.analysis_result?.draft_email_subject : undefined;
  let body = statusMatchesAiDraft ? applicant.analysis_result?.draft_email_body : undefined;

  if (!subject || !body) {
    const fallback = buildStatusEmailTemplate(applicant.status, applicant.name, jobTitle);
    subject = subject || fallback.subject;
    body = body || fallback.body;
  }

  body = body + buildTrustFooter(replyToEmail);

  subject = fillCompanyNamePlaceholder(subject, orgName);
  body = fillCompanyNamePlaceholder(body, orgName);

  const { statusLabel, statusColor } = getStatusEmailBanner(applicant.status);

  return { subject, body, statusLabel, statusColor };
}

/**
 * Resolves the "from" address for an org's HR emails: their own verified
 * custom domain if they've set one up (dormant today — Resend's free plan
 * caps domains at 1, already used by pulseai.biz.id — but kept as a future
 * upgrade path), otherwise a transparent "CompanyName (via PulseAI)" sender
 * using the shared platform address.
 */
async function resolveSenderFrom(orgId: string, orgName?: string | null): Promise<string> {
  const { data: domain } = await supabase
    .from('email_domains')
    .select('from_email, from_name, status')
    .eq('org_id', orgId)
    .eq('status', 'verified')
    .maybeSingle();

  if (domain) {
    const displayName = domain.from_name || orgName || 'HR';
    return `${displayName} <${domain.from_email}>`;
  }

  return buildOrgSenderDisplay(orgName);
}

// ─── Route Plugin ─────────────────────────────────────────────────────────────

export default async function cvScreeningRoutes(fastify: FastifyInstance) {

  // ─────────────────────────────────────────────────────────────────────────
  // POST /api/v1/jobs/:jobId/apply
  //
  // Public endpoint (no auth) — called by the applicant-facing form.
  // Accepts multipart/form-data with a single PDF field named "cv".
  //
  // Flow:
  //   1. Validate job exists and is active
  //   2. Read & validate the uploaded PDF buffer
  //   3. Build job description context string
  //   4. Send to Gemini for analysis (structured output)
  //   5. Persist result to `applicants` table
  //   6. Return the full analysis to the caller
  // ─────────────────────────────────────────────────────────────────────────
  fastify.post<{ Params: { jobId: string } }>(
    '/v1/jobs/:jobId/apply',
    async (request: FastifyRequest<{ Params: { jobId: string } }>, reply: FastifyReply) => {
      const { jobId } = request.params;

      try {
        // ── 1. Fetch the job vacancy ────────────────────────────────────────
        const { data: job, error: jobError } = await supabase
          .from('job_vacancies')
          .select('id, org_id, title, description, requirements, is_active')
          .eq('id', jobId)
          .maybeSingle();

        if (jobError || !job) {
          return reply.status(404).send({
            success: false,
            message: 'Lowongan kerja tidak ditemukan.',
          });
        }

        if (!job.is_active) {
          return reply.status(410).send({
            success: false,
            message: 'Lowongan kerja ini sudah ditutup.',
          });
        }

        // ── Quota/Credit Check untuk CV Scan ────────────────────────────────
        const { data: sub } = await supabase
          .from('subscriptions')
          .select('plan_type, credits, pdf_upload_limit')
          .eq('org_id', job.org_id)
          .maybeSingle();

        const isSubscriber = sub && sub.plan_type !== 'free';
        const pdfLimit = sub?.pdf_upload_limit ?? 0;
        let isExtraCreditScan = false; // true = di luar kuota bulanan, pakai kredit

        if (isSubscriber) {
          // Hitung scan bulan ini
          const startOfMonth = new Date();
          startOfMonth.setDate(1);
          startOfMonth.setHours(0, 0, 0, 0);

          const { count: monthlyCount } = await supabase
            .from('applicants')
            .select('*', { count: 'exact', head: true })
            .eq('org_id', job.org_id)
            .gte('created_at', startOfMonth.toISOString());

          if ((monthlyCount ?? 0) >= pdfLimit) {
            // Kuota bulanan habis — cek kredit untuk extra scan
            const currentCredits = sub?.credits ?? 0;
            if (currentCredits < 10) {
              return reply.status(402).send({
                success: false,
                message: `Kuota CV Scan bulan ini sudah habis (${pdfLimit} scan/bulan). Tambahkan kredit untuk scan ekstra. Saldo kredit Anda: ${currentCredits}.`,
                code: 'MONTHLY_QUOTA_EXCEEDED',
                quota_limit: pdfLimit,
                monthly_used: monthlyCount,
                credits_available: currentCredits,
              });
            }
            isExtraCreditScan = true; // akan potong 10 kredit
          }
          // Masih dalam kuota — gratis, lanjutkan
        } else {
          // Free user: selalu pakai kredit
          const currentCredits = sub?.credits ?? 0;
          if (currentCredits < 10) {
            return reply.status(402).send({
              success: false,
              message: `Kredit tidak cukup. Scan CV membutuhkan 10 kredit. Saldo Anda: ${currentCredits} kredit.`,
              code: 'CREDITS_INSUFFICIENT',
              credits_required: 10,
              credits_available: currentCredits,
            });
          }
          isExtraCreditScan = true; // free user selalu dipotong
        }

        // ── 2. Parse the multipart CV file ─────────────────────────────────
        let cvBuffer: Buffer | null = null;
        let mimeType = 'application/pdf';
        let originalFileName = 'cv.pdf';

        const parts = request.parts();
        for await (const part of parts) {
          if (part.type === 'file' && part.fieldname === 'cv') {
            cvBuffer = await part.toBuffer();
            mimeType = part.mimetype || 'application/pdf';
            originalFileName = part.filename || 'cv.pdf';
          }
        }

        if (!cvBuffer || cvBuffer.length === 0) {
          return reply.status(400).send({
            success: false,
            message: 'File CV tidak ditemukan. Kirimkan file PDF dalam field "cv".',
          });
        }

        if (cvBuffer.length > MAX_CV_SIZE_BYTES) {
          return reply.status(413).send({
            success: false,
            message: `Ukuran file CV melebihi batas maksimal ${MAX_CV_SIZE_BYTES / (1024 * 1024)}MB.`,
          });
        }

        const isPdf =
          mimeType === 'application/pdf' ||
          originalFileName.toLowerCase().endsWith('.pdf');

        if (!isPdf) {
          return reply.status(415).send({
            success: false,
            message: 'Format file tidak valid. Hanya PDF yang diterima.',
          });
        }

        // ── 3. Build job description context for Gemini ────────────────────
        const jobContext = [
          `Posisi: ${job.title}`,
          '',
          'Deskripsi Pekerjaan:',
          job.description,
          '',
          'Persyaratan:',
          job.requirements,
        ].join('\n');

        fastify.log.info(
          { jobId, fileName: originalFileName, sizeBytes: cvBuffer.length },
          '[CVScreening] Sending CV to Gemini for analysis...'
        );

        // ── 4. Run Gemini analysis ─────────────────────────────────────────
        const analysisResult = await analyzeCVWithGemini(jobContext, cvBuffer, mimeType);

        fastify.log.info(
          {
            jobId,
            applicant: analysisResult.nama_pelamar,
            atsScore: analysisResult.ats_score,
            status: analysisResult.rekomendasi_status,
          },
          '[CVScreening] Gemini analysis complete.'
        );

        // ── 5. Persist to Supabase ─────────────────────────────────────────
        const { data: savedApplicant, error: insertError } = await supabase
          .from('applicants')
          .insert({
            org_id:          job.org_id,
            job_id:          job.id,
            name:            analysisResult.nama_pelamar || 'Unknown',
            email:           analysisResult.email        || '',
            whatsapp:        analysisResult.whatsapp     || '',
            ats_score:       analysisResult.ats_score,
            analysis_result: analysisResult,
            status:          analysisResult.rekomendasi_status,
            cv_file_path:    null, // Set if you upload to Supabase Storage
          })
          .select('id, created_at')
          .single();

        if (insertError) {
          fastify.log.error(insertError, '[CVScreening] Failed to persist applicant');
          return reply.status(500).send({
            success: false,
            message: 'Analisis berhasil namun gagal menyimpan data. Silakan coba lagi.',
          });
        }

        // ── 6. Log analytics event ─────────────────────────────────────────
        await supabase.from('analytics_events').insert({
          org_id:     job.org_id,
          event_type: 'cv_screened',
          metadata: {
            applicantId: savedApplicant.id,
            jobId,
            atsScore:    analysisResult.ats_score,
            status:      analysisResult.rekomendasi_status,
          },
        }).then(); // fire-and-forget

        // ── 6.5 Deduct 10 credits (hanya jika extra scan / free user) ─────
        if (isExtraCreditScan) {
          try {
            const { data: latestSub } = await supabase
              .from('subscriptions')
              .select('credits')
              .eq('org_id', job.org_id)
              .maybeSingle();

            const newCredits = Math.max(0, (latestSub?.credits ?? 0) - 10);
            await supabase
              .from('subscriptions')
              .update({ credits: newCredits })
              .eq('org_id', job.org_id);

            await supabase.from('credit_transactions').insert({
              org_id:      job.org_id,
              amount:      -10,
              type:        'usage',
              description: `ATS CV Scan — ${analysisResult.nama_pelamar || 'Pelamar'} untuk posisi ${job.title}`,
              reference:   savedApplicant.id,
            });

            fastify.log.info({ orgId: job.org_id, newCredits }, '[Credits] -10 credits deducted for CV scan');
          } catch (creditErr) {
            // Non-fatal: jangan batalkan response sukses karena error kredit
            fastify.log.warn({ creditErr }, '[Credits] Failed to deduct CV scan credit');
          }
        } else {
          fastify.log.info({ orgId: job.org_id }, '[CVScan] Within monthly quota — no credit deducted');
        }

        // ── 7. Return success response ─────────────────────────────────────
        // Substitute the "[Nama Perusahaan]" placeholder in the drafts using
        // the org's current name — computed at read time (never persisted)
        // so it always reflects whatever the name is right now.
        const { data: orgForDraft } = await supabase
          .from('organizations')
          .select('name')
          .eq('id', job.org_id)
          .maybeSingle();

        return reply.status(201).send({
          success:      true,
          message:      'CV berhasil dianalisis oleh AI.',
          applicant_id: savedApplicant.id,
          credits_used: isExtraCreditScan ? 10 : 0,
          scan_type:    isExtraCreditScan ? 'extra_credit' : 'quota',
          data: {
            ...analysisResult,
            draft_whatsapp:      fillCompanyNamePlaceholder(analysisResult.draft_whatsapp, orgForDraft?.name),
            draft_email_subject: fillCompanyNamePlaceholder(analysisResult.draft_email_subject, orgForDraft?.name),
            draft_email_body:    fillCompanyNamePlaceholder(analysisResult.draft_email_body, orgForDraft?.name),
            created_at: savedApplicant.created_at,
          },
        });



      } catch (err: any) {
        fastify.log.error(err, '[CVScreening] Unexpected error during CV analysis');
        return reply.status(500).send({
          success: false,
          message: err?.message ?? 'Terjadi kesalahan tak terduga saat memproses CV.',
        });
      }
    }
  );

  // ─────────────────────────────────────────────────────────────────────────
  // GET /api/v1/jobs
  // Returns all active job vacancies for the authenticated org.
  // ─────────────────────────────────────────────────────────────────────────
  fastify.get(
    '/v1/jobs',
    { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const userId = (request as any).user?.id;

        const { data: org } = await supabase
          .from('organizations')
          .select('id')
          .eq('user_id', userId)
          .maybeSingle();

        if (!org) {
          return reply.status(404).send({ success: false, message: 'Organisasi tidak ditemukan.' });
        }

        const { data, error } = await supabase
          .from('job_vacancies')
          .select('*')
          .eq('org_id', org.id)
          .order('created_at', { ascending: false });

        if (error) throw error;

        return reply.send({ success: true, data: data ?? [] });
      } catch (err: any) {
        fastify.log.error(err, '[CVScreening] GET /v1/jobs failed');
        return reply.status(500).send({ success: false, message: err.message });
      }
    }
  );

  // ─────────────────────────────────────────────────────────────────────────
  // POST /api/v1/jobs
  // Creates a new job vacancy for the authenticated org.
  // ─────────────────────────────────────────────────────────────────────────
  fastify.post<{
    Body: { title: string; description: string; requirements?: string };
  }>(
    '/v1/jobs',
    { preHandler: [authenticate] },
    async (
      request: FastifyRequest<{ Body: { title: string; description: string; requirements?: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const userId = (request as any).user?.id;
        const { title, description, requirements = '' } = request.body;

        if (!title?.trim() || !description?.trim()) {
          return reply.status(400).send({
            success: false,
            message: 'Field "title" dan "description" wajib diisi.',
          });
        }

        const { data: org } = await supabase
          .from('organizations')
          .select('id')
          .eq('user_id', userId)
          .maybeSingle();

        if (!org) {
          return reply.status(404).send({ success: false, message: 'Organisasi tidak ditemukan.' });
        }

        const { data, error } = await supabase
          .from('job_vacancies')
          .insert({
            org_id:       org.id,
            title:        title.trim(),
            description:  description.trim(),
            requirements: requirements.trim(),
          })
          .select('*')
          .single();

        if (error) throw error;

        return reply.status(201).send({ success: true, data });
      } catch (err: any) {
        fastify.log.error(err, '[CVScreening] POST /v1/jobs failed');
        return reply.status(500).send({ success: false, message: err.message });
      }
    }
  );

  // ─────────────────────────────────────────────────────────────────────────
  // GET /api/v1/jobs/:jobId/applicants
  // Returns all applicants for a specific job vacancy, sorted by ATS score.
  // ─────────────────────────────────────────────────────────────────────────
  fastify.get<{ Params: { jobId: string }; Querystring: { status?: ApplicantStatus } }>(
    '/v1/jobs/:jobId/applicants',
    { preHandler: [authenticate] },
    async (
      request: FastifyRequest<{ Params: { jobId: string }; Querystring: { status?: ApplicantStatus } }>,
      reply: FastifyReply
    ) => {
      try {
        const userId = (request as any).user?.id;
        const { jobId }  = request.params;
        const { status } = request.query;

        const { data: org } = await supabase
          .from('organizations')
          .select('id, name')
          .eq('user_id', userId)
          .maybeSingle();

        if (!org) {
          return reply.status(404).send({ success: false, message: 'Organisasi tidak ditemukan.' });
        }

        let query = supabase
          .from('applicants')
          .select(`
            id, name, email, whatsapp, ats_score, status,
            analysis_result,
            analysis_result->>'pendidikan_terakhir'   AS pendidikan_terakhir,
            analysis_result->'red_flags'              AS red_flags,
            analysis_result->>'draft_whatsapp'        AS draft_whatsapp,
            analysis_result->>'draft_email_subject'   AS draft_email_subject,
            analysis_result->>'draft_email_body'      AS draft_email_body,
            email_sent_at,
            created_at
          `)
          .eq('org_id', org.id)
          .eq('job_id', jobId)
          .order('ats_score', { ascending: false });

        if (status) {
          query = query.eq('status', status) as typeof query;
        }

        const { data, error } = await query;

        if (error) throw error;

        // Substitute "[Nama Perusahaan]" with the org's current name — both
        // in the flattened draft columns (used by the table row) and inside
        // the nested analysis_result (used by the detail modal).
        const applicantsWithCompanyName = (data ?? []).map((a: any) => ({
          ...a,
          draft_whatsapp:      a.draft_whatsapp ? fillCompanyNamePlaceholder(a.draft_whatsapp, org.name) : a.draft_whatsapp,
          draft_email_subject: a.draft_email_subject ? fillCompanyNamePlaceholder(a.draft_email_subject, org.name) : a.draft_email_subject,
          draft_email_body:    a.draft_email_body ? fillCompanyNamePlaceholder(a.draft_email_body, org.name) : a.draft_email_body,
          analysis_result: a.analysis_result ? {
            ...a.analysis_result,
            draft_whatsapp:      a.analysis_result.draft_whatsapp ? fillCompanyNamePlaceholder(a.analysis_result.draft_whatsapp, org.name) : a.analysis_result.draft_whatsapp,
            draft_email_subject: a.analysis_result.draft_email_subject ? fillCompanyNamePlaceholder(a.analysis_result.draft_email_subject, org.name) : a.analysis_result.draft_email_subject,
            draft_email_body:    a.analysis_result.draft_email_body ? fillCompanyNamePlaceholder(a.analysis_result.draft_email_body, org.name) : a.analysis_result.draft_email_body,
          } : a.analysis_result,
        }));

        return reply.send({ success: true, total: applicantsWithCompanyName.length, data: applicantsWithCompanyName });
      } catch (err: any) {
        fastify.log.error(err, '[CVScreening] GET /v1/jobs/:jobId/applicants failed');
        return reply.status(500).send({ success: false, message: err.message });
      }
    }
  );

  // ─────────────────────────────────────────────────────────────────────────
  // PATCH /api/v1/jobs/:jobId/applicants/:applicantId/status
  // Allows HR to manually override the AI's recommended status.
  // ─────────────────────────────────────────────────────────────────────────
  fastify.patch<{
    Params: { jobId: string; applicantId: string };
    Body: { status: ApplicantStatus };
  }>(
    '/v1/jobs/:jobId/applicants/:applicantId/status',
    { preHandler: [authenticate] },
    async (
      request: FastifyRequest<{
        Params: { jobId: string; applicantId: string };
        Body: { status: ApplicantStatus };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const userId = (request as any).user?.id;
        const { applicantId } = request.params;
        const { status } = request.body;

        const validStatuses: ApplicantStatus[] = ['LOLOS_INTERVIEW', 'TALENT_POOL', 'TOLAK'];
        if (!validStatuses.includes(status)) {
          return reply.status(400).send({
            success: false,
            message: `Status tidak valid. Pilihan: ${validStatuses.join(', ')}`,
          });
        }

        const { data: org } = await supabase
          .from('organizations')
          .select('id')
          .eq('user_id', userId)
          .maybeSingle();

        if (!org) {
          return reply.status(404).send({ success: false, message: 'Organisasi tidak ditemukan.' });
        }

        // Clear email_sent_at: a status change means any previously sent email
        // no longer reflects the candidate's actual outcome, so the "already
        // sent" indicator must reset and HR must explicitly send again.
        const { error } = await supabase
          .from('applicants')
          .update({ status, email_sent_at: null })
          .eq('id', applicantId)
          .eq('org_id', org.id); // ownership check

        if (error) throw error;

        return reply.send({ success: true, message: `Status pelamar diperbarui ke "${status}".` });
      } catch (err: any) {
        fastify.log.error(err, '[CVScreening] PATCH status failed');
        return reply.status(500).send({ success: false, message: err.message });
      }
    }
  );

  // ─────────────────────────────────────────────────────────────────────────
  // POST /api/v1/jobs/:jobId/applicants/:applicantId/send-email
  //
  // Sends the AI-drafted decision email to the candidate so HR doesn't have
  // to compose/send it manually. Uses the draft_email_subject/draft_email_body
  // generated alongside draft_whatsapp during CV analysis.
  // ─────────────────────────────────────────────────────────────────────────
  fastify.post<{ Params: { jobId: string; applicantId: string } }>(
    '/v1/jobs/:jobId/applicants/:applicantId/send-email',
    { preHandler: [authenticate] },
    async (request: FastifyRequest<{ Params: { jobId: string; applicantId: string } }>, reply: FastifyReply) => {
      try {
        const userId = (request as any).user?.id;
        const { jobId, applicantId } = request.params;

        const { data: org } = await supabase
          .from('organizations')
          .select('id, name, reply_to_email')
          .eq('user_id', userId)
          .maybeSingle();

        if (!org) {
          return reply.status(404).send({ success: false, message: 'Organisasi tidak ditemukan.' });
        }

        const { data: applicant, error: fetchError } = await supabase
          .from('applicants')
          .select('id, name, email, status, analysis_result')
          .eq('id', applicantId)
          .eq('job_id', jobId)
          .eq('org_id', org.id)
          .maybeSingle();

        if (fetchError || !applicant) {
          return reply.status(404).send({ success: false, message: 'Pelamar tidak ditemukan.' });
        }

        if (!applicant.email) {
          return reply.status(400).send({
            success: false,
            message: 'Pelamar ini tidak memiliki alamat email yang terdeteksi dari CV.',
          });
        }

        const { data: job } = await supabase
          .from('job_vacancies')
          .select('title')
          .eq('id', jobId)
          .maybeSingle();

        const { subject, body, statusLabel, statusColor } = buildApplicantEmailContent(
          applicant,
          job?.title || 'posisi yang dilamar',
          org.name,
          org.reply_to_email
        );

        const from = await resolveSenderFrom(org.id, org.name);

        await sendEmail({ to: applicant.email, subject, body, statusLabel, statusColor, from, replyTo: org.reply_to_email || undefined });

        const { error: updateError } = await supabase
          .from('applicants')
          .update({ email_sent_at: new Date().toISOString() })
          .eq('id', applicantId)
          .eq('org_id', org.id);

        if (updateError) throw updateError;

        return reply.send({ success: true, message: `Email berhasil dikirim ke ${applicant.email}.` });
      } catch (err: any) {
        fastify.log.error(err, '[CVScreening] send-email failed');
        return reply.status(500).send({
          success: false,
          message: err?.message ?? 'Gagal mengirim email.',
        });
      }
    }
  );

  // ─────────────────────────────────────────────────────────────────────────
  // POST /api/v1/jobs/:jobId/applicants/send-email-bulk
  //
  // Sends the decision email to every eligible candidate for a job in one
  // click, using Resend's Batch API (up to 100 emails/call, chunked if more).
  // "Eligible" = has a detected email AND hasn't already been sent one — this
  // makes the action safely repeatable: re-running it only reaches candidates
  // added or whose status changed (which resets email_sent_at) since the
  // last run, never double-sends.
  // ─────────────────────────────────────────────────────────────────────────
  fastify.post<{ Params: { jobId: string } }>(
    '/v1/jobs/:jobId/applicants/send-email-bulk',
    { preHandler: [authenticate] },
    async (request: FastifyRequest<{ Params: { jobId: string } }>, reply: FastifyReply) => {
      try {
        const userId = (request as any).user?.id;
        const { jobId } = request.params;

        const { data: org } = await supabase
          .from('organizations')
          .select('id, name, reply_to_email')
          .eq('user_id', userId)
          .maybeSingle();

        if (!org) {
          return reply.status(404).send({ success: false, message: 'Organisasi tidak ditemukan.' });
        }

        const { data: job } = await supabase
          .from('job_vacancies')
          .select('title')
          .eq('id', jobId)
          .eq('org_id', org.id)
          .maybeSingle();

        if (!job) {
          return reply.status(404).send({ success: false, message: 'Lowongan tidak ditemukan.' });
        }

        const { data: candidates, error: fetchError } = await supabase
          .from('applicants')
          .select('id, name, email, status, analysis_result')
          .eq('job_id', jobId)
          .eq('org_id', org.id)
          .is('email_sent_at', null);

        if (fetchError) throw fetchError;

        const eligible = (candidates ?? []).filter((a) => a.email && a.email.trim());
        const skipped = (candidates?.length ?? 0) - eligible.length;

        if (eligible.length === 0) {
          return reply.send({
            success: true,
            sent: 0,
            skipped,
            failed: 0,
            sent_ids: [],
            message: 'Tidak ada pelamar yang memenuhi syarat untuk menerima email (tanpa email terdeteksi, atau semua sudah terkirim).',
          });
        }

        const from = await resolveSenderFrom(org.id, org.name);
        const sentIds: string[] = [];
        let failed = 0;

        for (let i = 0; i < eligible.length; i += EMAIL_BATCH_SIZE) {
          const chunk = eligible.slice(i, i + EMAIL_BATCH_SIZE);
          const payload: SendEmailParams[] = chunk.map((applicant) => ({
            to: applicant.email,
            from,
            replyTo: org.reply_to_email || undefined,
            ...buildApplicantEmailContent(applicant, job.title, org.name, org.reply_to_email),
          }));

          try {
            await sendBatchEmails(payload);
            sentIds.push(...chunk.map((a) => a.id));
          } catch (batchErr) {
            fastify.log.error(batchErr, '[CVScreening] Bulk email batch failed');
            failed += chunk.length;
          }
        }

        if (sentIds.length > 0) {
          const { error: updateError } = await supabase
            .from('applicants')
            .update({ email_sent_at: new Date().toISOString() })
            .in('id', sentIds);

          if (updateError) {
            fastify.log.error(updateError, '[CVScreening] Failed to mark bulk-sent applicants');
          }
        }

        return reply.send({
          success: true,
          sent: sentIds.length,
          skipped,
          failed,
          sent_ids: sentIds,
          message: `Berhasil mengirim ${sentIds.length} email.` +
            (failed ? ` ${failed} gagal dikirim.` : '') +
            (skipped ? ` ${skipped} dilewati (tanpa email atau sudah terkirim).` : ''),
        });
      } catch (err: any) {
        fastify.log.error(err, '[CVScreening] send-email-bulk failed');
        return reply.status(500).send({
          success: false,
          message: err?.message ?? 'Gagal mengirim email massal.',
        });
      }
    }
  );

  // ─────────────────────────────────────────────────────────────────────────
  // DELETE /api/v1/jobs/:jobId/applicants/:applicantId
  // ─────────────────────────────────────────────────────────────────────────
  fastify.delete<{ Params: { jobId: string; applicantId: string } }>(
    '/v1/jobs/:jobId/applicants/:applicantId',
    { preHandler: [authenticate] },
    async (request, reply) => {
      try {
        const userId = (request as any).user?.id;
        const { jobId, applicantId } = request.params;

        const { data: org } = await supabase
          .from('organizations')
          .select('id')
          .eq('user_id', userId)
          .maybeSingle();

        if (!org) return reply.status(404).send({ success: false, message: 'Not found' });

        const { error } = await supabase
          .from('applicants')
          .delete()
          .eq('id', applicantId)
          .eq('job_id', jobId)
          .eq('org_id', org.id);

        if (error) throw error;
        return reply.send({ success: true, message: 'Deleted' });
      } catch (err: any) {
        return reply.status(500).send({ success: false, message: err.message });
      }
    }
  );

  // ─────────────────────────────────────────────────────────────────────────
  // PUT /api/v1/jobs/:jobId
  // Update a job vacancy
  // ─────────────────────────────────────────────────────────────────────────
  fastify.put<{ Params: { jobId: string }; Body: { title: string; description: string; requirements?: string; is_active?: boolean } }>(
    '/v1/jobs/:jobId',
    { preHandler: [authenticate] },
    async (request, reply) => {
      try {
        const userId = (request as any).user?.id;
        const { jobId } = request.params;
        const { title, description, requirements, is_active } = request.body;

        const { data: org } = await supabase
          .from('organizations')
          .select('id')
          .eq('user_id', userId)
          .maybeSingle();

        if (!org) return reply.status(404).send({ success: false, message: 'Not found' });

        const updateData: any = {};
        if (title !== undefined) updateData.title = title.trim();
        if (description !== undefined) updateData.description = description.trim();
        if (requirements !== undefined) updateData.requirements = requirements.trim();
        if (is_active !== undefined) updateData.is_active = is_active;

        const { data, error } = await supabase
          .from('job_vacancies')
          .update(updateData)
          .eq('id', jobId)
          .eq('org_id', org.id)
          .select('*')
          .single();

        if (error) throw error;
        return reply.send({ success: true, data });
      } catch (err: any) {
        return reply.status(500).send({ success: false, message: err.message });
      }
    }
  );

  // ─────────────────────────────────────────────────────────────────────────
  // DELETE /api/v1/jobs/:jobId
  // Delete a job vacancy
  // ─────────────────────────────────────────────────────────────────────────
  fastify.delete<{ Params: { jobId: string } }>(
    '/v1/jobs/:jobId',
    { preHandler: [authenticate] },
    async (request, reply) => {
      try {
        const userId = (request as any).user?.id;
        const { jobId } = request.params;

        const { data: org } = await supabase
          .from('organizations')
          .select('id')
          .eq('user_id', userId)
          .maybeSingle();

        if (!org) return reply.status(404).send({ success: false, message: 'Not found' });

        const { error } = await supabase
          .from('job_vacancies')
          .delete()
          .eq('id', jobId)
          .eq('org_id', org.id);

        if (error) throw error;
        return reply.send({ success: true, message: 'Deleted' });
      } catch (err: any) {
        return reply.status(500).send({ success: false, message: err.message });
      }
    }
  );
  // ─────────────────────────────────────────────────────────────────────────
  // GET /api/v1/cv-quota
  // Returns current CV scan quota usage and subscription details.
  // ─────────────────────────────────────────────────────────────────────────
  fastify.get(
    '/v1/cv-quota',
    { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const userId = (request as any).user?.id;
        const { data: org } = await supabase
          .from('organizations')
          .select('id')
          .eq('user_id', userId)
          .maybeSingle();

        if (!org) return reply.status(404).send({ success: false, message: 'Not found' });

        const { data: sub } = await supabase
          .from('subscriptions')
          .select('plan_type, credits, pdf_upload_limit')
          .eq('org_id', org.id)
          .maybeSingle();

        const isSubscriber = sub && sub.plan_type !== 'free';
        const pdfLimit = sub?.pdf_upload_limit ?? 0;
        const currentCredits = sub?.credits ?? 0;

        let monthlyCount = 0;
        if (isSubscriber) {
          const startOfMonth = new Date();
          startOfMonth.setDate(1);
          startOfMonth.setHours(0, 0, 0, 0);

          const { count } = await supabase
            .from('applicants')
            .select('*', { count: 'exact', head: true })
            .eq('org_id', org.id)
            .gte('created_at', startOfMonth.toISOString());
          monthlyCount = count ?? 0;
        }

        return reply.send({
          success: true,
          data: {
            isSubscriber,
            pdfLimit,
            monthlyCount,
            currentCredits
          }
        });
      } catch (err: any) {
        return reply.status(500).send({ success: false, message: err.message });
      }
    }
  );
}
