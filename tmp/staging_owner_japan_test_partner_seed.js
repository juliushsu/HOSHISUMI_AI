import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const ENV_FILE = '/tmp/hs_railway_staging.env';
const API_BASE = 'https://hoshisumi-api-staging.up.railway.app/api';
const TENANT_ORG_ID = '33333333-3333-4333-8333-333333333333';
const TEST_PARTNER_ORG_ID = '88888888-1111-4888-8111-888888888888';
const TEST_PARTNER_ID = '90000000-0000-4000-8000-000000000099';
const PARTNER_AUTH_ID = '92000000-0000-4000-8000-000000000099';
const JULIUS_TENANT_AGENT_ID = 'e6b1899a-5e14-4440-9e85-17ff20333cc9';
const JULIUS_PARTNER_AGENT_ID = '78888888-1111-4888-8111-888888888888';
const JULIUS_PARTNER_USER_ID = '91111111-9999-4999-8999-999999999999';
const TENANT_DEFAULT_OWNER_AGENT_ID = '44444444-4444-4444-8444-444444444444';

const SAMPLE_MASTERS = [
  {
    id: '81111111-9999-4999-8999-999999999991',
    ref: 'HS-TEST-2026-0001',
    titleJa: '東京都新宿区テスト投資ワンルーム',
    titleZh: '東京都新宿區測試投資套房',
    addressJa: '東京都新宿区新宿1-10-10',
    addressZh: '東京都新宿區新宿1-10-10',
    price: 31800000,
    layout: '1K',
    area: 24.8,
    descriptionJa: 'テスト用の駅近投資ワンルーム。',
    descriptionZh: '專供 staging owner 測試的近站投資套房。',
    imageUrl: 'https://img.hoshisumi.test/jp/hs-test-0001-1.jpg',
    station: '新宿御苑前',
    walk: 5,
    buildingAge: 8,
    projectionId: '83333333-9999-4999-8999-999999999991',
    bindingId: '82222222-9999-4999-8999-999999999991',
    propertyCode: 'HS-TEST-0001',
    propertyType: 'apartment'
  },
  {
    id: '81111111-9999-4999-8999-999999999992',
    ref: 'HS-TEST-2026-0002',
    titleJa: '大阪市北区テスト2DK住宅',
    titleZh: '大阪市北區測試自住兩房',
    addressJa: '大阪府大阪市北区中津2-8-8',
    addressZh: '大阪府大阪市北區中津2-8-8',
    price: 42800000,
    layout: '2DK',
    area: 42.1,
    descriptionJa: 'テスト用の自住向け2DK。',
    descriptionZh: '專供 staging owner 測試的 2DK 日本住宅。',
    imageUrl: 'https://img.hoshisumi.test/jp/hs-test-0002-1.jpg',
    station: '中津',
    walk: 6,
    buildingAge: 12,
    projectionId: '83333333-9999-4999-8999-999999999992',
    bindingId: '82222222-9999-4999-8999-999999999992',
    propertyCode: 'HS-TEST-0002',
    propertyType: 'apartment'
  }
];

const SAMPLE_INGEST_JOB_ID = '70111111-1111-4711-8111-111111111199';
const TENANT_SMOKE_EMAIL = 'staging-owner-jp-test-tenant-smoke@hoshisumi.test';
const TENANT_SMOKE_PASSWORD = 'TenantSmokePass-20260427-Aa1!';
const TENANT_SMOKE_AGENT_ID = '78888888-2222-4888-8222-888888888888';
const PARTNER_SMOKE_EMAIL = 'staging-owner-jp-test-partner-smoke@hoshisumi.test';
const PARTNER_SMOKE_PASSWORD = 'PartnerSmokePass-20260427-Aa1!';
const PARTNER_SMOKE_AGENT_ID = '78888888-3333-4888-8333-888888888888';
const PARTNER_SMOKE_USER_ID = '91111111-8888-4888-8888-888888888888';
const WORLD_EYE_PARTNER_ID = '90000000-0000-4000-8000-000000000001';
const FORMAL_WORLD_EYE_MASTER_IDS = new Set([
  '81111111-1111-4111-8111-111111111111',
  '81111111-1111-4111-8111-111111111112',
  '81111111-1111-4111-8111-111111111113',
  '81111111-1111-4111-8111-111111111114',
  '81111111-1111-4111-8111-111111111115'
]);
const CONTAMINATION_PROPERTY_IDS = new Set([
  'a3333333-3333-4333-8333-333333333334',
  'a3333333-3333-4333-8333-333333333335',
  'a1111111-1111-4111-8111-111111111111',
  'a2222222-2222-4222-8222-222222222222',
  'a5555555-5555-4555-8555-555555555555',
  '7bad4e17-5c2f-44a1-b4f6-38b1af92a36b',
  '0bebfa68-37d4-4ff3-9e3b-d50a8bfc3cb8',
  '526e5b6d-b675-4824-90d9-1dc4d7e7e380',
  '00000000-0000-4000-8000-00000000de33',
  '00000000-0000-4000-8000-00000000de34'
]);

