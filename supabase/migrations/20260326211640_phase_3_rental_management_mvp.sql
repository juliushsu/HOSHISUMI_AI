-- Phase 3: Rental + Management MVP (lifecycle extension on existing properties)

alter table public.properties
  add column if not exists service_types text[] not null default '{}',
  add column if not exists current_stage text null,
  add column if not exists owner_client_id uuid null references public.clients(id) on delete set null,
  add column if not exists is_rental_enabled boolean not null default false,
  add column if not exists is_management_enabled boolean not null default false;

alter table public.properties
  drop constraint if exists properties_service_types_check,
  add constraint properties_service_types_check
    check (
      array_position(service_types, null) is null
      and service_types <@ array['sale', 'rental', 'management']::text[]
    ),
  drop constraint if exists properties_current_stage_check,
  add constraint properties_current_stage_check
    check (
      current_stage is null
      or current_stage in (
        'sale_active',
        'sold',
        'rental_listing',
        'rental_showing',
        'rental_negotiating',
        'rented',
        'under_management',
        'vacancy',
        'resale_ready'
      )
    );

create index if not exists idx_properties_owner_client_id on public.properties(owner_client_id);
create index if not exists idx_properties_current_stage on public.properties(current_stage);

create table if not exists public.rental_cases (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  owner_client_id uuid null references public.clients(id) on delete set null,
  listing_status text not null default 'draft',
  expected_rent numeric null,
  actual_rent numeric null,
  available_from date null,
  rented_at timestamptz null,
  created_by_agent_id uuid null references public.agents(id) on delete set null,
  updated_by_agent_id uuid null references public.agents(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rental_cases_listing_status_check
    check (listing_status in ('draft', 'listed', 'showing', 'negotiating', 'rented'))
);

create index if not exists idx_rental_cases_org_id on public.rental_cases(organization_id);
create index if not exists idx_rental_cases_property_id on public.rental_cases(property_id);
create index if not exists idx_rental_cases_listing_status on public.rental_cases(listing_status);

create table if not exists public.management_cases (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  owner_client_id uuid null references public.clients(id) on delete set null,
  rent numeric null,
  rent_due_day int null,
  management_fee numeric null,
  lease_start date null,
  lease_end date null,
  status text not null default 'active',
  tenant_name text null,
  created_by_agent_id uuid null references public.agents(id) on delete set null,
  updated_by_agent_id uuid null references public.agents(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint management_cases_status_check
    check (status in ('active', 'vacancy', 'terminated')),
  constraint management_cases_rent_due_day_check
    check (rent_due_day is null or (rent_due_day >= 1 and rent_due_day <= 31))
);

create index if not exists idx_management_cases_org_id on public.management_cases(organization_id);
create index if not exists idx_management_cases_property_id on public.management_cases(property_id);
create index if not exists idx_management_cases_status on public.management_cases(status);

create table if not exists public.management_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  management_case_id uuid not null references public.management_cases(id) on delete cascade,
  event_type text not null,
  title text not null,
  description text null,
  amount numeric null,
  event_date timestamptz not null default now(),
  created_by_agent_id uuid null references public.agents(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint management_events_event_type_check
    check (event_type in ('rent_received', 'repair', 'tenant_issue', 'inspection'))
);

create index if not exists idx_management_events_org_id on public.management_events(organization_id);
create index if not exists idx_management_events_case_id on public.management_events(management_case_id);
create index if not exists idx_management_events_event_type on public.management_events(event_type);
create index if not exists idx_management_events_event_date_desc on public.management_events(event_date desc);

create or replace function public.set_rental_cases_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_rental_cases_set_updated_at on public.rental_cases;
create trigger trg_rental_cases_set_updated_at
before update on public.rental_cases
for each row
execute function public.set_rental_cases_updated_at();

create or replace function public.set_management_cases_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_management_cases_set_updated_at on public.management_cases;
create trigger trg_management_cases_set_updated_at
before update on public.management_cases
for each row
execute function public.set_management_cases_updated_at();

alter table public.rental_cases enable row level security;
alter table public.management_cases enable row level security;
alter table public.management_events enable row level security;

drop policy if exists rental_cases_select_same_org on public.rental_cases;
create policy rental_cases_select_same_org
on public.rental_cases
for select
using (organization_id = public.current_organization_id());

drop policy if exists rental_cases_insert_same_org on public.rental_cases;
create policy rental_cases_insert_same_org
on public.rental_cases
for insert
with check (organization_id = public.current_organization_id());

drop policy if exists rental_cases_update_same_org on public.rental_cases;
create policy rental_cases_update_same_org
on public.rental_cases
for update
using (organization_id = public.current_organization_id())
with check (organization_id = public.current_organization_id());

drop policy if exists management_cases_select_same_org on public.management_cases;
create policy management_cases_select_same_org
on public.management_cases
for select
using (organization_id = public.current_organization_id());

drop policy if exists management_cases_insert_same_org on public.management_cases;
create policy management_cases_insert_same_org
on public.management_cases
for insert
with check (organization_id = public.current_organization_id());

drop policy if exists management_cases_update_same_org on public.management_cases;
create policy management_cases_update_same_org
on public.management_cases
for update
using (organization_id = public.current_organization_id())
with check (organization_id = public.current_organization_id());

drop policy if exists management_events_select_same_org on public.management_events;
create policy management_events_select_same_org
on public.management_events
for select
using (organization_id = public.current_organization_id());

drop policy if exists management_events_insert_owner_manager on public.management_events;
create policy management_events_insert_owner_manager
on public.management_events
for insert
with check (
  organization_id = public.current_organization_id()
  and public.is_owner_or_manager()
);

drop policy if exists management_events_update_owner_manager on public.management_events;
create policy management_events_update_owner_manager
on public.management_events
for update
using (
  organization_id = public.current_organization_id()
  and public.is_owner_or_manager()
)
with check (
  organization_id = public.current_organization_id()
  and public.is_owner_or_manager()
);
