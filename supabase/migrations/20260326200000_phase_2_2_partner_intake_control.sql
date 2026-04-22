-- Phase 2.2: partner authorization + intake control (minimal data layer)

create table if not exists public.partners (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  display_name text not null,
  country text not null default 'jp',
  status text not null check (status in ('active', 'suspended')),
  default_fee_percent numeric(6, 2) not null default 1.0 check (default_fee_percent >= 0),
  line_intake_enabled boolean not null default false,
  upload_intake_enabled boolean not null default true,
  api_intake_enabled boolean not null default false,
  partner_slug text not null unique,
  intake_token text unique null,
  contact_email text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.partner_users (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners(id) on delete cascade,
  name text not null,
  email text not null,
  role text not null check (role in ('admin', 'staff')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.partner_authorizations (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  is_exclusive boolean not null default false,
  is_active boolean not null default true,
  default_owner_agent_id uuid null references public.agents(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (partner_id, organization_id)
);

alter table public.properties
  add column if not exists partner_id uuid null references public.partners(id) on delete set null,
  add column if not exists intake_status text,
  add column if not exists raw_source_files_count int not null default 0,
  add column if not exists updated_at timestamptz not null default now();

update public.properties
set intake_status = coalesce(intake_status, 'imported')
where intake_status is null;

alter table public.properties
  alter column intake_status set default 'imported',
  alter column intake_status set not null;

alter table public.properties
  drop constraint if exists properties_intake_status_check,
  add constraint properties_intake_status_check
    check (intake_status in ('imported', 'analyzing', 'pending_review', 'ready_to_publish', 'assigned')),
  drop constraint if exists properties_raw_source_files_count_check,
  add constraint properties_raw_source_files_count_check
    check (raw_source_files_count >= 0);

create index if not exists idx_properties_partner_id on public.properties(partner_id);
create index if not exists idx_partners_status on public.partners(status);
create index if not exists idx_partners_partner_slug on public.partners(partner_slug);
create index if not exists idx_partner_users_partner_id on public.partner_users(partner_id);
create index if not exists idx_partner_authorizations_partner_id on public.partner_authorizations(partner_id);
create index if not exists idx_partner_authorizations_org_id on public.partner_authorizations(organization_id);

create or replace function public.set_partners_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_partners_set_updated_at on public.partners;
create trigger trg_partners_set_updated_at
before update on public.partners
for each row
execute function public.set_partners_updated_at();

alter table public.partners enable row level security;
alter table public.partner_users enable row level security;
alter table public.partner_authorizations enable row level security;

-- Partners are visible only when currently authorized for caller organization.
drop policy if exists partners_select_authorized_org on public.partners;
create policy partners_select_authorized_org
on public.partners
for select
using (
  exists (
    select 1
    from public.partner_authorizations pa
    where pa.partner_id = partners.id
      and pa.organization_id = public.current_organization_id()
      and pa.is_active = true
  )
);

-- Authorization rows are readable within current organization.
drop policy if exists partner_authorizations_select_owner_manager on public.partner_authorizations;
drop policy if exists partner_authorizations_select_same_org on public.partner_authorizations;
create policy partner_authorizations_select_same_org
on public.partner_authorizations
for select
using (
  organization_id = public.current_organization_id()
);

-- partner_users intentionally has no authenticated policies:
-- no direct read/write for regular organization users.
