-- ═══════════════════════════════════════════════════════════════════════════
-- PulseAI — Supabase Migration: Organization Security & Domains
-- ═══════════════════════════════════════════════════════════════════════════

alter table organizations add column if not exists allowed_domains text[] default '{}';

-- Documentation:
-- allowed_domains: An array of strings representing authorized domains (e.g., ['mysite.com', 'app.mysite.com'])
