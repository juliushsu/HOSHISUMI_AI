-- Staging only: organization-level AI assistant backend foundation.
-- Do not add this file to the production migration chain until product/legal review is complete.

create extension if not exists pgcrypto;

create table if not exists public.ai_usage_quotas (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  demo_data_type text null check (demo_data_type in ('seed', 'sandbox')),
  period_month date not null,
  monthly_unit_limit int not null default 100 check (monthly_unit_limit >= 0),
  used_units int not null default 0 check (used_units >= 0),
  reserved_units int not null default 0 check (reserved_units >= 0),
  reset_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_usage_quotas_period_month_start
    check (period_month = date_trunc('month', period_month)::date),
  constraint ai_usage_quotas_used_within_limit
    check (used_units <= monthly_unit_limit),
  constraint ai_usage_quotas_org_period_unique
    unique (organization_id, period_month)
);

create table if not exists public.property_ai_analyses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  demo_data_type text null check (demo_data_type in ('seed', 'sandbox')),
  property_id uuid not null references public.properties(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'superseded', 'failed')),
  analysis_version int not null default 1 check (analysis_version >= 1),
  property_snapshot_json jsonb not null,
  result_json jsonb not null default '{}'::jsonb,
  compliance_flags_json jsonb not null default '[]'::jsonb,
  risk_score numeric(5, 2) null check (risk_score is null or (risk_score >= 0 and risk_score <= 100)),
  provider text null,
  model text null,
  input_tokens int not null default 0 check (input_tokens >= 0),
  output_tokens int not null default 0 check (output_tokens >= 0),
  total_tokens int not null default 0 check (total_tokens >= 0),
  estimated_cost_usd numeric(12, 6) null check (estimated_cost_usd is null or estimated_cost_usd >= 0),
  generated_by uuid null references public.agents(id) on delete set null,
  superseded_by uuid null references public.property_ai_analyses(id) on delete set null,
  superseded_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint property_ai_analyses_snapshot_is_object
    check (jsonb_typeof(property_snapshot_json) = 'object'),
  constraint property_ai_analyses_result_is_object
    check (jsonb_typeof(result_json) = 'object'),
  constraint property_ai_analyses_compliance_flags_is_array
    check (jsonb_typeof(compliance_flags_json) = 'array')
);

create table if not exists public.property_ai_copy_generations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  demo_data_type text null check (demo_data_type in ('seed', 'sandbox')),
  property_id uuid not null references public.properties(id) on delete cascade,
  analysis_id uuid null references public.property_ai_analyses(id) on delete set null,
  channel text not null check (channel in ('fb', 'ig', 'line')),
  prompt_context_json jsonb not null default '{}'::jsonb,
  ai_output_text text not null,
  edited_output_text text null,
  compliance_flags_json jsonb not null default '[]'::jsonb,
  risk_score numeric(5, 2) null check (risk_score is null or (risk_score >= 0 and risk_score <= 100)),
  provider text null,
  model text null,
  input_tokens int not null default 0 check (input_tokens >= 0),
  output_tokens int not null default 0 check (output_tokens >= 0),
  total_tokens int not null default 0 check (total_tokens >= 0),
  estimated_cost_usd numeric(12, 6) null check (estimated_cost_usd is null or estimated_cost_usd >= 0),
  generated_by uuid null references public.agents(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint property_ai_copy_prompt_context_is_object
    check (jsonb_typeof(prompt_context_json) = 'object'),
  constraint property_ai_copy_compliance_flags_is_array
    check (jsonb_typeof(compliance_flags_json) = 'array')
);

