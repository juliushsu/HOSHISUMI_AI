-- Phase: Public inquiries / partner leads system (single-table strategy)

create table if not exists public.partner_inquiries (
  id uuid primary key default gen_random_uuid(),
  org_id uuid null references public.organizations(id) on delete set null,
  source text not null,
  inquiry_type text not null,
  company_name text null,
  contact_name text not null,
  email text not null,
  phone text null,
  line_id text null,
  country text null,
  language text null,
  subject text null,
  message text not null,
  metadata jsonb not null default '{}'::jsonb,
  status text not null default 'new',
  assigned_agent_id uuid null references public.agents(id) on delete set null,
  assigned_admin_id uuid null references public.agents(id) on delete set null,
  last_contacted_at timestamptz null,
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.partner_inquiries
  add column if not exists org_id uuid null references public.organizations(id) on delete set null,
  add column if not exists source text,
  add column if not exists inquiry_type text,
  add column if not exists company_name text,
  add column if not exists contact_name text,
  add column if not exists email text,
  add column if not exists phone text,
  add column if not exists line_id text,
  add column if not exists country text,
  add column if not exists language text,
  add column if not exists subject text,
  add column if not exists message text,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists status text not null default 'new',
  add column if not exists assigned_agent_id uuid null references public.agents(id) on delete set null,
  add column if not exists assigned_admin_id uuid null references public.agents(id) on delete set null,
  add column if not exists last_contacted_at timestamptz null,
  add column if not exists notes text null,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

update public.partner_inquiries
set
  metadata = coalesce(metadata, '{}'::jsonb),
  status = coalesce(status, 'new'),
  created_at = coalesce(created_at, now()),
  updated_at = coalesce(updated_at, now())
where
  metadata is null
  or status is null
  or created_at is null
  or updated_at is null;

alter table public.partner_inquiries
  alter column source set not null,
  alter column inquiry_type set not null,
  alter column contact_name set not null,
  alter column email set not null,
  alter column message set not null,
  alter column metadata set default '{}'::jsonb,
  alter column metadata set not null,
  alter column status set default 'new',
  alter column status set not null,
  alter column created_at set default now(),
  alter column created_at set not null,
  alter column updated_at set default now(),
  alter column updated_at set not null;

alter table public.partner_inquiries
  drop constraint if exists partner_inquiries_source_check,
  add constraint partner_inquiries_source_check
    check (source in ('partners_japan', 'for_agencies', 'contact', 'manual_admin')),
  drop constraint if exists partner_inquiries_inquiry_type_check,
  add constraint partner_inquiries_inquiry_type_check
    check (inquiry_type in ('japan_partnership', 'agency_onboarding', 'demo_request', 'general_contact', 'other')),
  drop constraint if exists partner_inquiries_status_check,
  add constraint partner_inquiries_status_check
    check (status in ('new', 'contacted', 'qualified', 'closed', 'archived')),
  drop constraint if exists partner_inquiries_language_check,
  add constraint partner_inquiries_language_check
    check (language is null or language in ('ja', 'zh', 'en')),
  drop constraint if exists partner_inquiries_source_not_blank_check,
  add constraint partner_inquiries_source_not_blank_check
    check (btrim(source) <> ''),
  drop constraint if exists partner_inquiries_inquiry_type_not_blank_check,
  add constraint partner_inquiries_inquiry_type_not_blank_check
    check (btrim(inquiry_type) <> ''),
  drop constraint if exists partner_inquiries_contact_name_not_blank_check,
  add constraint partner_inquiries_contact_name_not_blank_check
    check (btrim(contact_name) <> ''),
  drop constraint if exists partner_inquiries_email_not_blank_check,
  add constraint partner_inquiries_email_not_blank_check
    check (btrim(email) <> ''),
  drop constraint if exists partner_inquiries_message_not_blank_check,
  add constraint partner_inquiries_message_not_blank_check
    check (btrim(message) <> ''),
  drop constraint if exists partner_inquiries_metadata_object_check,
  add constraint partner_inquiries_metadata_object_check
    check (jsonb_typeof(metadata) = 'object');

create index if not exists idx_partner_inquiries_status on public.partner_inquiries(status);
create index if not exists idx_partner_inquiries_source on public.partner_inquiries(source);
create index if not exists idx_partner_inquiries_inquiry_type on public.partner_inquiries(inquiry_type);
create index if not exists idx_partner_inquiries_created_at_desc on public.partner_inquiries(created_at desc);
create index if not exists idx_partner_inquiries_org_id on public.partner_inquiries(org_id);
create index if not exists idx_partner_inquiries_assigned_agent_id on public.partner_inquiries(assigned_agent_id);
create index if not exists idx_partner_inquiries_assigned_admin_id on public.partner_inquiries(assigned_admin_id);

create or replace function public.set_partner_inquiries_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_partner_inquiries_set_updated_at on public.partner_inquiries;
create trigger trg_partner_inquiries_set_updated_at
before update on public.partner_inquiries
for each row
execute function public.set_partner_inquiries_updated_at();

alter table public.partner_inquiries enable row level security;

drop policy if exists partner_inquiries_insert_public on public.partner_inquiries;
create policy partner_inquiries_insert_public
on public.partner_inquiries
for insert
to anon, authenticated
with check (
  (org_id is null or org_id = public.current_organization_id())
  and source in ('partners_japan', 'for_agencies', 'contact', 'manual_admin')
  and inquiry_type in ('japan_partnership', 'agency_onboarding', 'demo_request', 'general_contact', 'other')
  and status in ('new', 'contacted', 'qualified', 'closed', 'archived')
);

drop policy if exists partner_inquiries_select_admin on public.partner_inquiries;
create policy partner_inquiries_select_admin
on public.partner_inquiries
for select
to authenticated
using (
  (org_id = public.current_organization_id() or org_id is null)
  and public.current_agent_role() in ('owner', 'super_admin', 'manager', 'store_manager', 'store_editor')
);

drop policy if exists partner_inquiries_update_admin on public.partner_inquiries;
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
