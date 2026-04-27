-- Staging-only seed for Hoshisumi Japan Test Realty owner-scope testing
-- Non-goals:
-- - do not touch production
-- - do not mutate world_eye / nippon_prime_realty formal seed rows
-- - do not change runtime contracts

begin;

insert into public.organizations (
  id,
  name,
  plan_type,
  organization_code,
  is_demo
)
values (
  '88888888-1111-4888-8111-888888888888',
  '星澄測試日本不動產株式会社',
  'pro',
  'HOSHISUMI_JP_TEST_PARTNER_STAGING',
  false
)
on conflict (id) do update
set
  name = excluded.name,
  plan_type = excluded.plan_type,
  organization_code = excluded.organization_code,
  is_demo = excluded.is_demo;

insert into public.agents (
  id,
  organization_id,
  name,
  email,
  role,
  is_active,
  is_demo
)
values (
  '78888888-1111-4888-8111-888888888888',
  '88888888-1111-4888-8111-888888888888',
  'Juliu Hsu (Japan Test Partner)',
  'juliushsu@gmail.com',
  'super_admin',
  true,
  false
)
on conflict (id) do update
set
  organization_id = excluded.organization_id,
  name = excluded.name,
  email = excluded.email,
  role = excluded.role,
  is_active = excluded.is_active,
  is_demo = excluded.is_demo;

insert into public.partners (
  id,
  company_name,
  display_name,
  country,
  status,
  default_fee_percent,
  line_intake_enabled,
  upload_intake_enabled,
  api_intake_enabled,
  partner_slug,
  intake_token,
  contact_email
)
values (
  '90000000-0000-4000-8000-000000000099',
  'Hoshisumi Japan Test Realty [STAGING_TEST_OWNER_TEST]',
  'Hoshisumi Japan Test Realty',
  'jp',
  'active',
  1.00,
  false,
  true,
  false,
  'hoshisumi_japan_test_partner',
  'staging-hoshisumi-jp-test-partner-token',
  'staging-hoshisumi-jp-test@hoshisumi.test'
)
on conflict (partner_slug) do update
set
  company_name = excluded.company_name,
  display_name = excluded.display_name,
  country = excluded.country,
  status = excluded.status,
  default_fee_percent = excluded.default_fee_percent,
  line_intake_enabled = excluded.line_intake_enabled,
  upload_intake_enabled = excluded.upload_intake_enabled,
  api_intake_enabled = excluded.api_intake_enabled,
  intake_token = excluded.intake_token,
  contact_email = excluded.contact_email,
  updated_at = now();

insert into public.partner_users (
  id,
  partner_id,
  organization_id,
  agent_id,
  name,
  email,
  role,
  is_active
)
values (
  '91111111-9999-4999-8999-999999999999',
  '90000000-0000-4000-8000-000000000099',
  '88888888-1111-4888-8111-888888888888',
  '78888888-1111-4888-8111-888888888888',
  'Juliu Hsu (Japan Test Partner)',
  'juliushsu@gmail.com',
  'admin',
  true
)
on conflict (id) do update
set
  partner_id = excluded.partner_id,
  organization_id = excluded.organization_id,
  agent_id = excluded.agent_id,
  name = excluded.name,
  email = excluded.email,
  role = excluded.role,
  is_active = excluded.is_active;

insert into public.partner_authorizations (
  id,
  partner_id,
  organization_id,
  is_exclusive,
  is_active,
  default_owner_agent_id
)
values (
  '92000000-0000-4000-8000-000000000099',
  '90000000-0000-4000-8000-000000000099',
  '33333333-3333-4333-8333-333333333333',
  false,
  true,
  '44444444-4444-4444-8444-444444444444'
)
on conflict (partner_id, organization_id) do update
set
  is_exclusive = excluded.is_exclusive,
  is_active = excluded.is_active,
  default_owner_agent_id = excluded.default_owner_agent_id;

