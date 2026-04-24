import crypto from 'node:crypto';
import { createServiceSupabase } from '../lib/supabase.js';

const PROVIDERS = ['openai', 'gemini', 'google_maps'];
const EDIT_ROLES = new Set(['owner', 'super_admin', 'system_admin']);
const DEFAULT_ROUTING = {
  ocr_provider: 'openai',
  standard_analysis_model: 'openai',
  vision_enhanced_analysis_model: 'openai_vision',
  copy_generation_model: 'openai',
  marketing_visual_generation_model: 'openai_image',
  location_enrichment_provider: 'google_maps'
};
const ROUTING_ENUMS = {
  ocr_provider: ['openai', 'gemini'],
  standard_analysis_model: ['openai', 'gemini'],
  vision_enhanced_analysis_model: ['openai_vision', 'gemini_vision'],
  copy_generation_model: ['openai', 'gemini'],
  marketing_visual_generation_model: ['openai_image', 'gemini_image'],
  location_enrichment_provider: ['google_maps']
};

function normalizeText(value, fallback = '') {
  if (value == null) return fallback;
  return String(value).trim();
}

function buildEncryptionKey() {
  const seed = normalizeText(process.env.AI_SETTINGS_ENCRYPTION_SECRET) ||
    [
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      process.env.RAILWAY_PROJECT_ID,
      process.env.RAILWAY_ENVIRONMENT_ID
    ].filter(Boolean).join(':');

  return crypto.createHash('sha256').update(seed || 'staging-ai-settings').digest();
}

function encryptSecret(plaintext) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', buildEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}.${tag.toString('base64')}.${encrypted.toString('base64')}`;
}

function decryptSecret(ciphertext) {
  const raw = normalizeText(ciphertext);
  if (!raw) return null;
  const [ivB64, tagB64, encryptedB64] = raw.split('.');
  if (!ivB64 || !tagB64 || !encryptedB64) return null;

  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    buildEncryptionKey(),
    Buffer.from(ivB64, 'base64')
  );
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedB64, 'base64')),
    decipher.final()
  ]);
  return decrypted.toString('utf8');
}

function keyLast4(value) {
  const raw = normalizeText(value);
  return raw ? raw.slice(-4) : null;
}

function maskSecret(value) {
  const raw = normalizeText(value);
  if (!raw || raw.length < 8) return raw ? '****' : null;
  if (raw.startsWith('AIza') && raw.length >= 9) {
    return `${raw.slice(0, 6)}****${raw.slice(-3)}`;
  }
  return `${raw.slice(0, Math.min(8, raw.length - 4))}****${raw.slice(-4)}`;
}

function ensureEditRole(role) {
  return EDIT_ROLES.has(String(role || '').toLowerCase());
}

function buildDefaultCredentialState() {
  return {
    openai: null,
    gemini: null,
    google_maps: null
  };
}

function buildProviderDto(provider, row, override = null) {
  const effective = override || row || null;
  return {
    enabled: true,
    api_key: {
      has_value: Boolean(effective?.is_configured),
      masked_value: effective?.masked_value ?? (effective?.api_key_last4 ? `****${effective.api_key_last4}` : null),
      last_updated_at: effective?.updated_at ?? null,
      last_updated_by: effective?.updated_by ?? null,
      last_tested_at: effective?.last_tested_at ?? null,
      last_test_status: effective?.last_test_status ?? 'skipped',
      last_test_message: effective?.last_test_message ?? null
    }
  };
}

function mapSettingsRowToRouting(row) {
  return {
    ...DEFAULT_ROUTING,
    ...(row
      ? {
        ocr_provider: row.ocr_provider,
        standard_analysis_model: row.standard_analysis_model,
        vision_enhanced_analysis_model: row.vision_enhanced_analysis_model,
        copy_generation_model: row.copy_generation_model,
        marketing_visual_generation_model: row.marketing_visual_generation_model,
        location_enrichment_provider: row.location_enrichment_provider
      }
      : {})
  };
}

function resolveProviderForRouting(key, value) {
  if (key === 'location_enrichment_provider') return 'google_maps';
  if (value === 'openai' || value === 'openai_vision' || value === 'openai_image') return 'openai';
  if (value === 'gemini' || value === 'gemini_vision' || value === 'gemini_image') return 'gemini';
  return null;
}

