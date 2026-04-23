-- Phase J2: property ingest v1 (staging-only canonical OCR -> translate -> review -> approve flow)

create table if not exists public.property_ingest_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  company_id uuid null,
  store_id uuid null references public.stores(id) on delete set null,
  environment_type text not null default 'staging',
  created_by uuid null references public.agents(id) on delete set null,
  reviewed_by uuid null references public.agents(id) on delete set null,
  source_type text not null default 'manual_admin',
  source_channel text null,
  source_partner_id uuid null references public.partners(id) on delete set null,
  metadata_json jsonb null,
  status text not null default 'uploaded',
  ocr_status text not null default 'pending',
  translation_status text not null default 'pending',
  primary_file_name text null,
  primary_file_mime_type text null,
  primary_file_size_bytes bigint null,
  current_ocr_text_ja text null,
  current_ocr_blocks_json jsonb null,
  current_translated_fields_json jsonb null,
  current_reviewed_fields_json jsonb null,
  failure_code text null,
  failure_message text null,
  approved_property_id uuid null references public.properties(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  reviewed_at timestamptz null,
  approved_at timestamptz null,
  constraint property_ingest_jobs_environment_type_check
    check (environment_type in ('development', 'staging', 'production')),
  constraint property_ingest_jobs_source_type_check
    check (source_type in ('manual_admin', 'partner_upload', 'api_import')),
  constraint property_ingest_jobs_status_check
    check (status in ('uploaded', 'ocr_processing', 'ocr_done', 'translating', 'translated', 'pending_review', 'approved', 'rejected', 'failed')),
  constraint property_ingest_jobs_ocr_status_check
    check (ocr_status in ('pending', 'processing', 'done', 'failed', 'unconfigured')),
  constraint property_ingest_jobs_translation_status_check
    check (translation_status in ('pending', 'processing', 'done', 'failed', 'unconfigured')),
  constraint property_ingest_jobs_primary_file_size_check
    check (primary_file_size_bytes is null or primary_file_size_bytes >= 0),
  constraint property_ingest_jobs_current_ocr_blocks_is_array
    check (current_ocr_blocks_json is null or jsonb_typeof(current_ocr_blocks_json) = 'array')
);

create index if not exists idx_property_ingest_jobs_org on public.property_ingest_jobs(organization_id);
create index if not exists idx_property_ingest_jobs_store on public.property_ingest_jobs(store_id);
create index if not exists idx_property_ingest_jobs_status on public.property_ingest_jobs(status);
create index if not exists idx_property_ingest_jobs_created_at_desc on public.property_ingest_jobs(created_at desc);

