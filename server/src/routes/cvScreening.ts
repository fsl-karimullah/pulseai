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
import { analyzeCVWithGemini, type ApplicantStatus } from '../services/cvScreeningService';

// ─── Max file size for CV uploads (separate from the global limit in app.ts) ──
const MAX_CV_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

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

        // ── 1.5. Check Quota (Free: 5/month, Paid: 50/month) ───────────────
        const { data: sub } = await supabase
          .from('subscriptions')
          .select('plan_type')
          .eq('org_id', job.org_id)
          .maybeSingle();

        const isSubscribed = sub && sub.plan_type !== 'free';
        const quotaLimit = isSubscribed ? 50 : 5;

        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);

        const { count, error: countError } = await supabase
          .from('applicants')
          .select('*', { count: 'exact', head: true })
          .eq('org_id', job.org_id)
          .gte('created_at', startOfMonth.toISOString());

        if (!countError && count !== null && count >= quotaLimit) {
          return reply.status(429).send({
            success: false,
            message: `Kuota habis! Anda hanya dapat melakukan ${quotaLimit} scan CV bulan ini (${isSubscribed ? 'Premium' : 'Early Access'}).`,
          });
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

        // ── 7. Return success response ─────────────────────────────────────
        return reply.status(201).send({
          success:      true,
          message:      'CV berhasil dianalisis oleh AI.',
          applicant_id: savedApplicant.id,
          data: {
            ...analysisResult,
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
          .select('id')
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
            analysis_result->>'pendidikan_terakhir' AS pendidikan_terakhir,
            analysis_result->'red_flags'            AS red_flags,
            analysis_result->>'draft_whatsapp'      AS draft_whatsapp,
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

        return reply.send({ success: true, total: data?.length ?? 0, data: data ?? [] });
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

        const { error } = await supabase
          .from('applicants')
          .update({ status })
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
}
