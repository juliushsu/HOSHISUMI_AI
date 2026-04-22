-- Demo Sandbox seed data
-- Canonical demo org code: DEMO_ORG
-- Canonical demo org uuid: 00000000-0000-4000-8000-00000000de00

insert into public.organizations (id, organization_code, name, plan_type, is_demo)
values (
  '00000000-0000-4000-8000-00000000de00',
  'DEMO_ORG',
  'Demo Environment',
  'pro',
  true
)
on conflict (id) do update
set
  organization_code = excluded.organization_code,
  name = excluded.name,
  plan_type = excluded.plan_type,
  is_demo = true;

insert into public.admin_profiles (email, role, org_id, is_demo)
values (
  'demo.manager@yourdomain.com',
  'store_manager',
  '00000000-0000-4000-8000-00000000de00',
  true
)
on conflict (email) do update
set
  role = excluded.role,
  org_id = excluded.org_id,
  is_demo = true;

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
  is_active
)
values (
  '00000000-0000-4000-8000-00000000de10',
  '00000000-0000-4000-8000-00000000de00',
  'HOSHISUMI Demo 台北信義店',
  'demo-xinyi-store',
  '台北市',
  '信義區',
  '信義區 / 大安區 / 中山區',
  '跨境置產與託租代管示範門店',
  'Demo 專用門店，模擬跨境客戶與在地買賣、出租、代管全流程。',
  '02-8800-1000',
  'demo-store@yourdomain.com',
  '台北市信義區松智路 1 號',
  'https://line.me/ti/p/demo-xinyi-store',
  'Mon-Sat 10:00-19:00',
  'https://img.hoshisumi.test/demo/store-logo.png',
  'https://img.hoshisumi.test/demo/store-cover.jpg',
  true
)
on conflict (id) do update
set
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
  is_active = excluded.is_active;

insert into public.agents (
  id,
  organization_id,
  store_id,
  name,
  role,
  email,
  title,
  phone,
  phone_public,
  line_url,
  is_active,
  is_public,
  is_demo
)
values
  (
    '00000000-0000-4000-8000-00000000de11',
    '00000000-0000-4000-8000-00000000de00',
    '00000000-0000-4000-8000-00000000de10',
    'Demo 店東 王信宏',
    'owner',
    'demo.owner@yourdomain.com',
    'Demo Owner',
    '0900-000-011',
    '0900-000-011',
    'https://line.me/ti/p/demo-owner',
    true,
    true,
    true
  ),
  (
    '00000000-0000-4000-8000-00000000de12',
    '00000000-0000-4000-8000-00000000de00',
    '00000000-0000-4000-8000-00000000de10',
    'Demo 店長 林雅婷',
    'store_manager',
    'demo.manager@yourdomain.com',
    'Store Manager',
    '0900-000-012',
    '0900-000-012',
    'https://line.me/ti/p/demo-manager',
    true,
    true,
    true
  ),
  (
    '00000000-0000-4000-8000-00000000de13',
    '00000000-0000-4000-8000-00000000de00',
    '00000000-0000-4000-8000-00000000de10',
    'Demo 業務 Ken Sato',
    'agent',
    'demo.agent@yourdomain.com',
    'Cross-border Advisor',
    '0900-000-013',
    '0900-000-013',
    'https://line.me/ti/p/demo-agent',
    true,
    true,
    true
  )
