-- Phase: Dashboard latest-activity feed upgrade
-- Canonical activity DTO source for /api/dashboard/summary recent_activities

create table if not exists public.dashboard_activities (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  actor_name text not null,
  actor_role text not null,
  action_type text not null,
  target_type text not null,
  target_id uuid null,
  target_name text not null,
  summary_text text not null,
  created_at timestamptz not null default now(),
  priority text not null default 'low',
  requires_attention boolean not null default false,
  related_status text null,
  demo_data_type text null,
  constraint dashboard_activities_actor_name_not_blank_check
    check (btrim(actor_name) <> ''),
  constraint dashboard_activities_actor_role_not_blank_check
    check (btrim(actor_role) <> ''),
  constraint dashboard_activities_action_type_not_blank_check
    check (btrim(action_type) <> ''),
  constraint dashboard_activities_target_type_not_blank_check
    check (btrim(target_type) <> ''),
  constraint dashboard_activities_target_name_not_blank_check
    check (btrim(target_name) <> ''),
  constraint dashboard_activities_summary_text_not_blank_check
    check (btrim(summary_text) <> ''),
  constraint dashboard_activities_priority_check
    check (priority in ('high', 'medium', 'low')),
  constraint dashboard_activities_demo_data_type_check
    check (demo_data_type in ('seed', 'sandbox') or demo_data_type is null)
);

create index if not exists idx_dashboard_activities_org_id
  on public.dashboard_activities(org_id);
create index if not exists idx_dashboard_activities_created_at
  on public.dashboard_activities(created_at desc);
create index if not exists idx_dashboard_activities_attention_priority_created
  on public.dashboard_activities(requires_attention desc, priority, created_at desc);
create index if not exists idx_dashboard_activities_demo_data_type
  on public.dashboard_activities(org_id, demo_data_type);
create index if not exists idx_dashboard_activities_target
  on public.dashboard_activities(target_type, target_id);

alter table public.dashboard_activities enable row level security;

drop policy if exists dashboard_activities_select_same_org on public.dashboard_activities;
create policy dashboard_activities_select_same_org
on public.dashboard_activities
for select
using (org_id = public.current_organization_id());

drop policy if exists dashboard_activities_insert_admin_roles on public.dashboard_activities;
create policy dashboard_activities_insert_admin_roles
on public.dashboard_activities
for insert
with check (
  org_id = public.current_organization_id()
  and public.current_agent_role() in ('owner', 'super_admin', 'manager', 'store_manager', 'store_editor')
);

drop policy if exists dashboard_activities_update_admin_roles on public.dashboard_activities;
create policy dashboard_activities_update_admin_roles
on public.dashboard_activities
for update
using (
  org_id = public.current_organization_id()
  and public.current_agent_role() in ('owner', 'super_admin', 'manager', 'store_manager', 'store_editor')
)
with check (
  org_id = public.current_organization_id()
  and public.current_agent_role() in ('owner', 'super_admin', 'manager', 'store_manager', 'store_editor')
);

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

  delete from public.dashboard_activities
  where org_id = demo_org
    and demo_data_type = 'sandbox';
end;
$$;
