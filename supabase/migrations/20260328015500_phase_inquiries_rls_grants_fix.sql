-- Normalize partner_inquiries RLS/policies when table existed before migration series.

grant insert on table public.partner_inquiries to anon;
grant select, insert, update on table public.partner_inquiries to authenticated;

do $$
declare
  pol record;
begin
  for pol in
    select policyname
    from pg_policies
    where schemaname = 'public' and tablename = 'partner_inquiries'
  loop
    execute format('drop policy if exists %I on public.partner_inquiries', pol.policyname);
  end loop;
end
$$;

create policy partner_inquiries_insert_public
on public.partner_inquiries
for insert
to anon, authenticated
with check (
  org_id is null
  and source in ('partners_japan', 'for_agencies', 'contact', 'manual_admin')
  and inquiry_type in ('japan_partnership', 'agency_onboarding', 'demo_request', 'general_contact', 'other')
  and status in ('new', 'contacted', 'qualified', 'closed', 'archived')
);

create policy partner_inquiries_select_admin
on public.partner_inquiries
for select
to authenticated
using (
  (org_id = public.current_organization_id() or org_id is null)
  and public.current_agent_role() in ('owner', 'super_admin', 'manager', 'store_manager', 'store_editor')
);

create policy partner_inquiries_update_admin
on public.partner_inquiries
for update
to authenticated
using (
  (org_id = public.current_organization_id() or org_id is null)
  and public.current_agent_role() in ('owner', 'super_admin', 'manager')
)
with check (
  (org_id = public.current_organization_id() or org_id is null)
  and public.current_agent_role() in ('owner', 'super_admin', 'manager')
);
