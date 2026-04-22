-- Phase 2.3 staging-safe data patch (minimal real-looking data, idempotent)
-- Target organization: staging bridge org

begin;

insert into public.organizations (id, name, plan_type)
values ('33333333-3333-4333-8333-333333333333', '星澄地所台北信義店（Staging）', 'pro')
on conflict (id) do nothing;

insert into public.agents (id, organization_id, name, role, is_active)
values
  ('44444444-4444-4444-8444-444444444444', '33333333-3333-4333-8333-333333333333', '資深業務（日本投資客）', 'owner', true),
  ('55555555-5555-4555-8555-555555555555', '33333333-3333-4333-8333-333333333333', '一般業務（台灣自住）', 'manager', true),
  ('66666666-6666-4666-8666-666666666666', '33333333-3333-4333-8333-333333333333', '新人', 'agent', true)
on conflict (id) do update
set
  organization_id = excluded.organization_id,
  name = excluded.name,
  role = excluded.role,
  is_active = excluded.is_active;

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
values
  (
    '90000000-0000-4000-8000-000000000001',
    'World Eye Co., Ltd.',
    'world_eye',
    'jp',
    'active',
    1.00,
    true,
    true,
    false,
    'world_eye',
    'staging-world-eye-token',
    'staging-world-eye@hoshisumi.test'
  ),
  (
    '90000000-0000-4000-8000-000000000002',
    'Nippon Prime Realty',
    'nippon_prime_realty',
    'jp',
    'active',
    1.20,
    false,
    true,
    true,
    'nippon_prime_realty',
    'staging-nippon-prime-token',
    'staging-nippon-prime@hoshisumi.test'
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

insert into public.partner_authorizations (
  id,
  partner_id,
  organization_id,
  is_exclusive,
  is_active,
  default_owner_agent_id
)
select
  x.id,
  p.id,
  '33333333-3333-4333-8333-333333333333',
  false,
  true,
  x.default_owner_agent_id
from (
  values
    ('92000000-0000-4000-8000-000000000001'::uuid, 'world_eye'::text, '44444444-4444-4444-8444-444444444444'::uuid),
    ('92000000-0000-4000-8000-000000000002'::uuid, 'nippon_prime_realty'::text, '55555555-5555-4555-8555-555555555555'::uuid)
) as x(id, partner_slug, default_owner_agent_id)
join public.partners p on p.partner_slug = x.partner_slug
on conflict (partner_id, organization_id) do update
set
  is_exclusive = excluded.is_exclusive,
  is_active = excluded.is_active,
  default_owner_agent_id = excluded.default_owner_agent_id;

insert into public.clients (
  id,
  organization_id,
  assigned_agent_id,
  name,
  phone,
  line_id,
  client_type,
  consent_property_tw,
  consent_property_jp,
  consent_contact_line,
  consent_contact_phone,
  consent_post_sale_follow,
  unsubscribe_all,
  consent_timestamp,
  consent_source
)
values
  (
    'c1111111-1111-4111-8111-111111111111',
    '33333333-3333-4333-8333-333333333333',
    '44444444-4444-4444-8444-444444444444',
    '高橋一郎',
    '0900-100-001',
    'line_takahashi',
    'japan',
    false,
    true,
    true,
    true,
    true,
    false,
    now() - interval '8 days',
    'staging_safe_seed'
  ),
  (
    'c2222222-2222-4222-8222-222222222222',
    '33333333-3333-4333-8333-333333333333',
    '44444444-4444-4444-8444-444444444444',
    '林雅惠',
    '0900-100-002',
    'line_lin_ya_hui',
    'investment',
    true,
    true,
    true,
    true,
    false,
    false,
    now() - interval '7 days',
    'staging_safe_seed'
  ),
  (
    'c3333333-3333-4333-8333-333333333333',
    '33333333-3333-4333-8333-333333333333',
    '55555555-5555-4555-8555-555555555555',
    '王先生',
    '0900-100-003',
    'line_wang_home',
    'self_use',
    true,
    false,
    true,
    true,
    true,
    false,
    now() - interval '6 days',
    'staging_safe_seed'
  ),
  (
    'c4444444-4444-4444-8444-444444444444',
    '33333333-3333-4333-8333-333333333333',
    '55555555-5555-4555-8555-555555555555',
    '陳小姐',
    '0900-100-004',
    null,
    'self_use',
    true,
    false,
    false,
    true,
    false,
    false,
    now() - interval '5 days',
    'staging_safe_seed'
  ),
  (
    'c5555555-5555-4555-8555-555555555555',
    '33333333-3333-4333-8333-333333333333',
    '66666666-6666-4666-8666-666666666666',
    '許先生',
    '0900-100-005',
    'line_hsu_new',
    'investment',
    true,
    true,
    true,
    false,
    false,
    false,
    now() - interval '4 days',
    'staging_safe_seed'
  ),
  (
    'c6666666-6666-4666-8666-666666666666',
    '33333333-3333-4333-8333-333333333333',
    '66666666-6666-4666-8666-666666666666',
    '張小姐',
    '0900-100-006',
    null,
    'japan',
    false,
    true,
    true,
    true,
    true,
    false,
    now() - interval '3 days',
    'staging_safe_seed'
  )
on conflict (id) do update
set
  assigned_agent_id = excluded.assigned_agent_id,
  name = excluded.name,
  phone = excluded.phone,
  line_id = excluded.line_id,
  client_type = excluded.client_type,
  consent_property_tw = excluded.consent_property_tw,
  consent_property_jp = excluded.consent_property_jp,
  consent_contact_line = excluded.consent_contact_line,
  consent_contact_phone = excluded.consent_contact_phone,
  consent_post_sale_follow = excluded.consent_post_sale_follow,
  unsubscribe_all = excluded.unsubscribe_all,
  consent_timestamp = excluded.consent_timestamp,
  consent_source = excluded.consent_source;

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
  source,
  source_type,
  source_partner,
  cross_border_fee_percent,
  intake_status,
  raw_source_files_count,
  images,
  layout_image
)
select
  x.id,
  '33333333-3333-4333-8333-333333333333',
  x.owner_agent_id,
  p.id,
  x.title,
  x.description,
  x.price,
  x.country,
  x.status,
  x.source,
  x.source_type,
  x.source_partner,
  x.cross_border_fee_percent,
  x.intake_status,
  x.raw_source_files_count,
  x.images::jsonb,
  x.layout_image
