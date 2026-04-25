-- Draft only
-- Do not apply directly.
-- This file intentionally lives outside supabase/migrations/ so it is not picked up as a runtime migration.
-- Scope: staging implementation proposal only.
-- Non-goal: this draft does not change the runtime approve flow yet.

begin;

-- ---------------------------------------------------------------------------
-- 0. Preflight notes
-- ---------------------------------------------------------------------------
-- This draft is intended for staging databases that already have:
-- - 20260326200000_phase_2_2_partner_intake_control.sql
-- - 20260423120000_phase_j2_property_ingest_v1.sql
-- - 20260424170000_phase_j3_partner_management_v1.sql
--
-- There is no reliable in-database environment flag in the current schema that
-- can safely distinguish staging from production. Staging-only rollout must be
-- enforced operationally when this draft is promoted to a real migration.

-- ---------------------------------------------------------------------------
-- 1. property_ingest_jobs
-- Expand source partner + address governance fields.
-- Keep the draft idempotent and avoid changing approve runtime flow.
-- ---------------------------------------------------------------------------

alter table public.property_ingest_jobs
  add column if not exists source_partner_name_snapshot text null,
  add column if not exists public_display_address_ja text null,
  add column if not exists public_display_address_zh text null,
  add column if not exists full_private_address_ja text null,
  add column if not exists full_private_address_zh text null,
  add column if not exists hide_exact_address boolean not null default true,
  add column if not exists address_completeness text null,
  add column if not exists address_review_required boolean not null default false;

alter table public.property_ingest_jobs
  drop constraint if exists property_ingest_jobs_address_completeness_check,
  add constraint property_ingest_jobs_address_completeness_check
    check (
      address_completeness is null
      or address_completeness in ('complete', 'partial', 'missing')
    ),
  drop constraint if exists property_ingest_jobs_source_partner_name_snapshot_not_blank,
  add constraint property_ingest_jobs_source_partner_name_snapshot_not_blank
    check (
      source_partner_name_snapshot is null
      or btrim(source_partner_name_snapshot) <> ''
    ),
  drop constraint if exists property_ingest_jobs_public_display_address_ja_not_blank,
  add constraint property_ingest_jobs_public_display_address_ja_not_blank
    check (
      public_display_address_ja is null
      or btrim(public_display_address_ja) <> ''
    ),
  drop constraint if exists property_ingest_jobs_public_display_address_zh_not_blank,
  add constraint property_ingest_jobs_public_display_address_zh_not_blank
    check (
      public_display_address_zh is null
      or btrim(public_display_address_zh) <> ''
    ),
  drop constraint if exists property_ingest_jobs_full_private_address_ja_not_blank,
  add constraint property_ingest_jobs_full_private_address_ja_not_blank
    check (
      full_private_address_ja is null
      or btrim(full_private_address_ja) <> ''
    ),
  drop constraint if exists property_ingest_jobs_full_private_address_zh_not_blank,
  add constraint property_ingest_jobs_full_private_address_zh_not_blank
    check (
      full_private_address_zh is null
      or btrim(full_private_address_zh) <> ''
    );

create index if not exists idx_property_ingest_jobs_source_partner_id
  on public.property_ingest_jobs(source_partner_id);

create index if not exists idx_property_ingest_jobs_org_source_partner_created_at_desc
  on public.property_ingest_jobs(organization_id, source_partner_id, created_at desc);

create index if not exists idx_property_ingest_jobs_address_review_required
  on public.property_ingest_jobs(address_review_required)
  where address_review_required = true;

create index if not exists idx_property_ingest_jobs_address_completeness
  on public.property_ingest_jobs(address_completeness)
  where address_completeness is not null;

-- Soft-enforce the governance rule without breaking existing staging rows.
-- NOT VALID keeps the draft backfill-safe:
-- - existing rows are tolerated temporarily
-- - new inserts / updates must satisfy the rule
alter table public.property_ingest_jobs
  drop constraint if exists property_ingest_jobs_source_partner_required;

alter table public.property_ingest_jobs
  add constraint property_ingest_jobs_source_partner_required
    check (source_partner_id is not null) not valid;

