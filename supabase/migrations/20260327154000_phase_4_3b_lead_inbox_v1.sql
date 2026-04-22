-- Phase 4.3B: lead inbox update scope + event type extension

alter table public.lead_events
  drop constraint if exists lead_events_event_type_check,
  add constraint lead_events_event_type_check
    check (event_type in ('lead_created', 'lead_status_changed', 'lead_note_updated', 'lead_note_added'));

drop policy if exists leads_update_admin_scope on public.leads;
create policy leads_update_admin_scope
on public.leads
for update
to authenticated
using (
  organization_id = public.current_organization_id()
  and (
    public.is_storefront_super_role()
    or (
      public.is_storefront_store_scoped_role()
      and store_id = public.current_agent_store_id()
    )
  )
)
with check (
  organization_id = public.current_organization_id()
  and (
    public.is_storefront_super_role()
    or (
      public.is_storefront_store_scoped_role()
      and store_id = public.current_agent_store_id()
    )
  )
);