insert into public.properties_master (
  id,
  source_partner_id,
  source_of_truth,
  source_property_ref,
  country,
  status,
  canonical_payload_json,
  title_ja,
  title_zh,
  address_ja,
  address_zh,
  price,
  currency,
  layout,
  area_sqm,
  description_ja,
  description_zh,
  image_urls,
  raw_source_payload,
  source_updated_at
)
values
(
  '81111111-9999-4999-8999-999999999991',
  '90000000-0000-4000-8000-000000000099',
  'japan_partner',
  'HS-TEST-2026-0001',
  'jp',
  'available',
  '{"title":"東京都新宿區測試投資套房","layout":"1K","area_sqm":24.8,"nearest_station":"新宿御苑前","walk_minutes":5,"platform_service_fee_percent":1.0}'::jsonb,
  '東京都新宿区テスト投資ワンルーム',
  '東京都新宿區測試投資套房',
  '東京都新宿区新宿1-10-10',
  '東京都新宿區新宿1-10-10',
  31800000,
  'JPY',
  '1K',
  24.8,
  'テスト用の駅近投資ワンルーム。',
  '專供 staging owner 測試的近站投資套房。',
  '["https://img.hoshisumi.test/jp/hs-test-0001-1.jpg"]'::jsonb,
  '{"seed":"staging_owner_japan_test_partner_scope_v1","staging_test":true,"owner_test":true,"service_fee_model":"platform_service_fee","source_partner_name_snapshot":"Hoshisumi Japan Test Realty"}'::jsonb,
  now()
),
(
  '81111111-9999-4999-8999-999999999992',
  '90000000-0000-4000-8000-000000000099',
  'japan_partner',
  'HS-TEST-2026-0002',
  'jp',
  'available',
  '{"title":"大阪市北區測試自住兩房","layout":"2DK","area_sqm":42.1,"nearest_station":"中津","walk_minutes":6,"platform_service_fee_percent":1.0}'::jsonb,
  '大阪市北区テスト2DK住宅',
  '大阪市北區測試自住兩房',
  '大阪府大阪市北区中津2-8-8',
  '大阪府大阪市北區中津2-8-8',
  42800000,
  'JPY',
  '2DK',
  42.1,
  'テスト用の自住向け2DK。',
  '專供 staging owner 測試的 2DK 日本住宅。',
  '["https://img.hoshisumi.test/jp/hs-test-0002-1.jpg"]'::jsonb,
  '{"seed":"staging_owner_japan_test_partner_scope_v1","staging_test":true,"owner_test":true,"service_fee_model":"platform_service_fee","source_partner_name_snapshot":"Hoshisumi Japan Test Realty"}'::jsonb,
  now()
)
on conflict (id) do update
set
  source_partner_id = excluded.source_partner_id,
  source_of_truth = excluded.source_of_truth,
  source_property_ref = excluded.source_property_ref,
  country = excluded.country,
  status = excluded.status,
  canonical_payload_json = excluded.canonical_payload_json,
  title_ja = excluded.title_ja,
  title_zh = excluded.title_zh,
  address_ja = excluded.address_ja,
  address_zh = excluded.address_zh,
  price = excluded.price,
  currency = excluded.currency,
  layout = excluded.layout,
  area_sqm = excluded.area_sqm,
  description_ja = excluded.description_ja,
  description_zh = excluded.description_zh,
  image_urls = excluded.image_urls,
  raw_source_payload = excluded.raw_source_payload,
  source_updated_at = excluded.source_updated_at,
  updated_at = now();

