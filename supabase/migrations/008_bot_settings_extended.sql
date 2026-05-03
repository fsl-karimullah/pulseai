-- ═══════════════════════════════════════════════════════════════════════════
-- PulseAI — Supabase Migration: Add Color and Logo to Bot Settings
-- ═══════════════════════════════════════════════════════════════════════════

alter table bot_settings 
add column if not exists color_theme text not null default '#10b981', -- Emerald-500
add column if not exists logo_url text;