from (
  values
    (
      'a1111111-1111-4111-8111-111111111111'::uuid,
      '44444444-4444-4444-8444-444444444444'::uuid,
      'world_eye'::text,
      '東京港區赤坂投資套房',
      'World Eye intake：近赤坂站，租賃中。',
      46800000::numeric,
      'jp'::text,
      'available'::text,
      'import'::text,
      'japan_line'::text,
      'world_eye'::text,
      1.00::numeric,
      'imported'::text,
      3::int,
      '["https://img.hoshisumi.test/tokyo-akasaka-1.jpg","https://img.hoshisumi.test/tokyo-akasaka-2.jpg"]'::text,
      'https://img.hoshisumi.test/tokyo-akasaka-layout.jpg'::text
    ),
    (
      'a2222222-2222-4222-8222-222222222222'::uuid,
      '55555555-5555-4555-8555-555555555555'::uuid,
      'world_eye'::text,
      '大阪難波商圈收租公寓',
      'World Eye intake：商圈核心，回報率穩定。',
      35800000::numeric,
      'jp'::text,
      'available'::text,
      'api'::text,
      'japan_api'::text,
      'world_eye'::text,
      1.00::numeric,
      'ready_to_publish'::text,
      2::int,
      '["https://img.hoshisumi.test/osaka-namba-1.jpg"]'::text,
      null::text
    ),
    (
      'a3333333-3333-4333-8333-333333333333'::uuid,
      '55555555-5555-4555-8555-555555555555'::uuid,
      null::text,
      '台北大安兩房電梯宅',
      '一般台灣物件：生活機能完整，近捷運。',
      24800000::numeric,
      'tw'::text,
      'available'::text,
      'manual'::text,
      'manual'::text,
      null::text,
      1.00::numeric,
      'assigned'::text,
      0::int,
      '["https://img.hoshisumi.test/taipei-daan-1.jpg"]'::text,
      'https://img.hoshisumi.test/taipei-daan-layout.jpg'::text
    ),
    (
      'a4444444-4444-4444-8444-444444444444'::uuid,
      '66666666-6666-4666-8666-666666666666'::uuid,
      null::text,
      '新北板橋三房車位',
      '一般台灣物件：屋況佳，可立即帶看。',
      18800000::numeric,
      'tw'::text,
      'negotiating'::text,
      'manual'::text,
      'manual'::text,
      null::text,
      1.00::numeric,
      'assigned'::text,
      0::int,
      '[]'::text,
      null::text
    ),
    (
      'a5555555-5555-4555-8555-555555555555'::uuid,
      null::uuid,
      'nippon_prime_realty'::text,
      '京都中京區旅宿改裝案',
      '跨境 intake：資料待補中，先進分析流程。',
      27800000::numeric,
      'jp'::text,
      'available'::text,
      'import'::text,
      'import'::text,
      'nippon_prime_realty'::text,
      1.20::numeric,
      'analyzing'::text,
      5::int,
      '["https://img.hoshisumi.test/kyoto-1.jpg"]'::text,
      null::text
    ),
    (
      'a6666666-6666-4666-8666-666666666666'::uuid,
      '44444444-4444-4444-8444-444444444444'::uuid,
      null::text,
      '台中西屯預售兩房',
      '一般台灣物件：近園區，換約討論中。',
      13800000::numeric,
      'tw'::text,
      'sold'::text,
      'manual'::text,
      'manual'::text,
      null::text,
      1.00::numeric,
      'assigned'::text,
      1::int,
      '["https://img.hoshisumi.test/taichung-xitun-1.jpg"]'::text,
      null::text
    )
) as x(
  id,
  owner_agent_id,
  partner_slug,
  title,
  description,
  price,
  country,
  status,
  source,
  source_type,
  source_partner,
  cross_border_fee_percent,
  intake_status,
  raw_source_files_count,
  images,
  layout_image
)
left join public.partners p on p.partner_slug = x.partner_slug
on conflict (id) do update
set
  owner_agent_id = excluded.owner_agent_id,
  partner_id = excluded.partner_id,
  title = excluded.title,
  description = excluded.description,
  price = excluded.price,
  country = excluded.country,
  status = excluded.status,
  source = excluded.source,
  source_type = excluded.source_type,
  source_partner = excluded.source_partner,
  cross_border_fee_percent = excluded.cross_border_fee_percent,
  intake_status = excluded.intake_status,
  raw_source_files_count = excluded.raw_source_files_count,
  images = excluded.images,
  layout_image = excluded.layout_image,
  updated_at = now();

