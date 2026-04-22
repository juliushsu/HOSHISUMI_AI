-- Phase 2.0: cross-border support (data layer)

alter table public.properties
  add column if not exists source_type text,
  add column if not exists source_partner text null,
  add column if not exists cross_border_fee_percent numeric(6, 2) not null default 1.0;

update public.properties
set source_type = case source
  when 'manual' then 'manual'
  when 'import' then 'import'
  when 'api' then 'japan_api'
  else 'manual'
end
where source_type is null;

alter table public.properties
  alter column source_type set default 'manual',
  alter column source_type set not null;

alter table public.properties
  drop constraint if exists properties_source_type_check,
  add constraint properties_source_type_check
    check (source_type in ('manual', 'import', 'japan_line', 'japan_api')),
  drop constraint if exists properties_cross_border_fee_percent_check,
  add constraint properties_cross_border_fee_percent_check
    check (cross_border_fee_percent >= 0);

create index if not exists idx_properties_source_type on public.properties(source_type);
create index if not exists idx_properties_source_partner on public.properties(source_partner);