on conflict (id) do update
set
  organization_id = excluded.organization_id,
  store_id = excluded.store_id,
  name = excluded.name,
  role = excluded.role,
  email = excluded.email,
  title = excluded.title,
  phone = excluded.phone,
  phone_public = excluded.phone_public,
  line_url = excluded.line_url,
  is_active = excluded.is_active,
  is_public = excluded.is_public,
  is_demo = true;

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
  demo_data_type
)
values
  ('00000000-0000-4000-8000-00000000de21', '00000000-0000-4000-8000-00000000de00', '00000000-0000-4000-8000-00000000de12', '陳柏翰', '0912-001-001', 'chen-bohan', 'self_use', true, false, true, true, true, false, 'seed'),
  ('00000000-0000-4000-8000-00000000de22', '00000000-0000-4000-8000-00000000de00', '00000000-0000-4000-8000-00000000de13', 'Emily Wang', '0912-001-002', null, 'investment', true, true, false, true, true, false, 'seed'),
  ('00000000-0000-4000-8000-00000000de23', '00000000-0000-4000-8000-00000000de00', '00000000-0000-4000-8000-00000000de13', '佐藤 健太', '+81-80-1111-2222', 'kenta.sato', 'japan', false, true, true, false, true, false, 'seed'),
  ('00000000-0000-4000-8000-00000000de24', '00000000-0000-4000-8000-00000000de00', '00000000-0000-4000-8000-00000000de12', '林美君', '0912-001-004', null, 'self_use', true, false, false, true, true, false, 'seed'),
  ('00000000-0000-4000-8000-00000000de25', '00000000-0000-4000-8000-00000000de00', '00000000-0000-4000-8000-00000000de11', 'Michael Chen', '0912-001-005', 'michael.demo', 'investment', true, true, true, true, true, false, 'seed')
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
  demo_data_type = 'seed';

insert into public.properties (
  id,
  organization_id,
  owner_agent_id,
  title,
  description,
  price,
  country,
  status,
  source,
  source_type,
  purpose,
  currency,
  intake_status,
  raw_source_files_count,
  city,
  district,
  cover_image_url,
  demo_data_type
)
values
  ('00000000-0000-4000-8000-00000000de31', '00000000-0000-4000-8000-00000000de00', '00000000-0000-4000-8000-00000000de12', '信義區兩房景觀宅', '近捷運與商圈，屋況佳。', 32800000, 'tw', 'available', 'manual', 'manual', 'sale', 'TWD', 'ready_to_publish', 0, '台北市', '信義區', 'https://img.hoshisumi.test/demo/property-1.jpg', 'seed'),
  ('00000000-0000-4000-8000-00000000de32', '00000000-0000-4000-8000-00000000de00', '00000000-0000-4000-8000-00000000de13', '大安區電梯三房', '家庭自住首選，格局方正。', 45800000, 'tw', 'negotiating', 'manual', 'manual', 'sale', 'TWD', 'assigned', 0, '台北市', '大安區', 'https://img.hoshisumi.test/demo/property-2.jpg', 'seed'),
  ('00000000-0000-4000-8000-00000000de33', '00000000-0000-4000-8000-00000000de00', '00000000-0000-4000-8000-00000000de13', '東京港區收租套房', '港區小坪數，高出租需求。', 46800000, 'jp', 'available', 'import', 'japan_api', 'rental', 'JPY', 'imported', 2, '東京都', '港區', 'https://img.hoshisumi.test/demo/property-3.jpg', 'seed'),
  ('00000000-0000-4000-8000-00000000de34', '00000000-0000-4000-8000-00000000de00', '00000000-0000-4000-8000-00000000de12', '大阪難波商圈套房', '高流量商圈，穩定租客來源。', 35800000, 'jp', 'available', 'import', 'japan_line', 'management', 'JPY', 'pending_review', 3, '大阪市', '中央區', 'https://img.hoshisumi.test/demo/property-4.jpg', 'seed'),
  ('00000000-0000-4000-8000-00000000de35', '00000000-0000-4000-8000-00000000de00', '00000000-0000-4000-8000-00000000de11', '中山區捷運宅', '首購友善，交通便利。', 24800000, 'tw', 'sold', 'manual', 'manual', 'sale', 'TWD', 'ready_to_publish', 0, '台北市', '中山區', 'https://img.hoshisumi.test/demo/property-5.jpg', 'seed')