insert into public.ai_usage_logs (
  id,
  organization_id,
  agent_id,
  action_type,
  tokens_used,
  created_at
)
values
  ('b1111111-1111-4111-8111-111111111111', '33333333-3333-4333-8333-333333333333', '44444444-4444-4444-8444-444444444444', 'translate_property', 980, now() - interval '6 days'),
  ('b2222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333', '44444444-4444-4444-8444-444444444444', 'generate_post', 720, now() - interval '5 days'),
  ('b3333333-3333-4333-8333-333333333333', '33333333-3333-4333-8333-333333333333', '55555555-5555-4555-8555-555555555555', 'generate_post', 650, now() - interval '4 days'),
  ('b4444444-4444-4444-8444-444444444444', '33333333-3333-4333-8333-333333333333', '66666666-6666-4666-8666-666666666666', 'translate_property', 540, now() - interval '3 days'),
  ('b5555555-5555-4555-8555-555555555555', '33333333-3333-4333-8333-333333333333', '55555555-5555-4555-8555-555555555555', 'generate_post', 610, now() - interval '2 days'),
  ('b6666666-6666-4666-8666-666666666666', '33333333-3333-4333-8333-333333333333', '44444444-4444-4444-8444-444444444444', 'generate_post', 760, now() - interval '1 day')
on conflict (id) do update
set
  organization_id = excluded.organization_id,
  agent_id = excluded.agent_id,
  action_type = excluded.action_type,
  tokens_used = excluded.tokens_used,
  created_at = excluded.created_at;

update public.properties
set
  service_types = array['sale', 'rental']::text[],
  current_stage = 'rental_listing',
  owner_client_id = 'c1111111-1111-4111-8111-111111111111',
  is_rental_enabled = true
where id = 'a1111111-1111-4111-8111-111111111111';

update public.properties
set
  service_types = array['sale', 'rental']::text[],
  current_stage = 'rented',
  owner_client_id = 'c3333333-3333-4333-8333-333333333333',
  is_rental_enabled = true
