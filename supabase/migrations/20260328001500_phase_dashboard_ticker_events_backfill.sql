-- Backfill/normalize dashboard_events when table already existed before formal migration.

update public.dashboard_events
set
  created_at = coalesce(created_at, now()),
  start_at = coalesce(start_at, now()),
  is_active = coalesce(is_active, true)
where
  created_at is null
  or start_at is null
  or is_active is null;

alter table public.dashboard_events
  alter column created_at set default now(),
  alter column created_at set not null,
  alter column start_at set default now(),
  alter column start_at set not null,
  alter column is_active set default true,
  alter column is_active set not null;

alter table public.dashboard_events
  drop constraint if exists dashboard_events_org_id_fkey,
  add constraint dashboard_events_org_id_fkey
    foreign key (org_id)
    references public.organizations(id)
    on delete cascade,
  drop constraint if exists dashboard_events_agent_id_fkey,
  add constraint dashboard_events_agent_id_fkey
    foreign key (agent_id)
    references public.agents(id)
    on delete set null,
  drop constraint if exists dashboard_events_message_not_blank_check,
  add constraint dashboard_events_message_not_blank_check
    check (btrim(message) <> ''),
  drop constraint if exists dashboard_events_time_window_check,
  add constraint dashboard_events_time_window_check
    check (end_at is null or end_at > start_at);