function sanitizeProviderError(status, fallback) {
  if (status === 401 || status === 403) return 'Unauthorized';
  if (status === 429) return 'Rate limited';
  return fallback;
}

async function testOpenAI(apiKey) {
  const response = await fetch('https://api.openai.com/v1/models', {
    headers: {
      Authorization: `Bearer ${apiKey}`
    }
  });
  if (!response.ok) {
    return {
      last_test_status: 'failed',
      last_test_message: sanitizeProviderError(response.status, 'OpenAI connection failed')
    };
  }
  return {
    last_test_status: 'ok',
    last_test_message: null
  };
}

async function testGemini(apiKey) {
  const url = new URL('https://generativelanguage.googleapis.com/v1beta/models');
  url.searchParams.set('key', apiKey);
  const response = await fetch(url);
  if (!response.ok) {
    return {
      last_test_status: 'failed',
      last_test_message: sanitizeProviderError(response.status, 'Gemini connection failed')
    };
  }
  return {
    last_test_status: 'ok',
    last_test_message: null
  };
}

async function testGoogleMaps(apiKey) {
  const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
  url.searchParams.set('address', 'Tokyo Station');
  url.searchParams.set('key', apiKey);
  const response = await fetch(url);
  if (!response.ok) {
    return {
      last_test_status: 'failed',
      last_test_message: sanitizeProviderError(response.status, 'Google Maps connection failed')
    };
  }
  const json = await response.json();
  if (json.status && json.status !== 'OK' && json.status !== 'ZERO_RESULTS') {
    return {
      last_test_status: 'failed',
      last_test_message: normalizeText(json.status, 'Google Maps connection failed')
    };
  }
  return {
    last_test_status: 'ok',
    last_test_message: null
  };
}

async function testProviderConnection(provider, apiKey) {
  try {
    if (!apiKey) {
      return {
        last_test_status: 'skipped',
        last_test_message: 'No key configured'
      };
    }
    if (provider === 'openai') return testOpenAI(apiKey);
    if (provider === 'gemini') return testGemini(apiKey);
    if (provider === 'google_maps') return testGoogleMaps(apiKey);
    return {
      last_test_status: 'skipped',
      last_test_message: 'Provider not supported'
    };
  } catch {
    return {
      last_test_status: 'failed',
      last_test_message: 'Connection test failed'
    };
  }
}

async function loadRows(organizationId) {
  const supabase = createServiceSupabase();
  const [{ data: settingsRow, error: settingsError }, { data: credentialRows, error: credentialsError }] = await Promise.all([
    supabase
      .from('organization_ai_settings')
      .select([
        'organization_id',
        'ocr_provider',
        'standard_analysis_model',
        'vision_enhanced_analysis_model',
        'copy_generation_model',
        'marketing_visual_generation_model',
        'location_enrichment_provider',
        'updated_by',
        'updated_at'
      ].join(','))
      .eq('organization_id', organizationId)
      .maybeSingle(),
    supabase
      .from('organization_ai_provider_credentials')
      .select([
        'provider',
        'api_key_ciphertext',
        'api_key_last4',
        'is_configured',
        'last_test_status',
        'last_test_message',
        'last_tested_at',
        'updated_by',
        'updated_at'
      ].join(','))
      .eq('organization_id', organizationId)
  ]);

  if (settingsError) {
    const error = new Error('Failed to load AI settings.');
    error.code = 'AI_SETTINGS_FETCH_FAILED';
    error.status = 500;
    error.details = { supabase_error: settingsError.message };
    throw error;
  }

  if (credentialsError) {
    const error = new Error('Failed to load AI provider credentials.');
    error.code = 'AI_PROVIDER_CREDENTIALS_FETCH_FAILED';
    error.status = 500;
    error.details = { supabase_error: credentialsError.message };
    throw error;
  }

  return {
    settingsRow,
    credentialRows: credentialRows ?? []
  };
}

function buildCredentialStateFromRows(rows = []) {
  const map = buildDefaultCredentialState();
  for (const row of rows) {
    map[row.provider] = {
      ...row,
      masked_value: row?.api_key_last4 ? `****${row.api_key_last4}` : null
    };
  }
  return map;
}