create table if not exists public.property_ai_copy_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  demo_data_type text null check (demo_data_type in ('seed', 'sandbox')),
  copy_generation_id uuid not null references public.property_ai_copy_generations(id) on delete cascade,
  version_number int not null check (version_number >= 1),
  source text not null check (source in ('ai', 'manual_edit')),
  output_text text not null,
  compliance_flags_json jsonb not null default '[]'::jsonb,
  risk_score numeric(5, 2) null check (risk_score is null or (risk_score >= 0 and risk_score <= 100)),
  edited_by uuid null references public.agents(id) on delete set null,
  edit_reason text null,
  audit_metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint property_ai_copy_versions_flags_is_array
    check (jsonb_typeof(compliance_flags_json) = 'array'),
  constraint property_ai_copy_versions_audit_is_object
    check (jsonb_typeof(audit_metadata_json) = 'object'),
  constraint property_ai_copy_versions_unique
    unique (copy_generation_id, version_number)
);

create table if not exists public.ai_usage_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  demo_data_type text null check (demo_data_type in ('seed', 'sandbox')),
  agent_id uuid null references public.agents(id) on delete set null,
  period_month date not null,
  event_type text not null check (event_type in ('analysis', 'copy_generation')),
  units int not null default 1 check (units > 0),
  property_id uuid null references public.properties(id) on delete set null,
  analysis_id uuid null references public.property_ai_analyses(id) on delete set null,
  copy_generation_id uuid null references public.property_ai_copy_generations(id) on delete set null,
  provider text null,
  model text null,
  input_tokens int not null default 0 check (input_tokens >= 0),
  output_tokens int not null default 0 check (output_tokens >= 0),
  total_tokens int not null default 0 check (total_tokens >= 0),
  estimated_cost_usd numeric(12, 6) null check (estimated_cost_usd is null or estimated_cost_usd >= 0),
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint ai_usage_events_period_month_start
    check (period_month = date_trunc('month', period_month)::date),
  constraint ai_usage_events_metadata_is_object
    check (jsonb_typeof(metadata_json) = 'object')
);

create unique index if not exists uq_property_ai_analyses_active
  on public.property_ai_analyses(organization_id, property_id)
  where status = 'active';

create index if not exists idx_ai_usage_quotas_org_period
  on public.ai_usage_quotas(organization_id, period_month);
create index if not exists idx_ai_usage_events_org_period
  on public.ai_usage_events(organization_id, period_month);
create index if not exists idx_ai_usage_events_property
  on public.ai_usage_events(property_id);
create index if not exists idx_property_ai_analyses_org_property
  on public.property_ai_analyses(organization_id, property_id, created_at desc);
create index if not exists idx_property_ai_analyses_status
  on public.property_ai_analyses(status);
create index if not exists idx_property_ai_copy_org_property
  on public.property_ai_copy_generations(organization_id, property_id, created_at desc);
create index if not exists idx_property_ai_copy_versions_generation
  on public.property_ai_copy_versions(copy_generation_id, version_number desc);

create or replace function public.set_ai_usage_quotas_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.set_property_ai_analyses_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.set_property_ai_copy_generations_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_ai_usage_quotas_set_updated_at on public.ai_usage_quotas;
create trigger trg_ai_usage_quotas_set_updated_at
before update on public.ai_usage_quotas
for each row execute function public.set_ai_usage_quotas_updated_at();

drop trigger if exists trg_property_ai_analyses_set_updated_at on public.property_ai_analyses;
create trigger trg_property_ai_analyses_set_updated_at
before update on public.property_ai_analyses
for each row execute function public.set_property_ai_analyses_updated_at();

drop trigger if exists trg_property_ai_copy_generations_set_updated_at on public.property_ai_copy_generations;
create trigger trg_property_ai_copy_generations_set_updated_at
before update on public.property_ai_copy_generations
for each row execute function public.set_property_ai_copy_generations_updated_at();

create or replace function public.consume_ai_usage_quota(
  p_organization_id uuid,
  p_period_month date,
  p_units int,
  p_default_limit int default 100
)
returns table (
  allowed boolean,
  monthly_unit_limit int,
  used_units int,
  remaining_units int
)
language plpgsql
security definer
set search_path = public
as $$
declare
  quota_row public.ai_usage_quotas%rowtype;
