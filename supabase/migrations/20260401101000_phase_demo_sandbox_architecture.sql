-- Phase D2: Demo Sandbox architecture (seed + sandbox dual-layer)
-- Goal: demo data is operable but isolated from formal business data.

alter table public.organizations
  add column if not exists organization_code text null;

create unique index if not exists uq_organizations_organization_code
  on public.organizations(organization_code)
  where organization_code is not null;

alter table public.agents
  add column if not exists is_demo boolean not null default false;

create index if not exists idx_agents_is_demo on public.agents(is_demo);

create table if not exists public.admin_profiles (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  role text not null,
  org_id uuid null references public.organizations(id) on delete set null,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint admin_profiles_email_not_blank_check
    check (btrim(email) <> ''),
  constraint admin_profiles_role_check
    check (role in ('owner', 'super_admin', 'manager', 'store_manager', 'store_editor', 'agent'))
);

alter table public.admin_profiles
  add column if not exists email text,
  add column if not exists role text,
  add column if not exists org_id uuid null references public.organizations(id) on delete set null,
  add column if not exists is_demo boolean not null default false,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

update public.admin_profiles
set
  is_demo = coalesce(is_demo, false),
  created_at = coalesce(created_at, now()),
  updated_at = coalesce(updated_at, now())
where
  is_demo is null
  or created_at is null
  or updated_at is null;

alter table public.admin_profiles
  alter column email set not null,
  alter column role set not null,
  alter column is_demo set default false,
  alter column is_demo set not null,
  alter column created_at set default now(),
  alter column created_at set not null,
  alter column updated_at set default now(),
  alter column updated_at set not null;

alter table public.admin_profiles
  drop constraint if exists admin_profiles_email_not_blank_check,
  add constraint admin_profiles_email_not_blank_check
    check (btrim(email) <> ''),
  drop constraint if exists admin_profiles_role_check,
  add constraint admin_profiles_role_check
    check (role in ('owner', 'super_admin', 'manager', 'store_manager', 'store_editor', 'agent'));

create unique index if not exists uq_admin_profiles_email_exact on public.admin_profiles(email);
create unique index if not exists uq_admin_profiles_email on public.admin_profiles(lower(email));
create index if not exists idx_admin_profiles_org_id on public.admin_profiles(org_id);
create index if not exists idx_admin_profiles_is_demo on public.admin_profiles(is_demo);

alter table public.admin_profiles enable row level security;

drop policy if exists admin_profiles_select_same_org on public.admin_profiles;
create policy admin_profiles_select_same_org
on public.admin_profiles
for select
to authenticated
using (
  org_id = public.current_organization_id()
  and public.current_agent_role() in ('owner', 'super_admin', 'manager', 'store_manager', 'store_editor')
);

create or replace function public.set_admin_profiles_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_admin_profiles_set_updated_at on public.admin_profiles;
create trigger trg_admin_profiles_set_updated_at
before update on public.admin_profiles
for each row
execute function public.set_admin_profiles_updated_at();

alter table public.clients
  add column if not exists demo_data_type text null;

alter table public.clients
  drop constraint if exists clients_demo_data_type_check,
  add constraint clients_demo_data_type_check
    check (demo_data_type in ('seed', 'sandbox') or demo_data_type is null);

create index if not exists idx_clients_org_demo_data_type
  on public.clients(organization_id, demo_data_type);

alter table public.properties
  add column if not exists demo_data_type text null;

alter table public.properties
  drop constraint if exists properties_demo_data_type_check,
  add constraint properties_demo_data_type_check
    check (demo_data_type in ('seed', 'sandbox') or demo_data_type is null);

create index if not exists idx_properties_org_demo_data_type
  on public.properties(organization_id, demo_data_type);

alter table public.leads
  add column if not exists demo_data_type text null;

alter table public.leads
  drop constraint if exists leads_demo_data_type_check,
  add constraint leads_demo_data_type_check
    check (demo_data_type in ('seed', 'sandbox') or demo_data_type is null);

create index if not exists idx_leads_org_demo_data_type
  on public.leads(organization_id, demo_data_type);

alter table public.ai_usage_logs
  add column if not exists demo_data_type text null;

alter table public.ai_usage_logs
  drop constraint if exists ai_usage_logs_demo_data_type_check,
  add constraint ai_usage_logs_demo_data_type_check
    check (demo_data_type in ('seed', 'sandbox') or demo_data_type is null);

create index if not exists idx_ai_usage_logs_org_demo_data_type
  on public.ai_usage_logs(organization_id, demo_data_type);

-- Optional tables: tasks / notes (if present in future).
do $$
begin
  if to_regclass('public.tasks') is not null then
    execute $stmt$
      alter table public.tasks
        add column if not exists demo_data_type text null
    $stmt$;
    execute $stmt$
      alter table public.tasks
        drop constraint if exists tasks_demo_data_type_check,
        add constraint tasks_demo_data_type_check
          check (demo_data_type in ('seed', 'sandbox') or demo_data_type is null)
    $stmt$;
  end if;

  if to_regclass('public.notes') is not null then
    execute $stmt$
      alter table public.notes
        add column if not exists demo_data_type text null
    $stmt$;
    execute $stmt$
      alter table public.notes
        drop constraint if exists notes_demo_data_type_check,
        add constraint notes_demo_data_type_check
          check (demo_data_type in ('seed', 'sandbox') or demo_data_type is null)
    $stmt$;
  end if;
end
$$;

create or replace function public.reset_demo_sandbox()
returns void
language plpgsql
as $$
declare
  demo_org uuid;
begin
  select id
  into demo_org
  from public.organizations
  where organization_code = 'DEMO_ORG'
  limit 1;

  if demo_org is null then
    return;
  end if;

  delete from public.clients
  where organization_id = demo_org
    and demo_data_type = 'sandbox';

  delete from public.properties
  where organization_id = demo_org
    and demo_data_type = 'sandbox';

  delete from public.leads
  where organization_id = demo_org
    and demo_data_type = 'sandbox';

  delete from public.ai_usage_logs
  where organization_id = demo_org
    and demo_data_type = 'sandbox';
end;
$$;
