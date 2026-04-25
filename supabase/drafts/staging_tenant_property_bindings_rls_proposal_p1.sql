-- Draft only
-- Do not apply directly.
-- Staging-only proposal for tenant_property_bindings org-scoped RLS.
-- Non-goal: this draft does not change runtime code or approve flow.

begin;

-- ---------------------------------------------------------------------------
-- 0. Preflight
-- ---------------------------------------------------------------------------
-- Intended dependency:
-- - 20260424170000_phase_j3_partner_management_v1.sql
--
-- This file is a proposal and intentionally lives under supabase/drafts/.
-- It must not be promoted to production in P1.

-- ---------------------------------------------------------------------------
-- 1. Enable RLS
-- ---------------------------------------------------------------------------

alter table public.tenant_property_bindings enable row level security;

-- ---------------------------------------------------------------------------
-- 2. Tenant org-scoped policies
-- ---------------------------------------------------------------------------

drop policy if exists tenant_property_bindings_select_same_org on public.tenant_property_bindings;
create policy tenant_property_bindings_select_same_org
on public.tenant_property_bindings
for select
using (
  organization_id = public.current_organization_id()
);

drop policy if exists tenant_property_bindings_insert_same_org on public.tenant_property_bindings;
create policy tenant_property_bindings_insert_same_org
on public.tenant_property_bindings
for insert
with check (
  organization_id = public.current_organization_id()
);

drop policy if exists tenant_property_bindings_update_same_org on public.tenant_property_bindings;
create policy tenant_property_bindings_update_same_org
on public.tenant_property_bindings
for update
using (
  organization_id = public.current_organization_id()
)
with check (
  organization_id = public.current_organization_id()
);

-- Conservative default for P1:
-- no delete policy yet.
-- If delete is required later, it should be explicitly restricted to elevated admin roles.

-- ---------------------------------------------------------------------------
-- 3. Support indexes
-- ---------------------------------------------------------------------------

create index if not exists idx_tenant_property_bindings_org_effective_status
  on public.tenant_property_bindings(organization_id, effective_status);

create index if not exists idx_tenant_property_bindings_org_visibility
  on public.tenant_property_bindings(organization_id, visibility);

create index if not exists idx_tenant_property_bindings_org_tenant_status
  on public.tenant_property_bindings(organization_id, tenant_status);

create index if not exists idx_tenant_property_bindings_linked_property_id
  on public.tenant_property_bindings(linked_property_id)
  where linked_property_id is not null;

-- ---------------------------------------------------------------------------
-- 4. P1 compatibility notes
-- ---------------------------------------------------------------------------
-- 1) Partner routes currently use service role to read binding summaries.
--    That can continue short-term because service role bypasses RLS.
--
-- 2) /api/admin/properties can adopt a tenant-visible adapter without cutting
--    over the approve flow immediately.
--
-- 3) AI assistant should not query tenant_property_bindings directly in P1
--    until a tenant-visible property subject resolver is introduced.

commit;

-- ---------------------------------------------------------------------------
-- Validation / review queries (not part of migration execution)
-- ---------------------------------------------------------------------------
--
-- Inspect rows by org:
-- select organization_id, count(*)
-- from public.tenant_property_bindings
-- group by organization_id
-- order by count(*) desc;
--
-- Inspect orphaned linked properties:
-- select id, organization_id, linked_property_id
-- from public.tenant_property_bindings
-- where linked_property_id is not null
--   and not exists (
--     select 1
--     from public.properties p
--     where p.id = tenant_property_bindings.linked_property_id
--   );
--
-- Verify a tenant org can only see its own bindings after RLS is applied:
-- select id, organization_id, property_master_id
-- from public.tenant_property_bindings
-- limit 20;