where id = 'a3333333-3333-4333-8333-333333333333';

update public.properties
set
  service_types = array['sale', 'management']::text[],
  current_stage = 'under_management',
  owner_client_id = 'c1111111-1111-4111-8111-111111111111',
  is_management_enabled = true
where id = 'a2222222-2222-4222-8222-222222222222';

update public.properties
set
  service_types = array['sale', 'management']::text[],
  current_stage = 'vacancy',
  owner_client_id = 'c4444444-4444-4444-8444-444444444444',
  is_management_enabled = true
where id = 'a4444444-4444-4444-8444-444444444444';

insert into public.rental_cases (
  id,
  organization_id,
  property_id,
  owner_client_id,
  listing_status,
  expected_rent,
  actual_rent,
  available_from,
  rented_at,
  created_by_agent_id,
  updated_by_agent_id
)
values
  (
    'd1111111-1111-4111-8111-111111111111',
    '33333333-3333-4333-8333-333333333333',
    'a1111111-1111-4111-8111-111111111111',
    'c1111111-1111-4111-8111-111111111111',
    'listed',
    118000,
    null,
    current_date + interval '14 days',
    null,
    '44444444-4444-4444-8444-444444444444',
    '44444444-4444-4444-8444-444444444444'
  ),
  (
    'd2222222-2222-4222-8222-222222222222',
    '33333333-3333-4333-8333-333333333333',
    'a3333333-3333-4333-8333-333333333333',
    'c3333333-3333-4333-8333-333333333333',
    'rented',
    52000,
    50000,
    current_date - interval '20 days',
    now() - interval '10 days',
    '55555555-5555-4555-8555-555555555555',
    '55555555-5555-4555-8555-555555555555'
  )
on conflict (id) do update
set
  organization_id = excluded.organization_id,
  property_id = excluded.property_id,
  owner_client_id = excluded.owner_client_id,
  listing_status = excluded.listing_status,
  expected_rent = excluded.expected_rent,
  actual_rent = excluded.actual_rent,
  available_from = excluded.available_from,
  rented_at = excluded.rented_at,
  updated_by_agent_id = excluded.updated_by_agent_id,
  updated_at = now();

insert into public.management_cases (
  id,
  organization_id,
  property_id,
  owner_client_id,
  rent,
  rent_due_day,
  management_fee,
  lease_start,
  lease_end,
  status,
  tenant_name,
  created_by_agent_id,
  updated_by_agent_id
)
values
  (
    'e1111111-1111-4111-8111-111111111111',
    '33333333-3333-4333-8333-333333333333',
    'a2222222-2222-4222-8222-222222222222',
    'c1111111-1111-4111-8111-111111111111',
    132000,
    5,
    6000,
    current_date - interval '120 days',
    current_date + interval '245 days',
    'active',
    '佐藤健一',
    '44444444-4444-4444-8444-444444444444',
    '44444444-4444-4444-8444-444444444444'
  ),
  (
    'e2222222-2222-4222-8222-222222222222',
    '33333333-3333-4333-8333-333333333333',
    'a4444444-4444-4444-8444-444444444444',
    'c4444444-4444-4444-8444-444444444444',
    38000,
    10,
    2800,
    current_date - interval '300 days',
    current_date - interval '5 days',
    'vacancy',
    null,
    '55555555-5555-4555-8555-555555555555',
    '55555555-5555-4555-8555-555555555555'
  )
on conflict (id) do update
set
  organization_id = excluded.organization_id,
  property_id = excluded.property_id,
  owner_client_id = excluded.owner_client_id,
  rent = excluded.rent,
  rent_due_day = excluded.rent_due_day,
  management_fee = excluded.management_fee,
  lease_start = excluded.lease_start,
  lease_end = excluded.lease_end,
  status = excluded.status,
  tenant_name = excluded.tenant_name,
  updated_by_agent_id = excluded.updated_by_agent_id,
  updated_at = now();

