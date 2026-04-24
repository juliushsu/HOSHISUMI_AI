-- Staging-focused AI/System Settings foundation.
-- This migration is being applied to staging first for the AI settings API v1 rollout.

create extension if not exists pgcrypto;

create table if not exists public.organization_ai_settings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  demo_data_type text null check (demo_data_type in ('seed', 'sandbox')),
  ocr_provider text not null default 'openai'
    check (ocr_provider in ('openai', 'gemini')),
  standard_analysis_model text not null default 'openai'
    check (standard_analysis_model in ('openai', 'gemini')),
  vision_enhanced_analysis_model text not null default 'openai_vision'
    check (vision_enhanced_analysis_model in ('openai_vision', 'gemini_vision')),
  copy_generation_model text not null default 'openai'
    check (copy_generation_model in ('openai', 'gemini')),
  marketing_visual_generation_model text not null default 'openai_image'
    check (marketing_visual_generation_model in ('openai_image', 'gemini_image')),
  location_enrichment_provider text not null default 'google_maps'
    check (location_enrichment_provider in ('google_maps')),
  updated_by uuid null references public.agents(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_ai_settings_org_unique unique (organization_id)
);

alter table public.organization_ai_settings
  add column if not exists ocr_provider text;
alter table public.organization_ai_settings
  add column if not exists standard_analysis_model text;
alter table public.organization_ai_settings
  add column if not exists vision_enhanced_analysis_model text;
alter table public.organization_ai_settings
  add column if not exists copy_generation_model text;
alter table public.organization_ai_settings
  add column if not exists marketing_visual_generation_model text;
alter table public.organization_ai_settings
  add column if not exists location_enrichment_provider text;
alter table public.organization_ai_settings
  add column if not exists updated_by uuid null references public.agents(id) on delete set null;

update public.organization_ai_settings
set
  ocr_provider = coalesce(nullif(ocr_provider, ''), 'openai'),
  standard_analysis_model = coalesce(nullif(standard_analysis_model, ''), 'openai'),
  vision_enhanced_analysis_model = coalesce(nullif(vision_enhanced_analysis_model, ''), 'openai_vision'),
  copy_generation_model = coalesce(nullif(copy_generation_model, ''), 'openai'),
  marketing_visual_generation_model = coalesce(nullif(marketing_visual_generation_model, ''), 'openai_image'),
  location_enrichment_provider = coalesce(nullif(location_enrichment_provider, ''), 'google_maps')
where
  ocr_provider is null
  or standard_analysis_model is null
  or vision_enhanced_analysis_model is null
  or copy_generation_model is null
  or marketing_visual_generation_model is null
  or location_enrichment_provider is null;

alter table public.organization_ai_settings
  alter column ocr_provider set default 'openai',
  alter column ocr_provider set not null,
  alter column standard_analysis_model set default 'openai',
  alter column standard_analysis_model set not null,
  alter column vision_enhanced_analysis_model set default 'openai_vision',
  alter column vision_enhanced_analysis_model set not null,
  alter column copy_generation_model set default 'openai',
  alter column copy_generation_model set not null,
  alter column marketing_visual_generation_model set default 'openai_image',
  alter column marketing_visual_generation_model set not null,
  alter column location_enrichment_provider set default 'google_maps',
  alter column location_enrichment_provider set not null;

alter table public.organization_ai_settings
  drop constraint if exists organization_ai_settings_ocr_provider_check,
  add constraint organization_ai_settings_ocr_provider_check
    check (ocr_provider in ('openai', 'gemini')),
  drop constraint if exists organization_ai_settings_standard_analysis_model_check,
  add constraint organization_ai_settings_standard_analysis_model_check
    check (standard_analysis_model in ('openai', 'gemini')),
  drop constraint if exists organization_ai_settings_vision_enhanced_analysis_model_check,
  add constraint organization_ai_settings_vision_enhanced_analysis_model_check
    check (vision_enhanced_analysis_model in ('openai_vision', 'gemini_vision')),
  drop constraint if exists organization_ai_settings_copy_generation_model_check,
  add constraint organization_ai_settings_copy_generation_model_check
    check (copy_generation_model in ('openai', 'gemini')),
  drop constraint if exists organization_ai_settings_marketing_visual_generation_model_check,
  add constraint organization_ai_settings_marketing_visual_generation_model_check
    check (marketing_visual_generation_model in ('openai_image', 'gemini_image')),
  drop constraint if exists organization_ai_settings_location_enrichment_provider_check,
  add constraint organization_ai_settings_location_enrichment_provider_check
    check (location_enrichment_provider in ('google_maps'));

alter table public.organization_ai_settings
  drop column if exists location_summary_model;

