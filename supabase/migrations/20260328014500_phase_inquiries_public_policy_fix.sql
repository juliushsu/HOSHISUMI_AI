-- Fix public insert policy: anonymous public submissions must not depend on JWT org claims.

drop policy if exists partner_inquiries_insert_public on public.partner_inquiries;
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