insert into public.management_events (
  id,
  organization_id,
  management_case_id,
  event_type,
  title,
  description,
  amount,
  event_date,
  created_by_agent_id
)
values
  (
    'f1111111-1111-4111-8111-111111111111',
    '33333333-3333-4333-8333-333333333333',
    'e1111111-1111-4111-8111-111111111111',
    'rent_received',
    '三月租金入帳',
    'World Eye 物件租金已入帳。',
    132000,
    now() - interval '20 days',
    '44444444-4444-4444-8444-444444444444'
  ),
  (
    'f2222222-2222-4222-8222-222222222222',
    '33333333-3333-4333-8333-333333333333',
    'e1111111-1111-4111-8111-111111111111',
    'repair',
    '冷氣維修',
    '租客反映冷氣異音，已安排修繕。',
    8500,
    now() - interval '12 days',
    '44444444-4444-4444-8444-444444444444'
  ),
  (
    'f3333333-3333-4333-8333-333333333333',
    '33333333-3333-4333-8333-333333333333',
    'e2222222-2222-4222-8222-222222222222',
    'tenant_issue',
    '前租客退租爭議',
    '押金返還細節需與屋主確認。',
    null,
    now() - interval '8 days',
    '55555555-5555-4555-8555-555555555555'
  ),
  (
    'f4444444-4444-4444-8444-444444444444',
    '33333333-3333-4333-8333-333333333333',
    'e2222222-2222-4222-8222-222222222222',
    'inspection',
    '空屋巡檢完成',
    '台灣物件空屋巡檢，待重新上架出租。',
    null,
    now() - interval '2 days',
    '55555555-5555-4555-8555-555555555555'
  )
on conflict (id) do update
set
  organization_id = excluded.organization_id,
  management_case_id = excluded.management_case_id,
  event_type = excluded.event_type,
  title = excluded.title,
  description = excluded.description,
  amount = excluded.amount,
  event_date = excluded.event_date,
  created_by_agent_id = excluded.created_by_agent_id;

insert into public.stores (
  id,
  organization_id,
  name,
  slug,
  city,
  district,
  service_area_text,
  tagline,
  introduction,
  phone,
  email,
  address,
  line_url,
  business_hours,
  logo_url,
  cover_image_url,
  is_active,
  theme_key,
  theme_overrides
)
values
  (
    '71000000-0000-4000-8000-000000000001',
    '33333333-3333-4333-8333-333333333333',
    '星澄地所台北信義店',
    'xinyi-store',
    '台北市',
    '信義區',
    '信義區 / 大安區 / 松山區',
    '安心買賣・託租代管',
    '在地門店團隊，專注台北核心住宅與跨境收租型物件。',
    '02-2722-0001',
    'xinyi-store@hoshisumi.test',
    '台北市信義區松壽路 18 號',
    'https://line.me/ti/p/xinyi-store',
    'Mon-Sun 10:00-19:00',
    'https://img.hoshisumi.test/storefront/xinyi-logo.png',
    'https://img.hoshisumi.test/storefront/xinyi-cover.jpg',
    true,
    'tw_classic_green',
    '{}'::jsonb
  )
on conflict (id) do update
set
  organization_id = excluded.organization_id,
  name = excluded.name,
  slug = excluded.slug,
  city = excluded.city,
  district = excluded.district,
  service_area_text = excluded.service_area_text,
  tagline = excluded.tagline,
  introduction = excluded.introduction,
  phone = excluded.phone,
  email = excluded.email,
  address = excluded.address,
  line_url = excluded.line_url,
  business_hours = excluded.business_hours,
  logo_url = excluded.logo_url,
  cover_image_url = excluded.cover_image_url,
  is_active = excluded.is_active,
  theme_key = excluded.theme_key,
  theme_overrides = excluded.theme_overrides,
  updated_at = now();

insert into public.store_domains (
  id,
  store_id,
  subdomain,
  custom_domain,
  is_primary,
  is_active
)
values
  (
    '71100000-0000-4000-8000-000000000001',
    '71000000-0000-4000-8000-000000000001',
    'xinyi-staging',
    null,
    true,
    true
  )
on conflict (id) do update
set
  store_id = excluded.store_id,
  subdomain = excluded.subdomain,
  custom_domain = excluded.custom_domain,
  is_primary = excluded.is_primary,
  is_active = excluded.is_active,
  updated_at = now();

update public.agents
set
  store_id = '71000000-0000-4000-8000-000000000001',
  slug = 'senior-jp-advisor',
  bio = '專注日本投資與收租型物件，熟悉跨境流程。',
  service_area = '信義區 / 日本東京都心',
  avatar_url = 'https://img.hoshisumi.test/agents/senior-jp-advisor.jpg',
  phone_public = '0900-200-001',
  line_url = 'https://line.me/ti/p/senior-jp-advisor',
  is_public = true,
  updated_at = now()
