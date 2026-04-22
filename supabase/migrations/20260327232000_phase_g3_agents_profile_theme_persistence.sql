-- Phase G3: agents profile editable schema + storefront theme persistence hardening
-- Idempotent and staging-safe.

-- Keep storefront role helpers available for policy expressions.
create or replace function public.is_storefront_super_role()
returns boolean
language sql
stable
as $$
  select public.current_agent_role() in ('owner', 'super_admin');
$$;

create or replace function public.is_storefront_store_scoped_role()
returns boolean
language sql
stable
as $$
  select public.current_agent_role() in ('manager', 'store_manager', 'store_editor');
$$;

create or replace function public.current_agent_store_id()
returns uuid
language sql
stable
as $$
  select a.store_id
  from public.agents a
  where a.id = public.current_agent_id();
$$;

-- Agents profile fields for editable canonical personal card/profile data.
alter table public.agents
  add column if not exists name_en text null,
  add column if not exists email text null,
  add column if not exists title text null,
  add column if not exists phone text null,
  add column if not exists line_id text null,
  add column if not exists languages text[] not null default '{}'::text[],
  add column if not exists service_areas text[] not null default '{}'::text[],
  add column if not exists specialties text[] not null default '{}'::text[],
  add column if not exists office_name text null,
  add column if not exists license_note text null,
  add column if not exists is_visible_on_card boolean not null default true,
  add column if not exists updated_at timestamptz not null default now();

update public.agents
set
  languages = coalesce(languages, '{}'::text[]),
  service_areas = coalesce(service_areas, '{}'::text[]),
  specialties = coalesce(specialties, '{}'::text[]),
  is_visible_on_card = coalesce(is_visible_on_card, true),
  updated_at = coalesce(updated_at, now())
where
  languages is null
  or service_areas is null
  or specialties is null
  or is_visible_on_card is null
  or updated_at is null;

alter table public.agents
  alter column languages set default '{}'::text[],
  alter column languages set not null,
  alter column service_areas set default '{}'::text[],
  alter column service_areas set not null,
  alter column specialties set default '{}'::text[],
  alter column specialties set not null,
  alter column is_visible_on_card set default true,
  alter column is_visible_on_card set not null,
  alter column updated_at set default now(),
  alter column updated_at set not null;

alter table public.agents
  drop constraint if exists agents_role_check,
  add constraint agents_role_check
    check (role in ('owner', 'super_admin', 'manager', 'store_manager', 'store_editor', 'agent')),
  drop constraint if exists agents_languages_no_null_elements_check,
  add constraint agents_languages_no_null_elements_check
    check (array_position(languages, null) is null),
  drop constraint if exists agents_service_areas_no_null_elements_check,
  add constraint agents_service_areas_no_null_elements_check
    check (array_position(service_areas, null) is null),
  drop constraint if exists agents_specialties_no_null_elements_check,
  add constraint agents_specialties_no_null_elements_check
    check (array_position(specialties, null) is null);

create or replace function public.set_agents_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_agents_set_updated_at on public.agents;
create trigger trg_agents_set_updated_at
before update on public.agents
for each row
execute function public.set_agents_updated_at();

create index if not exists idx_agents_email on public.agents(email);

-- Tighten agents RLS to align with API scope:
-- - owner/super_admin: all org agents
-- - store scoped roles: own store only
-- - self: own row
drop policy if exists agents_select_by_role on public.agents;
create policy agents_select_by_role
on public.agents
for select
using (
  organization_id = public.current_organization_id()
  and (
    public.is_storefront_super_role()
    or id = public.current_agent_id()
    or (
      public.is_storefront_store_scoped_role()
      and public.current_agent_store_id() is not null
      and store_id = public.current_agent_store_id()
    )
  )
);

drop policy if exists agents_update_owner_manager_or_self on public.agents;
create policy agents_update_owner_manager_or_self
on public.agents
for update
using (
  organization_id = public.current_organization_id()
  and (
    public.is_storefront_super_role()
    or id = public.current_agent_id()
    or (
      public.is_storefront_store_scoped_role()
      and public.current_agent_store_id() is not null
      and store_id = public.current_agent_store_id()
    )
  )
)
with check (
  organization_id = public.current_organization_id()
  and (
    public.is_storefront_super_role()
    or id = public.current_agent_id()
    or (
      public.is_storefront_store_scoped_role()
      and public.current_agent_store_id() is not null
      and store_id = public.current_agent_store_id()
    )
  )
);

-- Storefront theme persistence hardening.
alter table public.stores
  add column if not exists theme_key text not null default 'franchise_green_red',
  add column if not exists theme_overrides jsonb not null default '{}'::jsonb;

update public.stores
set theme_overrides = '{}'::jsonb
where theme_overrides is null;

alter table public.stores
  alter column theme_key set default 'franchise_green_red',
  alter column theme_overrides set default '{}'::jsonb,
  alter column theme_overrides set not null;

alter table public.stores
  drop constraint if exists stores_theme_key_check,
  add constraint stores_theme_key_check
    check (
      theme_key in (
        -- Canonical preset keys (Phase G3)
        'franchise_green_red',
        'franchise_yellow_red',
        'franchise_yellow_black',
        'franchise_blue_white',
        'franchise_green_gold',
        'neutral_modern_ivory',
        'neutral_warm_teak',
        'neutral_urban_sage',
        'neutral_luxury_black_gold',
        'neutral_trust_indigo',
        -- Legacy accepted keys for backward compatibility
        'tw_classic_green',
        'tw_bright_green',
        'global_orange_white',
        'jp_fresh_green',
        'jp_deep_blue_gray',
        'luxury_black_gold',
        'warm_wood',
        'modern_cream',
        'urban_gray_green',
        'trust_blue'
      )
    ),
  drop constraint if exists stores_theme_overrides_is_object_check,
  add constraint stores_theme_overrides_is_object_check
    check (jsonb_typeof(theme_overrides) = 'object');

