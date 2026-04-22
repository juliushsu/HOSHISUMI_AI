-- Phase 4.2: storefront admin role scope hardening (RLS)

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

drop policy if exists stores_insert_owner_manager on public.stores;
create policy stores_insert_owner_manager
on public.stores
for insert
with check (
  organization_id = public.current_organization_id()
  and public.is_storefront_super_role()
);

drop policy if exists stores_update_owner_manager on public.stores;
create policy stores_update_owner_manager
on public.stores
for update
using (
  organization_id = public.current_organization_id()
  and (
    public.is_storefront_super_role()
    or (
      public.is_storefront_store_scoped_role()
      and id = public.current_agent_store_id()
    )
  )
)
with check (
  organization_id = public.current_organization_id()
  and (
    public.is_storefront_super_role()
    or (
      public.is_storefront_store_scoped_role()
      and id = public.current_agent_store_id()
    )
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
      and (
        public.is_storefront_super_role()
        or (
          public.is_storefront_store_scoped_role()
          and s.id = public.current_agent_store_id()
        )
      )
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
      and (
        public.is_storefront_super_role()
        or (
          public.is_storefront_store_scoped_role()
          and s.id = public.current_agent_store_id()
        )
      )
  )
)
with check (
  exists (
    select 1
    from public.stores s
    where s.id = store_domains.store_id
      and s.organization_id = public.current_organization_id()
      and (
        public.is_storefront_super_role()
        or (
          public.is_storefront_store_scoped_role()
          and s.id = public.current_agent_store_id()
        )
      )
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
      and (
        public.is_storefront_super_role()
        or (
          public.is_storefront_store_scoped_role()
          and s.id = public.current_agent_store_id()
        )
      )
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
      and (
        public.is_storefront_super_role()
        or (
          public.is_storefront_store_scoped_role()
          and s.id = public.current_agent_store_id()
        )
      )
  )
)
with check (
  exists (
    select 1
    from public.stores s
    where s.id = store_services.store_id
      and s.organization_id = public.current_organization_id()
      and (
        public.is_storefront_super_role()
        or (
          public.is_storefront_store_scoped_role()
          and s.id = public.current_agent_store_id()
        )
      )
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
      and (
        public.is_storefront_super_role()
        or (
          public.is_storefront_store_scoped_role()
          and s.id = public.current_agent_store_id()
        )
      )
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
      and (
        public.is_storefront_super_role()
        or (
          public.is_storefront_store_scoped_role()
          and s.id = public.current_agent_store_id()
        )
      )
  )
)
with check (
  exists (
    select 1
    from public.stores s
    where s.id = store_property_publications.store_id
      and s.organization_id = public.current_organization_id()
      and (
        public.is_storefront_super_role()
        or (
          public.is_storefront_store_scoped_role()
          and s.id = public.current_agent_store_id()
        )
      )
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
      and (
        public.is_storefront_super_role()
        or (
          public.is_storefront_store_scoped_role()
          and s.id = public.current_agent_store_id()
        )
      )
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
      and (
        public.is_storefront_super_role()
        or (
          public.is_storefront_store_scoped_role()
          and s.id = public.current_agent_store_id()
        )
      )
  )
)
with check (
  exists (
    select 1
    from public.agents a
    join public.stores s on s.id = a.store_id
    where a.id = agent_publications.agent_id
      and s.organization_id = public.current_organization_id()
      and (
        public.is_storefront_super_role()
        or (
          public.is_storefront_store_scoped_role()
          and s.id = public.current_agent_store_id()
        )
      )
  )
);