-- Snapshot backfill draft:
update public.property_ingest_jobs j
set source_partner_name_snapshot = p.display_name
from public.partners p
where j.source_partner_id = p.id
  and j.source_partner_name_snapshot is null;

update public.property_ingest_jobs
set address_completeness = 'missing'
where address_completeness is null
  and coalesce(nullif(btrim(full_private_address_ja), ''), nullif(btrim(full_private_address_zh), '')) is null
  and coalesce(nullif(btrim(public_display_address_ja), ''), nullif(btrim(public_display_address_zh), '')) is null;

update public.property_ingest_jobs
set address_completeness = 'partial'
where address_completeness is null
  and coalesce(nullif(btrim(full_private_address_ja), ''), nullif(btrim(full_private_address_zh), '')) is null
  and coalesce(nullif(btrim(public_display_address_ja), ''), nullif(btrim(public_display_address_zh), '')) is not null;

-- ---------------------------------------------------------------------------
-- 2. properties_master
-- Expand public/private address fields and address governance fields.
-- Keep existing address_ja/address_zh for transitional compatibility.
-- ---------------------------------------------------------------------------

alter table public.properties_master
  add column if not exists source_partner_name_snapshot text null,
  add column if not exists public_display_address_ja text null,
  add column if not exists public_display_address_zh text null,
  add column if not exists full_private_address_ja text null,
  add column if not exists full_private_address_zh text null,
  add column if not exists hide_exact_address boolean not null default true,
  add column if not exists address_completeness text not null default 'missing',
  add column if not exists address_review_required boolean not null default false,
  add column if not exists geo_address_used text null,
  add column if not exists geocode_provider text null,
  add column if not exists lat numeric null,
  add column if not exists lng numeric null,
  add column if not exists geocoded_at timestamptz null;

alter table public.properties_master
  drop constraint if exists properties_master_address_completeness_check,
  add constraint properties_master_address_completeness_check
    check (address_completeness in ('complete', 'partial', 'missing')),
  drop constraint if exists properties_master_source_partner_name_snapshot_not_blank,
  add constraint properties_master_source_partner_name_snapshot_not_blank
    check (
      source_partner_name_snapshot is null
      or btrim(source_partner_name_snapshot) <> ''
    ),
  drop constraint if exists properties_master_public_display_address_ja_not_blank,
  add constraint properties_master_public_display_address_ja_not_blank
    check (
      public_display_address_ja is null
      or btrim(public_display_address_ja) <> ''
    ),
  drop constraint if exists properties_master_public_display_address_zh_not_blank,
  add constraint properties_master_public_display_address_zh_not_blank
    check (
      public_display_address_zh is null
      or btrim(public_display_address_zh) <> ''
    ),
  drop constraint if exists properties_master_full_private_address_ja_not_blank,
  add constraint properties_master_full_private_address_ja_not_blank
    check (
      full_private_address_ja is null
      or btrim(full_private_address_ja) <> ''
    ),
  drop constraint if exists properties_master_full_private_address_zh_not_blank,
  add constraint properties_master_full_private_address_zh_not_blank
    check (
      full_private_address_zh is null
      or btrim(full_private_address_zh) <> ''
    ),
  drop constraint if exists properties_master_geo_address_used_not_blank,
  add constraint properties_master_geo_address_used_not_blank
    check (
      geo_address_used is null
      or btrim(geo_address_used) <> ''
    ),
  drop constraint if exists properties_master_geocode_provider_not_blank,
  add constraint properties_master_geocode_provider_not_blank
    check (
      geocode_provider is null
      or btrim(geocode_provider) <> ''
    );

create index if not exists idx_properties_master_partner_status
  on public.properties_master(source_partner_id, status);

create index if not exists idx_properties_master_address_review_required
  on public.properties_master(address_review_required)
  where address_review_required = true;

create index if not exists idx_properties_master_address_completeness
  on public.properties_master(address_completeness);

update public.properties_master pm
set source_partner_name_snapshot = p.display_name
from public.partners p
where pm.source_partner_id = p.id
  and pm.source_partner_name_snapshot is null;

update public.properties_master
set public_display_address_ja = address_ja
where public_display_address_ja is null
  and address_ja is not null;