create table if not exists public.organization_ai_provider_credentials (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  demo_data_type text null check (demo_data_type in ('seed', 'sandbox')),
  provider text not null
    check (provider in ('openai', 'gemini', 'google_maps')),
  api_key_ciphertext text null,
  api_key_last4 text null,
  is_configured boolean not null default false,
  last_test_status text null check (last_test_status in ('ok', 'failed', 'skipped')),
  last_test_message text null,
  last_tested_at timestamptz null,
  updated_by uuid null references public.agents(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_ai_provider_credentials_provider_unique unique (organization_id, provider)
);

alter table public.organization_ai_provider_credentials
  add column if not exists last_test_status text null;
alter table public.organization_ai_provider_credentials
  add column if not exists last_test_message text null;
alter table public.organization_ai_provider_credentials
  add column if not exists last_tested_at timestamptz null;
alter table public.organization_ai_provider_credentials
  add column if not exists updated_by uuid null references public.agents(id) on delete set null;

update public.organization_ai_provider_credentials
set provider = 'gemini'
where provider = 'google_ai';

alter table public.organization_ai_provider_credentials
  drop constraint if exists organization_ai_provider_credentials_provider_check,
  add constraint organization_ai_provider_credentials_provider_check
    check (provider in ('openai', 'gemini', 'google_maps')),
  drop constraint if exists organization_ai_provider_credentials_last_test_status_check,
  add constraint organization_ai_provider_credentials_last_test_status_check
    check (last_test_status is null or last_test_status in ('ok', 'failed', 'skipped'));

create index if not exists idx_organization_ai_settings_org
  on public.organization_ai_settings(organization_id);
create index if not exists idx_organization_ai_provider_credentials_org
  on public.organization_ai_provider_credentials(organization_id, provider);

create or replace function public.set_organization_ai_settings_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.set_organization_ai_provider_credentials_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_organization_ai_settings_set_updated_at on public.organization_ai_settings;
create trigger trg_organization_ai_settings_set_updated_at
before update on public.organization_ai_settings
for each row execute function public.set_organization_ai_settings_updated_at();

drop trigger if exists trg_organization_ai_provider_credentials_set_updated_at on public.organization_ai_provider_credentials;
create trigger trg_organization_ai_provider_credentials_set_updated_at
before update on public.organization_ai_provider_credentials
for each row execute function public.set_organization_ai_provider_credentials_updated_at();

alter table public.organization_ai_settings enable row level security;
alter table public.organization_ai_provider_credentials enable row level security;

drop policy if exists organization_ai_settings_select_same_org on public.organization_ai_settings;
create policy organization_ai_settings_select_same_org
on public.organization_ai_settings
for select
using (
  organization_id = public.current_organization_id()
  and public.current_agent_role() in ('owner', 'super_admin', 'system_admin')
);

drop policy if exists organization_ai_settings_insert_same_org on public.organization_ai_settings;
create policy organization_ai_settings_insert_same_org
on public.organization_ai_settings
for insert
with check (
  organization_id = public.current_organization_id()
  and public.current_agent_role() in ('owner', 'super_admin', 'system_admin')
);

drop policy if exists organization_ai_settings_update_same_org on public.organization_ai_settings;
create policy organization_ai_settings_update_same_org
on public.organization_ai_settings
for update
using (
  organization_id = public.current_organization_id()
  and public.current_agent_role() in ('owner', 'super_admin', 'system_admin')
)
with check (
  organization_id = public.current_organization_id()
  and public.current_agent_role() in ('owner', 'super_admin', 'system_admin')
);

drop policy if exists organization_ai_provider_credentials_select_same_org on public.organization_ai_provider_credentials;
create policy organization_ai_provider_credentials_select_same_org
on public.organization_ai_provider_credentials
for select
using (
  organization_id = public.current_organization_id()
  and public.current_agent_role() in ('owner', 'super_admin', 'system_admin')
);

drop policy if exists organization_ai_provider_credentials_insert_same_org on public.organization_ai_provider_credentials;
create policy organization_ai_provider_credentials_insert_same_org
on public.organization_ai_provider_credentials
for insert
with check (
  organization_id = public.current_organization_id()
  and public.current_agent_role() in ('owner', 'super_admin', 'system_admin')
);

drop policy if exists organization_ai_provider_credentials_update_same_org on public.organization_ai_provider_credentials;
create policy organization_ai_provider_credentials_update_same_org
on public.organization_ai_provider_credentials
for update
using (
  organization_id = public.current_organization_id()
  and public.current_agent_role() in ('owner', 'super_admin', 'system_admin')
)
with check (
  organization_id = public.current_organization_id()
  and public.current_agent_role() in ('owner', 'super_admin', 'system_admin')
);