function parseEnvFile(path) {
  return Object.fromEntries(
    fs.readFileSync(path, 'utf8')
      .split(/\r?\n/)
      .filter(Boolean)
      .filter((line) => !line.startsWith('#'))
      .map((line) => {
        const separator = line.indexOf('=');
        return [line.slice(0, separator), line.slice(separator + 1)];
      })
  );
}

const env = parseEnvFile(ENV_FILE);
const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const anon = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);

function seedFlags(extra = {}) {
  return {
    seed: 'staging_owner_japan_test_partner_scope_v1',
    staging_test: true,
    owner_test: true,
    service_fee_model: 'platform_service_fee',
    source_partner_name_snapshot: 'Hoshisumi Japan Test Realty',
    ...extra
  };
}

async function upsertOrganization() {
  const { error } = await admin.from('organizations').upsert({
    id: TEST_PARTNER_ORG_ID,
    name: '星澄測試日本不動產株式会社',
    plan_type: 'pro',
    organization_code: 'HOSHISUMI_JP_TEST_PARTNER_STAGING',
    is_demo: false
  }, { onConflict: 'id' });
  if (error) throw error;
}

async function upsertPartner() {
  const { error } = await admin.from('partners').upsert({
    id: TEST_PARTNER_ID,
    company_name: 'Hoshisumi Japan Test Realty [STAGING_TEST_OWNER_TEST]',
    display_name: 'Hoshisumi Japan Test Realty',
    country: 'jp',
    status: 'active',
    default_fee_percent: 1.0,
    line_intake_enabled: false,
    upload_intake_enabled: true,
    api_intake_enabled: false,
    partner_slug: 'hoshisumi_japan_test_partner',
    intake_token: 'staging-hoshisumi-jp-test-partner-token',
    contact_email: 'staging-hoshisumi-jp-test@hoshisumi.test'
  }, { onConflict: 'partner_slug' });
  if (error) throw error;
}

async function upsertAgent(id, organizationId, name, email, role) {
  const { error } = await admin.from('agents').upsert({
    id,
    organization_id: organizationId,
    name,
    email,
    role,
    is_active: true,
    is_demo: false
  }, { onConflict: 'id' });
  if (error) throw error;
}

async function upsertPartnerUser(id, organizationId, agentId, email, name, role = 'admin') {
  const { error } = await admin.from('partner_users').upsert({
    id,
    partner_id: TEST_PARTNER_ID,
    organization_id: organizationId,
    agent_id: agentId,
    name,
    email,
    role,
    is_active: true
  }, { onConflict: 'id' });
  if (error) throw error;
}

async function upsertPartnerAuthorization() {
  const { error } = await admin.from('partner_authorizations').upsert({
    id: PARTNER_AUTH_ID,
    partner_id: TEST_PARTNER_ID,
    organization_id: TENANT_ORG_ID,
    is_exclusive: false,
    is_active: true,
    default_owner_agent_id: TENANT_DEFAULT_OWNER_AGENT_ID
  }, { onConflict: 'partner_id,organization_id' });
  if (error) throw error;
}

