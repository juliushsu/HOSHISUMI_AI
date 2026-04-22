-- Phase G3 hotfix: avoid agents RLS recursion ("stack depth limit exceeded")
-- Root cause: agents policy referenced current_agent_store_id(), which queries agents again.

create or replace function public.current_store_id_claim()
returns uuid
language sql
stable
as $$
  select public.try_parse_uuid(public.jwt_claim_text('store_id'));
$$;

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
      and public.current_store_id_claim() is not null
      and store_id = public.current_store_id_claim()
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
      and public.current_store_id_claim() is not null
      and store_id = public.current_store_id_claim()
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
      and public.current_store_id_claim() is not null
      and store_id = public.current_store_id_claim()
    )
  )
);

