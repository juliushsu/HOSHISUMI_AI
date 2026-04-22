-- Phase 4.3A: storefront lead capture + attribution skeleton

alter table public.leads
  add column if not exists organization_id uuid null references public.organizations(id) on delete cascade,
  add column if not exists store_id uuid null references public.stores(id) on delete set null,
  add column if not exists agent_id uuid null references public.agents(id) on delete set null,
  add column if not exists property_id uuid null references public.properties(id) on delete set null,
  add column if not exists source_type text null,
  add column if not exists source_code text null,
  add column if not exists source_store_slug text null,
  add column if not exists source_agent_slug text null,
  add column if not exists customer_name text null,
  add column if not exists line_id text null,
  add column if not exists preferred_contact_method text null,
  add column if not exists inquiry_message text null,
  add column if not exists status text null,
  add column if not exists notes text null,
  add column if not exists updated_at timestamptz null;

update public.leads
set
  customer_name = coalesce(customer_name, name),
  inquiry_message = coalesce(inquiry_message, message),
  source_type = coalesce(source_type, 'direct'),
  status = coalesce(status, 'new'),
  updated_at = coalesce(updated_at, created_at, now());

alter table public.leads
  alter column customer_name set not null,
  alter column source_type set default 'direct',
  alter column status set default 'new',
  alter column updated_at set default now();

alter table public.leads
  drop constraint if exists leads_contact_required,
  add constraint leads_contact_required check (
    (email is not null and char_length(trim(email)) > 0)
    or (phone is not null and char_length(trim(phone)) > 0)
    or (line_id is not null and char_length(trim(line_id)) > 0)
  ),
  drop constraint if exists leads_customer_name_required,
  add constraint leads_customer_name_required check (char_length(trim(customer_name)) > 0),
  drop constraint if exists leads_source_type_check,
  add constraint leads_source_type_check
    check (source_type in ('qr', 'agent_page', 'store_contact', 'property_inquiry', 'direct')),
  drop constraint if exists leads_status_check,
  add constraint leads_status_check
    check (status in ('new', 'contacted', 'qualified', 'closed', 'lost')),
  drop constraint if exists leads_preferred_contact_method_check,
  add constraint leads_preferred_contact_method_check
    check (
      preferred_contact_method is null
      or preferred_contact_method in ('phone', 'email', 'line')
    );

create index if not exists idx_leads_org_id on public.leads(organization_id);
create index if not exists idx_leads_store_id on public.leads(store_id);
create index if not exists idx_leads_agent_id on public.leads(agent_id);
create index if not exists idx_leads_property_id on public.leads(property_id);
create index if not exists idx_leads_status on public.leads(status);
create index if not exists idx_leads_source_type on public.leads(source_type);
create index if not exists idx_leads_created_at_desc on public.leads(created_at desc);

create or replace function public.sync_lead_legacy_fields()
returns trigger
language plpgsql
as $$
begin
  if new.customer_name is null or btrim(new.customer_name) = '' then
    new.customer_name := nullif(btrim(new.name), '');
  end if;

  if new.name is null or btrim(new.name) = '' then
    new.name := new.customer_name;
  end if;

  if new.inquiry_message is null then
    new.inquiry_message := nullif(new.message, '');
  end if;

  if new.message is null then
    new.message := new.inquiry_message;
  end if;

  if new.source_type is null then
    new.source_type := 'direct';
  end if;

  if new.status is null then
    new.status := 'new';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_leads_sync_legacy_fields on public.leads;
create trigger trg_leads_sync_legacy_fields
before insert or update on public.leads
for each row
execute function public.sync_lead_legacy_fields();

create table if not exists public.lead_events (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint lead_events_event_type_check
    check (event_type in ('lead_created', 'lead_status_changed', 'lead_note_added'))
);

create index if not exists idx_lead_events_lead_id on public.lead_events(lead_id);
create index if not exists idx_lead_events_event_type on public.lead_events(event_type);
create index if not exists idx_lead_events_created_at_desc on public.lead_events(created_at desc);

alter table public.lead_events enable row level security;

drop policy if exists leads_public_insert on public.leads;
create policy leads_public_insert
on public.leads
for insert
to anon, authenticated
with check (true);

drop policy if exists leads_select_admin_scope on public.leads;
create policy leads_select_admin_scope
on public.leads
for select
using (
  organization_id = public.current_organization_id()
  and (
    public.is_storefront_super_role()
    or (
      public.is_storefront_store_scoped_role()
      and store_id = public.current_agent_store_id()
    )
  )
);

drop policy if exists lead_events_public_insert on public.lead_events;
create policy lead_events_public_insert
on public.lead_events
for insert
to anon, authenticated
with check (
  event_type = 'lead_created'
  and exists (
    select 1
    from public.leads l
    where l.id = lead_events.lead_id
  )
);

drop policy if exists lead_events_insert_admin_scope on public.lead_events;
create policy lead_events_insert_admin_scope
on public.lead_events
for insert
to authenticated
with check (
  exists (
    select 1
    from public.leads l
    where l.id = lead_events.lead_id
      and l.organization_id = public.current_organization_id()
      and (
        public.is_storefront_super_role()
        or (
          public.is_storefront_store_scoped_role()
          and l.store_id = public.current_agent_store_id()
        )
      )
  )
);

drop policy if exists lead_events_select_admin_scope on public.lead_events;
create policy lead_events_select_admin_scope
on public.lead_events
for select
using (
  exists (
    select 1
    from public.leads l
    where l.id = lead_events.lead_id
      and l.organization_id = public.current_organization_id()
      and (
        public.is_storefront_super_role()
        or (
          public.is_storefront_store_scoped_role()
          and l.store_id = public.current_agent_store_id()
        )
      )
  )
);
