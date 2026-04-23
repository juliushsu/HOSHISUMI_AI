import { randomUUID } from 'node:crypto';
import { createServiceSupabase } from '../lib/supabase.js';
import { extractText } from './propertyIngestProviders/ocrProvider.js';
import { translatePropertyFields } from './propertyIngestProviders/translatorProvider.js';
import { extractAndTranslate } from './propertyIngestProviders/visionPropertyProvider.js';
import { PROCESSING_STRATEGY_ENUM, normalizeOptionalString, RECOMMENDED_NEXT_STEP_ENUM } from './propertyIngestProviders/strategyUtils.js';

const OWNER_SCOPE_ROLES = new Set(['owner', 'super_admin']);
const STORE_SCOPE_ROLES = new Set(['manager', 'store_manager', 'store_editor']);
const ALLOWED_ROLES = new Set(['owner', 'super_admin', 'manager', 'store_manager', 'store_editor']);
const SOURCE_TYPE_ENUM = new Set(['manual_admin', 'partner_upload', 'api_import']);
const JOB_STATUS_ENUM = new Set([
  'uploaded',
  'ocr_processing',
  'ocr_done',
  'ocr_low_confidence',
  'translating',
  'vision_fallback_processing',
  'translated',
  'pending_review',
  'approved',
  'rejected',
  'failed'
]);
const REVIEW_DECISION_ENUM = new Set(['reviewed', 'rejected', 'needs_fix']);
const SIGNED_URL_TTL_SECONDS = 60 * 15;

export const PROPERTY_INGEST_BUCKET = process.env.PROPERTY_INGEST_BUCKET || 'property-ingest-raw';
export const PROPERTY_INGEST_ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp'
]);
export const PROPERTY_INGEST_MAX_FILE_BYTES = Number.parseInt(
  String(process.env.PROPERTY_INGEST_MAX_FILE_BYTES || process.env.PROPERTY_INTAKE_MAX_FILE_BYTES || 10485760),
  10
);

const JOB_SELECT = [
  'id',
  'organization_id',
  'company_id',
  'store_id',
  'environment_type',
  'created_by',
  'reviewed_by',
  'source_type',
  'source_channel',
  'source_partner_id',
  'metadata_json',
  'status',
  'ocr_status',
  'translation_status',
  'processing_strategy',
  'recommended_next_step',
  'key_field_coverage_json',
  'current_ocr_confidence',
  'token_input_count',
  'token_output_count',
  'token_total_count',
  'estimated_cost_usd',
  'primary_file_name',
  'primary_file_mime_type',
  'primary_file_size_bytes',
  'current_ocr_text_ja',
  'current_ocr_blocks_json',
  'current_translated_fields_json',
  'current_reviewed_fields_json',
  'failure_code',
  'failure_message',
  'approved_property_id',
  'created_at',
  'updated_at',
  'reviewed_at',
  'approved_at',
  'store:stores!property_ingest_jobs_store_id_fkey(id,name,slug)',
  'partner:partners!property_ingest_jobs_source_partner_id_fkey(id,display_name,status)',
  'creator:agents!property_ingest_jobs_created_by_fkey(id,name,role,store_id)',
  'reviewer:agents!property_ingest_jobs_reviewed_by_fkey(id,name,role,store_id)'
].join(',');

function isPlainObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeUuid(value) {
  const normalized = normalizeOptionalText(value, 100);
  if (!normalized) return normalized;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)
    ? normalized
    : undefined;
}

function normalizeOptionalText(value, maxLength = 5000) {
  if (value == null) return null;
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > maxLength ? trimmed.slice(0, maxLength) : trimmed;
}

