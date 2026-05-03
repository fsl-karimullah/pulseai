-- ═══════════════════════════════════════════════════════════════════════════
-- PulseAI — Supabase Migration: analytics_events table
-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor > New Query)
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists analytics_events (
  id          uuid        primary key default gen_random_uuid(),
  event_type  text        not null,
  metadata    jsonb       not null default '{}',
  created_at  timestamptz not null default now()
);

-- Index for fast analytics queries based on time and type
create index if not exists analytics_events_type_created_idx
  on analytics_events (event_type, created_at desc);

alter table analytics_events enable row level security;

-- Only service role can insert and read
create policy "Service role can manage analytics"
  on analytics_events for all to service_role using (true);
