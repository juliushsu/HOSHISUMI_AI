-- Seed data for 星澄地所 HOSHISUMI MVP (Phase 2.2)
-- Includes 2 organizations for RLS isolation testing.

insert into public.organizations (id, name, plan_type, created_at) values
  ('11111111-1111-1111-1111-111111111111', '星澄地所 台北信義店', 'ai', now() - interval '20 days'),
  ('22222222-2222-2222-2222-222222222222', '星澄地所 東京店', 'pro', now() - interval '15 days')
on conflict (id) do nothing;

insert into public.agents (id, organization_id, name, role, is_active, created_at) values
  ('aaaaaaa1-aaaa-aaaa-aaaa-aaaaaaaaaaa1', '11111111-1111-1111-1111-111111111111', '王店長', 'owner', true, now() - interval '19 days'),
  ('aaaaaaa2-aaaa-aaaa-aaaa-aaaaaaaaaaa2', '11111111-1111-1111-1111-111111111111', '李經理', 'manager', true, now() - interval '18 days'),
  ('aaaaaaa3-aaaa-aaaa-aaaa-aaaaaaaaaaa3', '11111111-1111-1111-1111-111111111111', '陳業務', 'agent', true, now() - interval '17 days'),
  ('bbbbbbb1-bbbb-bbbb-bbbb-bbbbbbbbbbb1', '22222222-2222-2222-2222-222222222222', '佐藤店長', 'owner', true, now() - interval '14 days'),
  ('bbbbbbb2-bbbb-bbbb-bbbb-bbbbbbbbbbb2', '22222222-2222-2222-2222-222222222222', '高橋業務', 'agent', true, now() - interval '13 days')
on conflict (id) do nothing;

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
  contact_email,
  created_at,
  updated_at
) values
  ('90000000-0000-0000-0000-000000000001', 'World Eye Realty Inc.', 'world_eye', 'jp', 'active', 1.00, true, true, true, 'world_eye', 'we_tok_001', 'bd@world-eye.jp', now() - interval '30 days', now() - interval '2 days'),
  ('90000000-0000-0000-0000-000000000002', 'Nippon Prime Realty Co., Ltd.', 'nippon_prime_realty', 'jp', 'active', 1.20, false, true, true, 'nippon_prime_realty', 'npr_tok_001', 'partner@nippon-prime.jp', now() - interval '25 days', now() - interval '3 days'),
  ('90000000-0000-0000-0000-000000000003', 'Kansai Asset Link Ltd.', 'kansai_asset_link', 'jp', 'active', 1.10, false, true, false, 'kansai_asset_link', 'kal_tok_001', 'biz@kansai-asset.jp', now() - interval '22 days', now() - interval '4 days')
on conflict (id) do nothing;

insert into public.partner_users (
  id,
  partner_id,
  name,
  email,
  role,
  is_active,
  created_at
) values
  ('91000000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000001', 'Aki Tanaka', 'aki@world-eye.jp', 'admin', true, now() - interval '20 days'),
  ('91000000-0000-0000-0000-000000000002', '90000000-0000-0000-0000-000000000002', 'Yuto Sato', 'yuto@nippon-prime.jp', 'admin', true, now() - interval '19 days'),
  ('91000000-0000-0000-0000-000000000003', '90000000-0000-0000-0000-000000000003', 'Mika Ueda', 'mika@kansai-asset.jp', 'staff', true, now() - interval '18 days')
on conflict (id) do nothing;

insert into public.partner_authorizations (
  id,
  partner_id,
  organization_id,
  is_exclusive,
  is_active,
  default_owner_agent_id,
  created_at
) values
  ('92000000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', false, true, 'aaaaaaa2-aaaa-aaaa-aaaa-aaaaaaaaaaa2', now() - interval '16 days'),
  ('92000000-0000-0000-0000-000000000002', '90000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', false, true, 'aaaaaaa3-aaaa-aaaa-aaaa-aaaaaaaaaaa3', now() - interval '15 days'),
  ('92000000-0000-0000-0000-000000000003', '90000000-0000-0000-0000-000000000003', '22222222-2222-2222-2222-222222222222', true, true, 'bbbbbbb2-bbbb-bbbb-bbbb-bbbbbbbbbbb2', now() - interval '14 days')