async function upsertSampleMaster(master) {
  const { error } = await admin.from('properties_master').upsert({
    id: master.id,
    source_partner_id: TEST_PARTNER_ID,
    source_of_truth: 'japan_partner',
    source_property_ref: master.ref,
    country: 'jp',
    status: 'available',
    canonical_payload_json: {
      title: master.titleZh,
      layout: master.layout,
      area_sqm: master.area,
      nearest_station: master.station,
      walk_minutes: master.walk,
      platform_service_fee_percent: 1.0
    },
    title_ja: master.titleJa,
    title_zh: master.titleZh,
    address_ja: master.addressJa,
    address_zh: master.addressZh,
    price: master.price,
    currency: 'JPY',
    layout: master.layout,
    area_sqm: master.area,
    description_ja: master.descriptionJa,
    description_zh: master.descriptionZh,
    image_urls: [master.imageUrl],
    raw_source_payload: seedFlags({
      source_property_ref: master.ref,
      nearest_station: master.station,
      walk_minutes: master.walk
    }),
    source_updated_at: new Date().toISOString()
  }, { onConflict: 'id' });
  if (error) throw error;
}

async function upsertSampleProjection(master) {
  const { error } = await admin.from('properties').upsert({
    id: master.projectionId,
    organization_id: TENANT_ORG_ID,
    owner_agent_id: TENANT_DEFAULT_OWNER_AGENT_ID,
    partner_id: TEST_PARTNER_ID,
    title: master.titleZh,
    title_ja: master.titleJa,
    title_zh: master.titleZh,
    description: master.descriptionZh,
    description_ja: master.descriptionJa,
    description_zh: master.descriptionZh,
    price: master.price,
    country: 'jp',
    status: 'available',
    service_types: ['sale'],
    current_stage: 'sale_active',
    is_rental_enabled: false,
    is_management_enabled: false,
    source: 'api',
    source_type: 'api_sync',
    source_partner: 'hoshisumi_japan_test_partner',
    cross_border_fee_percent: 1,
    intake_status: 'imported',
    raw_source_files_count: 0,
    property_code: master.propertyCode,
    address_ja: master.addressJa,
    address_zh: master.addressZh,
    purpose: 'sale',
    property_type: master.propertyType,
    currency: 'JPY',
    area_sqm: master.area,
    layout: master.layout,
    building_age: master.buildingAge,
    nearest_station: master.station,
    walking_minutes: master.walk,
    source_ref: master.ref,
    cover_image_url: master.imageUrl,
    gallery_urls: [master.imageUrl],
    raw_source_payload: seedFlags({
      property_master_id: master.id,
      source_property_ref: master.ref,
      source_scope: 'partner_test_projection'
    })
  }, { onConflict: 'id' });
  if (error) throw error;
}

async function upsertSampleBinding(master) {
  const { error } = await admin.from('tenant_property_bindings').upsert({
    id: master.bindingId,
    property_master_id: master.id,
    organization_id: TENANT_ORG_ID,
    linked_property_id: master.projectionId,
    visibility: 'active',
    tenant_status: 'marketing',
    source_status: 'available',
    metadata_json: seedFlags({
      property_projection_id: master.projectionId,
      source_property_ref: master.ref,
      is_visible: true,
      is_marketing_enabled: true
    })
  }, { onConflict: 'id' });
  if (error) throw error;
}

async function upsertSampleIngestJob() {
  const { error } = await admin.from('property_ingest_jobs').upsert({
    id: SAMPLE_INGEST_JOB_ID,
    organization_id: TENANT_ORG_ID,
    company_id: null,
    store_id: null,
    environment_type: 'staging',
    created_by: JULIUS_TENANT_AGENT_ID,
    reviewed_by: JULIUS_TENANT_AGENT_ID,
    source_type: 'manual_admin',
    source_channel: 'upload',
    source_partner_id: TEST_PARTNER_ID,
    metadata_json: seedFlags({
      ingest_sample: true,
      source_partner_name_snapshot: 'Hoshisumi Japan Test Realty',
      sample_property_master_id: SAMPLE_MASTERS[0].id
    }),
    status: 'approved',
    ocr_status: 'done',
    translation_status: 'done',
    primary_file_name: 'hs-test-owner-upload.pdf',
    primary_file_mime_type: 'application/pdf',
    primary_file_size_bytes: 204800,
    current_ocr_text_ja: 'テストOCRテキスト',
    current_translated_fields_json: { title_zh: SAMPLE_MASTERS[0].titleZh, price: SAMPLE_MASTERS[0].price },
    current_reviewed_fields_json: { title_zh: SAMPLE_MASTERS[0].titleZh, price: SAMPLE_MASTERS[0].price },
    approved_property_id: SAMPLE_MASTERS[0].projectionId,
    reviewed_at: new Date().toISOString(),
    approved_at: new Date().toISOString()
  }, { onConflict: 'id' });
  if (error) throw error;
}

