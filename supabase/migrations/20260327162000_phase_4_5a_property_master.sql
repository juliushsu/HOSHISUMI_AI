-- Phase 4.5A: property master skeleton (manual entry + future import-ready)

alter table public.properties
  add column if not exists property_code text null,
  add column if not exists title_ja text null,
  add column if not exists title_zh text null,
  add column if not exists title_en text null,
  add column if not exists description_ja text null,
  add column if not exists description_zh text null,
  add column if not exists description_en text null,
  add column if not exists prefecture text null,
  add column if not exists city text null,
  add column if not exists district text null,
  add column if not exists address_ja text null,
  add column if not exists address_zh text null,
  add column if not exists address_en text null,
  add column if not exists purpose text null,
  add column if not exists property_type text null,
  add column if not exists currency text null,
  add column if not exists area_sqm numeric(12, 2) null,
  add column if not exists layout text null,
  add column if not exists building_age int null,
  add column if not exists floor int null,
  add column if not exists total_floors int null,
  add column if not exists nearest_station text null,
  add column if not exists walking_minutes int null,
  add column if not exists management_fee numeric(14, 2) null,
  add column if not exists contact_store_id uuid null references public.stores(id) on delete set null,
  add column if not exists source_ref text null,
  add column if not exists import_batch_id text null,
  add column if not exists cover_image_url text null,
  add column if not exists floorplan_image_url text null,
  add column if not exists gallery_urls jsonb not null default '[]'::jsonb,
  add column if not exists raw_source_payload jsonb null;

update public.properties
set purpose = case
  when 'management' = any(service_types) then 'management'
  when 'rental' = any(service_types) then 'rental'
  else 'sale'
end
where purpose is null;

update public.properties
set currency = case
  when country = 'jp' then 'JPY'
  when country = 'tw' then 'TWD'
  else 'JPY'
end
where currency is null;

alter table public.properties
  alter column purpose set default 'sale',
  alter column purpose set not null,
  alter column currency set default 'JPY',
  alter column currency set not null;

alter table public.properties
  drop constraint if exists properties_purpose_check,
  add constraint properties_purpose_check
    check (purpose in ('sale', 'rental', 'management')),
  drop constraint if exists properties_currency_check,
  add constraint properties_currency_check
    check (currency in ('JPY', 'TWD', 'USD')),
  drop constraint if exists properties_source_type_check,
  add constraint properties_source_type_check
    check (
      source_type in (
        'manual',
        'import',
        'japan_line',
        'japan_api',
        'csv_import',
        'image_draft',
        'api_sync'
      )
    ),
  drop constraint if exists properties_gallery_urls_is_array,
  add constraint properties_gallery_urls_is_array
    check (jsonb_typeof(gallery_urls) = 'array'),
  drop constraint if exists properties_area_sqm_non_negative_check,
  add constraint properties_area_sqm_non_negative_check
    check (area_sqm is null or area_sqm >= 0),
  drop constraint if exists properties_building_age_non_negative_check,
  add constraint properties_building_age_non_negative_check
    check (building_age is null or building_age >= 0),
  drop constraint if exists properties_walking_minutes_non_negative_check,
  add constraint properties_walking_minutes_non_negative_check
    check (walking_minutes is null or walking_minutes >= 0),
  drop constraint if exists properties_management_fee_non_negative_check,
  add constraint properties_management_fee_non_negative_check
    check (management_fee is null or management_fee >= 0);

create unique index if not exists uq_properties_org_property_code
  on public.properties(organization_id, property_code)
  where property_code is not null;
create index if not exists idx_properties_purpose on public.properties(purpose);
create index if not exists idx_properties_currency on public.properties(currency);
create index if not exists idx_properties_city on public.properties(city);
create index if not exists idx_properties_district on public.properties(district);
create index if not exists idx_properties_contact_store_id on public.properties(contact_store_id);
create index if not exists idx_properties_import_batch_id on public.properties(import_batch_id);
