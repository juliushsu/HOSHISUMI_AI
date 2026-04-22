-- Phase J1: property intake cases canonical staging foundation
-- Scope: raw file -> OCR -> parse -> review -> approve(stub) on Railway canonical API.

create table if not exists public.property_intake_cases (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid null references public.stores(id) on delete set null,
  environment_type text not null default 'staging',
  created_by uuid null references public.agents(id) on delete set null,
  reviewed_by uuid null references public.agents(id) on delete set null,
  source_type text not null default 'manual_admin',
  source_partner_id uuid null references public.partners(id) on delete set null,
  source_channel text null,
  source_metadata_json jsonb null,
  raw_file_path text not null,
  raw_file_name text not null,
  raw_file_mime_type text not null,
  raw_file_size_bytes bigint null,
  ocr_status text not null default 'pending',
  ocr_provider text null,
  ocr_text text null,
  ocr_blocks_json jsonb null,
  ocr_confidence numeric(5, 4) null,
  ocr_error_code text null,
  ocr_error_message text null,
  parse_status text not null default 'pending',
  parse_provider text null,
  parsed_payload jsonb null,
  parse_audit_trail jsonb not null default '[]'::jsonb,
  parsed_confidence numeric(5, 4) null,
  parse_error_code text null,
  parse_error_message text null,
  review_status text not null default 'pending_review',
  reviewed_payload jsonb null,
  review_audit_trail jsonb not null default '[]'::jsonb,
  review_notes text null,
  approval_target_type text null,
  approved_property_id uuid null references public.properties(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  reviewed_at timestamptz null,
  approved_at timestamptz null,
  constraint property_intake_cases_environment_type_check
    check (environment_type in ('development', 'staging', 'production')),
  constraint property_intake_cases_source_type_check
    check (source_type in ('manual_admin', 'partner_upload', 'api_import')),
  constraint property_intake_cases_raw_file_size_check
    check (raw_file_size_bytes is null or raw_file_size_bytes >= 0),
  constraint property_intake_cases_ocr_status_check
    check (ocr_status in ('pending', 'processing', 'done', 'failed')),
  constraint property_intake_cases_ocr_confidence_check
    check (ocr_confidence is null or (ocr_confidence >= 0 and ocr_confidence <= 1)),
  constraint property_intake_cases_parse_status_check
    check (parse_status in ('pending', 'processing', 'done', 'failed')),
  constraint property_intake_cases_parsed_confidence_check
    check (parsed_confidence is null or (parsed_confidence >= 0 and parsed_confidence <= 1)),
  constraint property_intake_cases_review_status_check
    check (review_status in ('pending_review', 'needs_fix', 'approved', 'rejected')),
  constraint property_intake_cases_approval_target_type_check
    check (approval_target_type is null or approval_target_type in ('property_draft', 'property_live')),
  constraint property_intake_cases_parse_audit_trail_is_array
    check (jsonb_typeof(parse_audit_trail) = 'array'),
  constraint property_intake_cases_review_audit_trail_is_array
    check (jsonb_typeof(review_audit_trail) = 'array')
);

create index if not exists idx_property_intake_cases_org_id
  on public.property_intake_cases(organization_id);
create index if not exists idx_property_intake_cases_store_id
  on public.property_intake_cases(store_id);
create index if not exists idx_property_intake_cases_review_status
  on public.property_intake_cases(review_status);
create index if not exists idx_property_intake_cases_source_type
  on public.property_intake_cases(source_type);
create index if not exists idx_property_intake_cases_created_at_desc
  on public.property_intake_cases(created_at desc);

create or replace function public.set_property_intake_cases_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_property_intake_cases_set_updated_at on public.property_intake_cases;
create trigger trg_property_intake_cases_set_updated_at
before update on public.property_intake_cases
for each row
execute function public.set_property_intake_cases_updated_at();

alter table public.property_intake_cases enable row level security;

drop policy if exists property_intake_cases_select_admin_scope on public.property_intake_cases;
create policy property_intake_cases_select_admin_scope
on public.property_intake_cases
for select
using (
  organization_id = public.current_organization_id()
  and (
    public.is_storefront_super_role()
    or (
      public.is_storefront_store_scoped_role()
      and store_id = public.current_agent_store_id()
    )
  )
);

drop policy if exists property_intake_cases_insert_admin_scope on public.property_intake_cases;
create policy property_intake_cases_insert_admin_scope
on public.property_intake_cases
for insert
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

drop policy if exists property_intake_cases_update_admin_scope on public.property_intake_cases;
create policy property_intake_cases_update_admin_scope
on public.property_intake_cases
for update
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

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'property-intake-raw',
  'property-intake-raw',
  false,
  10485760,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists property_intake_raw_select_admin_scope on storage.objects;
create policy property_intake_raw_select_admin_scope
on storage.objects
for select
to authenticated
using (
  bucket_id = 'property-intake-raw'
  and (storage.foldername(name))[1] = 'orgs'
  and public.current_organization_id() is not null
  and (storage.foldername(name))[2] = public.current_organization_id()::text
  and (
    public.current_agent_role() in ('owner', 'super_admin')
    or (
      public.current_agent_role() in ('manager', 'store_manager', 'store_editor')
      and public.current_agent_store_id() is not null
      and (storage.foldername(name))[3] = 'stores'
      and (storage.foldername(name))[4] = public.current_agent_store_id()::text
    )
  )
);

drop policy if exists property_intake_raw_insert_admin_scope on storage.objects;
create policy property_intake_raw_insert_admin_scope
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'property-intake-raw'
  and (storage.foldername(name))[1] = 'orgs'
  and public.current_organization_id() is not null
  and (storage.foldername(name))[2] = public.current_organization_id()::text
  and (
    public.current_agent_role() in ('owner', 'super_admin')
    or (
      public.current_agent_role() in ('manager', 'store_manager', 'store_editor')
      and public.current_agent_store_id() is not null
      and (storage.foldername(name))[3] = 'stores'
      and (storage.foldername(name))[4] = public.current_agent_store_id()::text
    )
  )
);

drop policy if exists property_intake_raw_update_admin_scope on storage.objects;
create policy property_intake_raw_update_admin_scope
on storage.objects
for update
to authenticated
using (
  bucket_id = 'property-intake-raw'
  and (storage.foldername(name))[1] = 'orgs'
  and public.current_organization_id() is not null
  and (storage.foldername(name))[2] = public.current_organization_id()::text
  and (
    public.current_agent_role() in ('owner', 'super_admin')
    or (
      public.current_agent_role() in ('manager', 'store_manager', 'store_editor')
      and public.current_agent_store_id() is not null
      and (storage.foldername(name))[3] = 'stores'
      and (storage.foldername(name))[4] = public.current_agent_store_id()::text
    )
  )
)
with check (
  bucket_id = 'property-intake-raw'
  and (storage.foldername(name))[1] = 'orgs'
  and public.current_organization_id() is not null
  and (storage.foldername(name))[2] = public.current_organization_id()::text
  and (
    public.current_agent_role() in ('owner', 'super_admin')
    or (
      public.current_agent_role() in ('manager', 'store_manager', 'store_editor')
      and public.current_agent_store_id() is not null
      and (storage.foldername(name))[3] = 'stores'
      and (storage.foldername(name))[4] = public.current_agent_store_id()::text
    )
  )
);
