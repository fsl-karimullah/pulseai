-- ═══════════════════════════════════════════════════════════════════════════
-- PulseAI — Supabase Migration: Add Widget Placement to Bot Settings
-- ═══════════════════════════════════════════════════════════════════════════

alter table bot_settings 
add column if not exists widget_placement text not null default 'bottom-right'
  check (widget_placement in ('bottom-right', 'bottom-left'));
