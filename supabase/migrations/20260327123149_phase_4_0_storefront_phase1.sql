-- Phase 4.0 (Storefront Phase 1): data model + public skeleton policies

create table if not exists public.stores (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  slug text not null unique,
  city text null,
  district text null,
  service_area_text text null,
  tagline text null,
  introduction text null,
  phone text null,
  email text null,
  address text null,
  line_url text null,
  business_hours text null,
  logo_url text null,
  cover_image_url text null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint stores_slug_format_check
    check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);

create index if not exists idx_stores_org_id on public.stores(organization_id);
create index if not exists idx_stores_is_active on public.stores(is_active);

create table if not exists public.store_domains (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  subdomain text null,
  custom_domain text null,
  is_primary boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint store_domains_one_domain_required_check
    check (subdomain is not null or custom_domain is not null)
);

create unique index if not exists uq_store_domains_subdomain
  on public.store_domains(subdomain)
  where subdomain is not null;
create unique index if not exists uq_store_domains_custom_domain
  on public.store_domains(custom_domain)
  where custom_domain is not null;
create unique index if not exists uq_store_domains_primary_per_store
  on public.store_domains(store_id)
  where is_primary = true;
create index if not exists idx_store_domains_store_id on public.store_domains(store_id);

alter table public.agents
  add column if not exists store_id uuid null references public.stores(id) on delete set null,
  add column if not exists slug text null,
  add column if not exists bio text null,
  add column if not exists service_area text null,
  add column if not exists avatar_url text null,
  add column if not exists phone_public text null,
  add column if not exists line_url text null,
  add column if not exists is_public boolean not null default false,
  add column if not exists updated_at timestamptz not null default now();

