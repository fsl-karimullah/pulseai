-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration: AI CV Screening & ATS Reader
-- Run this in: Supabase Dashboard → SQL Editor
-- Scope: Tables are org-scoped (org_id FK) so each tenant owns their own data.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Extension: ensure uuid_generate_v4() is available
-- ─────────────────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Table: job_vacancies
--    Stores job postings per organization. The description + requirements
--    fields are passed verbatim to Gemini as the "job context".
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.job_vacancies (
  id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id       UUID        NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  title        TEXT        NOT NULL,
  description  TEXT        NOT NULL,
  requirements TEXT        NOT NULL DEFAULT '',
  is_active    BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  public.job_vacancies                IS 'Job postings per organization — used as AI screening context.';
COMMENT ON COLUMN public.job_vacancies.description    IS 'Full job description sent to Gemini for semantic matching.';
COMMENT ON COLUMN public.job_vacancies.requirements   IS 'Required skills / qualifications appended to description.';

-- Fast lookup: all vacancies for an org, filtered by active status
CREATE INDEX IF NOT EXISTS idx_job_vacancies_org_active
  ON public.job_vacancies (org_id, is_active);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Enum: applicant_status
--    Three-state decision returned by Gemini and persisted per applicant.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'applicant_status') THEN
    CREATE TYPE public.applicant_status AS ENUM (
      'PENDING',          -- uploaded but not yet analysed (race-condition guard)
      'LOLOS_INTERVIEW',  -- AI recommends interview
      'TALENT_POOL',      -- keep on file, not right now
      'TOLAK'             -- rejected
    );
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Table: applicants
--    One row per submitted CV. analysis_result stores the raw Gemini JSON so
--    you can re-render any field without a second AI call.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.applicants (
  id              UUID              PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id          UUID              NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  job_id          UUID              NOT NULL REFERENCES public.job_vacancies (id) ON DELETE CASCADE,
  -- Basic contact info extracted by Gemini
  name            TEXT              NOT NULL DEFAULT '',
  email           TEXT              NOT NULL DEFAULT '',
  whatsapp        TEXT              NOT NULL DEFAULT '',
  -- ATS scoring
  ats_score       SMALLINT          NOT NULL DEFAULT 0
                  CHECK (ats_score BETWEEN 0 AND 100),
  -- Full structured output from Gemini (stored for replay / audit)
  analysis_result JSONB             NOT NULL DEFAULT '{}',
  -- HR decision (starts as AI recommendation; can be overridden manually)
  status          public.applicant_status NOT NULL DEFAULT 'PENDING',
  -- Original CV file reference (optional: path in Supabase Storage)
  cv_file_path    TEXT,
  created_at      TIMESTAMPTZ       NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  public.applicants                IS 'Submitted CVs with AI screening results per job vacancy.';
COMMENT ON COLUMN public.applicants.analysis_result IS 'Raw JSON from Gemini CV analysis — includes kelebihan, red_flags, draft_whatsapp, etc.';
COMMENT ON COLUMN public.applicants.ats_score        IS 'ATS compatibility score 0-100 returned by Gemini.';
COMMENT ON COLUMN public.applicants.status           IS 'AI recommendation: LOLOS_INTERVIEW | TALENT_POOL | TOLAK. Can be manually overridden by HR.';

-- Indexes for common HR queries
CREATE INDEX IF NOT EXISTS idx_applicants_job_id    ON public.applicants (job_id);
CREATE INDEX IF NOT EXISTS idx_applicants_org_id    ON public.applicants (org_id);
CREATE INDEX IF NOT EXISTS idx_applicants_status    ON public.applicants (status);
CREATE INDEX IF NOT EXISTS idx_applicants_ats_score ON public.applicants (ats_score DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Row-Level Security (RLS)
--    Both tables are org-scoped. The Fastify backend uses service_role (bypasses
--    RLS) so these policies protect against anon key leakage.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.job_vacancies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.applicants    ENABLE ROW LEVEL SECURITY;

-- service_role has full access (used by backend API)
CREATE POLICY "svc_full_job_vacancies"
  ON public.job_vacancies FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "svc_full_applicants"
  ON public.applicants FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Authenticated users can only see their own org's data (dashboard queries)
CREATE POLICY "owner_read_job_vacancies"
  ON public.job_vacancies FOR SELECT TO authenticated
  USING (
    org_id IN (
      SELECT id FROM public.organizations
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "owner_read_applicants"
  ON public.applicants FOR SELECT TO authenticated
  USING (
    org_id IN (
      SELECT id FROM public.organizations
      WHERE user_id = auth.uid()
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Helper view: applicant_summary
--    Joins applicants ↔ job_vacancies for quick HR dashboard display.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.applicant_summary AS
SELECT
  a.id,
  a.org_id,
  a.job_id,
  j.title                                       AS job_title,
  a.name,
  a.email,
  a.whatsapp,
  a.ats_score,
  a.status,
  a.analysis_result -> 'rekomendasi_status'     AS ai_recommendation,
  a.analysis_result -> 'red_flags'              AS red_flags,
  a.analysis_result -> 'draft_whatsapp'         AS draft_whatsapp,
  a.created_at
FROM public.applicants  a
JOIN public.job_vacancies j ON j.id = a.job_id;
