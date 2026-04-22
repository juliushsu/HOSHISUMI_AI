-- Phase 4.5B: property import batch skeleton (CSV/XLSX validation + draft creation)

create table if not exists public.import_batches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid null references public.stores(id) on delete set null,
  source_type text not null default 'csv_import',
  import_type text not null,
  original_filename text not null,
  file_url text null,
  status text not null default 'uploaded',
  total_rows int not null default 0,
  valid_rows int not null default 0,
  invalid_rows int not null default 0,
  created_drafts_count int not null default 0,
  error_summary jsonb null,
  started_at timestamptz not null default now(),
  finished_at timestamptz null,
  created_by uuid null references public.agents(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint import_batches_source_type_check
    check (source_type in ('manual', 'csv_import', 'image_draft', 'api_sync')),
  constraint import_batches_import_type_check
    check (import_type in ('japan_csv', 'japan_xlsx')),
  constraint import_batches_status_check
    check (status in ('uploaded', 'validating', 'validated', 'imported', 'failed')),
  constraint import_batches_total_rows_check
    check (total_rows >= 0),
  constraint import_batches_valid_rows_check
    check (valid_rows >= 0),
  constraint import_batches_invalid_rows_check
    check (invalid_rows >= 0),
  constraint import_batches_created_drafts_count_check
    check (created_drafts_count >= 0),
  constraint import_batches_finished_after_started_check
    check (finished_at is null or finished_at >= started_at)
);

create index if not exists idx_import_batches_org_id on public.import_batches(organization_id);
create index if not exists idx_import_batches_store_id on public.import_batches(store_id);
create index if not exists idx_import_batches_status on public.import_batches(status);
create index if not exists idx_import_batches_import_type on public.import_batches(import_type);
create index if not exists idx_import_batches_created_at_desc on public.import_batches(created_at desc);

create table if not exists public.property_import_rows (
  id uuid primary key default gen_random_uuid(),
  import_batch_id uuid not null references public.import_batches(id) on delete cascade,
  row_number int not null,
  property_code text null,
  raw_row_payload jsonb not null,
  normalized_payload jsonb null,
  validation_errors jsonb null,
  status text not null default 'invalid',
  created_property_id uuid null references public.properties(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint property_import_rows_status_check
    check (status in ('valid', 'invalid', 'imported')),
  constraint property_import_rows_row_number_check
    check (row_number > 0),
  constraint property_import_rows_validation_errors_array_check
    check (validation_errors is null or jsonb_typeof(validation_errors) = 'array')
);

create index if not exists idx_property_import_rows_batch_id on public.property_import_rows(import_batch_id);
create index if not exists idx_property_import_rows_status on public.property_import_rows(status);
create index if not exists idx_property_import_rows_row_number on public.property_import_rows(row_number);
create index if not exists idx_property_import_rows_property_code on public.property_import_rows(property_code);
create unique index if not exists uq_property_import_rows_batch_row_number
  on public.property_import_rows(import_batch_id, row_number);

create or replace function public.set_import_batches_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_import_batches_set_updated_at on public.import_batches;
create trigger trg_import_batches_set_updated_at
before update on public.import_batches
for each row
execute function public.set_import_batches_updated_at();

alter table public.import_batches enable row level security;
alter table public.property_import_rows enable row level security;

drop policy if exists import_batches_select_admin_scope on public.import_batches;
create policy import_batches_select_admin_scope
on public.import_batches
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

drop policy if exists import_batches_insert_admin_scope on public.import_batches;
create policy import_batches_insert_admin_scope
on public.import_batches
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

drop policy if exists import_batches_update_admin_scope on public.import_batches;
create policy import_batches_update_admin_scope
on public.import_batches
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

drop policy if exists property_import_rows_select_admin_scope on public.property_import_rows;
create policy property_import_rows_select_admin_scope
on public.property_import_rows
for select
using (
  exists (
    select 1
    from public.import_batches b
    where b.id = property_import_rows.import_batch_id
      and b.organization_id = public.current_organization_id()
      and (
        public.is_storefront_super_role()
        or (
          public.is_storefront_store_scoped_role()
          and b.store_id = public.current_agent_store_id()
        )
      )
  )
);

drop policy if exists property_import_rows_insert_admin_scope on public.property_import_rows;
create policy property_import_rows_insert_admin_scope
on public.property_import_rows
for insert
with check (
  exists (
    select 1
    from public.import_batches b
    where b.id = property_import_rows.import_batch_id
      and b.organization_id = public.current_organization_id()
      and (
        public.is_storefront_super_role()
        or (
          public.is_storefront_store_scoped_role()
          and b.store_id = public.current_agent_store_id()
        )
      )
  )
);
