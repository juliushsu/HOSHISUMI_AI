-- 星澄地所 HOSHISUMI MVP backend schema
create extension if not exists pgcrypto;

-- Helper: safely cast text to UUID (invalid text -> NULL)
create or replace function public.try_parse_uuid(value text)
returns uuid
language sql
immutable
as $$
  select case
    when value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then value::uuid
    else null
  end;
$$;

-- Helper: read JWT claims from direct/app_metadata/user_metadata.
create or replace function public.jwt_claim_text(claim text)
returns text
language sql
stable
as $$
  select coalesce(
    auth.jwt() ->> claim,
    auth.jwt() -> 'app_metadata' ->> claim,
    auth.jwt() -> 'user_metadata' ->> claim
  );
$$;

create or replace function public.current_organization_id()
returns uuid
language sql
stable
as $$
  select public.try_parse_uuid(public.jwt_claim_text('organization_id'));
$$;

create or replace function public.current_agent_id()
returns uuid
language sql
stable
as $$
  select public.try_parse_uuid(public.jwt_claim_text('agent_id'));
$$;

create or replace function public.current_agent_role()
returns text
language sql
stable
as $$
  select lower(coalesce(public.jwt_claim_text('role'), ''));
$$;

create or replace function public.is_owner_or_manager()
returns boolean
language sql
stable
as $$
  select public.current_agent_role() in ('owner', 'manager');
$$;

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  plan_type text not null check (plan_type in ('basic', 'pro', 'ai')),
  created_at timestamptz not null default now()
);

create table if not exists public.agents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  role text not null check (role in ('owner', 'manager', 'agent')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  assigned_agent_id uuid references public.agents(id) on delete set null,
  name text not null,
  phone text,
  line_id text,
  client_type text not null check (client_type in ('investment', 'self_use', 'japan')),
  consent_property_tw boolean not null default false,
  consent_property_jp boolean not null default false,
  consent_contact_line boolean not null default false,
  consent_contact_phone boolean not null default false,
  consent_post_sale_follow boolean not null default false,
  unsubscribe_all boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.properties (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null,
  description text,
  price numeric(14, 2) not null check (price >= 0),
  country text not null check (country in ('tw', 'jp')),
  status text not null check (status in ('available', 'negotiating', 'sold')),
  source text not null check (source in ('manual', 'import', 'api')),
  created_at timestamptz not null default now()
);

create table if not exists public.ai_usage_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  agent_id uuid references public.agents(id) on delete set null,
  action_type text not null,
  tokens_used int not null default 0 check (tokens_used >= 0),
  created_at timestamptz not null default now()
);

create index if not exists idx_agents_org on public.agents(organization_id);
create index if not exists idx_clients_org on public.clients(organization_id);
create index if not exists idx_clients_assigned_agent on public.clients(assigned_agent_id);
create index if not exists idx_properties_org on public.properties(organization_id);
create index if not exists idx_properties_status on public.properties(status);
create index if not exists idx_ai_usage_logs_org on public.ai_usage_logs(organization_id);
create index if not exists idx_ai_usage_logs_agent on public.ai_usage_logs(agent_id);

alter table public.organizations enable row level security;
alter table public.agents enable row level security;
alter table public.clients enable row level security;
alter table public.properties enable row level security;
alter table public.ai_usage_logs enable row level security;

-- organizations: only current organization members can read; owner/manager can update.
drop policy if exists organizations_select_same_org on public.organizations;
create policy organizations_select_same_org
on public.organizations
for select
using (id = public.current_organization_id());

drop policy if exists organizations_update_owner_manager on public.organizations;
create policy organizations_update_owner_manager
on public.organizations
for update
using (
  id = public.current_organization_id()
  and public.is_owner_or_manager()
)
with check (
  id = public.current_organization_id()
  and public.is_owner_or_manager()
);

-- agents: owner/manager can read all org agents; normal agent can read self row.
drop policy if exists agents_select_by_role on public.agents;
create policy agents_select_by_role
on public.agents
for select
using (
  organization_id = public.current_organization_id()
  and (
    public.is_owner_or_manager()
    or id = public.current_agent_id()
  )
);

drop policy if exists agents_insert_owner_manager on public.agents;
create policy agents_insert_owner_manager
on public.agents
for insert
with check (
  organization_id = public.current_organization_id()
  and public.is_owner_or_manager()
);

drop policy if exists agents_update_owner_manager_or_self on public.agents;
create policy agents_update_owner_manager_or_self
on public.agents
for update
using (
  organization_id = public.current_organization_id()
  and (
    public.is_owner_or_manager()
    or id = public.current_agent_id()
  )
)
with check (
  organization_id = public.current_organization_id()
  and (
    public.is_owner_or_manager()
    or id = public.current_agent_id()
  )
);

-- clients: owner/manager can read all org clients; normal agent can only read assigned/unassigned leads.
drop policy if exists clients_select_by_role on public.clients;
create policy clients_select_by_role
on public.clients
for select
using (
  organization_id = public.current_organization_id()
  and (
    public.is_owner_or_manager()
    or assigned_agent_id = public.current_agent_id()
    or assigned_agent_id is null
  )
);

drop policy if exists clients_insert_by_role on public.clients;
create policy clients_insert_by_role
on public.clients
for insert
with check (
  organization_id = public.current_organization_id()
  and (
    public.is_owner_or_manager()
    or assigned_agent_id = public.current_agent_id()
    or assigned_agent_id is null
  )
);

drop policy if exists clients_update_by_role on public.clients;
create policy clients_update_by_role
on public.clients
for update
using (
  organization_id = public.current_organization_id()
  and (
    public.is_owner_or_manager()
    or assigned_agent_id = public.current_agent_id()
  )
)
with check (
  organization_id = public.current_organization_id()
  and (
    public.is_owner_or_manager()
    or assigned_agent_id = public.current_agent_id()
  )
);

-- properties: organization-level shared data; all org agents can read/insert/update.
drop policy if exists properties_select_same_org on public.properties;
create policy properties_select_same_org
on public.properties
for select
using (organization_id = public.current_organization_id());

drop policy if exists properties_insert_same_org on public.properties;
create policy properties_insert_same_org
on public.properties
for insert
with check (organization_id = public.current_organization_id());

drop policy if exists properties_update_same_org on public.properties;
create policy properties_update_same_org
on public.properties
for update
using (organization_id = public.current_organization_id())
with check (organization_id = public.current_organization_id());

-- ai usage logs: owner/manager can read all; normal agent can read own.
drop policy if exists ai_usage_logs_select_by_role on public.ai_usage_logs;
create policy ai_usage_logs_select_by_role
on public.ai_usage_logs
for select
using (
  organization_id = public.current_organization_id()
  and (
    public.is_owner_or_manager()
    or agent_id = public.current_agent_id()
  )
);

drop policy if exists ai_usage_logs_insert_same_org on public.ai_usage_logs;
create policy ai_usage_logs_insert_same_org
on public.ai_usage_logs
for insert
with check (
  organization_id = public.current_organization_id()
  and (
    public.is_owner_or_manager()
    or agent_id = public.current_agent_id()
  )
);