begin
  if auth.role() <> 'service_role' and p_organization_id <> public.current_organization_id() then
    raise exception 'organization scope mismatch';
  end if;

  if p_units is null or p_units <= 0 then
    raise exception 'p_units must be positive';
  end if;

  insert into public.ai_usage_quotas (
    organization_id,
    period_month,
    monthly_unit_limit,
    reset_at
  )
  values (
    p_organization_id,
    p_period_month,
    p_default_limit,
    (p_period_month + interval '1 month')::timestamptz
  )
  on conflict (organization_id, period_month) do nothing;

  select *
  into quota_row
  from public.ai_usage_quotas
  where organization_id = p_organization_id
    and period_month = p_period_month
  for update;

  if quota_row.used_units + p_units > quota_row.monthly_unit_limit then
    return query
    select
      false,
      quota_row.monthly_unit_limit,
      quota_row.used_units,
      greatest(quota_row.monthly_unit_limit - quota_row.used_units, 0);
    return;
  end if;

  update public.ai_usage_quotas as quota
  set used_units = quota.used_units + p_units
  where quota.id = quota_row.id
  returning * into quota_row;

  return query
  select
    true,
    quota_row.monthly_unit_limit,
    quota_row.used_units,
    greatest(quota_row.monthly_unit_limit - quota_row.used_units, 0);
end;
$$;