on conflict (id) do update
set
  owner_agent_id = excluded.owner_agent_id,
  title = excluded.title,
  description = excluded.description,
  price = excluded.price,
  country = excluded.country,
  status = excluded.status,
  source = excluded.source,
  source_type = excluded.source_type,
  purpose = excluded.purpose,
  currency = excluded.currency,
  intake_status = excluded.intake_status,
  raw_source_files_count = excluded.raw_source_files_count,
  city = excluded.city,
  district = excluded.district,
  cover_image_url = excluded.cover_image_url,
  demo_data_type = 'seed';

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
  preferred_contact_method,
  inquiry_message,
  message,
  status,
  notes,
  demo_data_type
)
values
  ('00000000-0000-4000-8000-00000000de41', '00000000-0000-4000-8000-00000000de00', '00000000-0000-4000-8000-00000000de10', '00000000-0000-4000-8000-00000000de12', '00000000-0000-4000-8000-00000000de31', 'store_contact', 'demo-campaign-1', 'demo-xinyi-store', 'demo-manager', '張小姐', '張小姐', '0922-200-001', 'lead1@example.com', 'phone', '想預約看屋與貸款評估。', '想預約看屋與貸款評估。', 'new', '首輪待聯繫', 'seed'),
  ('00000000-0000-4000-8000-00000000de42', '00000000-0000-4000-8000-00000000de00', '00000000-0000-4000-8000-00000000de10', '00000000-0000-4000-8000-00000000de13', '00000000-0000-4000-8000-00000000de33', 'agent_page', 'demo-campaign-2', 'demo-xinyi-store', 'demo-agent', 'Kenji Mori', 'Kenji Mori', '+81-90-3300-2002', 'lead2@example.jp', 'email', 'Interested in long-term rental yield simulation.', 'Interested in long-term rental yield simulation.', 'contacted', '已寄送初步收益試算', 'seed'),
  ('00000000-0000-4000-8000-00000000de43', '00000000-0000-4000-8000-00000000de00', '00000000-0000-4000-8000-00000000de10', '00000000-0000-4000-8000-00000000de11', '00000000-0000-4000-8000-00000000de34', 'property_inquiry', 'demo-campaign-3', 'demo-xinyi-store', 'demo-owner', '王先生', '王先生', '0922-200-003', 'lead3@example.com', 'line', '希望了解代管條件與費率。', '希望了解代管條件與費率。', 'qualified', '已安排下週簽約會議', 'seed')
on conflict (id) do update
set
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
  preferred_contact_method = excluded.preferred_contact_method,
  inquiry_message = excluded.inquiry_message,
  message = excluded.message,
  status = excluded.status,
  notes = excluded.notes,
  demo_data_type = 'seed';

insert into public.ai_usage_logs (
  id,
  organization_id,
  agent_id,
  action_type,
  tokens_used,
  demo_data_type
)
values
  ('00000000-0000-4000-8000-00000000de51', '00000000-0000-4000-8000-00000000de00', '00000000-0000-4000-8000-00000000de12', 'translate_property', 880, 'seed'),
  ('00000000-0000-4000-8000-00000000de52', '00000000-0000-4000-8000-00000000de00', '00000000-0000-4000-8000-00000000de13', 'generate_post', 620, 'seed')
on conflict (id) do update
set
  organization_id = excluded.organization_id,
  agent_id = excluded.agent_id,
  action_type = excluded.action_type,
  tokens_used = excluded.tokens_used,
  demo_data_type = 'seed';