function normalizeProvidersInput(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const next = {};
  for (const provider of PROVIDERS) {
    if (!Object.prototype.hasOwnProperty.call(value, provider)) continue;
    const apiKey = value[provider]?.api_key;
    if (apiKey === null) {
      next[provider] = { api_key: null };
      continue;
    }
    const normalizedKey = normalizeText(apiKey);
    if (normalizedKey) {
      next[provider] = { api_key: normalizedKey };
    }
  }
  return next;
}

function normalizeRoutingInput(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const next = {};
  for (const [key, allowed] of Object.entries(ROUTING_ENUMS)) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
    const normalizedValue = normalizeText(value[key]);
    if (normalizedValue) next[key] = normalizedValue;
    if (normalizedValue && !allowed.includes(normalizedValue)) {
      const error = new Error(`${key} is not supported.`);
      error.code = 'UNSUPPORTED_ROUTING_VALUE';
      error.status = 422;
      error.details = { key, value: normalizedValue, allowed_values: allowed };
      throw error;
    }
  }
  return next;
}

function buildEffectiveKeyState(existingState, providersInput) {
  const next = {};
  for (const provider of PROVIDERS) {
    if (providersInput[provider]?.api_key === null) {
      next[provider] = { has_value: false, api_key: null };
      continue;
    }
    if (providersInput[provider]?.api_key) {
      next[provider] = { has_value: true, api_key: providersInput[provider].api_key };
      continue;
    }
    const existing = existingState[provider];
    next[provider] = {
      has_value: Boolean(existing?.is_configured),
      api_key: existing?.api_key_ciphertext ? decryptSecret(existing.api_key_ciphertext) : null
    };
  }
  return next;
}

function validateRoutingAgainstKeys(routing, effectiveKeys) {
  const missing = [];
  for (const [key, value] of Object.entries(routing)) {
    const provider = resolveProviderForRouting(key, value);
    if (!provider) continue;
    if (!effectiveKeys[provider]?.has_value) {
      missing.push({
        key,
        provider,
        value
      });
    }
  }

  if (missing.length > 0) {
    const error = new Error('Routing references a provider without a configured key.');
    error.code = 'INVALID_AI_SETTINGS';
    error.status = 422;
    error.details = { missing_providers: missing };
    throw error;
  }
}

async function runConnectionTests(effectiveKeys) {
  const now = new Date().toISOString();
  const results = {};
  for (const provider of PROVIDERS) {
    const probe = await testProviderConnection(provider, effectiveKeys[provider]?.api_key || null);
    results[provider] = {
      ...probe,
      last_tested_at: now
    };
  }
  return results;
}

function buildResponseDto({ settingsRow, credentialState, routingOverride = null, credentialOverride = null }) {
  const routing = routingOverride || mapSettingsRowToRouting(settingsRow);
  return {
    environment: 'staging',
    editable: true,
    providers: {
      openai: buildProviderDto('openai', credentialState.openai, credentialOverride?.openai),
      gemini: buildProviderDto('gemini', credentialState.gemini, credentialOverride?.gemini),
      google_maps: buildProviderDto('google_maps', credentialState.google_maps, credentialOverride?.google_maps)
    },
    routing,
    usage_telemetry_contract: {
      token_count_fields: ['input_tokens', 'output_tokens', 'total_tokens'],
      map_request_count_enabled: true,
      estimated_cost_usd_enabled: true,
      charged_units_enabled: true
    }
  };
}

export function canAccessAiSystemSettings(role) {
  return ensureEditRole(role);
}

export async function getAiSystemSettings(organizationId) {
  const { settingsRow, credentialRows } = await loadRows(organizationId);
  const credentialState = buildCredentialStateFromRows(credentialRows);
  return buildResponseDto({ settingsRow, credentialState });
}