async function findAuthUserByEmail(email) {
  let page = 1;
  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const user = data.users.find((item) => String(item.email || '').toLowerCase() === email.toLowerCase());
    if (user) return user;
    if (data.users.length < 200) return null;
    page += 1;
  }
}

async function ensureAuthUser(email, password) {
  const existing = await findAuthUserByEmail(email);
  if (existing) return existing;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true
  });
  if (error) throw error;
  return data.user;
}

async function signIn(email, password) {
  const { data, error } = await anon.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.session.access_token;
}

async function apiRequest({ token, orgId, path }) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      authorization: `Bearer ${token}`,
      'x-organization-id': orgId
    }
  });
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return {
    status: response.status,
    ok: response.ok,
    json,
    text
  };
}

async function worldEyePollutionAudit() {
  const [{ data: properties, error: propertiesError }, { data: masters, error: mastersError }, { data: bindings, error: bindingsError }] = await Promise.all([
    admin
      .from('properties')
      .select('id,title,organization_id,partner_id,source_type,source_partner,source_ref,raw_source_payload')
      .eq('partner_id', WORLD_EYE_PARTNER_ID)
      .order('created_at', { ascending: true }),
    admin
      .from('properties_master')
      .select('id,source_partner_id,source_property_ref,title_zh,raw_source_payload')
      .eq('source_partner_id', WORLD_EYE_PARTNER_ID)
      .order('created_at', { ascending: true }),
    admin
      .from('tenant_property_bindings')
      .select('id,property_master_id,organization_id,linked_property_id,metadata_json')
      .order('created_at', { ascending: true })
  ]);
  if (propertiesError) throw propertiesError;
  if (mastersError) throw mastersError;
  if (bindingsError) throw bindingsError;

  const candidateProperties = (properties ?? []).filter((row) =>
    CONTAMINATION_PROPERTY_IDS.has(row.id)
    || String(row.title || '').toLowerCase().includes('staging intake property world eye')
    || String(row.source_partner || '') === 'world_eye'
  );

  const candidateMasters = (masters ?? []).filter((row) =>
    !FORMAL_WORLD_EYE_MASTER_IDS.has(row.id)
    || String(row.source_property_ref || '').startsWith('LEGACY-')
  );

  const masterIds = new Set(candidateMasters.map((row) => row.id));
  const propertyIds = new Set(candidateProperties.map((row) => row.id));
  const candidateBindings = (bindings ?? []).filter((row) =>
    masterIds.has(row.property_master_id) || propertyIds.has(row.linked_property_id)
  );

  return {
    candidate_properties: candidateProperties,
    candidate_properties_master: candidateMasters,
    candidate_bindings: candidateBindings
  };
}

