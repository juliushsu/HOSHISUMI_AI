-- Staging-only seed for Japan partner management model (Phase P1.5)
-- Apply after 20260424170000_phase_j3_partner_management_v1.sql

begin;

insert into public.organizations (
  id,
  name,
  plan_type,
  organization_code,
  is_demo
)
values (
  '77777777-7777-4777-8777-777777777777',
  'World Eye Japan Partner (Staging)',
  'pro',
  'PARTNER_WORLD_EYE_STAGING',
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
  '78888888-8888-4888-8888-888888888888',
  '77777777-7777-4777-8777-777777777777',
  'Aki Tanaka',
  'aki@world-eye.jp',
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
  '91111111-1111-4111-8111-111111111111',
  '90000000-0000-4000-8000-000000000001',
  '77777777-7777-4777-8777-777777777777',
  '78888888-8888-4888-8888-888888888888',
  'Aki Tanaka',
  'aki@world-eye.jp',
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
  '81111111-1111-4111-8111-111111111111',
  '90000000-0000-4000-8000-000000000001',
  'japan_partner',
  'WE-2026-0001',
  'jp',
  'available',
  '{"title":"東京都港区南青山投資套房","layout":"1K","area_sqm":25.4}'::jsonb,
  '東京都港区南青山投資マンション',
  '東京都港區南青山投資套房',
  '東京都港区南青山1-2-3',
  '東京都港區南青山1-2-3',
  32800000,
  'JPY',
  '1K',
  25.4,
  '駅近で投資需要が安定したワンルーム。',
  '近站、投資需求穩定的一房物件。',
  '["https://img.hoshisumi.test/jp/we-0001-1.jpg"]'::jsonb,
  '{"seed":"staging_partner_management"}'::jsonb,
  now()
),
(
  '81111111-1111-4111-8111-111111111112',
  '90000000-0000-4000-8000-000000000001',
  'japan_partner',
  'WE-2026-0002',
  'jp',
  'available',
  '{"title":"東京都目黒区自住兩房","layout":"2DK","area_sqm":41.2}'::jsonb,
  '東京都目黒区2DK住宅',
  '東京都目黑區自住兩房',
  '東京都目黒区下目黒4-5-6',
  '東京都目黑區下目黑4-5-6',
  46800000,
  'JPY',
  '2DK',
  41.2,
  '自住與出租皆有競爭力。',
  '兼具自住與出租彈性的兩房物件。',
  '["https://img.hoshisumi.test/jp/we-0002-1.jpg"]'::jsonb,
  '{"seed":"staging_partner_management"}'::jsonb,
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

insert into public.tenant_property_bindings (
  id,
  property_master_id,
  organization_id,
  linked_property_id,
  visibility,
  tenant_status,
  source_status,
  effective_status,
  metadata_json
)
values
(
  '82222222-2222-4222-8222-222222222221',
  '81111111-1111-4111-8111-111111111111',
  '33333333-3333-4333-8333-333333333333',
  null,
  'active',
  'marketing',
  'available',
  'available',
  '{"seed":"staging_partner_management"}'::jsonb
),
(
  '82222222-2222-4222-8222-222222222222',
  '81111111-1111-4111-8111-111111111112',
  '33333333-3333-4333-8333-333333333333',
  null,
  'active',
  'draft',
  'available',
  'available',
  '{"seed":"staging_partner_management"}'::jsonb
)
on conflict (property_master_id, organization_id) do update
set
  linked_property_id = excluded.linked_property_id,
  visibility = excluded.visibility,
  tenant_status = excluded.tenant_status,
  source_status = excluded.source_status,
  effective_status = excluded.effective_status,
  metadata_json = excluded.metadata_json,
  updated_at = now();

commit;