alter table public.agents
  drop constraint if exists agents_slug_format_check,
  add constraint agents_slug_format_check
    check (slug is null or slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$');

create unique index if not exists uq_agents_store_slug
  on public.agents(store_id, slug)
  where store_id is not null and slug is not null;
create index if not exists idx_agents_store_id on public.agents(store_id);
create index if not exists idx_agents_is_public on public.agents(is_public);

create table if not exists public.store_services (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  service_type text not null default 'general',
  buy boolean not null default false,
  sell boolean not null default false,
  rental boolean not null default false,
  management boolean not null default false,
  consultation boolean not null default false,
  title text not null,
  description text null,
  is_enabled boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint store_services_sort_order_check
    check (sort_order >= 0)
);

create index if not exists idx_store_services_store_id on public.store_services(store_id);
create index if not exists idx_store_services_enabled on public.store_services(is_enabled);
create index if not exists idx_store_services_sort_order on public.store_services(sort_order);

create table if not exists public.store_property_publications (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  purpose text not null default 'sale',
  publication_type text not null default 'normal',
  featured boolean not null default false,
  normal boolean not null default true,
  is_public boolean not null default true,
  display_order int not null default 0,
  published_at timestamptz null,
  unpublished_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint store_property_publications_purpose_check
    check (purpose in ('sale', 'rental', 'management')),
  constraint store_property_publications_type_check
    check (publication_type in ('featured', 'normal')),
  constraint store_property_publications_flag_consistency_check
    check (
      (publication_type = 'featured' and featured = true and normal = false)
      or (publication_type = 'normal' and featured = false and normal = true)
    ),
  constraint store_property_publications_display_order_check
    check (display_order >= 0),
  constraint store_property_publications_publish_window_check
    check (unpublished_at is null or published_at is null or unpublished_at > published_at),
  unique (store_id, property_id, purpose)
);

create index if not exists idx_store_property_publications_store_id
  on public.store_property_publications(store_id);
create index if not exists idx_store_property_publications_property_id
  on public.store_property_publications(property_id);
create index if not exists idx_store_property_publications_is_public
  on public.store_property_publications(is_public);
create index if not exists idx_store_property_publications_type
  on public.store_property_publications(publication_type);
create index if not exists idx_store_property_publications_purpose
  on public.store_property_publications(purpose);
create index if not exists idx_store_property_publications_display_order
  on public.store_property_publications(display_order);

create table if not exists public.agent_publications (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agents(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  is_featured boolean not null default false,
  display_order int not null default 0,
  is_public boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agent_publications_display_order_check
    check (display_order >= 0),
  unique (agent_id, property_id)
);

create index if not exists idx_agent_publications_agent_id on public.agent_publications(agent_id);
create index if not exists idx_agent_publications_property_id on public.agent_publications(property_id);
create index if not exists idx_agent_publications_is_public on public.agent_publications(is_public);

create or replace function public.set_storefront_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_stores_set_updated_at on public.stores;
create trigger trg_stores_set_updated_at
before update on public.stores
for each row
execute function public.set_storefront_updated_at();

drop trigger if exists trg_store_domains_set_updated_at on public.store_domains;
create trigger trg_store_domains_set_updated_at
before update on public.store_domains
for each row
execute function public.set_storefront_updated_at();

drop trigger if exists trg_store_services_set_updated_at on public.store_services;
create trigger trg_store_services_set_updated_at
before update on public.store_services
for each row
execute function public.set_storefront_updated_at();

drop trigger if exists trg_store_property_publications_set_updated_at on public.store_property_publications;
create trigger trg_store_property_publications_set_updated_at
before update on public.store_property_publications
for each row
execute function public.set_storefront_updated_at();

drop trigger if exists trg_agent_publications_set_updated_at on public.agent_publications;
create trigger trg_agent_publications_set_updated_at
before update on public.agent_publications
for each row
execute function public.set_storefront_updated_at();

drop trigger if exists trg_agents_set_updated_at on public.agents;
create trigger trg_agents_set_updated_at
before update on public.agents
for each row
execute function public.set_storefront_updated_at();

alter table public.stores enable row level security;
alter table public.store_domains enable row level security;
alter table public.store_services enable row level security;
alter table public.store_property_publications enable row level security;
alter table public.agent_publications enable row level security;

drop policy if exists stores_select_same_org on public.stores;
create policy stores_select_same_org
on public.stores
for select
using (organization_id = public.current_organization_id());

drop policy if exists stores_insert_owner_manager on public.stores;
create policy stores_insert_owner_manager
on public.stores
for insert
with check (
  organization_id = public.current_organization_id()
  and public.is_owner_or_manager()
);

drop policy if exists stores_update_owner_manager on public.stores;
create policy stores_update_owner_manager
on public.stores
for update
using (
  organization_id = public.current_organization_id()
  and public.is_owner_or_manager()
)
with check (
  organization_id = public.current_organization_id()
  and public.is_owner_or_manager()
);

drop policy if exists stores_select_public_active on public.stores;
create policy stores_select_public_active
on public.stores
for select
using (is_active = true);

drop policy if exists store_domains_select_same_org on public.store_domains;
create policy store_domains_select_same_org
on public.store_domains
for select
using (
  exists (
    select 1
    from public.stores s
    where s.id = store_domains.store_id
      and s.organization_id = public.current_organization_id()
  )
);

drop policy if exists store_domains_insert_owner_manager on public.store_domains;
create policy store_domains_insert_owner_manager
on public.store_domains
for insert
with check (
  exists (
    select 1
    from public.stores s
    where s.id = store_domains.store_id
      and s.organization_id = public.current_organization_id()
      and public.is_owner_or_manager()
  )
);

drop policy if exists store_domains_update_owner_manager on public.store_domains;
create policy store_domains_update_owner_manager
on public.store_domains
for update
using (
  exists (
    select 1
    from public.stores s
    where s.id = store_domains.store_id
      and s.organization_id = public.current_organization_id()
      and public.is_owner_or_manager()
  )
)
with check (
  exists (
    select 1
    from public.stores s
    where s.id = store_domains.store_id
      and s.organization_id = public.current_organization_id()
      and public.is_owner_or_manager()
  )
);

drop policy if exists store_domains_select_public_active on public.store_domains;
create policy store_domains_select_public_active
on public.store_domains
for select
using (
  is_active = true
  and exists (
    select 1
    from public.stores s
    where s.id = store_domains.store_id
      and s.is_active = true
  )
);

drop policy if exists store_services_select_same_org on public.store_services;
create policy store_services_select_same_org
on public.store_services
for select
using (
  exists (
    select 1
    from public.stores s
    where s.id = store_services.store_id
      and s.organization_id = public.current_organization_id()
  )
);

drop policy if exists store_services_insert_owner_manager on public.store_services;
create policy store_services_insert_owner_manager
on public.store_services
for insert
with check (
  exists (
    select 1
    from public.stores s
    where s.id = store_services.store_id
      and s.organization_id = public.current_organization_id()
      and public.is_owner_or_manager()
  )
);

drop policy if exists store_services_update_owner_manager on public.store_services;
create policy store_services_update_owner_manager
on public.store_services
for update
using (
  exists (
    select 1
    from public.stores s
    where s.id = store_services.store_id
      and s.organization_id = public.current_organization_id()
      and public.is_owner_or_manager()
  )
)
with check (
  exists (
    select 1
    from public.stores s
    where s.id = store_services.store_id
      and s.organization_id = public.current_organization_id()
      and public.is_owner_or_manager()
  )
);

drop policy if exists store_services_select_public_enabled on public.store_services;
create policy store_services_select_public_enabled
on public.store_services
for select
using (
  is_enabled = true
  and exists (
    select 1
    from public.stores s
    where s.id = store_services.store_id
      and s.is_active = true
  )
);

drop policy if exists store_property_publications_select_same_org on public.store_property_publications;
create policy store_property_publications_select_same_org
on public.store_property_publications
for select
using (
  exists (
    select 1
    from public.stores s
    where s.id = store_property_publications.store_id
      and s.organization_id = public.current_organization_id()
  )
);

drop policy if exists store_property_publications_insert_owner_manager on public.store_property_publications;
create policy store_property_publications_insert_owner_manager
on public.store_property_publications
for insert
with check (
  exists (
    select 1
    from public.stores s
    where s.id = store_property_publications.store_id
      and s.organization_id = public.current_organization_id()
      and public.is_owner_or_manager()
  )
);

drop policy if exists store_property_publications_update_owner_manager on public.store_property_publications;
create policy store_property_publications_update_owner_manager
on public.store_property_publications
for update
using (
  exists (
    select 1
    from public.stores s
    where s.id = store_property_publications.store_id
      and s.organization_id = public.current_organization_id()
      and public.is_owner_or_manager()
  )
)
with check (
  exists (
    select 1
    from public.stores s
    where s.id = store_property_publications.store_id
      and s.organization_id = public.current_organization_id()
      and public.is_owner_or_manager()
  )
);

drop policy if exists store_property_publications_select_public on public.store_property_publications;
create policy store_property_publications_select_public
on public.store_property_publications
for select
using (
  is_public = true
  and (published_at is null or published_at <= now())
  and (unpublished_at is null or unpublished_at > now())
  and exists (
    select 1
    from public.stores s
    where s.id = store_property_publications.store_id
      and s.is_active = true
  )
);

drop policy if exists agent_publications_select_same_org on public.agent_publications;
create policy agent_publications_select_same_org
on public.agent_publications
for select
using (
  exists (
    select 1
    from public.agents a
    join public.stores s on s.id = a.store_id
    where a.id = agent_publications.agent_id
      and s.organization_id = public.current_organization_id()
  )
);

drop policy if exists agent_publications_insert_owner_manager on public.agent_publications;
create policy agent_publications_insert_owner_manager
on public.agent_publications
for insert
with check (
  exists (
    select 1
    from public.agents a
    join public.stores s on s.id = a.store_id
    where a.id = agent_publications.agent_id
      and s.organization_id = public.current_organization_id()
      and public.is_owner_or_manager()
  )
);

drop policy if exists agent_publications_update_owner_manager on public.agent_publications;
create policy agent_publications_update_owner_manager
on public.agent_publications
for update
using (
  exists (
    select 1
    from public.agents a
    join public.stores s on s.id = a.store_id
    where a.id = agent_publications.agent_id
      and s.organization_id = public.current_organization_id()
      and public.is_owner_or_manager()
  )
)
with check (
  exists (
    select 1
    from public.agents a
    join public.stores s on s.id = a.store_id
    where a.id = agent_publications.agent_id
      and s.organization_id = public.current_organization_id()
      and public.is_owner_or_manager()
  )
);

drop policy if exists agent_publications_select_public on public.agent_publications;
create policy agent_publications_select_public
on public.agent_publications
for select
using (
  is_public = true
  and exists (
    select 1
    from public.agents a
    join public.stores s on s.id = a.store_id
    where a.id = agent_publications.agent_id
      and a.is_active = true
      and a.is_public = true
      and s.is_active = true
  )
);

drop policy if exists agents_select_public_storefront on public.agents;
create policy agents_select_public_storefront
on public.agents
for select
using (
  is_active = true
  and is_public = true
  and store_id is not null
  and exists (
    select 1
    from public.stores s
    where s.id = agents.store_id
      and s.is_active = true
  )
);

drop policy if exists properties_select_storefront_public on public.properties;
create policy properties_select_storefront_public
on public.properties
for select
using (
  exists (
    select 1
    from public.store_property_publications spp
    join public.stores s on s.id = spp.store_id
    where spp.property_id = properties.id
      and spp.is_public = true
      and (spp.published_at is null or spp.published_at <= now())
      and (spp.unpublished_at is null or spp.unpublished_at > now())
      and s.is_active = true
  )
);