on conflict (partner_id, organization_id) do nothing;

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
  consent_source,
  created_at
) values
  ('c1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'aaaaaaa3-aaaa-aaaa-aaaa-aaaaaaaaaaa3', '林小姐', '0912345678', 'lin_line_001', 'self_use', true, false, true, true, true, false, now() - interval '10 days', 'line_form', now() - interval '10 days'),
  ('c1111111-1111-1111-1111-111111111112', '11111111-1111-1111-1111-111111111111', 'aaaaaaa2-aaaa-aaaa-aaaa-aaaaaaaaaaa2', '張先生', '0922333444', 'zhang_line_002', 'investment', true, true, true, false, false, false, now() - interval '9 days', 'phone_recording', now() - interval '9 days'),
  ('c2222222-2222-2222-2222-222222222221', '22222222-2222-2222-2222-222222222222', 'bbbbbbb2-bbbb-bbbb-bbbb-bbbbbbbbbbb2', '田中太郎', '+81-90-1111-2222', 'tanaka_line_001', 'japan', false, true, true, true, true, false, now() - interval '8 days', 'line_form', now() - interval '8 days')
on conflict (id) do nothing;

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
  updated_at,
  created_at
) values
  ('p1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', null, null, '信義區兩房電梯宅', '近捷運，採光佳，適合首購。', 2580.00, 'tw', 'available', 'manual', 'manual', null, 1.0, 'assigned', 0, now() - interval '7 days', now() - interval '7 days'),
  ('p1111111-1111-1111-1111-111111111112', '11111111-1111-1111-1111-111111111111', null, '90000000-0000-0000-0000-000000000002', '大阪中央區收益型套房（Nippon Prime）', '合作夥伴初步匯入，待進一步審閱。', 3980.00, 'jp', 'negotiating', 'import', 'import', 'nippon_prime_realty', 1.2, 'imported', 2, now() - interval '6 days', now() - interval '6 days'),
  ('p1111111-1111-1111-1111-111111111113', '11111111-1111-1111-1111-111111111111', 'aaaaaaa2-aaaa-aaaa-aaaa-aaaaaaaaaaa2', '90000000-0000-0000-0000-000000000001', '東京目黑區精選物件（World Eye）', 'World Eye 合作日本物件，交通與生活機能完整。', 4680.00, 'jp', 'available', 'api', 'japan_line', 'world_eye', 1.0, 'ready_to_publish', 5, now() - interval '5 days', now() - interval '5 days'),
  ('p2222222-2222-2222-2222-222222222221', '22222222-2222-2222-2222-222222222222', null, '90000000-0000-0000-0000-000000000003', '東京品川高樓層景觀宅（Kansai Asset）', 'Kansai Asset Link 提供，正在 AI 分析中。', 5280.00, 'jp', 'available', 'api', 'japan_api', 'kansai_asset_link', 1.1, 'analyzing', 4, now() - interval '4 days', now() - interval '4 days')
on conflict (id) do nothing;

insert into public.ai_usage_logs (
  id,
  organization_id,
  agent_id,
  action_type,
  tokens_used,
  created_at
) values
  ('f1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'aaaaaaa2-aaaa-aaaa-aaaa-aaaaaaaaaaa2', 'translate_property', 1240, now() - interval '4 days'),
  ('f1111111-1111-1111-1111-111111111112', '11111111-1111-1111-1111-111111111111', 'aaaaaaa3-aaaa-aaaa-aaaa-aaaaaaaaaaa3', 'generate_post', 980, now() - interval '3 days'),
  ('f2222222-2222-2222-2222-222222222221', '22222222-2222-2222-2222-222222222222', 'bbbbbbb2-bbbb-bbbb-bbbb-bbbbbbbbbbb2', 'generate_post', 860, now() - interval '2 days')
on conflict (id) do nothing;

insert into public.consent_logs (
  id,
  client_id,
  consent_type,
  consent_value,
  changed_at,
  changed_by_agent_id
) values
  ('d1111111-1111-1111-1111-111111111111', 'c1111111-1111-1111-1111-111111111111', 'consent_property_tw', true, now() - interval '10 days', 'aaaaaaa3-aaaa-aaaa-aaaa-aaaaaaaaaaa3'),
  ('d1111111-1111-1111-1111-111111111112', 'c1111111-1111-1111-1111-111111111111', 'consent_contact_phone', true, now() - interval '10 days', 'aaaaaaa3-aaaa-aaaa-aaaa-aaaaaaaaaaa3'),
  ('d1111111-1111-1111-1111-111111111113', 'c1111111-1111-1111-1111-111111111112', 'consent_property_jp', true, now() - interval '9 days', 'aaaaaaa2-aaaa-aaaa-aaaa-aaaaaaaaaaa2'),
  ('d2222222-2222-2222-2222-222222222221', 'c2222222-2222-2222-2222-222222222221', 'consent_contact_line', true, now() - interval '8 days', 'bbbbbbb2-bbbb-bbbb-bbbb-bbbbbbbbbbb2')
on conflict (id) do nothing;