export async function putAiSystemSettings({
  organizationId,
  agentId,
  body = {}
}) {
  const supabase = createServiceSupabase();
  const providersInput = normalizeProvidersInput(body.providers);
  const routingInput = normalizeRoutingInput(body.routing);
  const validateOnly = body.validate_only === true;
  const testConnections = body.test_connections === true;
  const { settingsRow, credentialRows } = await loadRows(organizationId);
  const credentialState = buildCredentialStateFromRows(credentialRows);
  const routing = {
    ...mapSettingsRowToRouting(settingsRow),
    ...routingInput
  };
  const effectiveKeys = buildEffectiveKeyState(credentialState, providersInput);

  validateRoutingAgainstKeys(routing, effectiveKeys);

  const connectionResults = testConnections ? await runConnectionTests(effectiveKeys) : null;
  const credentialPreview = {};
  for (const provider of PROVIDERS) {
    const sourceKey = effectiveKeys[provider]?.api_key || null;
    const existing = credentialState[provider];
    credentialPreview[provider] = {
      is_configured: Boolean(effectiveKeys[provider]?.has_value),
      masked_value: sourceKey ? maskSecret(sourceKey) : null,
      updated_at: existing?.updated_at ?? null,
      updated_by: existing?.updated_by ?? null,
      last_tested_at: connectionResults?.[provider]?.last_tested_at ?? existing?.last_tested_at ?? null,
      last_test_status: connectionResults?.[provider]?.last_test_status ?? existing?.last_test_status ?? 'skipped',
      last_test_message: connectionResults?.[provider]?.last_test_message ?? existing?.last_test_message ?? null
    };
  }

  if (validateOnly) {
    return {
      saved: false,
      ...buildResponseDto({
        settingsRow,
        credentialState,
        routingOverride: routing,
        credentialOverride: credentialPreview
      })
    };
  }

  const settingsPayload = {
    organization_id: organizationId,
    ocr_provider: routing.ocr_provider,
    standard_analysis_model: routing.standard_analysis_model,
    vision_enhanced_analysis_model: routing.vision_enhanced_analysis_model,
    copy_generation_model: routing.copy_generation_model,
    marketing_visual_generation_model: routing.marketing_visual_generation_model,
    location_enrichment_provider: routing.location_enrichment_provider,
    updated_by: agentId
  };
  const { error: settingsUpsertError } = await supabase
    .from('organization_ai_settings')
    .upsert(settingsPayload, { onConflict: 'organization_id' });

  if (settingsUpsertError) {
    const error = new Error('Failed to save AI settings.');
    error.code = 'AI_SETTINGS_SAVE_FAILED';
    error.status = 500;
    error.details = { supabase_error: settingsUpsertError.message };
    throw error;
  }

  for (const provider of PROVIDERS) {
    if (!Object.prototype.hasOwnProperty.call(providersInput, provider) && !connectionResults) continue;

    const submittedKey = providersInput[provider]?.api_key;
    const current = credentialState[provider];
    const effectiveKey = effectiveKeys[provider]?.api_key || null;
    const isConfigured = Boolean(effectiveKeys[provider]?.has_value);
    const payload = {
      organization_id: organizationId,
      provider,
      api_key_ciphertext: submittedKey === null
        ? null
        : providersInput[provider]?.api_key
          ? encryptSecret(providersInput[provider].api_key)
          : current?.api_key_ciphertext ?? null,
      api_key_last4: submittedKey === null
        ? null
        : providersInput[provider]?.api_key
          ? keyLast4(providersInput[provider].api_key)
          : current?.api_key_last4 ?? keyLast4(effectiveKey),
      is_configured: isConfigured,
      last_test_status: connectionResults?.[provider]?.last_test_status ?? current?.last_test_status ?? null,
      last_test_message: connectionResults?.[provider]?.last_test_message ?? current?.last_test_message ?? null,
      last_tested_at: connectionResults?.[provider]?.last_tested_at ?? current?.last_tested_at ?? null,
      updated_by: agentId
    };

    const { error: credentialUpsertError } = await supabase
      .from('organization_ai_provider_credentials')
      .upsert(payload, { onConflict: 'organization_id,provider' });

    if (credentialUpsertError) {
      const error = new Error('Failed to save AI provider credentials.');
      error.code = 'AI_PROVIDER_CREDENTIALS_SAVE_FAILED';
      error.status = 500;
      error.details = { supabase_error: credentialUpsertError.message, provider };
      throw error;
    }
  }

  return {
    saved: true,
    ...(await getAiSystemSettings(organizationId))
  };
}
