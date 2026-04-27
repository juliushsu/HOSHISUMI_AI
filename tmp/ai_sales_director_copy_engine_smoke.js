import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const API_BASE = 'https://hoshisumi-api-staging.up.railway.app/api';
const ENV_FILE = '/tmp/hs_railway_staging.env';
const ORG_ID = '33333333-3333-4333-8333-333333333333';
const TENANT_SMOKE_EMAIL = 'staging-owner-jp-test-tenant-smoke@hoshisumi.test';
const TENANT_SMOKE_PASSWORD = 'TenantSmokePass-20260427-Aa1!';
const JP_PROPERTY_ID = '83333333-9999-4999-8999-999999999991';
const CHANNELS = ['fb', 'ig', 'line'];

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

function buildForbiddenScan(text) {
  const checks = {
    raw_key_poi: /\bpoi_[a-z0-9_]*\b/i,
    raw_key_transit: /\btransit\.[a-z0-9_.]*\b/i,
    raw_key_location_enrichment: /\blocation_enrichment\b/i,
    raw_key_uncertain: /\buncertain\b/i,
    raw_key_rent_jpy: /\brent_jpy\b/i,
    raw_key_price_jpy: /\bprice_jpy\b/i,
    internal_data_pending: /資料待補/,
    internal_unverified: /無法驗證/,
    internal_conservative: /保守評估/,
    internal_avoid_claim: /避免宣稱/,
    internal_seed_phrase: /先用/,
    internal_entry_phrase: /切入/,
    ai_self_analysis: /目前資料顯示|建議補齊|此欄位不足/,
    engineering_terms: /\bfallback\b|\banalysis\b|\bdata_sources\b/i
  };

  const matches = Object.entries(checks)
    .filter(([, pattern]) => pattern.test(text))
    .map(([key]) => key);

  return {
    ok: matches.length === 0,
    matches
  };
}

const env = parseEnvFile(ENV_FILE);
const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const client = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);

const signIn = await client.auth.signInWithPassword({
  email: TENANT_SMOKE_EMAIL,
  password: TENANT_SMOKE_PASSWORD
});
if (signIn.error) throw signIn.error;

const token = signIn.data.session.access_token;

async function apiPost(path, body) {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
      'x-organization-id': ORG_ID
    },
    body: JSON.stringify(body)
  });

  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }

  return { status: response.status, json, text };
}

async function apiGet(path) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      authorization: `Bearer ${token}`,
      'x-organization-id': ORG_ID
    }
  });
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: response.status, json, text };
}

async function fetchPropertyOrThrow(id) {
  const { data, error } = await admin
    .from('properties')
    .select('id,title,title_ja,title_zh,country,price,currency,layout,area_sqm,building_age,nearest_station,walking_minutes,raw_source_payload')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
}

async function fetchTaiwanPropertyOrThrow() {
  const { data, error } = await admin
    .from('properties')
    .select('id,title,title_ja,title_zh,country,price,currency,layout,area_sqm,building_age,nearest_station,walking_minutes,raw_source_payload')
    .eq('organization_id', ORG_ID)
    .eq('country', 'tw')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error('No Taiwan property found in staging org 3333.');
  return data;
}

async function runScenario(label, property) {
  const analysisRes = await apiPost('/admin/ai-assistant/analyses', {
    property_id: property.id,
    force_regenerate: true
  });

  const analysisId = analysisRes.json?.data?.id ?? null;
  const provider = analysisRes.json?.data?.provider ?? null;
  const model = analysisRes.json?.data?.model ?? null;

  const copies = [];
  for (const channel of CHANNELS) {
    const copyRes = await apiPost('/admin/ai-assistant/copy-generations', {
      property_id: property.id,
      analysis_id: analysisId,
      channel,
      prompt_context: {}
    });

    const text = String(copyRes.json?.data?.ai_output_text ?? '');
    copies.push({
      channel,
      status: copyRes.status,
      provider: copyRes.json?.data?.provider ?? null,
      model: copyRes.json?.data?.model ?? null,
      is_fallback: (copyRes.json?.data?.provider ?? null) === 'fallback',
      text_length: text.length,
      forbidden_scan: buildForbiddenScan(text),
      text
    });
  }

  return {
    label,
    property,
    analysis: {
      status: analysisRes.status,
      id: analysisId,
      provider,
      model,
      is_fallback: provider === 'fallback'
    },
    copies
  };
}

const health = await apiGet('/health');
const japanProperty = await fetchPropertyOrThrow(JP_PROPERTY_ID);
const taiwanProperty = await fetchTaiwanPropertyOrThrow();
const japanScenario = await runScenario('japan_partner_property', japanProperty);
const taiwanScenario = await runScenario('taiwan_property', taiwanProperty);

console.log(JSON.stringify({
  health: {
    status: health.status,
    body: health.json?.data ?? null
  },
  scenarios: [japanScenario, taiwanScenario]
}, null, 2));