function parseOptionalJSONObject(value) {
  if (value == null || value === '') return null;
  if (isPlainObject(value)) return value;
  if (typeof value !== 'string') return undefined;
  try {
    const parsed = JSON.parse(value);
    return isPlainObject(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function parsePaging(rawPage, rawLimit, defaultLimit = 20, maxLimit = 100) {
  const page = Number.parseInt(String(rawPage ?? '1'), 10);
  const limit = Number.parseInt(String(rawLimit ?? String(defaultLimit)), 10);
  const safePage = Number.isFinite(page) && page > 0 ? page : 1;
  const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.min(limit, maxLimit) : defaultLimit;
  return { page: safePage, limit: safeLimit };
}

function normalizeEnvironmentType() {
  const appEnv = String(process.env.APP_ENV || process.env.NODE_ENV || '').toLowerCase();
  const railwayProjectName = String(process.env.RAILWAY_PROJECT_NAME || '').toLowerCase();

  if (appEnv === 'production' && !railwayProjectName.includes('staging')) return 'production';
  if (appEnv === 'staging' || railwayProjectName.includes('staging')) return 'staging';
  return 'development';
}

function isFeatureEnabled() {
  const raw = String(process.env.PROPERTY_INGEST_ENABLED ?? '').trim().toLowerCase();
  if (!raw) return true;
  return ['1', 'true', 'yes', 'on'].includes(raw);
}

function assertIngestAccessAllowed({ auth, requiresWrite = false }) {
  if (!ALLOWED_ROLES.has(String(auth?.role || '').toLowerCase())) {
    return {
      ok: false,
      status: 403,
      code: 'ROLE_NOT_ALLOWED',
      message: 'Current role cannot access property ingest APIs.'
    };
  }

  if (auth?.isDemo) {
    return {
      ok: false,
      status: 403,
      code: 'DEMO_MODE_NOT_SUPPORTED',
      message: 'Property ingest canonical flow is disabled for demo organizations.'
    };
  }

  const environmentType = normalizeEnvironmentType();
  if (environmentType === 'production') {
    return {
      ok: false,
      status: 403,
      code: 'PROPERTY_INGEST_DISABLED_IN_PRODUCTION',
      message: 'Property ingest APIs are enabled only for development/staging.'
    };
  }

  if (!isFeatureEnabled()) {
    return {
      ok: false,
      status: 403,
      code: 'PROPERTY_INGEST_DISABLED',
      message: requiresWrite
        ? 'Property ingest writes are currently disabled by environment setting.'
        : 'Property ingest is currently disabled by environment setting.'
    };
  }

  return { ok: true, environmentType };
}

function sanitizeFileName(fileName) {
  const normalized = String(fileName || 'upload').trim().toLowerCase();
  const parts = normalized.split('.');
  const extension = parts.length > 1 ? parts.pop() : '';
  const base = parts.join('.') || 'upload';
  const safeBase = base.replace(/[^a-z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'upload';
  const safeExtension = extension ? extension.replace(/[^a-z0-9]+/g, '') : '';
  return safeExtension ? `${safeBase}.${safeExtension}` : safeBase;
}

function buildRawFilePath({ organizationId, storeId, jobId, fileName }) {
  return [
    'orgs',
    organizationId,
    'stores',
    storeId || 'unscoped',
    'property-ingest',
    'jobs',
    jobId,
    'raw',
    `${Date.now()}-${sanitizeFileName(fileName)}`
  ].join('/');
}

function mergeFields(base, patch) {
  const next = isPlainObject(base) ? { ...base } : {};
  if (!isPlainObject(patch)) return next;
  for (const [key, value] of Object.entries(patch)) {
    next[key] = value;
  }
  return next;
}

function buildFieldChanges(before, after) {
  const previous = isPlainObject(before) ? before : {};
  const next = isPlainObject(after) ? after : {};
  const keys = new Set([...Object.keys(previous), ...Object.keys(next)]);
  const changes = {};

  for (const key of keys) {
    const prevValue = previous[key] ?? null;
    const nextValue = next[key] ?? null;
    if (JSON.stringify(prevValue) === JSON.stringify(nextValue)) continue;
    changes[key] = { before: prevValue, after: nextValue };
  }

  return changes;
}

function sumNullableCost(left, right) {
  const leftValue = typeof left === 'number' && Number.isFinite(left) ? left : null;
  const rightValue = typeof right === 'number' && Number.isFinite(right) ? right : null;
  if (leftValue == null && rightValue == null) return null;
  return Number(((leftValue ?? 0) + (rightValue ?? 0)).toFixed(6));
}

function buildUsageTotals(job, tokenUsage, estimatedCostUsd) {
  return {
    token_input_count: (job.token_input_count ?? 0) + (tokenUsage?.input_tokens ?? 0),
    token_output_count: (job.token_output_count ?? 0) + (tokenUsage?.output_tokens ?? 0),
    token_total_count: (job.token_total_count ?? 0) + (tokenUsage?.total_tokens ?? 0),
    estimated_cost_usd: sumNullableCost(job.estimated_cost_usd, estimatedCostUsd)
  };
}

function buildPreview(row) {
  const payload = isPlainObject(row.current_reviewed_fields_json)
    ? row.current_reviewed_fields_json
    : isPlainObject(row.current_translated_fields_json)
      ? row.current_translated_fields_json
      : null;

  return {
    title_zh: payload?.title_zh ?? null,
    address_zh: payload?.address_zh ?? null,
    rent: payload?.rent_jpy ?? null,
    area: payload?.area_sqm ?? null,
    layout: payload?.layout ?? null
  };
}

function toFileDto(row) {
  return {
    id: row.id,
    storage_bucket: row.storage_bucket,
    storage_path: row.storage_path,
    original_file_name: row.original_file_name,
    mime_type: row.mime_type,
    size_bytes: row.size_bytes ?? null,
    file_kind: row.file_kind,
    created_at: row.created_at
  };
}

function toOcrResultDto(row) {
  if (!row) return null;
  return {
    id: row.id,
    provider: row.provider ?? null,
    provider_model: row.provider_model ?? null,
    status: row.status,
    processing_strategy: row.processing_strategy ?? null,
    raw_text_ja: row.raw_text_ja ?? null,
    blocks_json: row.blocks_json ?? [],
    confidence: row.confidence ?? null,
    key_field_coverage: row.key_field_coverage_json ?? null,
    recommended_next_step: row.recommended_next_step ?? null,
    token_usage: {
      input_tokens: row.token_input_count ?? null,
      output_tokens: row.token_output_count ?? null,
      total_tokens: row.token_total_count ?? null
    },
    estimated_cost_usd: row.estimated_cost_usd ?? null,
    raw_json: row.raw_json ?? null,
    error_code: row.error_code ?? null,
    error_message: row.error_message ?? null,
    created_at: row.created_at
  };
}

function toTranslationResultDto(row) {
  if (!row) return null;
  return {
    id: row.id,
    provider: row.provider ?? null,
    provider_model: row.provider_model ?? null,
    status: row.status,
    processing_strategy: row.processing_strategy ?? null,
    source_language: row.source_language,
    target_language: row.target_language,
    translated_fields_json: row.translated_fields_json ?? null,
    key_field_coverage: row.key_field_coverage_json ?? null,
    confidence: row.confidence ?? null,
    token_usage: {
      input_tokens: row.token_input_count ?? null,
      output_tokens: row.token_output_count ?? null,
      total_tokens: row.token_total_count ?? null
    },
    estimated_cost_usd: row.estimated_cost_usd ?? null,
    raw_json: row.raw_json ?? null,
    error_code: row.error_code ?? null,
    error_message: row.error_message ?? null,
    created_at: row.created_at
  };
}

function toReviewDecisionDto(row) {
  return {
    id: row.id,
    decision: row.decision,
    status_before: row.status_before,
    status_after: row.status_after,
    translated_fields_before_json: row.translated_fields_before_json ?? null,
    reviewed_fields_json: row.reviewed_fields_json ?? null,
    field_changes_json: row.field_changes_json ?? null,
    notes: row.notes ?? null,
    created_by: row.created_by ?? null,
    created_at: row.created_at
  };
}

function toJobListDto(row) {
  return {
    id: row.id,
    status: row.status,
    ocr_status: row.ocr_status,
    translation_status: row.translation_status,
    processing_strategy: row.processing_strategy ?? null,
    recommended_next_step: row.recommended_next_step ?? null,
    key_field_coverage: row.key_field_coverage_json ?? null,
    current_ocr_confidence: row.current_ocr_confidence ?? null,
    token_usage: {
      input_tokens: row.token_input_count ?? null,
      output_tokens: row.token_output_count ?? null,
      total_tokens: row.token_total_count ?? null
    },
    estimated_cost_usd: row.estimated_cost_usd ?? null,
    organization_id: row.organization_id,
    company_id: row.company_id ?? null,
    store_id: row.store_id ?? null,
    raw_file_name: row.primary_file_name ?? null,
    raw_file_mime_type: row.primary_file_mime_type ?? null,
    raw_file_size_bytes: row.primary_file_size_bytes ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    preview: buildPreview(row)
  };
}

function toJobDetailDto(row, extras) {
  return {
    job: {
      id: row.id,
      organization_id: row.organization_id,
      company_id: row.company_id ?? null,
      store_id: row.store_id ?? null,
      store: row.store
        ? { id: row.store.id, name: row.store.name, slug: row.store.slug ?? null }
        : null,
      environment_type: row.environment_type,
      source_type: row.source_type,
      source_channel: row.source_channel ?? null,
      source_partner_id: row.source_partner_id ?? null,
      source_partner: row.partner
        ? { id: row.partner.id, display_name: row.partner.display_name ?? null, status: row.partner.status ?? null }
        : null,
      metadata: row.metadata_json ?? null,
      status: row.status,
      ocr_status: row.ocr_status,
      translation_status: row.translation_status,
      processing_strategy: row.processing_strategy ?? null,
      recommended_next_step: row.recommended_next_step ?? null,
      key_field_coverage: row.key_field_coverage_json ?? null,
      current_ocr_confidence: row.current_ocr_confidence ?? null,
      token_usage: {
        input_tokens: row.token_input_count ?? null,
        output_tokens: row.token_output_count ?? null,
        total_tokens: row.token_total_count ?? null
      },
      estimated_cost_usd: row.estimated_cost_usd ?? null,
      failure_code: row.failure_code ?? null,
      failure_message: row.failure_message ?? null,
      current_ocr_text_ja: row.current_ocr_text_ja ?? null,
      current_ocr_blocks_json: row.current_ocr_blocks_json ?? null,
      current_translated_fields_json: row.current_translated_fields_json ?? null,
      current_reviewed_fields_json: row.current_reviewed_fields_json ?? null,
      approved_property_id: row.approved_property_id ?? null,
      created_by: row.created_by ?? null,
      reviewed_by: row.reviewed_by ?? null,
      created_at: row.created_at,
      updated_at: row.updated_at,
      reviewed_at: row.reviewed_at ?? null,
      approved_at: row.approved_at ?? null
    },
    files: extras.files.map(toFileDto),
    ocr_result: toOcrResultDto(extras.latestOcrResult),
    translation_result: toTranslationResultDto(extras.latestTranslationResult),
    review_history: extras.reviewHistory.map(toReviewDecisionDto),
    file_access: extras.fileAccess,
    preview: buildPreview(row)
  };
}

async function fetchStoreByIdInOrg(supabase, organizationId, storeId) {
  const { data, error } = await supabase
    .from('stores')
    .select('id,organization_id,name,slug')
    .eq('id', storeId)
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (error) {
    return {
      ok: false,
      status: 500,
      code: 'STORE_LOOKUP_FAILED',
      message: 'Failed to resolve property ingest store scope.',
      details: { supabase_error: error.message }
    };
  }

  if (!data) {
    return {
      ok: false,
      status: 404,
      code: 'STORE_NOT_FOUND',
      message: 'store_id not found in current organization scope.'
    };
  }

  return { ok: true, store: data };
}

async function resolveAdminScope({ supabase, auth, requestedStoreId }) {
  const { data: actor, error } = await supabase
    .from('agents')
    .select('id,organization_id,role,store_id,is_active')
    .eq('id', auth.agentId)
    .maybeSingle();

  if (error) {
    return {
      ok: false,
      status: 500,
      code: 'PROPERTY_INGEST_SCOPE_LOOKUP_FAILED',
      message: 'Failed to resolve property ingest scope.',
      details: { supabase_error: error.message }
    };
  }

  if (!actor || !actor.is_active || actor.organization_id !== auth.organizationId) {
    return {
      ok: false,
      status: 403,
      code: 'ACTOR_NOT_ALLOWED',
      message: 'Current actor cannot access property ingest APIs.'
    };
  }

  const role = String(actor.role || '').toLowerCase();
  const normalizedRequestedStoreId = normalizeUuid(requestedStoreId);
  if (requestedStoreId != null && requestedStoreId !== '' && normalizedRequestedStoreId === undefined) {
    return {
      ok: false,
      status: 400,
      code: 'INVALID_STORE_ID',
      message: 'store_id must be a UUID string when provided.'
    };
  }

  if (OWNER_SCOPE_ROLES.has(role)) {
    if (normalizedRequestedStoreId) {
      const storeCheck = await fetchStoreByIdInOrg(supabase, auth.organizationId, normalizedRequestedStoreId);
      if (!storeCheck.ok) return storeCheck;
      return { ok: true, store_id: storeCheck.store.id, store: storeCheck.store };
    }
    return { ok: true, store_id: null, store: null };
  }

  if (STORE_SCOPE_ROLES.has(role)) {
    if (!actor.store_id) {
      return {
        ok: false,
        status: 403,
        code: 'STORE_SCOPE_NOT_ASSIGNED',
        message: 'Current role requires a bound store_id for property ingest.'
      };
    }

    if (normalizedRequestedStoreId && normalizedRequestedStoreId !== actor.store_id) {
      return {
        ok: false,
        status: 403,
        code: 'STORE_SCOPE_MISMATCH',
        message: 'Requested store_id is outside current actor scope.'
      };
    }

    const storeCheck = await fetchStoreByIdInOrg(supabase, auth.organizationId, actor.store_id);
    if (!storeCheck.ok) return storeCheck;
    return { ok: true, store_id: storeCheck.store.id, store: storeCheck.store };
  }

  return {
    ok: false,
    status: 403,
    code: 'ROLE_NOT_ALLOWED',
    message: 'Current role cannot access property ingest APIs.'
  };
}

async function validatePartnerInOrg(supabase, organizationId, partnerId) {
  if (!partnerId) return { ok: true, partner: null };
  const { data, error } = await supabase
    .from('partners')
    .select('id,organization_id,display_name,status')
    .eq('id', partnerId)
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (error) {
    return {
      ok: false,
      status: 500,
      code: 'PARTNER_LOOKUP_FAILED',
      message: 'Failed to validate source_partner_id.',
      details: { supabase_error: error.message }
    };
  }

  if (!data) {
    return {
      ok: false,
      status: 400,
      code: 'INVALID_SOURCE_PARTNER_ID',
      message: 'source_partner_id must belong to the same organization.'
    };
  }

  return { ok: true, partner: data };
}

async function uploadRawFile({ serviceSupabase, filePath, file }) {
  const { error } = await serviceSupabase.storage.from(PROPERTY_INGEST_BUCKET).upload(filePath, file.buffer, {
    contentType: file.mimetype,
    upsert: false
  });

  if (error) {
    return {
      ok: false,
      status: 502,
      code: 'PROPERTY_INGEST_UPLOAD_FAILED',
      message: 'Failed to upload raw property ingest file.',
      details: { supabase_error: error.message }
    };
  }

  return { ok: true };
}

async function removeRawFile(serviceSupabase, filePath) {
  try {
    await serviceSupabase.storage.from(PROPERTY_INGEST_BUCKET).remove([filePath]);
  } catch {
    return;
  }
}

async function updateJobRow(supabase, jobId, updates) {
  const { data, error } = await supabase
    .from('property_ingest_jobs')
    .update(updates)
    .eq('id', jobId)
    .select(JOB_SELECT)
    .maybeSingle();

  if (error) {
    return {
      ok: false,
      status: 500,
      code: 'PROPERTY_INGEST_JOB_UPDATE_FAILED',
      message: 'Failed to update property ingest job.',
      details: { supabase_error: error.message }
    };
  }

  if (!data) {
    return {
      ok: false,
      status: 404,
      code: 'PROPERTY_INGEST_JOB_NOT_FOUND',
      message: 'Property ingest job not found in current scope.'
    };
  }

  return { ok: true, row: data };
}

async function fetchJobRow(supabase, jobId) {
  const { data, error } = await supabase
    .from('property_ingest_jobs')
    .select(JOB_SELECT)
    .eq('id', jobId)
    .maybeSingle();

  if (error) {
    return {
      ok: false,
      status: 500,
      code: 'PROPERTY_INGEST_JOB_FETCH_FAILED',
      message: 'Failed to fetch property ingest job.',
      details: { supabase_error: error.message }
    };
  }

  if (!data) {
    return {
      ok: false,
      status: 404,
      code: 'PROPERTY_INGEST_JOB_NOT_FOUND',
      message: 'Property ingest job not found in current scope.'
    };
  }

  return { ok: true, row: data };
}

async function fetchJobInScope({ supabase, auth, id, requestedStoreId = null }) {
  const scope = await resolveAdminScope({ supabase, auth, requestedStoreId });
  if (!scope.ok) return scope;
  const job = await fetchJobRow(supabase, id);
  if (!job.ok) return job;

  if (job.row.organization_id !== auth.organizationId) {
    return {
      ok: false,
      status: 404,
      code: 'PROPERTY_INGEST_JOB_NOT_FOUND',
      message: 'Property ingest job not found in current scope.'
    };
  }

  if (scope.store_id && job.row.store_id !== scope.store_id) {
    return {
      ok: false,
      status: 404,
      code: 'PROPERTY_INGEST_JOB_NOT_FOUND',
      message: 'Property ingest job not found in current scope.'
    };
  }

  return { ok: true, scope, row: job.row };
}

async function fetchFilesForJob(supabase, jobId) {
  const { data, error } = await supabase
    .from('property_ingest_files')
    .select('id,job_id,storage_bucket,storage_path,original_file_name,mime_type,size_bytes,file_kind,created_at')
    .eq('job_id', jobId)
    .order('created_at', { ascending: true });

  if (error) {
    return {
      ok: false,
      status: 500,
      code: 'PROPERTY_INGEST_FILES_FETCH_FAILED',
      message: 'Failed to fetch property ingest files.',
      details: { supabase_error: error.message }
    };
  }

  return { ok: true, rows: data ?? [] };
}

async function fetchLatestOcrResult(supabase, jobId) {
  const { data, error } = await supabase
    .from('property_ocr_results')
    .select('*')
    .eq('job_id', jobId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return {
      ok: false,
      status: 500,
      code: 'PROPERTY_INGEST_OCR_FETCH_FAILED',
      message: 'Failed to fetch OCR result.',
      details: { supabase_error: error.message }
    };
  }

  return { ok: true, row: data ?? null };
}

async function fetchLatestTranslationResult(supabase, jobId) {
  const { data, error } = await supabase
    .from('property_translation_results')
    .select('*')
    .eq('job_id', jobId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return {
      ok: false,
      status: 500,
      code: 'PROPERTY_INGEST_TRANSLATION_FETCH_FAILED',
      message: 'Failed to fetch translation result.',
      details: { supabase_error: error.message }
    };
  }

  return { ok: true, row: data ?? null };
}

async function fetchReviewHistory(supabase, jobId) {
  const { data, error } = await supabase
    .from('property_review_decisions')
    .select('*')
    .eq('job_id', jobId)
    .order('created_at', { ascending: false });

  if (error) {
    return {
      ok: false,
      status: 500,
      code: 'PROPERTY_INGEST_REVIEW_HISTORY_FETCH_FAILED',
      message: 'Failed to fetch property review history.',
      details: { supabase_error: error.message }
    };
  }

  return { ok: true, rows: data ?? [] };
}

async function buildFileAccess(fileRow) {
  if (!fileRow) {
    return { strategy: 'none', signed_url: null, expires_in_seconds: null };
  }

  try {
    const serviceSupabase = createServiceSupabase();
    const { data, error } = await serviceSupabase.storage
      .from(fileRow.storage_bucket)
      .createSignedUrl(fileRow.storage_path, SIGNED_URL_TTL_SECONDS);

    if (error || !data?.signedUrl) {
      return { strategy: 'storage_path_only', signed_url: null, expires_in_seconds: null };
    }

    return {
      strategy: 'signed_url',
      signed_url: data.signedUrl,
      expires_in_seconds: SIGNED_URL_TTL_SECONDS
    };
  } catch {
    return { strategy: 'storage_path_only', signed_url: null, expires_in_seconds: null };
  }
}

async function insertOcrResult(supabase, payload) {
  const { data, error } = await supabase
    .from('property_ocr_results')
    .insert(payload)
    .select('*')
    .maybeSingle();

  if (error) {
    return {
      ok: false,
      status: 500,
      code: 'PROPERTY_INGEST_OCR_RESULT_CREATE_FAILED',
      message: 'Failed to write OCR result.',
      details: { supabase_error: error.message }
    };
  }

  return { ok: true, row: data };
}

async function insertTranslationResult(supabase, payload) {
  const { data, error } = await supabase
    .from('property_translation_results')
    .insert(payload)
    .select('*')
    .maybeSingle();

  if (error) {
    return {
      ok: false,
      status: 500,
      code: 'PROPERTY_INGEST_TRANSLATION_RESULT_CREATE_FAILED',
      message: 'Failed to write translation result.',
      details: { supabase_error: error.message }
    };
  }

  return { ok: true, row: data };
}

async function insertReviewDecision(supabase, payload) {
  const { data, error } = await supabase
    .from('property_review_decisions')
    .insert(payload)
    .select('*')
    .maybeSingle();

  if (error) {
    return {
      ok: false,
      status: 500,
      code: 'PROPERTY_INGEST_REVIEW_DECISION_CREATE_FAILED',
      message: 'Failed to write review decision.',
      details: { supabase_error: error.message }
    };
  }

  return { ok: true, row: data };
}

async function downloadPrimaryFile(files) {
  const primaryFile = (files || []).find((item) => item.file_kind === 'raw_source') || files?.[0] || null;
  if (!primaryFile) {
    return {
      ok: false,
      status: 404,
      code: 'PROPERTY_INGEST_FILE_NOT_FOUND',
      message: 'No raw source file is attached to this property ingest job.'
    };
  }

  try {
    const serviceSupabase = createServiceSupabase();
    const { data, error } = await serviceSupabase.storage
      .from(primaryFile.storage_bucket)
      .download(primaryFile.storage_path);

    if (error || !data) {
      return {
        ok: false,
        status: 502,
        code: 'PROPERTY_INGEST_FILE_DOWNLOAD_FAILED',
        message: 'Failed to download raw source file from storage.',
        details: { supabase_error: error?.message ?? null }
      };
    }

    const buffer = Buffer.from(await data.arrayBuffer());
    return { ok: true, file: primaryFile, buffer };
  } catch (error) {
    return {
      ok: false,
      status: 502,
      code: 'PROPERTY_INGEST_FILE_DOWNLOAD_FAILED',
      message: 'Failed to download raw source file from storage.',
      details: { reason: error instanceof Error ? error.message : 'Unknown storage error.' }
    };
  }
}

function deriveCanonicalPropertyPayload(job) {
  const source = isPlainObject(job.current_reviewed_fields_json)
    ? job.current_reviewed_fields_json
    : isPlainObject(job.current_translated_fields_json)
      ? job.current_translated_fields_json
      : null;

  if (!source) {
    return {
      ok: false,
      status: 400,
      code: 'PROPERTY_INGEST_APPROVAL_INPUT_MISSING',
      message: 'No translated or reviewed property fields are available for approval.'
    };
  }

  const title = source.title_zh || source.title_ja || source.address_zh || source.address_ja || null;
  if (!title) {
    return {
      ok: false,
      status: 400,
      code: 'PROPERTY_INGEST_APPROVAL_TITLE_REQUIRED',
      message: 'title_zh/title_ja or address text is required before approval.'
    };
  }

  const rent = typeof source.rent_jpy === 'number' && Number.isFinite(source.rent_jpy) ? source.rent_jpy : null;
  if (rent == null || rent < 0) {
    return {
      ok: false,
      status: 400,
      code: 'PROPERTY_INGEST_APPROVAL_RENT_REQUIRED',
      message: 'rent_jpy is required before approval can create a canonical property.'
    };
  }

  return {
    ok: true,
    payload: {
      title,
      title_ja: source.title_ja ?? null,
      title_zh: source.title_zh ?? null,
      description: source.remarks ?? null,
      description_zh: source.remarks ?? null,
      price: rent,
      country: 'jp',
      status: 'available',
      source: 'import',
      source_type: 'image_draft',
      purpose: 'rental',
      current_stage: 'rental_listing',
      currency: 'JPY',
      address_ja: source.address_ja ?? null,
      address_zh: source.address_zh ?? null,
      area_sqm: typeof source.area_sqm === 'number' ? source.area_sqm : null,
      layout: source.layout ?? null,
      building_age: Number.isInteger(source.building_age) ? source.building_age : null,
      nearest_station: source.station_name ?? null,
      walking_minutes: Number.isInteger(source.station_walk_minutes) ? source.station_walk_minutes : null,
      contact_store_id: job.store_id ?? null,
      source_ref: source.source_agency ?? null,
      raw_source_payload: {
        property_ingest_job_id: job.id,
        organization_id: job.organization_id,
        company_id: job.company_id ?? null,
        source_type: job.source_type,
        source_channel: job.source_channel ?? null,
        processing_strategy: job.processing_strategy ?? null,
        recommended_next_step: job.recommended_next_step ?? null,
        key_field_coverage_json: job.key_field_coverage_json ?? null,
        translated_fields: job.current_translated_fields_json ?? null,
        reviewed_fields: job.current_reviewed_fields_json ?? null,
        mapping_version: 'property_ingest_v1_strategy'
      },
      service_types: ['rental'],
      is_rental_enabled: true,
      is_management_enabled: false
    }
  };
}

export function validateCreateInput(body, file) {
  const sourceType = body.source_type === undefined ? 'manual_admin' : String(body.source_type);
  if (!SOURCE_TYPE_ENUM.has(sourceType)) {
    return {
      ok: false,
      status: 400,
      code: 'INVALID_SOURCE_TYPE',
      message: 'source_type must be manual_admin/partner_upload/api_import.'
    };
  }

  const sourcePartnerId = normalizeUuid(body.source_partner_id);
  if (body.source_partner_id !== undefined && body.source_partner_id !== '' && sourcePartnerId === undefined) {
    return {
      ok: false,
      status: 400,
      code: 'INVALID_SOURCE_PARTNER_ID',
      message: 'source_partner_id must be a UUID string when provided.'
    };
  }

  const storeId = normalizeUuid(body.store_id);
  if (body.store_id !== undefined && body.store_id !== '' && storeId === undefined) {
    return {
      ok: false,
      status: 400,
      code: 'INVALID_STORE_ID',
      message: 'store_id must be a UUID string when provided.'
    };
  }

  const sourceChannel = body.source_channel === undefined ? 'upload' : normalizeOptionalText(body.source_channel, 100);
  if (body.source_channel !== undefined && sourceChannel === undefined) {
    return {
      ok: false,
      status: 400,
      code: 'INVALID_SOURCE_CHANNEL',
      message: 'source_channel must be a string when provided.'
    };
  }

  const metadata = parseOptionalJSONObject(body.metadata);
  if (body.metadata !== undefined && metadata === undefined) {
    return {
      ok: false,
      status: 400,
      code: 'INVALID_METADATA',
      message: 'metadata must be a JSON object string when provided.'
    };
  }

  if (!file) {
    return { ok: false, status: 400, code: 'FILE_REQUIRED', message: 'file is required.' };
  }

  if (!PROPERTY_INGEST_ALLOWED_MIME_TYPES.has(file.mimetype)) {
    return {
      ok: false,
      status: 400,
      code: 'INVALID_FILE_TYPE',
      message: 'Only PDF/JPEG/PNG/WEBP uploads are supported.'
    };
  }

  if (file.size > PROPERTY_INGEST_MAX_FILE_BYTES) {
    return {
      ok: false,
      status: 413,
      code: 'FILE_TOO_LARGE',
      message: `file exceeds the ${PROPERTY_INGEST_MAX_FILE_BYTES}-byte limit.`
    };
  }

  return {
    ok: true,
    input: {
      source_type: sourceType,
      source_partner_id: sourcePartnerId ?? null,
      source_channel: sourceChannel ?? null,
      store_id: storeId ?? null,
      metadata: metadata ?? null
    }
  };
}

export function validateRunInput(body) {
  if (body == null || body === '') {
    return { ok: true, input: { force_rerun: false, requested_store_id: null } };
  }
  if (!isPlainObject(body)) {
    return { ok: false, status: 400, code: 'INVALID_BODY', message: 'Request body must be a JSON object.' };
  }

  const requestedStoreId = body.store_id === undefined ? null : normalizeUuid(body.store_id);
  if (body.store_id !== undefined && body.store_id !== '' && requestedStoreId === undefined) {
    return {
      ok: false,
      status: 400,
      code: 'INVALID_STORE_ID',
      message: 'store_id must be a UUID string when provided.'
    };
  }

  return { ok: true, input: { force_rerun: body.force_rerun === true, requested_store_id: requestedStoreId ?? null } };
}

export function validateTranslateInput(body) {
  const base = validateRunInput(body);
  if (!base.ok) return base;

  const strategy = body?.strategy === undefined || body?.strategy === null || body?.strategy === ''
    ? null
    : String(body.strategy).trim();
  if (strategy && !PROCESSING_STRATEGY_ENUM.has(strategy)) {
    return {
      ok: false,
      status: 400,
      code: 'INVALID_PROCESSING_STRATEGY',
      message: 'strategy must be ocr_then_ai/hybrid_assist/vision_only_fallback.'
    };
  }

  return {
    ok: true,
    input: {
      ...base.input,
      strategy
    }
  };
}

export function validateReviewInput(body) {
  if (!isPlainObject(body)) {
    return { ok: false, status: 400, code: 'INVALID_BODY', message: 'Request body must be a JSON object.' };
  }

  const decision = String(body.decision || 'reviewed');
  if (!REVIEW_DECISION_ENUM.has(decision)) {
    return {
      ok: false,
      status: 400,
      code: 'INVALID_DECISION',
      message: 'decision must be reviewed/rejected/needs_fix.'
    };
  }

  const reviewedFields = body.reviewed_fields == null ? {} : body.reviewed_fields;
  if (!isPlainObject(reviewedFields)) {
    return {
      ok: false,
      status: 400,
      code: 'INVALID_REVIEWED_FIELDS',
      message: 'reviewed_fields must be a JSON object when provided.'
    };
  }

  const notes = body.notes === undefined ? null : normalizeOptionalText(body.notes, 5000);
  if (body.notes !== undefined && notes === undefined) {
    return {
      ok: false,
      status: 400,
      code: 'INVALID_REVIEW_NOTES',
      message: 'notes must be a string when provided.'
    };
  }

  const requestedStoreId = body.store_id === undefined ? null : normalizeUuid(body.store_id);
  if (body.store_id !== undefined && body.store_id !== '' && requestedStoreId === undefined) {
    return {
      ok: false,
      status: 400,
      code: 'INVALID_STORE_ID',
      message: 'store_id must be a UUID string when provided.'
    };
  }

  return {
    ok: true,
    input: {
      decision,
      reviewed_fields: reviewedFields,
      notes: notes ?? null,
      requested_store_id: requestedStoreId ?? null
    }
  };
}

export function validateApproveInput(body) {
  if (body == null || body === '') {
    return { ok: true, input: { notes: null, requested_store_id: null } };
  }
  if (!isPlainObject(body)) {
    return { ok: false, status: 400, code: 'INVALID_BODY', message: 'Request body must be a JSON object.' };
  }

  const notes = body.notes === undefined ? null : normalizeOptionalText(body.notes, 5000);
  if (body.notes !== undefined && notes === undefined) {
    return {
      ok: false,
      status: 400,
      code: 'INVALID_APPROVAL_NOTES',
      message: 'notes must be a string when provided.'
    };
  }

  const requestedStoreId = body.store_id === undefined ? null : normalizeUuid(body.store_id);
  if (body.store_id !== undefined && body.store_id !== '' && requestedStoreId === undefined) {
    return {
      ok: false,
      status: 400,
      code: 'INVALID_STORE_ID',
      message: 'store_id must be a UUID string when provided.'
    };
  }

  return { ok: true, input: { notes: notes ?? null, requested_store_id: requestedStoreId ?? null } };
}

export async function createPropertyIngestJob({ supabase, auth, body, file }) {
  const access = assertIngestAccessAllowed({ auth, requiresWrite: true });
  if (!access.ok) return access;

  const scope = await resolveAdminScope({ supabase, auth, requestedStoreId: body.store_id });
  if (!scope.ok) return scope;

  const partnerCheck = await validatePartnerInOrg(supabase, auth.organizationId, body.source_partner_id);
  if (!partnerCheck.ok) return partnerCheck;

  const serviceSupabase = createServiceSupabase();
  const jobId = randomUUID();
  const filePath = buildRawFilePath({ organizationId: auth.organizationId, storeId: scope.store_id, jobId, fileName: file.originalname });

  const upload = await uploadRawFile({ serviceSupabase, filePath, file });
  if (!upload.ok) return upload;

  const { data: jobRow, error: jobError } = await supabase
    .from('property_ingest_jobs')
    .insert({
      id: jobId,
      organization_id: auth.organizationId,
      company_id: null,
      store_id: scope.store_id,
      environment_type: access.environmentType,
      created_by: auth.agentId,
      source_type: body.source_type,
      source_channel: body.source_channel,
      source_partner_id: body.source_partner_id,
      metadata_json: body.metadata,
      status: 'uploaded',
      ocr_status: 'pending',
      translation_status: 'pending',
      primary_file_name: file.originalname,
      primary_file_mime_type: file.mimetype,
      primary_file_size_bytes: file.size
    })
    .select(JOB_SELECT)
    .maybeSingle();

  if (jobError || !jobRow) {
    await removeRawFile(serviceSupabase, filePath);
    return {
      ok: false,
      status: 500,
      code: 'PROPERTY_INGEST_JOB_CREATE_FAILED',
      message: 'Failed to create property ingest job.',
      details: { supabase_error: jobError?.message ?? null }
    };
  }

  const { data: fileRow, error: fileError } = await supabase
    .from('property_ingest_files')
    .insert({
      job_id: jobId,
      organization_id: auth.organizationId,
      company_id: null,
      storage_bucket: PROPERTY_INGEST_BUCKET,
      storage_path: filePath,
      original_file_name: file.originalname,
      mime_type: file.mimetype,
      size_bytes: file.size,
      file_kind: 'raw_source',
      created_by: auth.agentId
    })
    .select('*')
    .maybeSingle();

  if (fileError || !fileRow) {
    await removeRawFile(serviceSupabase, filePath);
    await supabase.from('property_ingest_jobs').delete().eq('id', jobId);
    return {
      ok: false,
      status: 500,
      code: 'PROPERTY_INGEST_FILE_CREATE_FAILED',
      message: 'Failed to create property ingest file record.',
      details: { supabase_error: fileError?.message ?? null }
    };
  }

  return {
    ok: true,
    status: 201,
    data: {
      job: toJobDetailDto(jobRow, {
        files: [fileRow],
        latestOcrResult: null,
        latestTranslationResult: null,
        reviewHistory: [],
        fileAccess: await buildFileAccess(fileRow)
      }).job,
      file: toFileDto(fileRow)
    }
  };
}

export async function listPropertyIngestJobs({ supabase, auth, query }) {
  const access = assertIngestAccessAllowed({ auth, requiresWrite: false });
  if (!access.ok) return access;

  const scope = await resolveAdminScope({ supabase, auth, requestedStoreId: query.store_id ?? null });
  if (!scope.ok) return scope;

  const { page, limit } = parsePaging(query.page, query.limit);
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let request = supabase
    .from('property_ingest_jobs')
    .select(JOB_SELECT, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to)
    .eq('organization_id', auth.organizationId);

  if (scope.store_id) request = request.eq('store_id', scope.store_id);

  if (query.status) {
    const status = String(query.status);
    if (!JOB_STATUS_ENUM.has(status)) {
      return {
        ok: false,
        status: 400,
        code: 'INVALID_STATUS',
        message: 'status filter must be a valid property ingest job state.'
      };
    }
    request = request.eq('status', status);
  }

  if (query.processing_strategy) {
    const processingStrategy = String(query.processing_strategy);
    if (!PROCESSING_STRATEGY_ENUM.has(processingStrategy)) {
      return {
        ok: false,
        status: 400,
        code: 'INVALID_PROCESSING_STRATEGY',
        message: 'processing_strategy must be ocr_then_ai/hybrid_assist/vision_only_fallback.'
      };
    }
    request = request.eq('processing_strategy', processingStrategy);
  }

  const search = normalizeOptionalText(query.search, 200);
  if (search) {
    request = request.or(`primary_file_name.ilike.%${search}%,current_ocr_text_ja.ilike.%${search}%`);
  }

  const { data, error, count } = await request;
  if (error) {
    return {
      ok: false,
      status: 500,
      code: 'PROPERTY_INGEST_JOBS_FETCH_FAILED',
      message: 'Failed to fetch property ingest jobs.',
      details: { supabase_error: error.message }
    };
  }

  const total = Number(count ?? 0);
  return {
    ok: true,
    data: (data ?? []).map(toJobListDto),
    meta: {
      page,
      limit,
      total,
      total_pages: total === 0 ? 0 : Math.ceil(total / limit)
    }
  };
}

export async function getPropertyIngestJobDetail({ supabase, auth, id, requestedStoreId = null }) {
  const access = assertIngestAccessAllowed({ auth, requiresWrite: false });
  if (!access.ok) return access;

  const job = await fetchJobInScope({ supabase, auth, id, requestedStoreId });
  if (!job.ok) return job;

  const [filesResult, ocrResult, translationResult, reviewHistory] = await Promise.all([
    fetchFilesForJob(supabase, id),
    fetchLatestOcrResult(supabase, id),
    fetchLatestTranslationResult(supabase, id),
    fetchReviewHistory(supabase, id)
  ]);

  if (!filesResult.ok) return filesResult;
  if (!ocrResult.ok) return ocrResult;
  if (!translationResult.ok) return translationResult;
  if (!reviewHistory.ok) return reviewHistory;

  const fileAccess = await buildFileAccess(filesResult.rows[0] ?? null);
  return {
    ok: true,
    data: toJobDetailDto(job.row, {
      files: filesResult.rows,
      latestOcrResult: ocrResult.row,
      latestTranslationResult: translationResult.row,
      reviewHistory: reviewHistory.rows,
      fileAccess
    })
  };
}

export async function runPropertyIngestOcr({ supabase, auth, id, body }) {
  const access = assertIngestAccessAllowed({ auth, requiresWrite: true });
  if (!access.ok) return access;

  const job = await fetchJobInScope({ supabase, auth, id, requestedStoreId: body.requested_store_id ?? null });
  if (!job.ok) return job;

  if (!body.force_rerun && job.row.ocr_status === 'done') {
    const latest = await fetchLatestOcrResult(supabase, id);
    if (!latest.ok) return latest;
    return {
      ok: true,
      data: {
        job_id: job.row.id,
        status: job.row.status,
        ocr_confidence: job.row.current_ocr_confidence ?? null,
        key_field_coverage: job.row.key_field_coverage_json ?? null,
        recommended_next_step: job.row.recommended_next_step ?? null,
        ocr_result: toOcrResultDto(latest.row)
      }
    };
  }

  const filesResult = await fetchFilesForJob(supabase, id);
  if (!filesResult.ok) return filesResult;

  const fileDownload = await downloadPrimaryFile(filesResult.rows);
  if (!fileDownload.ok) {
    await updateJobRow(supabase, id, {
      status: 'failed',
      ocr_status: 'failed',
      failure_code: fileDownload.code,
      failure_message: fileDownload.message
    });
    return fileDownload;
  }

  const jobInProgress = await updateJobRow(supabase, id, {
    status: 'ocr_processing',
    ocr_status: 'processing',
    translation_status: 'pending',
    recommended_next_step: null,
    processing_strategy: null,
    failure_code: null,
    failure_message: null
  });
  if (!jobInProgress.ok) return jobInProgress;

  const ocr = await extractText({
    buffer: fileDownload.buffer,
    mimeType: fileDownload.file.mime_type,
    fileName: fileDownload.file.original_file_name
  });

  const ocrInsert = await insertOcrResult(supabase, {
    job_id: id,
    organization_id: auth.organizationId,
    company_id: null,
    provider: ocr.provider,
    provider_model: ocr.model,
    status: ocr.status,
    processing_strategy: ocr.processingStrategy,
    raw_text_ja: ocr.rawText,
    blocks_json: ocr.blocks,
    raw_json: ocr.rawJson,
    confidence: ocr.confidence,
    key_field_coverage_json: ocr.keyFieldCoverage,
    recommended_next_step: ocr.recommendedNextStep,
    token_input_count: ocr.tokenUsage?.input_tokens ?? null,
    token_output_count: ocr.tokenUsage?.output_tokens ?? null,
    token_total_count: ocr.tokenUsage?.total_tokens ?? null,
    estimated_cost_usd: ocr.estimatedCostUsd,
    error_code: ocr.errorCode,
    error_message: ocr.errorMessage,
    created_by: auth.agentId
  });
  if (!ocrInsert.ok) return ocrInsert;

  const usageTotals = buildUsageTotals(job.row, ocr.tokenUsage, ocr.estimatedCostUsd);
  const jobStatus = ocr.status === 'done'
    ? (ocr.recommendedNextStep === 'ocr_then_ai' ? 'ocr_done' : 'ocr_low_confidence')
    : 'failed';
  const updatedJob = await updateJobRow(supabase, id, {
    status: jobStatus,
    ocr_status: ocr.status === 'done' ? 'done' : ocr.status,
    current_ocr_text_ja: ocr.rawText,
    current_ocr_blocks_json: ocr.blocks,
    current_ocr_confidence: ocr.confidence,
    key_field_coverage_json: ocr.keyFieldCoverage,
    recommended_next_step: ocr.recommendedNextStep,
    translation_status: 'pending',
    failure_code: ocr.errorCode,
    failure_message: ocr.errorMessage,
    ...usageTotals
  });
  if (!updatedJob.ok) return updatedJob;

  return {
    ok: true,
    data: {
      job_id: id,
      status: updatedJob.row.status,
      ocr_confidence: ocr.confidence,
      key_field_coverage: ocr.keyFieldCoverage,
      recommended_next_step: ocr.recommendedNextStep,
      ocr_result: toOcrResultDto(ocrInsert.row)
    }
  };
}

export async function runPropertyIngestTranslate({ supabase, auth, id, body }) {
  const access = assertIngestAccessAllowed({ auth, requiresWrite: true });
  if (!access.ok) return access;

  const job = await fetchJobInScope({ supabase, auth, id, requestedStoreId: body.requested_store_id ?? null });
  if (!job.ok) return job;

  const strategy = body.strategy || job.row.recommended_next_step || 'ocr_then_ai';
  if (!PROCESSING_STRATEGY_ENUM.has(strategy)) {
    return {
      ok: false,
      status: 400,
      code: 'INVALID_PROCESSING_STRATEGY',
      message: 'strategy must be ocr_then_ai/hybrid_assist/vision_only_fallback.'
    };
  }

  if (!body.force_rerun && job.row.translation_status === 'done' && job.row.processing_strategy === strategy) {
    const latest = await fetchLatestTranslationResult(supabase, id);
    if (!latest.ok) return latest;
    return {
      ok: true,
      data: {
        job_id: job.row.id,
        status: job.row.status,
        processing_strategy: strategy,
        translation_result: toTranslationResultDto(latest.row)
      }
    };
  }

  if (strategy === 'ocr_then_ai') {
    if (!normalizeOptionalString(job.row.current_ocr_text_ja, 60000)) {
      if (new Set(['failed', 'unconfigured']).has(job.row.ocr_status)) {
        await updateJobRow(supabase, id, {
          status: 'failed',
          processing_strategy: strategy,
          translation_status: 'failed',
          failure_code: job.row.failure_code || 'PROPERTY_INGEST_TRANSLATION_INPUT_MISSING',
          failure_message: job.row.failure_message || 'Run OCR successfully before translation.'
        });
      }

      return {
        ok: false,
        status: 400,
        code: 'PROPERTY_INGEST_TRANSLATION_INPUT_MISSING',
        message: 'Run OCR successfully before translation.'
      };
    }
  }

  const statusBeforeCall = strategy === 'vision_only_fallback' ? 'vision_fallback_processing' : 'translating';
  const jobInProgress = await updateJobRow(supabase, id, {
    status: statusBeforeCall,
    processing_strategy: strategy,
    translation_status: 'processing',
    failure_code: null,
    failure_message: null
  });
  if (!jobInProgress.ok) return jobInProgress;

  let translation;
  if (strategy === 'ocr_then_ai') {
    translation = await translatePropertyFields({
      rawTextJa: job.row.current_ocr_text_ja,
      blocks: Array.isArray(job.row.current_ocr_blocks_json) ? job.row.current_ocr_blocks_json : [],
      processingStrategy: 'ocr_then_ai'
    });
  } else {
    const filesResult = await fetchFilesForJob(supabase, id);
    if (!filesResult.ok) return filesResult;
    const fileDownload = await downloadPrimaryFile(filesResult.rows);
    if (!fileDownload.ok) return fileDownload;

    translation = await extractAndTranslate({
      buffer: fileDownload.buffer,
      mimeType: fileDownload.file.mime_type,
      fileName: fileDownload.file.original_file_name,
      rawTextJa: strategy === 'hybrid_assist' ? job.row.current_ocr_text_ja : null,
      blocks: strategy === 'hybrid_assist' && Array.isArray(job.row.current_ocr_blocks_json)
        ? job.row.current_ocr_blocks_json
        : [],
      processingStrategy: strategy
    });
  }

  const latestOcr = await fetchLatestOcrResult(supabase, id);
  if (!latestOcr.ok) return latestOcr;

  const translationInsert = await insertTranslationResult(supabase, {
    job_id: id,
    ocr_result_id: latestOcr.row?.id ?? null,
    organization_id: auth.organizationId,
    company_id: null,
    provider: translation.provider,
    provider_model: translation.model,
    status: translation.status,
    processing_strategy: translation.processingStrategy,
    source_language: 'ja',
    target_language: 'zh-TW',
    translated_fields_json: translation.translatedFields,
    key_field_coverage_json: translation.keyFieldCoverage,
    raw_json: translation.rawJson,
    confidence: translation.confidence,
    token_input_count: translation.tokenUsage?.input_tokens ?? null,
    token_output_count: translation.tokenUsage?.output_tokens ?? null,
    token_total_count: translation.tokenUsage?.total_tokens ?? null,
    estimated_cost_usd: translation.estimatedCostUsd,
    error_code: translation.errorCode,
    error_message: translation.errorMessage,
    created_by: auth.agentId
  });
  if (!translationInsert.ok) return translationInsert;

  const usageTotals = buildUsageTotals(job.row, translation.tokenUsage, translation.estimatedCostUsd);
  const updatedJob = await updateJobRow(supabase, id, {
    status: translation.status === 'done' ? 'translated' : 'failed',
    processing_strategy: strategy,
    translation_status: translation.status === 'done' ? 'done' : translation.status,
    current_translated_fields_json: translation.translatedFields,
    failure_code: translation.errorCode,
    failure_message: translation.errorMessage,
    ...usageTotals
  });
  if (!updatedJob.ok) return updatedJob;

  return {
    ok: true,
    data: {
      job_id: id,
      status: updatedJob.row.status,
      processing_strategy: strategy,
      translation_result: toTranslationResultDto(translationInsert.row)
    }
  };
}

export async function reviewPropertyIngestJob({ supabase, auth, id, body }) {
  const access = assertIngestAccessAllowed({ auth, requiresWrite: true });
  if (!access.ok) return access;

  const job = await fetchJobInScope({ supabase, auth, id, requestedStoreId: body.requested_store_id ?? null });
  if (!job.ok) return job;

  const latestTranslation = await fetchLatestTranslationResult(supabase, id);
  if (!latestTranslation.ok) return latestTranslation;

  if (!isPlainObject(job.row.current_translated_fields_json) && !isPlainObject(job.row.current_reviewed_fields_json)) {
    return {
      ok: false,
      status: 400,
      code: 'PROPERTY_INGEST_REVIEW_INPUT_MISSING',
      message: 'Run translation successfully before review.'
    };
  }

  const baseline = isPlainObject(job.row.current_reviewed_fields_json)
    ? job.row.current_reviewed_fields_json
    : isPlainObject(job.row.current_translated_fields_json)
      ? job.row.current_translated_fields_json
      : {};

  const reviewedFields = mergeFields(baseline, body.reviewed_fields);
  const fieldChanges = buildFieldChanges(baseline, reviewedFields);
  const statusAfter = body.decision === 'rejected' ? 'rejected' : 'pending_review';

  const decisionInsert = await insertReviewDecision(supabase, {
    job_id: id,
    organization_id: auth.organizationId,
    company_id: null,
    decision: body.decision,
    status_before: job.row.status,
    status_after: statusAfter,
    translation_result_id: latestTranslation.row?.id ?? null,
    translated_fields_before_json: baseline,
    reviewed_fields_json: reviewedFields,
    field_changes_json: fieldChanges,
    notes: body.notes,
    created_by: auth.agentId
  });
  if (!decisionInsert.ok) return decisionInsert;

  const updatedJob = await updateJobRow(supabase, id, {
    status: statusAfter,
    current_reviewed_fields_json: reviewedFields,
    reviewed_by: auth.agentId,
    reviewed_at: new Date().toISOString(),
    failure_code: null,
    failure_message: null
  });
  if (!updatedJob.ok) return updatedJob;

  return {
    ok: true,
    data: {
      job_id: id,
      status: updatedJob.row.status,
      review_decision: toReviewDecisionDto(decisionInsert.row)
    }
  };
}

export async function approvePropertyIngestJob({ supabase, auth, id, body }) {
  const access = assertIngestAccessAllowed({ auth, requiresWrite: true });
  if (!access.ok) return access;

  const job = await fetchJobInScope({ supabase, auth, id, requestedStoreId: body.requested_store_id ?? null });
  if (!job.ok) return job;

  if (job.row.status === 'approved') {
    return { ok: false, status: 409, code: 'PROPERTY_INGEST_ALREADY_APPROVED', message: 'Property ingest job has already been approved.' };
  }

  if (job.row.status === 'rejected') {
    return { ok: false, status: 409, code: 'PROPERTY_INGEST_REJECTED', message: 'Rejected property ingest jobs cannot be approved.' };
  }

  if (!new Set(['translated', 'pending_review']).has(job.row.status)) {
    return {
      ok: false,
      status: 409,
      code: 'PROPERTY_INGEST_NOT_READY_FOR_APPROVAL',
      message: 'Property ingest job must be translated or pending_review before approval.'
    };
  }

  const canonical = deriveCanonicalPropertyPayload(job.row);
  if (!canonical.ok) return canonical;

  const { data: propertyRow, error: propertyError } = await supabase
    .from('properties')
    .insert({
      organization_id: auth.organizationId,
      ...canonical.payload
    })
    .select('id,title,title_zh,address_zh,price')
    .maybeSingle();

  if (propertyError || !propertyRow) {
    return {
      ok: false,
      status: 500,
      code: 'PROPERTY_INGEST_APPROVAL_PROPERTY_CREATE_FAILED',
      message: 'Failed to create canonical property from approved ingest job.',
      details: { supabase_error: propertyError?.message ?? null }
    };
  }

  const decisionInsert = await insertReviewDecision(supabase, {
    job_id: id,
    organization_id: auth.organizationId,
    company_id: null,
    decision: 'approved',
    status_before: job.row.status,
    status_after: 'approved',
    translation_result_id: null,
    translated_fields_before_json: job.row.current_reviewed_fields_json ?? job.row.current_translated_fields_json ?? null,
    reviewed_fields_json: job.row.current_reviewed_fields_json ?? job.row.current_translated_fields_json ?? null,
    field_changes_json: null,
    notes: body.notes,
    created_by: auth.agentId
  });
  if (!decisionInsert.ok) return decisionInsert;

  const updatedJob = await updateJobRow(supabase, id, {
    status: 'approved',
    approved_property_id: propertyRow.id,
    approved_at: new Date().toISOString(),
    reviewed_by: auth.agentId
  });
  if (!updatedJob.ok) return updatedJob;

  return {
    ok: true,
    data: {
      job_id: id,
      status: updatedJob.row.status,
      approved_property: propertyRow
    }
  };
}
