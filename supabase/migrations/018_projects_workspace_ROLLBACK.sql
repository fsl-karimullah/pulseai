-- ═══════════════════════════════════════════════════════════════════════════
-- PulseAI — Rollback for Migration 018: Projects / Workspace layer
--
-- Reverses 018_projects_workspace.sql completely. Safe to run at any time
-- AFTER 018 as long as application code has NOT yet been switched over to
-- project_id / match_knowledge_nodes_by_project (Langkah 2/3 not deployed).
-- org_id-based tables/functions/policies are untouched by 018, so nothing
-- else needs to be restored.
--
-- Run in Supabase Dashboard → SQL Editor → New Query
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 7. Drop project-scoped RAG RPC ────────────────────────────────────────
drop function if exists match_knowledge_nodes_by_project(vector, uuid, float, int);

-- ─── 6. Drop project_id from bot_settings ──────────────────────────────────
drop index if exists bot_settings_project_id_uidx;
alter table bot_settings drop column if exists project_id;

-- ─── 5. Drop project_id from whatsapp_sessions ─────────────────────────────
drop index if exists whatsapp_sessions_project_id_idx;
alter table whatsapp_sessions drop column if exists project_id;

-- ─── 4. Drop project_id from knowledge_nodes ───────────────────────────────
drop index if exists knowledge_nodes_project_id_idx;
alter table knowledge_nodes drop column if exists project_id;

-- ─── 3. Drop widget_channels table ──────────────────────────────────────────
drop trigger if exists widget_channels_updated_at on widget_channels;
drop table if exists widget_channels;

-- ─── 2. Drop auto-provision trigger for new orgs ───────────────────────────
drop trigger if exists on_org_created_project on organizations;
drop function if exists public.handle_new_org_project();

-- ─── 1. Drop projects table ─────────────────────────────────────────────────
drop trigger if exists projects_updated_at on projects;
drop table if exists projects;

-- ═══════════════════════════════════════════════════════════════════════════
-- Done. Schema restored to pre-018 state.
-- ═══════════════════════════════════════════════════════════════════════════
