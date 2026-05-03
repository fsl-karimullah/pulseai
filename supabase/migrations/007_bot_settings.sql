-- ═══════════════════════════════════════════════════════════════════════════
-- PulseAI — Supabase Migration: Bot Settings
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists bot_settings (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  bot_name text not null default 'Aria',
  ai_model text not null default 'Gemini 1.5 Flash',
  tone text not null default 'Professional',
  response_delay int not null default 500,
  is_active boolean not null default true,
  collect_leads boolean not null default true,
  custom_instructions text,
  updated_at timestamptz not null default now()
);

alter table bot_settings enable row level security;

-- Users can view and update their own bot settings
create policy "Users can view own bot settings"
  on bot_settings for select
  using (
    org_id in (
      select id from organizations where user_id = auth.uid()
    )
  );

create policy "Users can update own bot settings"
  on bot_settings for update
  using (
    org_id in (
      select id from organizations where user_id = auth.uid()
    )
  );

-- Auto-provision bot settings when an organization is created
create or replace function public.handle_new_org_settings()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into bot_settings (org_id)
  values (new.id);
  return new;
end;
$$;

create trigger on_org_created_settings
  after insert on organizations
  for each row execute procedure public.handle_new_org_settings();
