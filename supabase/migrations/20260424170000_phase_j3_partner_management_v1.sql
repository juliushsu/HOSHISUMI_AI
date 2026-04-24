-- Phase J3: staging-only Japan partner management model v1

alter table public.partner_users
  add column if not exists organization_id uuid null references public.organizations(id) on delete set null,
  add column if not exists agent_id uuid null references public.agents(id) on delete set null;

create index if not exists idx_partner_users_org_id on public.partner_users(organization_id);
create index if not exists idx_partner_users_agent_id on public.partner_users(agent_id);
create unique index if not exists uq_partner_users_partner_email
  on public.partner_users(partner_id, lower(email));

create table if not exists public.properties_master (
  id uuid primary key default gen_random_uuid(),
  source_partner_id uuid not null references public.partners(id) on delete restrict,
  source_of_truth text not null default 'japan_partner'
    check (source_of_truth in ('japan_partner')),
  source_property_ref text not null,
  country text not null default 'jp'
    check (country in ('jp')),
  status text not null default 'available'
    check (status in ('available', 'sold', 'off_market')),
  canonical_payload_json jsonb not null default '{}'::jsonb,
  title_ja text null,
  title_zh text null,
  address_ja text null,
  address_zh text null,
  price numeric(14, 2) null check (price is null or price >= 0),
  currency text not null default 'JPY'
    check (currency in ('JPY')),
  layout text null,
  area_sqm numeric(12, 2) null check (area_sqm is null or area_sqm >= 0),
  description_ja text null,
  description_zh text null,
  image_urls jsonb not null default '[]'::jsonb,
  raw_source_payload jsonb null,
  source_updated_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint properties_master_canonical_payload_is_object
    check (jsonb_typeof(canonical_payload_json) = 'object'),
  constraint properties_master_image_urls_is_array
    check (jsonb_typeof(image_urls) = 'array'),
  constraint properties_master_raw_payload_is_object
    check (raw_source_payload is null or jsonb_typeof(raw_source_payload) = 'object'),
  constraint properties_master_source_ref_not_blank
    check (btrim(source_property_ref) <> ''),
  constraint properties_master_source_unique
    unique (source_partner_id, source_property_ref)
);

create index if not exists idx_properties_master_partner_id
  on public.properties_master(source_partner_id);
create index if not exists idx_properties_master_status
  on public.properties_master(status);
create index if not exists idx_properties_master_updated_at_desc
  on public.properties_master(updated_at desc);

create table if not exists public.tenant_property_bindings (
  id uuid primary key default gen_random_uuid(),
  property_master_id uuid not null references public.properties_master(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  linked_property_id uuid null references public.properties(id) on delete set null,
  visibility text not null default 'active'
    check (visibility in ('active', 'hidden')),
  tenant_status text not null default 'draft'
    check (tenant_status in ('draft', 'marketing', 'archived')),
  source_status text not null
    check (source_status in ('available', 'sold', 'off_market')),
  effective_status text not null
    check (effective_status in ('available', 'sold', 'off_market', 'archived', 'hidden')),
  source_lock_reason text null,
  source_locked_at timestamptz null,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenant_property_bindings_metadata_is_object
    check (jsonb_typeof(metadata_json) = 'object'),
  constraint tenant_property_bindings_org_master_unique
    unique (property_master_id, organization_id)
);

create index if not exists idx_tenant_property_bindings_org_id
  on public.tenant_property_bindings(organization_id);
create index if not exists idx_tenant_property_bindings_master_id
  on public.tenant_property_bindings(property_master_id);
create index if not exists idx_tenant_property_bindings_effective_status
  on public.tenant_property_bindings(effective_status);

create or replace function public.set_properties_master_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_properties_master_set_updated_at on public.properties_master;
create trigger trg_properties_master_set_updated_at
before update on public.properties_master
for each row
execute function public.set_properties_master_updated_at();

create or replace function public.set_tenant_property_bindings_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_tenant_property_bindings_set_updated_at on public.tenant_property_bindings;
create trigger trg_tenant_property_bindings_set_updated_at
before update on public.tenant_property_bindings
for each row
execute function public.set_tenant_property_bindings_updated_at();

create or replace function public.compute_tenant_binding_effective_status(
  p_source_status text,
  p_visibility text,
  p_tenant_status text
)
returns text
language sql
immutable
as $$
  select case
    when p_visibility = 'hidden' then 'hidden'
    when p_tenant_status = 'archived' then 'archived'
    when p_source_status in ('sold', 'off_market') then p_source_status
    else 'available'
  end;
$$;

create or replace function public.apply_tenant_binding_status_defaults()
returns trigger
language plpgsql
as $$
begin
  new.effective_status := public.compute_tenant_binding_effective_status(
    new.source_status,
    new.visibility,
    new.tenant_status
  );

  if new.source_status in ('sold', 'off_market') then
    new.source_locked_at := coalesce(new.source_locked_at, now());
    new.source_lock_reason := coalesce(
      nullif(new.source_lock_reason, ''),
      case
        when new.source_status = 'sold' then 'source_marked_sold'
        else 'source_marked_off_market'
      end
    );
  else
    new.source_locked_at := null;
    new.source_lock_reason := null;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_tenant_property_bindings_apply_defaults on public.tenant_property_bindings;
create trigger trg_tenant_property_bindings_apply_defaults
before insert or update on public.tenant_property_bindings
for each row
execute function public.apply_tenant_binding_status_defaults();

create or replace function public.sync_properties_master_status_to_bindings()
returns trigger
language plpgsql
as $$
begin
  if new.status is distinct from old.status then
    update public.tenant_property_bindings
    set
      source_status = new.status,
      effective_status = public.compute_tenant_binding_effective_status(new.status, visibility, tenant_status),
      source_lock_reason = case
        when new.status = 'sold' then 'source_marked_sold'
        when new.status = 'off_market' then 'source_marked_off_market'
        else null
      end,
      source_locked_at = case
        when new.status in ('sold', 'off_market') then now()
        else null
      end,
      updated_at = now()
    where property_master_id = new.id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_properties_master_sync_bindings on public.properties_master;
create trigger trg_properties_master_sync_bindings
after update of status on public.properties_master
for each row
execute function public.sync_properties_master_status_to_bindings();