where id = '44444444-4444-4444-8444-444444444444';

update public.agents
set
  store_id = '71000000-0000-4000-8000-000000000001',
  slug = 'tw-home-consultant',
  bio = '專注台北自住買賣與託租管理，提供完整售後諮詢。',
  service_area = '信義區 / 大安區',
  avatar_url = 'https://img.hoshisumi.test/agents/tw-home-consultant.jpg',
  phone_public = '0900-200-002',
  line_url = 'https://line.me/ti/p/tw-home-consultant',
  is_public = true,
  updated_at = now()
where id = '55555555-5555-4555-8555-555555555555';

update public.agents
set
  store_id = '71000000-0000-4000-8000-000000000001',
  slug = 'junior-assistant',
  bio = '門店行政與帶看支援。',
  service_area = '信義區',
  avatar_url = 'https://img.hoshisumi.test/agents/junior-assistant.jpg',
  phone_public = null,
  line_url = null,
  is_public = false,
  updated_at = now()
where id = '66666666-6666-4666-8666-666666666666';

insert into public.store_services (
  id,
  store_id,
  service_type,
  buy,
  sell,
  rental,
  management,
  consultation,
  title,
  description,
  is_enabled,
  sort_order
)
values
  (
    '71200000-0000-4000-8000-000000000001',
    '71000000-0000-4000-8000-000000000001',
    'buy',
    true,
    true,
    true,
    true,
    true,
    '買賣與代管整合服務',
    '單店一站完成買賣、託租、代管流程。',
    true,
    0
  ),
  (
    '71200000-0000-4000-8000-000000000002',
    '71000000-0000-4000-8000-000000000001',
    'rental',
    false,
    false,
    true,
    true,
    true,
    '託租代管服務',
    '租客媒合、租後管理、空屋巡檢。',
    true,
    1
  ),
  (
    '71200000-0000-4000-8000-000000000003',
    '71000000-0000-4000-8000-000000000001',
    'consultation',
    true,
    true,
    true,
    true,
    true,
    '置產諮詢服務',
    '台日跨境置產與稅務初步諮詢。',
    true,
    2
  )
on conflict (id) do update
set
  store_id = excluded.store_id,
  service_type = excluded.service_type,
  buy = excluded.buy,
  sell = excluded.sell,
  rental = excluded.rental,
  management = excluded.management,
  consultation = excluded.consultation,
  title = excluded.title,
  description = excluded.description,
  is_enabled = excluded.is_enabled,
  sort_order = excluded.sort_order,
  updated_at = now();

insert into public.store_property_publications (
  id,
  store_id,
  property_id,
  purpose,
  publication_type,
  featured,
  normal,
  is_public,
  display_order,
  published_at,
  unpublished_at
)
values
  (
    '71300000-0000-4000-8000-000000000001',
    '71000000-0000-4000-8000-000000000001',
    'a3333333-3333-4333-8333-333333333333',
    'sale',
    'featured',
    true,
    false,
    true,
    0,
    now() - interval '9 days',
    null
  ),
  (
    '71300000-0000-4000-8000-000000000002',
    '71000000-0000-4000-8000-000000000001',
    'a4444444-4444-4444-8444-444444444444',
    'sale',
    'normal',
    false,
    true,
    true,
    1,
    now() - interval '8 days',
    null
  ),
  (
    '71300000-0000-4000-8000-000000000003',
    '71000000-0000-4000-8000-000000000001',
    'a1111111-1111-4111-8111-111111111111',
    'rental',
    'featured',
    true,
    false,
    true,
    2,
    now() - interval '7 days',
    null
  ),
  (
    '71300000-0000-4000-8000-000000000004',
    '71000000-0000-4000-8000-000000000001',
    'a2222222-2222-4222-8222-222222222222',
    'management',
    'normal',
    false,
    true,
    true,
    3,
    now() - interval '6 days',
    null
  )
on conflict (store_id, property_id, purpose) do update
set
  publication_type = excluded.publication_type,
  featured = excluded.featured,
  normal = excluded.normal,
  is_public = excluded.is_public,
  display_order = excluded.display_order,
  published_at = excluded.published_at,
  unpublished_at = excluded.unpublished_at,
  updated_at = now();