insert into public.properties (
  id,
  organization_id,
  owner_agent_id,
  partner_id,
  title,
  description,
  price,
  country,
  status,
  service_types,
  current_stage,
  is_rental_enabled,
  is_management_enabled,
  source,
  source_type,
  source_partner,
  cross_border_fee_percent,
  intake_status,
  raw_source_files_count,
  property_code,
  title_ja,
  title_zh,
  description_ja,
  description_zh,
  address_ja,
  address_zh,
  purpose,
  property_type,
  currency,
  area_sqm,
  layout,
  building_age,
  nearest_station,
  walking_minutes,
  source_ref,
  cover_image_url,
  gallery_urls,
  raw_source_payload
)
values
(
  '83333333-9999-4999-8999-999999999991',
  '33333333-3333-4333-8333-333333333333',
  '44444444-4444-4444-8444-444444444444',
  '90000000-0000-4000-8000-000000000099',
  '東京都新宿區測試投資套房',
  '專供 staging owner 測試的近站投資套房。',
  31800000,
  'jp',
  'available',
  array['sale']::text[],
  'sale_active',
  false,
  false,
  'api',
  'api_sync',
  'hoshisumi_japan_test_partner',
  1.00,
  'imported',
  0,
  'HS-TEST-0001',
  '東京都新宿区テスト投資ワンルーム',
  '東京都新宿區測試投資套房',
  'テスト用の駅近投資ワンルーム。',
  '專供 staging owner 測試的近站投資套房。',
  '東京都新宿区新宿1-10-10',
  '東京都新宿區新宿1-10-10',
  'sale',
  'apartment',
  'JPY',
  24.8,
  '1K',
  8,
  '新宿御苑前',
  5,
  'HS-TEST-2026-0001',
  'https://img.hoshisumi.test/jp/hs-test-0001-1.jpg',
  '["https://img.hoshisumi.test/jp/hs-test-0001-1.jpg"]'::jsonb,
  '{"seed":"staging_owner_japan_test_partner_scope_v1","staging_test":true,"owner_test":true,"property_master_id":"81111111-9999-4999-8999-999999999991","source_partner_name_snapshot":"Hoshisumi Japan Test Realty"}'::jsonb
),
(
  '83333333-9999-4999-8999-999999999992',
  '33333333-3333-4333-8333-333333333333',
  '44444444-4444-4444-8444-444444444444',
  '90000000-0000-4000-8000-000000000099',
  '大阪市北區測試自住兩房',
  '專供 staging owner 測試的 2DK 日本住宅。',
  42800000,
  'jp',
  'available',
  array['sale']::text[],
  'sale_active',
  false,
  false,
  'api',
  'api_sync',
  'hoshisumi_japan_test_partner',
  1.00,
  'imported',
  0,
  'HS-TEST-0002',
  '大阪市北区テスト2DK住宅',
  '大阪市北區測試自住兩房',
  'テスト用の自住向け2DK。',
  '專供 staging owner 測試的 2DK 日本住宅。',
  '大阪府大阪市北区中津2-8-8',
  '大阪府大阪市北區中津2-8-8',
  'sale',
  'apartment',
  'JPY',
  42.1,
  '2DK',
  12,
  '中津',
  6,
  'HS-TEST-2026-0002',
  'https://img.hoshisumi.test/jp/hs-test-0002-1.jpg',
  '["https://img.hoshisumi.test/jp/hs-test-0002-1.jpg"]'::jsonb,
  '{"seed":"staging_owner_japan_test_partner_scope_v1","staging_test":true,"owner_test":true,"property_master_id":"81111111-9999-4999-8999-999999999992","source_partner_name_snapshot":"Hoshisumi Japan Test Realty"}'::jsonb
)
on conflict (id) do update
set
  organization_id = excluded.organization_id,
  owner_agent_id = excluded.owner_agent_id,
  partner_id = excluded.partner_id,
  title = excluded.title,
  description = excluded.description,
  price = excluded.price,
  country = excluded.country,
  status = excluded.status,
  service_types = excluded.service_types,
  current_stage = excluded.current_stage,
  is_rental_enabled = excluded.is_rental_enabled,
  is_management_enabled = excluded.is_management_enabled,
  source = excluded.source,
  source_type = excluded.source_type,
  source_partner = excluded.source_partner,
  cross_border_fee_percent = excluded.cross_border_fee_percent,
  intake_status = excluded.intake_status,
  raw_source_files_count = excluded.raw_source_files_count,
  property_code = excluded.property_code,
  title_ja = excluded.title_ja,
  title_zh = excluded.title_zh,
  description_ja = excluded.description_ja,
  description_zh = excluded.description_zh,
  address_ja = excluded.address_ja,
  address_zh = excluded.address_zh,
  purpose = excluded.purpose,
  property_type = excluded.property_type,
  currency = excluded.currency,
  area_sqm = excluded.area_sqm,
  layout = excluded.layout,
  building_age = excluded.building_age,
  nearest_station = excluded.nearest_station,
  walking_minutes = excluded.walking_minutes,
  source_ref = excluded.source_ref,
  cover_image_url = excluded.cover_image_url,
  gallery_urls = excluded.gallery_urls,
  raw_source_payload = excluded.raw_source_payload,
  updated_at = now();

