-- Dashboard ticker events (deal / birthday / ranking / announce)

create table if not exists public.dashboard_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  type text not null,
  title text null,
  message text not null,
  agent_id uuid null references public.agents(id) on delete set null,
  created_at timestamptz not null default now(),
  start_at timestamptz not null default now(),
  end_at timestamptz null,
  is_active boolean not null default true,
  constraint dashboard_events_type_check
    check (type in ('deal', 'birthday', 'ranking', 'announce')),
  constraint dashboard_events_message_not_blank_check
    check (btrim(message) <> ''),
  constraint dashboard_events_time_window_check
    check (end_at is null or end_at > start_at)
);

create index if not exists idx_dashboard_events_org_id on public.dashboard_events(org_id);
create index if not exists idx_dashboard_events_type on public.dashboard_events(type);
create index if not exists idx_dashboard_events_is_active on public.dashboard_events(is_active);
create index if not exists idx_dashboard_events_start_at on public.dashboard_events(start_at desc);
create index if not exists idx_dashboard_events_end_at on public.dashboard_events(end_at desc);
create index if not exists idx_dashboard_events_created_at on public.dashboard_events(created_at desc);

alter table public.dashboard_events enable row level security;

drop policy if exists dashboard_events_select_same_org on public.dashboard_events;
create policy dashboard_events_select_same_org
on public.dashboard_events
for select
using (org_id = public.current_organization_id());

drop policy if exists dashboard_events_insert_admin_roles on public.dashboard_events;
create policy dashboard_events_insert_admin_roles
on public.dashboard_events
for insert
with check (
  org_id = public.current_organization_id()
  and public.current_agent_role() in ('owner', 'super_admin', 'manager', 'store_manager', 'store_editor')
);

drop policy if exists dashboard_events_update_admin_roles on public.dashboard_events;
create policy dashboard_events_update_admin_roles
on public.dashboard_events
for update
using (
  org_id = public.current_organization_id()
  and public.current_agent_role() in ('owner', 'super_admin', 'manager', 'store_manager', 'store_editor')
)
with check (
  org_id = public.current_organization_id()
  and public.current_agent_role() in ('owner', 'super_admin', 'manager', 'store_manager', 'store_editor')
);