create or replace function public.ensure_ai_usage_quota(
  p_organization_id uuid,
  p_period_month date,
  p_default_limit int default 100
)
returns table (
  period_month date,
  monthly_unit_limit int,
  used_units int,
  reserved_units int,
  reset_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  quota_row public.ai_usage_quotas%rowtype;
begin
  if auth.role() <> 'service_role' and p_organization_id <> public.current_organization_id() then
    raise exception 'organization scope mismatch';
  end if;

  insert into public.ai_usage_quotas (
    organization_id,
    period_month,
    monthly_unit_limit,
    reset_at
  )
  values (
    p_organization_id,
    p_period_month,
    p_default_limit,
    (p_period_month + interval '1 month')::timestamptz
  )
  on conflict (organization_id, period_month) do nothing;

  select *
  into quota_row
  from public.ai_usage_quotas
  where organization_id = p_organization_id
    and period_month = p_period_month;

  return query
  select
    quota_row.period_month,
    quota_row.monthly_unit_limit,
    quota_row.used_units,
    quota_row.reserved_units,
    quota_row.reset_at;
end;
$$;

create or replace function public.refund_ai_usage_quota(
  p_organization_id uuid,
  p_period_month date,
  p_units int
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() <> 'service_role' and p_organization_id <> public.current_organization_id() then
    raise exception 'organization scope mismatch';
  end if;

  update public.ai_usage_quotas as quota
  set used_units = greatest(quota.used_units - greatest(coalesce(p_units, 0), 0), 0)
  where quota.organization_id = p_organization_id
    and quota.period_month = p_period_month;
end;
$$;

grant execute on function public.consume_ai_usage_quota(uuid, date, int, int) to authenticated, service_role;
grant execute on function public.ensure_ai_usage_quota(uuid, date, int) to authenticated, service_role;
grant execute on function public.refund_ai_usage_quota(uuid, date, int) to authenticated, service_role;

alter table public.ai_usage_quotas enable row level security;
alter table public.ai_usage_events enable row level security;
alter table public.property_ai_analyses enable row level security;
alter table public.property_ai_copy_generations enable row level security;
alter table public.property_ai_copy_versions enable row level security;

drop policy if exists ai_usage_quotas_select_same_org on public.ai_usage_quotas;
create policy ai_usage_quotas_select_same_org
on public.ai_usage_quotas
for select
using (
  organization_id = public.current_organization_id()
  and public.current_agent_role() in ('owner', 'super_admin', 'manager', 'store_manager', 'store_editor')
);

drop policy if exists ai_usage_events_select_same_org on public.ai_usage_events;
create policy ai_usage_events_select_same_org
on public.ai_usage_events
for select
using (
  organization_id = public.current_organization_id()
  and public.current_agent_role() in ('owner', 'super_admin', 'manager', 'store_manager', 'store_editor')
);

drop policy if exists ai_usage_events_insert_same_org on public.ai_usage_events;
create policy ai_usage_events_insert_same_org
on public.ai_usage_events
for insert
with check (
  organization_id = public.current_organization_id()
  and public.current_agent_role() in ('owner', 'super_admin', 'manager', 'store_manager', 'store_editor')
);

drop policy if exists property_ai_analyses_select_same_org on public.property_ai_analyses;
create policy property_ai_analyses_select_same_org
on public.property_ai_analyses
for select
using (
  organization_id = public.current_organization_id()
  and public.current_agent_role() in ('owner', 'super_admin', 'manager', 'store_manager', 'store_editor')
);

drop policy if exists property_ai_analyses_insert_same_org on public.property_ai_analyses;
create policy property_ai_analyses_insert_same_org
on public.property_ai_analyses
for insert
with check (
  organization_id = public.current_organization_id()
  and public.current_agent_role() in ('owner', 'super_admin', 'manager', 'store_manager', 'store_editor')
);

drop policy if exists property_ai_analyses_update_same_org on public.property_ai_analyses;
create policy property_ai_analyses_update_same_org
on public.property_ai_analyses
for update
using (
  organization_id = public.current_organization_id()
  and public.current_agent_role() in ('owner', 'super_admin', 'manager', 'store_manager', 'store_editor')
)
with check (
  organization_id = public.current_organization_id()
  and public.current_agent_role() in ('owner', 'super_admin', 'manager', 'store_manager', 'store_editor')
);

drop policy if exists property_ai_copy_generations_select_same_org on public.property_ai_copy_generations;
create policy property_ai_copy_generations_select_same_org
on public.property_ai_copy_generations
for select
using (
  organization_id = public.current_organization_id()
  and public.current_agent_role() in ('owner', 'super_admin', 'manager', 'store_manager', 'store_editor')
);

drop policy if exists property_ai_copy_generations_insert_same_org on public.property_ai_copy_generations;
create policy property_ai_copy_generations_insert_same_org
on public.property_ai_copy_generations
for insert
with check (
  organization_id = public.current_organization_id()
  and public.current_agent_role() in ('owner', 'super_admin', 'manager', 'store_manager', 'store_editor')
);

drop policy if exists property_ai_copy_generations_update_same_org on public.property_ai_copy_generations;
create policy property_ai_copy_generations_update_same_org
on public.property_ai_copy_generations
for update
using (
  organization_id = public.current_organization_id()
  and public.current_agent_role() in ('owner', 'super_admin', 'manager', 'store_manager', 'store_editor')
)
with check (
  organization_id = public.current_organization_id()
  and public.current_agent_role() in ('owner', 'super_admin', 'manager', 'store_manager', 'store_editor')
);

drop policy if exists property_ai_copy_versions_select_same_org on public.property_ai_copy_versions;
create policy property_ai_copy_versions_select_same_org
on public.property_ai_copy_versions
for select
using (
  organization_id = public.current_organization_id()
  and public.current_agent_role() in ('owner', 'super_admin', 'manager', 'store_manager', 'store_editor')
);

drop policy if exists property_ai_copy_versions_insert_same_org on public.property_ai_copy_versions;
create policy property_ai_copy_versions_insert_same_org
on public.property_ai_copy_versions
for insert
with check (
  organization_id = public.current_organization_id()
  and public.current_agent_role() in ('owner', 'super_admin', 'manager', 'store_manager', 'store_editor')
);