insert into public.tenant_property_bindings (
  id,
  property_master_id,
  organization_id,
  linked_property_id,
  visibility,
  tenant_status,
  source_status,
  metadata_json
)
values
(
  '82222222-9999-4999-8999-999999999991',
  '81111111-9999-4999-8999-999999999991',
  '33333333-3333-4333-8333-333333333333',
  '83333333-9999-4999-8999-999999999991',
  'active',
  'marketing',
  'available',
  '{"seed":"staging_owner_japan_test_partner_scope_v1","staging_test":true,"owner_test":true,"is_visible":true,"is_marketing_enabled":true,"property_projection_id":"83333333-9999-4999-8999-999999999991","source_partner_name_snapshot":"Hoshisumi Japan Test Realty"}'::jsonb
),
(
  '82222222-9999-4999-8999-999999999992',
  '81111111-9999-4999-8999-999999999992',
  '33333333-3333-4333-8333-333333333333',
  '83333333-9999-4999-8999-999999999992',
  'active',
  'marketing',
  'available',
  '{"seed":"staging_owner_japan_test_partner_scope_v1","staging_test":true,"owner_test":true,"is_visible":true,"is_marketing_enabled":true,"property_projection_id":"83333333-9999-4999-8999-999999999992","source_partner_name_snapshot":"Hoshisumi Japan Test Realty"}'::jsonb
)
on conflict (id) do update
set
  property_master_id = excluded.property_master_id,
  organization_id = excluded.organization_id,
  linked_property_id = excluded.linked_property_id,
  visibility = excluded.visibility,
  tenant_status = excluded.tenant_status,
  source_status = excluded.source_status,
  metadata_json = excluded.metadata_json,
  updated_at = now();

insert into public.property_ingest_jobs (
  id,
  organization_id,
  company_id,
  store_id,
  environment_type,
  created_by,
  reviewed_by,
  source_type,
  source_channel,
  source_partner_id,
  metadata_json,
  status,
  ocr_status,
  translation_status,
  primary_file_name,
  primary_file_mime_type,
  primary_file_size_bytes,
  current_ocr_text_ja,
  current_translated_fields_json,
  current_reviewed_fields_json,
  approved_property_id,
  created_at,
  updated_at,
  reviewed_at,
  approved_at
)
values (
  '70111111-1111-4711-8111-111111111199',
  '33333333-3333-4333-8333-333333333333',
  null,
  null,
  'staging',
  'e6b1899a-5e14-4440-9e85-17ff20333cc9',
  'e6b1899a-5e14-4440-9e85-17ff20333cc9',
  'manual_admin',
  'upload',
  '90000000-0000-4000-8000-000000000099',
  '{"seed":"staging_owner_japan_test_partner_scope_v1","staging_test":true,"owner_test":true,"source_partner_name_snapshot":"Hoshisumi Japan Test Realty","sample_property_master_id":"81111111-9999-4999-8999-999999999991"}'::jsonb,
  'approved',
  'done',
  'done',
  'hs-test-owner-upload.pdf',
  'application/pdf',
  204800,
  'テストOCRテキスト',
  '{"title_zh":"東京都新宿區測試投資套房","price":31800000}'::jsonb,
  '{"title_zh":"東京都新宿區測試投資套房","price":31800000}'::jsonb,
  '83333333-9999-4999-8999-999999999991',
  now(),
  now(),
  now(),
  now()
)
on conflict (id) do update
set
  organization_id = excluded.organization_id,
  created_by = excluded.created_by,
  reviewed_by = excluded.reviewed_by,
  source_type = excluded.source_type,
  source_channel = excluded.source_channel,
  source_partner_id = excluded.source_partner_id,
  metadata_json = excluded.metadata_json,
  status = excluded.status,
  ocr_status = excluded.ocr_status,
  translation_status = excluded.translation_status,
  primary_file_name = excluded.primary_file_name,
  primary_file_mime_type = excluded.primary_file_mime_type,
  primary_file_size_bytes = excluded.primary_file_size_bytes,
  current_ocr_text_ja = excluded.current_ocr_text_ja,
  current_translated_fields_json = excluded.current_translated_fields_json,
  current_reviewed_fields_json = excluded.current_reviewed_fields_json,
  approved_property_id = excluded.approved_property_id,
  reviewed_at = excluded.reviewed_at,
  approved_at = excluded.approved_at,
  updated_at = now();

commit;