async function main() {
  await upsertOrganization();
  await upsertPartner();
  await upsertAgent(JULIUS_PARTNER_AGENT_ID, TEST_PARTNER_ORG_ID, 'Juliu Hsu (Japan Test Partner)', 'juliushsu@gmail.com', 'super_admin');
  await upsertPartnerUser(JULIUS_PARTNER_USER_ID, TEST_PARTNER_ORG_ID, JULIUS_PARTNER_AGENT_ID, 'juliushsu@gmail.com', 'Juliu Hsu (Japan Test Partner)');
  await upsertPartnerAuthorization();

  for (const master of SAMPLE_MASTERS) {
    await upsertSampleMaster(master);
    await upsertSampleProjection(master);
    await upsertSampleBinding(master);
  }
  await upsertSampleIngestJob();

  await ensureAuthUser(TENANT_SMOKE_EMAIL, TENANT_SMOKE_PASSWORD);
  await ensureAuthUser(PARTNER_SMOKE_EMAIL, PARTNER_SMOKE_PASSWORD);
  await upsertAgent(TENANT_SMOKE_AGENT_ID, TENANT_ORG_ID, 'Owner Test Tenant Smoke', TENANT_SMOKE_EMAIL, 'owner');
  await upsertAgent(PARTNER_SMOKE_AGENT_ID, TEST_PARTNER_ORG_ID, 'Owner Test Partner Smoke', PARTNER_SMOKE_EMAIL, 'super_admin');
  await upsertPartnerUser(PARTNER_SMOKE_USER_ID, TEST_PARTNER_ORG_ID, PARTNER_SMOKE_AGENT_ID, PARTNER_SMOKE_EMAIL, 'Owner Test Partner Smoke');

  const tenantToken = await signIn(TENANT_SMOKE_EMAIL, TENANT_SMOKE_PASSWORD);
  const partnerToken = await signIn(PARTNER_SMOKE_EMAIL, PARTNER_SMOKE_PASSWORD);

  const adminPropertiesSmoke = await apiRequest({
    token: tenantToken,
    orgId: TENANT_ORG_ID,
    path: '/admin/properties?page=1&limit=100&country=jp'
  });
  const partnerPropertiesSmoke = await apiRequest({
    token: partnerToken,
    orgId: TEST_PARTNER_ORG_ID,
    path: '/partner/properties?page=1&page_size=100'
  });

  const adminRows = adminPropertiesSmoke.json?.data ?? [];
  const partnerRows = partnerPropertiesSmoke.json?.data ?? [];

  const result = {
    org_id: TEST_PARTNER_ORG_ID,
    partner_id: TEST_PARTNER_ID,
    partner_authorization_id: PARTNER_AUTH_ID,
    owner_agent_partner_mapping: {
      tenant_agent_id: JULIUS_TENANT_AGENT_ID,
      partner_agent_id: JULIUS_PARTNER_AGENT_ID,
      partner_user_id: JULIUS_PARTNER_USER_ID,
      email: 'juliushsu@gmail.com'
    },
    sample_property_master_ids: SAMPLE_MASTERS.map((row) => row.id),
    sample_tenant_property_binding_ids: SAMPLE_MASTERS.map((row) => row.bindingId),
    sample_public_properties_ids: SAMPLE_MASTERS.map((row) => row.projectionId),
    sample_ingest_job_id: SAMPLE_INGEST_JOB_ID,
    admin_properties_smoke: {
      status: adminPropertiesSmoke.status,
      ok: adminPropertiesSmoke.ok,
      total: adminPropertiesSmoke.json?.meta?.total ?? null,
      matched_sample_rows: adminRows
        .filter((row) => SAMPLE_MASTERS.some((item) => item.projectionId === row.id))
        .map((row) => ({
          id: row.id,
          title: row.title,
          property_source_type: row.property_source_type,
          property_master_id: row.property_master_id,
          tenant_property_binding_id: row.tenant_property_binding_id,
          source_partner_id: row.source_partner_id,
          marketing_status: row.marketing_status
        }))
    },
    partner_properties_smoke: {
      status: partnerPropertiesSmoke.status,
      ok: partnerPropertiesSmoke.ok,
      total: partnerPropertiesSmoke.json?.meta?.total ?? null,
      matched_sample_rows: partnerRows
        .filter((row) => SAMPLE_MASTERS.some((item) => item.id === row.id))
        .map((row) => ({
          id: row.id,
          source_partner_id: row.source_partner_id,
          source_property_ref: row.source_property_ref,
          title_zh: row.title_zh
        })),
      unexpected_world_eye_rows: partnerRows
        .filter((row) => row.source_partner_id === WORLD_EYE_PARTNER_ID)
        .map((row) => ({
          id: row.id,
          source_property_ref: row.source_property_ref,
          title_zh: row.title_zh
        }))
    },
    world_eye_pollution_audit: await worldEyePollutionAudit()
  };

  console.log(JSON.stringify(result, null, 2));
}

await main();