update public.properties_master
set public_display_address_zh = address_zh
where public_display_address_zh is null
  and address_zh is not null;

update public.properties_master
set full_private_address_ja = address_ja
where full_private_address_ja is null
  and address_ja is not null;

update public.properties_master
set full_private_address_zh = address_zh
where full_private_address_zh is null
  and address_zh is not null;

update public.properties_master
set address_completeness = case
  when coalesce(nullif(btrim(full_private_address_ja), ''), nullif(btrim(full_private_address_zh), '')) is not null
    then 'complete'
  when coalesce(nullif(btrim(public_display_address_ja), ''), nullif(btrim(public_display_address_zh), '')) is not null
    then 'partial'
  else 'missing'
end
where address_completeness = 'missing';

-- ---------------------------------------------------------------------------
-- 3. tenant_property_bindings
-- Add marketing_status and supporting timestamps only.
-- No approve flow / binding orchestration change yet.
-- ---------------------------------------------------------------------------

alter table public.tenant_property_bindings
  add column if not exists marketing_status text not null default 'not_generated',
  add column if not exists archived_at timestamptz null,
  add column if not exists last_master_synced_at timestamptz null,
  add column if not exists last_marketing_generated_at timestamptz null,
  add column if not exists last_marketing_source_hash text null;

alter table public.tenant_property_bindings
  drop constraint if exists tenant_property_bindings_marketing_status_check,
  add constraint tenant_property_bindings_marketing_status_check
    check (marketing_status in ('not_generated', 'generated', 'updated', 'stale')),
  drop constraint if exists tenant_property_bindings_last_marketing_source_hash_not_blank,
  add constraint tenant_property_bindings_last_marketing_source_hash_not_blank
    check (
      last_marketing_source_hash is null
      or btrim(last_marketing_source_hash) <> ''
    );

create index if not exists idx_tenant_property_bindings_org_marketing_status
  on public.tenant_property_bindings(organization_id, marketing_status);

create index if not exists idx_tenant_property_bindings_master_marketing_status
  on public.tenant_property_bindings(property_master_id, marketing_status);

-- Existing bindings start as not_generated unless application runtime decides otherwise later.
update public.tenant_property_bindings
set marketing_status = 'not_generated'
where marketing_status is null;

-- ---------------------------------------------------------------------------
-- 4. partner_authorizations
-- Add validation-friendly indexes and lightweight consistency checks.
-- Keep this draft compatible with current runtime validation refactor plans.
-- ---------------------------------------------------------------------------

create index if not exists idx_partner_authorizations_org_partner_active
  on public.partner_authorizations(organization_id, partner_id)
  where is_active = true;

create index if not exists idx_partner_authorizations_partner_org_active
  on public.partner_authorizations(partner_id, organization_id)
  where is_active = true;

create index if not exists idx_partner_authorizations_org_active_created_at_desc
  on public.partner_authorizations(organization_id, created_at desc)
  where is_active = true;

alter table public.partner_authorizations
  drop constraint if exists partner_authorizations_active_flag_check,
  add constraint partner_authorizations_active_flag_check
    check (is_active in (true, false)),
  drop constraint if exists partner_authorizations_exclusive_flag_check,
  add constraint partner_authorizations_exclusive_flag_check
    check (is_exclusive in (true, false));

commit;

-- ---------------------------------------------------------------------------
-- Validation queries for review only. Do not run as migration steps.
-- ---------------------------------------------------------------------------
--
-- 1) Identify staging ingest rows that would block a future VALIDATE:
-- select id, organization_id, source_partner_id
-- from public.property_ingest_jobs
-- where source_partner_id is null;
--
-- 2) Identify jobs with partner ids that have no active authorization:
-- select j.id, j.organization_id, j.source_partner_id
-- from public.property_ingest_jobs j
-- left join public.partner_authorizations pa
--   on pa.organization_id = j.organization_id
--  and pa.partner_id = j.source_partner_id
--  and pa.is_active = true
-- where j.source_partner_id is not null
--   and pa.id is null;
--
-- 3) Inspect master rows that still need address review:
-- select id, source_partner_id, address_completeness, address_review_required
-- from public.properties_master
-- where address_completeness <> 'complete'
--    or address_review_required = true;