create table if not exists public.property_ingest_files (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.property_ingest_jobs(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  company_id uuid null,
  storage_bucket text not null,
  storage_path text not null,
  original_file_name text not null,
  mime_type text not null,
  size_bytes bigint null,
  file_kind text not null default 'raw_source',
  created_by uuid null references public.agents(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint property_ingest_files_file_kind_check
    check (file_kind in ('raw_source', 'derived_preview', 'attachment')),
  constraint property_ingest_files_size_check
    check (size_bytes is null or size_bytes >= 0)
);

create index if not exists idx_property_ingest_files_job on public.property_ingest_files(job_id);
create index if not exists idx_property_ingest_files_org on public.property_ingest_files(organization_id);
create unique index if not exists uq_property_ingest_files_bucket_path
  on public.property_ingest_files(storage_bucket, storage_path);

create table if not exists public.property_ocr_results (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.property_ingest_jobs(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  company_id uuid null,
  provider text null,
  provider_model text null,
  status text not null default 'processing',
  raw_text_ja text null,
  blocks_json jsonb null,
  raw_json jsonb null,
  confidence numeric(5, 4) null,
  error_code text null,
  error_message text null,
  created_by uuid null references public.agents(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint property_ocr_results_status_check
    check (status in ('processing', 'done', 'failed', 'unconfigured')),
  constraint property_ocr_results_blocks_is_array
    check (blocks_json is null or jsonb_typeof(blocks_json) = 'array'),
  constraint property_ocr_results_confidence_check
    check (confidence is null or (confidence >= 0 and confidence <= 1))
);

create index if not exists idx_property_ocr_results_job on public.property_ocr_results(job_id, created_at desc);
create index if not exists idx_property_ocr_results_org on public.property_ocr_results(organization_id);

create table if not exists public.property_translation_results (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.property_ingest_jobs(id) on delete cascade,
  ocr_result_id uuid null references public.property_ocr_results(id) on delete set null,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  company_id uuid null,
  provider text null,
  provider_model text null,
  status text not null default 'processing',
  source_language text not null default 'ja',
  target_language text not null default 'zh-TW',
  translated_fields_json jsonb null,
  raw_json jsonb null,
  confidence numeric(5, 4) null,
  error_code text null,
  error_message text null,
  created_by uuid null references public.agents(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint property_translation_results_status_check
    check (status in ('processing', 'done', 'failed', 'unconfigured')),
  constraint property_translation_results_fields_is_object
    check (translated_fields_json is null or jsonb_typeof(translated_fields_json) = 'object'),
  constraint property_translation_results_confidence_check
    check (confidence is null or (confidence >= 0 and confidence <= 1))
);

create index if not exists idx_property_translation_results_job on public.property_translation_results(job_id, created_at desc);
create index if not exists idx_property_translation_results_org on public.property_translation_results(organization_id);

create table if not exists public.property_review_decisions (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.property_ingest_jobs(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  company_id uuid null,
  decision text not null,
  status_before text not null,
  status_after text not null,
  translation_result_id uuid null references public.property_translation_results(id) on delete set null,
  translated_fields_before_json jsonb null,
  reviewed_fields_json jsonb null,
  field_changes_json jsonb null,
  notes text null,
  created_by uuid null references public.agents(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint property_review_decisions_decision_check
    check (decision in ('reviewed', 'approved', 'rejected', 'needs_fix')),
  constraint property_review_decisions_status_before_check
    check (status_before in ('uploaded', 'ocr_processing', 'ocr_done', 'translating', 'translated', 'pending_review', 'approved', 'rejected', 'failed')),
  constraint property_review_decisions_status_after_check
    check (status_after in ('uploaded', 'ocr_processing', 'ocr_done', 'translating', 'translated', 'pending_review', 'approved', 'rejected', 'failed')),
  constraint property_review_decisions_before_json_is_object
    check (translated_fields_before_json is null or jsonb_typeof(translated_fields_before_json) = 'object'),
  constraint property_review_decisions_reviewed_json_is_object
    check (reviewed_fields_json is null or jsonb_typeof(reviewed_fields_json) = 'object'),
  constraint property_review_decisions_changes_json_is_object
    check (field_changes_json is null or jsonb_typeof(field_changes_json) = 'object')
);

create index if not exists idx_property_review_decisions_job on public.property_review_decisions(job_id, created_at desc);
create index if not exists idx_property_review_decisions_org on public.property_review_decisions(organization_id);

create or replace function public.set_property_ingest_jobs_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_property_ingest_jobs_set_updated_at on public.property_ingest_jobs;
create trigger trg_property_ingest_jobs_set_updated_at
before update on public.property_ingest_jobs
for each row
execute function public.set_property_ingest_jobs_updated_at();

alter table public.property_ingest_jobs enable row level security;
alter table public.property_ingest_files enable row level security;
alter table public.property_ocr_results enable row level security;
alter table public.property_translation_results enable row level security;
alter table public.property_review_decisions enable row level security;

drop policy if exists property_ingest_jobs_select_admin_scope on public.property_ingest_jobs;
create policy property_ingest_jobs_select_admin_scope
on public.property_ingest_jobs
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

drop policy if exists property_ingest_jobs_insert_admin_scope on public.property_ingest_jobs;
create policy property_ingest_jobs_insert_admin_scope
on public.property_ingest_jobs
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

drop policy if exists property_ingest_jobs_update_admin_scope on public.property_ingest_jobs;
create policy property_ingest_jobs_update_admin_scope
on public.property_ingest_jobs
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

drop policy if exists property_ingest_files_select_admin_scope on public.property_ingest_files;
create policy property_ingest_files_select_admin_scope
on public.property_ingest_files
for select
using (
  exists (
    select 1
    from public.property_ingest_jobs j
    where j.id = property_ingest_files.job_id
      and j.organization_id = public.current_organization_id()
      and (
        public.is_storefront_super_role()
        or (
          public.is_storefront_store_scoped_role()
          and j.store_id = public.current_agent_store_id()
        )
      )
  )
);

drop policy if exists property_ingest_files_insert_admin_scope on public.property_ingest_files;
create policy property_ingest_files_insert_admin_scope
on public.property_ingest_files
for insert
with check (
  exists (
    select 1
    from public.property_ingest_jobs j
    where j.id = property_ingest_files.job_id
      and j.organization_id = public.current_organization_id()
      and (
        public.is_storefront_super_role()
        or (
          public.is_storefront_store_scoped_role()
          and j.store_id = public.current_agent_store_id()
        )
      )
  )
);

drop policy if exists property_ocr_results_select_admin_scope on public.property_ocr_results;
create policy property_ocr_results_select_admin_scope
on public.property_ocr_results
for select
using (
  exists (
    select 1
    from public.property_ingest_jobs j
    where j.id = property_ocr_results.job_id
      and j.organization_id = public.current_organization_id()
      and (
        public.is_storefront_super_role()
        or (
          public.is_storefront_store_scoped_role()
          and j.store_id = public.current_agent_store_id()
        )
      )
  )
);

drop policy if exists property_ocr_results_insert_admin_scope on public.property_ocr_results;
create policy property_ocr_results_insert_admin_scope
on public.property_ocr_results
for insert
with check (
  exists (
    select 1
    from public.property_ingest_jobs j
    where j.id = property_ocr_results.job_id
      and j.organization_id = public.current_organization_id()
      and (
        public.is_storefront_super_role()
        or (
          public.is_storefront_store_scoped_role()
          and j.store_id = public.current_agent_store_id()
        )
      )
  )
);

drop policy if exists property_translation_results_select_admin_scope on public.property_translation_results;
create policy property_translation_results_select_admin_scope
on public.property_translation_results
for select
using (
  exists (
    select 1
    from public.property_ingest_jobs j
    where j.id = property_translation_results.job_id
      and j.organization_id = public.current_organization_id()
      and (
        public.is_storefront_super_role()
        or (
          public.is_storefront_store_scoped_role()
          and j.store_id = public.current_agent_store_id()
        )
      )
  )
);

drop policy if exists property_translation_results_insert_admin_scope on public.property_translation_results;
create policy property_translation_results_insert_admin_scope
on public.property_translation_results
for insert
with check (
  exists (
    select 1
    from public.property_ingest_jobs j
    where j.id = property_translation_results.job_id
      and j.organization_id = public.current_organization_id()
      and (
        public.is_storefront_super_role()
        or (
          public.is_storefront_store_scoped_role()
          and j.store_id = public.current_agent_store_id()
        )
      )
  )
);

drop policy if exists property_review_decisions_select_admin_scope on public.property_review_decisions;
create policy property_review_decisions_select_admin_scope
on public.property_review_decisions
for select
using (
  exists (
    select 1
    from public.property_ingest_jobs j
    where j.id = property_review_decisions.job_id
      and j.organization_id = public.current_organization_id()
      and (
        public.is_storefront_super_role()
        or (
          public.is_storefront_store_scoped_role()
          and j.store_id = public.current_agent_store_id()
        )
      )
  )
);

drop policy if exists property_review_decisions_insert_admin_scope on public.property_review_decisions;
create policy property_review_decisions_insert_admin_scope
on public.property_review_decisions
for insert
with check (
  exists (
    select 1
    from public.property_ingest_jobs j
    where j.id = property_review_decisions.job_id
      and j.organization_id = public.current_organization_id()
      and (
        public.is_storefront_super_role()
        or (
          public.is_storefront_store_scoped_role()
          and j.store_id = public.current_agent_store_id()
        )
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
  'property-ingest-raw',
  'property-ingest-raw',
  false,
  10485760,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists property_ingest_raw_select_admin_scope on storage.objects;
create policy property_ingest_raw_select_admin_scope
on storage.objects
for select
to authenticated
using (
  bucket_id = 'property-ingest-raw'
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

drop policy if exists property_ingest_raw_insert_admin_scope on storage.objects;
create policy property_ingest_raw_insert_admin_scope
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'property-ingest-raw'
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

drop policy if exists property_ingest_raw_update_admin_scope on storage.objects;
create policy property_ingest_raw_update_admin_scope
on storage.objects
for update
to authenticated
using (
  bucket_id = 'property-ingest-raw'
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
  bucket_id = 'property-ingest-raw'
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