insert into public.dashboard_activities (
  id,
  org_id,
  actor_name,
  actor_role,
  action_type,
  target_type,
  target_id,
  target_name,
  summary_text,
  created_at,
  priority,
  requires_attention,
  related_status,
  demo_data_type
)
values
  ('00000000-0000-4000-8000-00000000dea1', '00000000-0000-4000-8000-00000000de00', '林雅婷', 'store_manager', 'client_created', 'client', '00000000-0000-4000-8000-00000000de21', '陳柏翰', '林雅婷 新增客戶「陳柏翰」並完成需求標記', now() - interval '7 hours', 'medium', false, null, 'seed'),
  ('00000000-0000-4000-8000-00000000dea2', '00000000-0000-4000-8000-00000000de00', 'Ken Sato', 'agent', 'property_created', 'property', '00000000-0000-4000-8000-00000000de33', '東京港區收租套房', 'Ken Sato 新增委託物件「東京港區收租套房」', now() - interval '6 hours 30 minutes', 'medium', false, 'available', 'seed'),
  ('00000000-0000-4000-8000-00000000dea3', '00000000-0000-4000-8000-00000000de00', '王信宏', 'owner', 'client_assigned', 'client', '00000000-0000-4000-8000-00000000de22', 'Emily Wang', '王信宏 指派客戶「Emily Wang」給 Ken Sato 跟進', now() - interval '6 hours', 'high', true, 'assigned', 'seed'),
  ('00000000-0000-4000-8000-00000000dea4', '00000000-0000-4000-8000-00000000de00', '林雅婷', 'store_manager', 'showing_scheduled', 'property', '00000000-0000-4000-8000-00000000de31', '信義區兩房景觀宅', '林雅婷 安排「信義區兩房景觀宅」週五 14:00 帶看', now() - interval '5 hours', 'high', true, 'showing', 'seed'),
  ('00000000-0000-4000-8000-00000000dea5', '00000000-0000-4000-8000-00000000de00', 'AI 助理', 'system', 'ai_analysis_completed', 'client', '00000000-0000-4000-8000-00000000de23', '佐藤 健太', 'AI 助理 完成客戶「佐藤 健太」需求分析，偏好東京都港區', now() - interval '4 hours 45 minutes', 'medium', false, null, 'seed'),
  ('00000000-0000-4000-8000-00000000dea6', '00000000-0000-4000-8000-00000000de00', 'Ken Sato', 'agent', 'status_updated', 'client', '00000000-0000-4000-8000-00000000de23', '佐藤 健太', 'Ken Sato 將客戶「佐藤 健太」標記為高意願', now() - interval '4 hours', 'high', true, 'high_intent', 'seed'),
  ('00000000-0000-4000-8000-00000000dea7', '00000000-0000-4000-8000-00000000de00', '林雅婷', 'store_manager', 'status_updated', 'property', '00000000-0000-4000-8000-00000000de32', '大安區電梯三房', '林雅婷 更新物件「大安區電梯三房」狀態為議價中', now() - interval '3 hours 40 minutes', 'high', true, 'negotiating', 'seed'),
  ('00000000-0000-4000-8000-00000000dea8', '00000000-0000-4000-8000-00000000de00', '王信宏', 'owner', 'followup_reminder', 'lead', '00000000-0000-4000-8000-00000000de41', '張小姐', '王信宏 建立追蹤提醒：今日 18:00 前回覆「張小姐」貸款問題', now() - interval '3 hours', 'high', true, 'todo', 'seed'),
  ('00000000-0000-4000-8000-00000000dea9', '00000000-0000-4000-8000-00000000de00', 'Ken Sato', 'agent', 'lead_created', 'lead', '00000000-0000-4000-8000-00000000de42', 'Kenji Mori', 'Ken Sato 新增詢問「Kenji Mori」並附上租金報酬需求', now() - interval '2 hours 45 minutes', 'medium', false, 'contacted', 'seed'),
  ('00000000-0000-4000-8000-00000000deaa', '00000000-0000-4000-8000-00000000de00', '林雅婷', 'store_manager', 'task_created', 'operation', null, '每週屋況巡檢', '林雅婷 新增待辦「每週屋況巡檢」並指派給代管組', now() - interval '2 hours', 'medium', false, 'open', 'seed'),
  ('00000000-0000-4000-8000-00000000deab', '00000000-0000-4000-8000-00000000de00', 'AI 助理', 'system', 'ai_analysis_completed', 'property', '00000000-0000-4000-8000-00000000de34', '大阪難波商圈套房', 'AI 助理 完成「大阪難波商圈套房」租金區間預測', now() - interval '1 hour 50 minutes', 'low', false, null, 'seed'),
  ('00000000-0000-4000-8000-00000000deac', '00000000-0000-4000-8000-00000000de00', '王信宏', 'owner', 'status_updated', 'lead', '00000000-0000-4000-8000-00000000de43', '王先生', '王信宏 將詢問「王先生」狀態更新為 qualified', now() - interval '1 hour 30 minutes', 'high', true, 'qualified', 'seed'),
  ('00000000-0000-4000-8000-00000000dead', '00000000-0000-4000-8000-00000000de00', '林雅婷', 'store_manager', 'viewing_feedback_logged', 'property', '00000000-0000-4000-8000-00000000de31', '信義區兩房景觀宅', '林雅婷 記錄帶看回饋：客戶關注總價與裝修', now() - interval '1 hour 15 minutes', 'medium', false, null, 'seed'),
  ('00000000-0000-4000-8000-00000000deae', '00000000-0000-4000-8000-00000000de00', 'Ken Sato', 'agent', 'client_assigned', 'client', '00000000-0000-4000-8000-00000000de24', '林美君', 'Ken Sato 接手客戶「林美君」並排定首次電話訪談', now() - interval '50 minutes', 'medium', false, 'assigned', 'seed'),
  ('00000000-0000-4000-8000-00000000deaf', '00000000-0000-4000-8000-00000000de00', '王信宏', 'owner', 'status_updated', 'property', '00000000-0000-4000-8000-00000000de35', '中山區捷運宅', '王信宏 將物件「中山區捷運宅」標記為可再銷售準備', now() - interval '35 minutes', 'medium', false, 'resale_ready', 'seed'),
  ('00000000-0000-4000-8000-00000000deb0', '00000000-0000-4000-8000-00000000de00', '林雅婷', 'store_manager', 'followup_reminder', 'lead', '00000000-0000-4000-8000-00000000de42', 'Kenji Mori', '林雅婷 提醒今日 17:30 前寄出「Kenji Mori」收益試算更新版', now() - interval '20 minutes', 'high', true, 'todo', 'seed')
