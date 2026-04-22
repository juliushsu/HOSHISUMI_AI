-- Phase 1.5: API contract stabilization + legal consent chain

alter table public.clients
  add column if not exists consent_timestamp timestamptz null,
  add column if not exists consent_source text null;

create table if not exists public.consent_logs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  consent_type text not null,
  consent_value boolean not null,
  changed_at timestamptz not null default now(),
  changed_by_agent_id uuid null references public.agents(id) on delete set null
);

create index if not exists idx_consent_logs_client_id on public.consent_logs(client_id);
create index if not exists idx_consent_logs_changed_at on public.consent_logs(changed_at desc);

-- Tighten clients visibility: agent can only see/update self-assigned clients.
drop policy if exists clients_select_by_role on public.clients;
create policy clients_select_by_role
on public.clients
for select
using (
  organization_id = public.current_organization_id()
  and (
    public.is_owner_or_manager()
    or assigned_agent_id = public.current_agent_id()
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

alter table public.consent_logs enable row level security;

-- consent_logs follows client visibility boundary.
drop policy if exists consent_logs_select_by_role on public.consent_logs;
create policy consent_logs_select_by_role
on public.consent_logs
for select
using (
  exists (
    select 1
    from public.clients c
    where c.id = consent_logs.client_id
      and c.organization_id = public.current_organization_id()
      and (
        public.is_owner_or_manager()
        or c.assigned_agent_id = public.current_agent_id()
      )
  )
);

drop policy if exists consent_logs_insert_by_role on public.consent_logs;
create policy consent_logs_insert_by_role
on public.consent_logs
for insert
with check (
  exists (
    select 1
    from public.clients c
    where c.id = consent_logs.client_id
      and c.organization_id = public.current_organization_id()
      and (
        public.is_owner_or_manager()
        or c.assigned_agent_id = public.current_agent_id()
      )
  )
);

-- Auto-populate consent metadata when any consent flag changes.
create or replace function public.handle_client_consent_metadata()
returns trigger
language plpgsql
as $$
begin
  if (
    old.consent_property_tw is distinct from new.consent_property_tw
    or old.consent_property_jp is distinct from new.consent_property_jp
    or old.consent_contact_line is distinct from new.consent_contact_line
    or old.consent_contact_phone is distinct from new.consent_contact_phone
    or old.consent_post_sale_follow is distinct from new.consent_post_sale_follow
    or old.unsubscribe_all is distinct from new.unsubscribe_all
  ) then
    if new.consent_timestamp is null then
      new.consent_timestamp = now();
    end if;

    if new.consent_source is null then
      new.consent_source = 'api';
    end if;
  end if;

  return new;
end;
$$;

-- Append legal evidence logs when consent fields change.
create or replace function public.log_client_consent_changes()
returns trigger
language plpgsql
as $$
declare
  claim_agent_id uuid;
begin
  claim_agent_id := public.current_agent_id();

  if old.consent_property_tw is distinct from new.consent_property_tw then
    insert into public.consent_logs (client_id, consent_type, consent_value, changed_by_agent_id)
    values (new.id, 'consent_property_tw', new.consent_property_tw, claim_agent_id);
  end if;

  if old.consent_property_jp is distinct from new.consent_property_jp then
    insert into public.consent_logs (client_id, consent_type, consent_value, changed_by_agent_id)
    values (new.id, 'consent_property_jp', new.consent_property_jp, claim_agent_id);
  end if;

  if old.consent_contact_line is distinct from new.consent_contact_line then
    insert into public.consent_logs (client_id, consent_type, consent_value, changed_by_agent_id)
    values (new.id, 'consent_contact_line', new.consent_contact_line, claim_agent_id);
  end if;

  if old.consent_contact_phone is distinct from new.consent_contact_phone then
    insert into public.consent_logs (client_id, consent_type, consent_value, changed_by_agent_id)
    values (new.id, 'consent_contact_phone', new.consent_contact_phone, claim_agent_id);
  end if;

  if old.consent_post_sale_follow is distinct from new.consent_post_sale_follow then
    insert into public.consent_logs (client_id, consent_type, consent_value, changed_by_agent_id)
    values (new.id, 'consent_post_sale_follow', new.consent_post_sale_follow, claim_agent_id);
  end if;

  if old.unsubscribe_all is distinct from new.unsubscribe_all then
    insert into public.consent_logs (client_id, consent_type, consent_value, changed_by_agent_id)
    values (new.id, 'unsubscribe_all', new.unsubscribe_all, claim_agent_id);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_clients_consent_metadata on public.clients;
create trigger trg_clients_consent_metadata
before update on public.clients
for each row
execute function public.handle_client_consent_metadata();

drop trigger if exists trg_clients_consent_logs on public.clients;
create trigger trg_clients_consent_logs
after update on public.clients
for each row
execute function public.log_client_consent_changes();
