-- Phase 2.1: cross-border intake flow support (data layer)

alter table public.properties
  add column if not exists intake_status text,
  add column if not exists raw_source_files_count int not null default 0,
  add column if not exists updated_at timestamptz not null default now();

update public.properties
set intake_status = coalesce(intake_status, 'imported')
where intake_status is null;

alter table public.properties
  alter column intake_status set default 'imported',
  alter column intake_status set not null;

alter table public.properties
  drop constraint if exists properties_intake_status_check,
  add constraint properties_intake_status_check
    check (intake_status in ('imported', 'analyzing', 'ready_to_publish')),
  drop constraint if exists properties_raw_source_files_count_check,
  add constraint properties_raw_source_files_count_check
    check (raw_source_files_count >= 0);

create index if not exists idx_properties_intake_status on public.properties(intake_status);

create or replace function public.set_properties_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_properties_set_updated_at on public.properties;
create trigger trg_properties_set_updated_at
before update on public.properties
for each row
execute function public.set_properties_updated_at();