insert into public.agent_publications (
  id,
  agent_id,
  property_id,
  is_featured,
  display_order,
  is_public
)
values
  (
    '71400000-0000-4000-8000-000000000001',
    '44444444-4444-4444-8444-444444444444',
    'a1111111-1111-4111-8111-111111111111',
    true,
    0,
    true
  ),
  (
    '71400000-0000-4000-8000-000000000002',
    '44444444-4444-4444-8444-444444444444',
    'a2222222-2222-4222-8222-222222222222',
    false,
    1,
    true
  ),
  (
    '71400000-0000-4000-8000-000000000003',
    '55555555-5555-4555-8555-555555555555',
    'a3333333-3333-4333-8333-333333333333',
    true,
    0,
    true
  )
on conflict (agent_id, property_id) do update
set
  is_featured = excluded.is_featured,
  display_order = excluded.display_order,
  is_public = excluded.is_public,
  updated_at = now();

insert into public.leads (
  id,
  organization_id,
  store_id,
  agent_id,
  property_id,
  source_type,
  source_code,
  source_store_slug,
  source_agent_slug,
  customer_name,
  name,
  phone,
  email,
  line_id,
  preferred_contact_method,
  inquiry_message,
  message,
  status,
  notes,
  created_at,
  updated_at
)
values
  (
    '71500000-0000-4000-8000-000000000001',
    '33333333-3333-4333-8333-333333333333',
    '71000000-0000-4000-8000-000000000001',
    '44444444-4444-4444-8444-444444444444',
    'a1111111-1111-4111-8111-111111111111',
    'agent_page',
    'qr-xinyi-agent-001',
    'xinyi-store',
    'senior-jp-advisor',
    '王小明',
    '王小明',
    '0912-000-123',
    'lead1@example.com',
    null,
    'phone',
    '想了解日本出租投報與代管細節。',
    '想了解日本出租投報與代管細節。',
    'new',
    null,
    now() - interval '3 days',
    now() - interval '3 days'
  ),
  (
    '71500000-0000-4000-8000-000000000002',
    '33333333-3333-4333-8333-333333333333',
    '71000000-0000-4000-8000-000000000001',
    null,
    null,
    'store_contact',
    null,
    'xinyi-store',
    null,
    '陳小姐',
    '陳小姐',
    null,
    'lead2@example.com',
    'line_demo_002',
    'line',
    '有台北自住換屋需求，想先約諮詢。',
    '有台北自住換屋需求，想先約諮詢。',
    'contacted',
    '已初步回覆，待安排到店。',
    now() - interval '1 day',
    now() - interval '20 hours'
  )
on conflict (id) do update
set
  organization_id = excluded.organization_id,
  store_id = excluded.store_id,
  agent_id = excluded.agent_id,
  property_id = excluded.property_id,
  source_type = excluded.source_type,
  source_code = excluded.source_code,
  source_store_slug = excluded.source_store_slug,
  source_agent_slug = excluded.source_agent_slug,
  customer_name = excluded.customer_name,
  name = excluded.name,
  phone = excluded.phone,
  email = excluded.email,
  line_id = excluded.line_id,
  preferred_contact_method = excluded.preferred_contact_method,
  inquiry_message = excluded.inquiry_message,
  message = excluded.message,
  status = excluded.status,
  notes = excluded.notes,
  updated_at = excluded.updated_at;

insert into public.lead_events (
  id,
  lead_id,
  event_type,
  payload,
  created_at
)
values
  (
    '71600000-0000-4000-8000-000000000001',
    '71500000-0000-4000-8000-000000000001',
    'lead_created',
    '{"source_type":"agent_page","store_slug":"xinyi-store","agent_slug":"senior-jp-advisor","property_id":"a1111111-1111-4111-8111-111111111111"}'::jsonb,
    now() - interval '3 days'
  ),
  (
    '71600000-0000-4000-8000-000000000002',
    '71500000-0000-4000-8000-000000000002',
    'lead_created',
    '{"source_type":"store_contact","store_slug":"xinyi-store"}'::jsonb,
    now() - interval '1 day'
  )
on conflict (id) do update
set
  lead_id = excluded.lead_id,
  event_type = excluded.event_type,
  payload = excluded.payload,
  created_at = excluded.created_at;

commit;