on conflict (id) do update
set
  org_id = excluded.org_id,
  actor_name = excluded.actor_name,
  actor_role = excluded.actor_role,
  action_type = excluded.action_type,
  target_type = excluded.target_type,
  target_id = excluded.target_id,
  target_name = excluded.target_name,
  summary_text = excluded.summary_text,
  created_at = excluded.created_at,
  priority = excluded.priority,
  requires_attention = excluded.requires_attention,
  related_status = excluded.related_status,
  demo_data_type = excluded.demo_data_type;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'dashboard_activities'
      and column_name = 'store_id'
  ) then
    update public.dashboard_activities
    set
      store_id = '00000000-0000-4000-8000-00000000de10'::uuid,
      created_by_agent_id = case
        when actor_name = '王信宏' then '00000000-0000-4000-8000-00000000de11'::uuid
        when actor_name = '林雅婷' then '00000000-0000-4000-8000-00000000de12'::uuid
        when actor_name = 'Ken Sato' then '00000000-0000-4000-8000-00000000de13'::uuid
        else null
      end
    where org_id = '00000000-0000-4000-8000-00000000de00'
      and demo_data_type = 'seed'
      and id in (
        '00000000-0000-4000-8000-00000000dea1',
        '00000000-0000-4000-8000-00000000dea2',
        '00000000-0000-4000-8000-00000000dea3',
        '00000000-0000-4000-8000-00000000dea4',
        '00000000-0000-4000-8000-00000000dea5',
        '00000000-0000-4000-8000-00000000dea6',
        '00000000-0000-4000-8000-00000000dea7',
        '00000000-0000-4000-8000-00000000dea8',
        '00000000-0000-4000-8000-00000000dea9',
        '00000000-0000-4000-8000-00000000deaa',
        '00000000-0000-4000-8000-00000000deab',
        '00000000-0000-4000-8000-00000000deac',
        '00000000-0000-4000-8000-00000000dead',
        '00000000-0000-4000-8000-00000000deae',
        '00000000-0000-4000-8000-00000000deaf',
        '00000000-0000-4000-8000-00000000deb0'
      );
  end if;
end
$$;
