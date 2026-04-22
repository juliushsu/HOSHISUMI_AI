import { randomUUID } from 'node:crypto';
import { createServiceSupabase } from '../lib/supabase.js';
import { extractTextFromDocument } from './propertyIntakeOcr.js';
import { parseJapanesePropertySheet } from './propertyIntakeParser.js';

const OWNER_SCOPE_ROLES = new Set(['owner', 'super_admin']);
const STORE_SCOPE_ROLES = new Set(['manager', 'store_manager', 'store_editor']);
const ALLOWED_ROLES = new Set(['owner', 'super_admin', 'manager', 'store_manager', 'store_editor']);

const SOURCE_TYPE_ENUM = new Set(['manual_admin', 'partner_upload', 'api_import']);
const REVIEW_STATUS_ENUM = new Set(['pending_review', 'needs_fix', 'approved', 'rejected']);
const APPROVAL_TARGET_TYPE = 'property_draft';
const SIGNED_URL_TTL_SECONDS = 60 * 15;

export const PROPERTY_INTAKE_BUCKET = process.env.SUPABASE_PROPERTY_INTAKE_BUCKET || 'property-intake-raw';
export const PROPERTY_INTAKE_ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp'
]);
export const PROPERTY_INTAKE_MAX_FILE_BYTES = Number.parseInt(
  String(process.env.PROPERTY_INTAKE_MAX_FILE_BYTES || 10485760),
  10
);

const DETAIL_SELECT = [
  'id',
  'organization_id',
  'store_id',
  'environment_type',
  'created_by',
  'reviewed_by',
  'source_type',
  'source_partner_id',
  'source_channel',
  'source_metadata_json',
  'raw_file_path',
  'raw_file_name',
  'raw_file_mime_type',
  'raw_file_size_bytes',
  'ocr_status',
  'ocr_provider',
  'ocr_text',
  'ocr_blocks_json',
  'ocr_confidence',
  'ocr_error_code',
  'ocr_error_message',
  'parse_status',
  'parse_provider',
  'parsed_payload',
  'parse_audit_trail',
  'parsed_confidence',
  'parse_error_code',
  'parse_error_message',
  'review_status',
  'reviewed_payload',
  'review_audit_trail',
  'review_notes',
  'approval_target_type',
  'approved_property_id',
  'created_at',
  'updated_at',
  'reviewed_at',
  'approved_at',
  'store:stores!property_intake_cases_store_id_fkey(id,name,slug)',
  'partner:partners!property_intake_cases_source_partner_id_fkey(id,display_name,status)',
  'creator:agents!property_intake_cases_created_by_fkey(id,name,role,store_id)',
  'reviewer:agents!property_intake_cases_reviewed_by_fkey(id,name,role,store_id)'
].join(',');

const LIST_SELECT = [
  'id',
  'organization_id',
  'store_id',
  'environment_type',
  'source_type',
  'source_partner_id',
  'source_channel',
  'raw_file_name',
  'raw_file_mime_type',
  'raw_file_size_bytes',
  'ocr_status',
  'parse_status',
  'review_status',
  'parsed_payload',
  'reviewed_payload',
  'created_at',
  'updated_at',
  'store:stores!property_intake_cases_store_id_fkey(id,name,slug)',
  'partner:partners!property_intake_cases_source_partner_id_fkey(id,display_name,status)'
].join(',');

function isPlainObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeOptionalText(value, maxLength = 5000) {
  if (value == null) return null;
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > maxLength ? trimmed.slice(0, maxLength) : trimmed;
}

function normalizeUuid(value) {
  const normalized = normalizeOptionalText(value, 100);
  if (!normalized) return normalized;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)
    ? normalized
    : undefined;
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

function ensureRoleAllowed(role) {
  return ALLOWED_ROLES.has(String(role || '').toLowerCase());
}

function normalizeEnvironmentType() {
  const appEnv = String(process.env.APP_ENV || process.env.NODE_ENV || '').toLowerCase();
  const railwayProjectName = String(process.env.RAILWAY_PROJECT_NAME || '').toLowerCase();

  if (appEnv === 'production' && !railwayProjectName.includes('staging')) return 'production';
  if (appEnv === 'staging' || railwayProjectName.includes('staging')) return 'staging';
  return 'development';
}

function assertIntakeWriteAllowed(auth) {
  if (auth?.isDemo) {
    return {
      ok: false,
      status: 403,
      code: 'DEMO_MODE_NOT_SUPPORTED',
      message: 'Property intake canonical writes are disabled for demo organizations.'
    };
  }

  const environmentType = normalizeEnvironmentType();
  if (environmentType === 'production') {
    return {
      ok: false,
      status: 403,
      code: 'PROPERTY_INTAKE_DISABLED_IN_PRODUCTION',
      message: 'Property intake canonical writes are currently enabled only for development/staging.'
    };
  }

  return { ok: true, environmentType };
}

function buildPreviewSummary(row) {
  const payload = isPlainObject(row?.reviewed_payload)
    ? row.reviewed_payload
    : isPlainObject(row?.parsed_payload)
      ? row.parsed_payload
      : null;

  if (!payload) {
    return {
      price_jpy: null,
      layout: null,
      address_text: null,
      building_name: null,
      area_sqm: null
    };
  }

  return {
    price_jpy: payload.price_jpy ?? null,
    layout: payload.layout ?? null,
    address_text: payload.address_text ?? null,
    building_name: payload.building_name ?? null,
    area_sqm: payload.area_sqm ?? null
  };
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

function buildRawFilePath({ organizationId, storeId, intakeCaseId, fileName }) {
  return [
    'orgs',
    organizationId,
    'stores',
    storeId || 'unscoped',
    'intake-cases',
    intakeCaseId,
    'raw',
    `${Date.now()}-${sanitizeFileName(fileName)}`
  ].join('/');
}

function toListDto(row) {
  return {
    id: row.id,
    organization_id: row.organization_id,
    store_id: row.store_id ?? null,
    store_name: row.store?.name ?? null,
    environment_type: row.environment_type,
    source_type: row.source_type,
    source_channel: row.source_channel ?? null,
    source_partner_id: row.source_partner_id ?? null,
    source_partner_name: row.partner?.display_name ?? null,
    raw_file_name: row.raw_file_name,
    raw_file_mime_type: row.raw_file_mime_type,
    raw_file_size_bytes: row.raw_file_size_bytes ?? null,
    ocr_status: row.ocr_status,
    parse_status: row.parse_status,
    review_status: row.review_status,
    preview_summary: buildPreviewSummary(row),
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

function toDetailDto(row, fileAccess = null) {
  return {
    id: row.id,
    organization_id: row.organization_id,
    store_id: row.store_id ?? null,
    store: row.store
      ? {
          id: row.store.id,
          name: row.store.name,
          slug: row.store.slug ?? null
        }
      : null,
    environment_type: row.environment_type,
    created_by: row.created_by ?? null,
    creator: row.creator
      ? {
          id: row.creator.id,
          name: row.creator.name ?? null,
          role: row.creator.role ?? null,
          store_id: row.creator.store_id ?? null
        }
      : null,
    reviewed_by: row.reviewed_by ?? null,
    reviewer: row.reviewer
      ? {
          id: row.reviewer.id,
          name: row.reviewer.name ?? null,
          role: row.reviewer.role ?? null,
          store_id: row.reviewer.store_id ?? null
        }
      : null,
    source_type: row.source_type,
    source_partner_id: row.source_partner_id ?? null,
    source_partner: row.partner
      ? {
          id: row.partner.id,
          display_name: row.partner.display_name ?? null,
          status: row.partner.status ?? null
        }
      : null,
    source_channel: row.source_channel ?? null,
    source_metadata: row.source_metadata_json ?? null,
    raw_file: {
      path: row.raw_file_path,
      name: row.raw_file_name,
      mime_type: row.raw_file_mime_type,
      size_bytes: row.raw_file_size_bytes ?? null,
      access: fileAccess ?? {
        strategy: 'storage_path_only',
        signed_url: null,
        expires_in_seconds: null
      }
    },
    ocr: {
      status: row.ocr_status,
      provider: row.ocr_provider ?? null,
      text: row.ocr_text ?? null,
      blocks: row.ocr_blocks_json ?? null,
      confidence: row.ocr_confidence ?? null,
      error_code: row.ocr_error_code ?? null,
      error_message: row.ocr_error_message ?? null
    },
    parsing: {
      status: row.parse_status,
      provider: row.parse_provider ?? null,
      payload: row.parsed_payload ?? null,
      payload_audit_trail: Array.isArray(row.parse_audit_trail) ? row.parse_audit_trail : [],
      confidence: row.parsed_confidence ?? null,
      error_code: row.parse_error_code ?? null,
      error_message: row.parse_error_message ?? null
    },
    review: {
      status: row.review_status,
      reviewed_payload: row.reviewed_payload ?? null,
      review_notes: row.review_notes ?? null,
      review_audit_trail: Array.isArray(row.review_audit_trail) ? row.review_audit_trail : [],
      approval_target_type: row.approval_target_type ?? null,
      approved_property_id: row.approved_property_id ?? null
    },
    preview_summary: buildPreviewSummary(row),
    timestamps: {
      created_at: row.created_at,
      updated_at: row.updated_at,
      reviewed_at: row.reviewed_at ?? null,
      approved_at: row.approved_at ?? null
    }
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
      message: 'Failed to resolve intake store scope.',
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
      code: 'INTAKE_SCOPE_LOOKUP_FAILED',
      message: 'Failed to resolve intake scope.',
      details: { supabase_error: error.message }
    };
  }

  if (!actor || !actor.is_active || actor.organization_id !== auth.organizationId) {
    return {
      ok: false,
      status: 403,
      code: 'ACTOR_NOT_ALLOWED',
      message: 'Current actor cannot access property intake APIs.'
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
      return {
        ok: true,
        mode: 'cross_store_owner',
        store_id: storeCheck.store.id,
        store: storeCheck.store
      };
    }

    return {
      ok: true,
      mode: 'cross_store_owner',
      store_id: null,
      store: null
    };
  }

  if (STORE_SCOPE_ROLES.has(role)) {
    if (!actor.store_id) {
      return {
        ok: false,
        status: 403,
        code: 'STORE_SCOPE_NOT_ASSIGNED',
        message: 'Current role requires a bound store_id for property intake.'
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

    return {
      ok: true,
      mode: 'store_scoped',
      store_id: storeCheck.store.id,
      store: storeCheck.store
    };
  }

  return {
    ok: false,
    status: 403,
    code: 'ROLE_NOT_ALLOWED',
    message: 'Current role cannot access property intake APIs.'
  };
}

async function validatePartnerInOrg(supabase, organizationId, partnerId) {
  if (!partnerId) return { ok: true };

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
  const { error } = await serviceSupabase.storage.from(PROPERTY_INTAKE_BUCKET).upload(filePath, file.buffer, {
    contentType: file.mimetype,
    upsert: false
  });

  if (error) {
    return {
      ok: false,
      status: 502,
      code: 'INTAKE_UPLOAD_FAILED',
      message: 'Failed to upload raw intake file.',
      details: { supabase_error: error.message }
    };
  }

  return { ok: true };
}

async function removeRawFile(serviceSupabase, filePath) {
  try {
    await serviceSupabase.storage.from(PROPERTY_INTAKE_BUCKET).remove([filePath]);
  } catch {
    return;
  }
}

async function updateCaseRow(supabase, caseId, updates) {
  const { data, error } = await supabase
    .from('property_intake_cases')
    .update(updates)
    .eq('id', caseId)
    .select(DETAIL_SELECT)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

async function fetchCaseRow(supabase, caseId, scope) {
  let query = supabase
    .from('property_intake_cases')
    .select(DETAIL_SELECT)
    .eq('id', caseId)
    .eq('organization_id', scope.organizationId);

  if (scope.storeId) {
    query = query.eq('store_id', scope.storeId);
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    return {
      ok: false,
      status: 500,
      code: 'INTAKE_CASE_FETCH_FAILED',
      message: 'Failed to fetch property intake case.',
      details: { supabase_error: error.message }
    };
  }

  if (!data) {
    return {
      ok: false,
      status: 404,
      code: 'INTAKE_CASE_NOT_FOUND',
      message: 'Property intake case not found in current scope.'
    };
  }

  return { ok: true, row: data };
}

async function buildFileAccess(row) {
  try {
    const serviceSupabase = createServiceSupabase();
    const { data, error } = await serviceSupabase.storage
      .from(PROPERTY_INTAKE_BUCKET)
      .createSignedUrl(row.raw_file_path, SIGNED_URL_TTL_SECONDS);

    if (error || !data?.signedUrl) {
      return {
        strategy: 'storage_path_only',
        signed_url: null,
        expires_in_seconds: null
      };
    }

    return {
      strategy: 'signed_url',
      signed_url: data.signedUrl,
      expires_in_seconds: SIGNED_URL_TTL_SECONDS
    };
  } catch {
    return {
      strategy: 'storage_path_only',
      signed_url: null,
      expires_in_seconds: null
    };
  }
}

async function processIntakeCase({ supabase, intakeCase, file }) {
  const ocrResult = await extractTextFromDocument({
    buffer: file.buffer,
    mimeType: file.mimetype,
    fileName: file.originalname
  });

  if (ocrResult.status !== 'success') {
    const parseErrorCode = ocrResult.status === 'unconfigured'
      ? 'PARSE_SKIPPED_OCR_UNCONFIGURED'
      : 'PARSE_SKIPPED_OCR_FAILED';
    const parseErrorMessage = ocrResult.status === 'unconfigured'
      ? 'AI parsing was skipped because OCR is not configured.'
      : 'AI parsing was skipped because OCR did not return usable text.';

    return updateCaseRow(supabase, intakeCase.id, {
      ocr_status: 'failed',
      ocr_provider: ocrResult.provider,
      ocr_text: null,
      ocr_blocks_json: ocrResult.blocks,
      ocr_confidence: ocrResult.confidence,
      ocr_error_code: ocrResult.errorCode,
      ocr_error_message: ocrResult.errorMessage,
      parse_status: 'failed',
      parse_provider: null,
      parse_error_code: parseErrorCode,
      parse_error_message: parseErrorMessage
    });
  }

  const caseAfterOcr = await updateCaseRow(supabase, intakeCase.id, {
    ocr_status: 'done',
    ocr_provider: ocrResult.provider,
    ocr_text: ocrResult.rawText,
    ocr_blocks_json: ocrResult.blocks,
    ocr_confidence: ocrResult.confidence,
    ocr_error_code: null,
    ocr_error_message: null,
    parse_status: 'processing',
    parse_provider: null,
    parse_error_code: null,
    parse_error_message: null
  });

  const parseResult = await parseJapanesePropertySheet({
    ocrText: ocrResult.rawText,
    ocrBlocks: ocrResult.blocks
  });

  const parseAuditTrail = Array.isArray(caseAfterOcr.parse_audit_trail)
    ? [...caseAfterOcr.parse_audit_trail]
    : [];

  parseAuditTrail.push({
    attempted_at: new Date().toISOString(),
    status: parseResult.status,
    provider: parseResult.provider,
    confidence: parseResult.confidence,
    error_code: parseResult.errorCode,
    error_message: parseResult.errorMessage,
    payload: parseResult.payload,
    meta: parseResult.meta
  });

  if (parseResult.status !== 'success') {
    return updateCaseRow(supabase, intakeCase.id, {
      parse_status: 'failed',
      parse_provider: parseResult.provider,
      parse_audit_trail: parseAuditTrail,
      parsed_confidence: parseResult.confidence,
      parse_error_code: parseResult.errorCode,
      parse_error_message: parseResult.errorMessage
    });
  }

  return updateCaseRow(supabase, intakeCase.id, {
    parse_status: 'done',
    parse_provider: parseResult.provider,
    parsed_payload: parseResult.payload,
    parse_audit_trail: parseAuditTrail,
    parsed_confidence: parseResult.confidence,
    parse_error_code: null,
    parse_error_message: null
  });
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

  const sourceChannel = body.source_channel === undefined
    ? 'upload'
    : normalizeOptionalText(body.source_channel, 100);
  if (body.source_channel !== undefined && sourceChannel === undefined) {
    return {
      ok: false,
      status: 400,
      code: 'INVALID_SOURCE_CHANNEL',
      message: 'source_channel must be a string when provided.'
    };
  }

  const sourceMetadata = parseOptionalJSONObject(body.metadata);
  if (body.metadata !== undefined && sourceMetadata === undefined) {
    return {
      ok: false,
      status: 400,
      code: 'INVALID_METADATA',
      message: 'metadata must be a JSON object when provided.'
    };
  }

  if (!file) {
    return {
      ok: false,
      status: 400,
      code: 'MISSING_FILE',
      message: 'file is required.'
    };
  }

  if (!PROPERTY_INTAKE_ALLOWED_MIME_TYPES.has(file.mimetype)) {
    return {
      ok: false,
      status: 400,
      code: 'INVALID_FILE_TYPE',
      message: 'Only PDF, JPEG, PNG, and WEBP uploads are supported.'
    };
  }

  if (file.size > PROPERTY_INTAKE_MAX_FILE_BYTES) {
    return {
      ok: false,
      status: 413,
      code: 'FILE_TOO_LARGE',
      message: `file exceeds the ${PROPERTY_INTAKE_MAX_FILE_BYTES}-byte limit.`
    };
  }

  return {
    ok: true,
    input: {
      source_type: sourceType,
      source_partner_id: sourcePartnerId ?? null,
      source_channel: sourceChannel ?? 'upload',
      source_metadata_json: sourceMetadata ?? null,
      requested_store_id: storeId ?? null
    }
  };
}

export async function createIntakeCase({ supabase, auth, body, file }) {
  if (!ensureRoleAllowed(auth.role)) {
    return {
      ok: false,
      status: 403,
      code: 'ROLE_NOT_ALLOWED',
      message: 'Current role cannot create property intake cases.'
    };
  }

  const writeGuard = assertIntakeWriteAllowed(auth);
  if (!writeGuard.ok) return writeGuard;

  const scope = await resolveAdminScope({
    supabase,
    auth,
    requestedStoreId: body.requested_store_id
  });
  if (!scope.ok) return scope;

  const partnerCheck = await validatePartnerInOrg(supabase, auth.organizationId, body.source_partner_id);
  if (!partnerCheck.ok) return partnerCheck;

  const intakeCaseId = randomUUID();
  const rawFilePath = buildRawFilePath({
    organizationId: auth.organizationId,
    storeId: scope.store_id,
    intakeCaseId,
    fileName: file.originalname
  });
  let serviceSupabase = null;

  try {
    serviceSupabase = createServiceSupabase();
  } catch (error) {
    return {
      ok: false,
      status: 500,
      code: 'STORAGE_SERVICE_NOT_CONFIGURED',
      message: 'SUPABASE_SERVICE_ROLE_KEY is required for property intake storage orchestration.',
      details: { message: error instanceof Error ? error.message : 'Missing service role key.' }
    };
  }

  const uploadResult = await uploadRawFile({
    serviceSupabase,
    filePath: rawFilePath,
    file
  });
  if (!uploadResult.ok) return uploadResult;

  const insertPayload = {
    id: intakeCaseId,
    organization_id: auth.organizationId,
    store_id: scope.store_id,
    environment_type: writeGuard.environmentType,
    created_by: auth.agentId,
    reviewed_by: null,
    source_type: body.source_type,
    source_partner_id: body.source_partner_id,
    source_channel: body.source_channel,
    source_metadata_json: body.source_metadata_json,
    raw_file_path: rawFilePath,
    raw_file_name: file.originalname,
    raw_file_mime_type: file.mimetype,
    raw_file_size_bytes: file.size,
    ocr_status: 'processing',
    parse_status: 'pending',
    review_status: 'pending_review'
  };

  const { data, error } = await supabase
    .from('property_intake_cases')
    .insert(insertPayload)
    .select(DETAIL_SELECT)
    .single();

  if (error) {
    await removeRawFile(serviceSupabase, rawFilePath);
    return {
      ok: false,
      status: 500,
      code: 'INTAKE_CASE_CREATE_FAILED',
      message: 'Failed to create property intake case.',
      details: { supabase_error: error.message }
    };
  }

  try {
    const processed = await processIntakeCase({
      supabase,
      intakeCase: data,
      file
    });
    const fileAccess = await buildFileAccess(processed);

    return {
      ok: true,
      status: 201,
      data: {
        intake_case_id: processed.id,
        ocr_status: processed.ocr_status,
        parse_status: processed.parse_status,
        review_status: processed.review_status,
        created_at: processed.created_at,
        raw_file: {
          path: processed.raw_file_path,
          name: processed.raw_file_name,
          mime_type: processed.raw_file_mime_type,
          size_bytes: processed.raw_file_size_bytes
        },
        parsed_summary: buildPreviewSummary(processed),
        detail: toDetailDto(processed, fileAccess)
      }
    };
  } catch (processingError) {
    let fallbackRow = data;

    try {
      fallbackRow = await updateCaseRow(supabase, data.id, {
        ocr_status: 'failed',
        parse_status: 'failed',
        ocr_error_code: 'OCR_PIPELINE_UNEXPECTED_ERROR',
        ocr_error_message: processingError instanceof Error ? processingError.message : 'Unknown processing error.',
        parse_error_code: 'PARSE_PIPELINE_UNEXPECTED_ERROR',
        parse_error_message: 'OCR/parsing orchestration terminated unexpectedly.'
      });
    } catch {
      fallbackRow = data;
    }

    const fileAccess = await buildFileAccess(fallbackRow);

    return {
      ok: true,
      status: 201,
      data: {
        intake_case_id: fallbackRow.id,
        ocr_status: fallbackRow.ocr_status,
        parse_status: fallbackRow.parse_status,
        review_status: fallbackRow.review_status,
        created_at: fallbackRow.created_at,
        raw_file: {
          path: fallbackRow.raw_file_path,
          name: fallbackRow.raw_file_name,
          mime_type: fallbackRow.raw_file_mime_type,
          size_bytes: fallbackRow.raw_file_size_bytes
        },
        parsed_summary: buildPreviewSummary(fallbackRow),
        detail: toDetailDto(fallbackRow, fileAccess)
      }
    };
  }
}

export async function listIntakeCases({ supabase, auth, query }) {
  if (!ensureRoleAllowed(auth.role)) {
    return {
      ok: false,
      status: 403,
      code: 'ROLE_NOT_ALLOWED',
      message: 'Current role cannot access property intake queue.'
    };
  }

  const scope = await resolveAdminScope({
    supabase,
    auth,
    requestedStoreId: query.store_id
  });
  if (!scope.ok) return scope;

  const reviewStatus = query.review_status ? String(query.review_status) : null;
  if (reviewStatus && !REVIEW_STATUS_ENUM.has(reviewStatus)) {
    return {
      ok: false,
      status: 400,
      code: 'INVALID_REVIEW_STATUS',
      message: 'review_status must be pending_review/needs_fix/approved/rejected.'
    };
  }

  const sourceType = query.source_type ? String(query.source_type) : null;
  if (sourceType && !SOURCE_TYPE_ENUM.has(sourceType)) {
    return {
      ok: false,
      status: 400,
      code: 'INVALID_SOURCE_TYPE',
      message: 'source_type must be manual_admin/partner_upload/api_import.'
    };
  }

  const search = normalizeOptionalText(query.search, 200);
  const { page, limit } = parsePaging(query.page, query.limit);
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let request = supabase
    .from('property_intake_cases')
    .select(LIST_SELECT, { count: 'exact' })
    .eq('organization_id', auth.organizationId)
    .order('created_at', { ascending: false })
    .range(from, to);

  if (scope.store_id) request = request.eq('store_id', scope.store_id);
  if (reviewStatus) request = request.eq('review_status', reviewStatus);
  if (sourceType) request = request.eq('source_type', sourceType);
  if (search) {
    const safeSearch = search.replace(/[,%()]/g, ' ').trim();
    request = request.or(`raw_file_name.ilike.%${safeSearch}%,ocr_text.ilike.%${safeSearch}%`);
  }

  const { data, error, count } = await request;

  if (error) {
    return {
      ok: false,
      status: 500,
      code: 'INTAKE_CASES_FETCH_FAILED',
      message: 'Failed to fetch property intake cases.',
      details: { supabase_error: error.message }
    };
  }

  return {
    ok: true,
    data: (data || []).map(toListDto),
    meta: {
      page,
      limit,
      total: count ?? 0,
      total_pages: count ? Math.max(1, Math.ceil(count / limit)) : 1,
      scope_mode: scope.mode,
      scope_store_id: scope.store_id
    }
  };
}

export async function getIntakeCaseDetail({ supabase, auth, id, requestedStoreId = null }) {
  if (!ensureRoleAllowed(auth.role)) {
    return {
      ok: false,
      status: 403,
      code: 'ROLE_NOT_ALLOWED',
      message: 'Current role cannot access property intake detail.'
    };
  }

  const normalizedCaseId = normalizeUuid(id);
  if (!normalizedCaseId) {
    return {
      ok: false,
      status: 400,
      code: 'INVALID_INTAKE_CASE_ID',
      message: 'intake case id must be a UUID string.'
    };
  }

  const scope = await resolveAdminScope({
    supabase,
    auth,
    requestedStoreId
  });
  if (!scope.ok) return scope;

  const lookup = await fetchCaseRow(supabase, normalizedCaseId, {
    organizationId: auth.organizationId,
    storeId: scope.store_id
  });
  if (!lookup.ok) return lookup;

  const fileAccess = await buildFileAccess(lookup.row);

  return {
    ok: true,
    data: toDetailDto(lookup.row, fileAccess)
  };
}

export function validateReviewInput(body) {
  const reviewStatus = body.review_status === undefined ? undefined : String(body.review_status);
  if (!reviewStatus || !REVIEW_STATUS_ENUM.has(reviewStatus)) {
    return {
      ok: false,
      status: 400,
      code: 'INVALID_REVIEW_STATUS',
      message: 'review_status must be pending_review/needs_fix/approved/rejected.'
    };
  }

  if (!isPlainObject(body.reviewed_payload)) {
    return {
      ok: false,
      status: 400,
      code: 'INVALID_REVIEWED_PAYLOAD',
      message: 'reviewed_payload must be a JSON object.'
    };
  }

  const reviewNotes = body.review_notes === undefined ? null : normalizeOptionalText(body.review_notes, 10000);
  if (body.review_notes !== undefined && reviewNotes === undefined) {
    return {
      ok: false,
      status: 400,
      code: 'INVALID_REVIEW_NOTES',
      message: 'review_notes must be a string when provided.'
    };
  }

  return {
    ok: true,
    input: {
      review_status: reviewStatus,
      reviewed_payload: body.reviewed_payload,
      review_notes: reviewNotes
    }
  };
}

export async function reviewIntakeCase({ supabase, auth, id, body, requestedStoreId = null }) {
  if (!ensureRoleAllowed(auth.role)) {
    return {
      ok: false,
      status: 403,
      code: 'ROLE_NOT_ALLOWED',
      message: 'Current role cannot review property intake cases.'
    };
  }

  const writeGuard = assertIntakeWriteAllowed(auth);
  if (!writeGuard.ok) return writeGuard;

  const normalizedCaseId = normalizeUuid(id);
  if (!normalizedCaseId) {
    return {
      ok: false,
      status: 400,
      code: 'INVALID_INTAKE_CASE_ID',
      message: 'intake case id must be a UUID string.'
    };
  }

  const scope = await resolveAdminScope({ supabase, auth, requestedStoreId });
  if (!scope.ok) return scope;

  const lookup = await fetchCaseRow(supabase, normalizedCaseId, {
    organizationId: auth.organizationId,
    storeId: scope.store_id
  });
  if (!lookup.ok) return lookup;

  const reviewAuditTrail = Array.isArray(lookup.row.review_audit_trail)
    ? [...lookup.row.review_audit_trail]
    : [];
  reviewAuditTrail.push({
    reviewed_at: new Date().toISOString(),
    reviewed_by: auth.agentId,
    review_status: body.review_status,
    review_notes: body.review_notes,
    reviewed_payload: body.reviewed_payload
  });

  const updated = await updateCaseRow(supabase, normalizedCaseId, {
    review_status: body.review_status,
    reviewed_payload: body.reviewed_payload,
    review_notes: body.review_notes,
    reviewed_by: auth.agentId,
    reviewed_at: new Date().toISOString(),
    review_audit_trail: reviewAuditTrail
  });

  return {
    ok: true,
    data: {
      status: updated.review_status,
      reviewed_payload: updated.reviewed_payload,
      review_notes: updated.review_notes,
      reviewed_by: updated.reviewed_by,
      reviewed_at: updated.reviewed_at,
      review_audit_trail: Array.isArray(updated.review_audit_trail) ? updated.review_audit_trail : []
    }
  };
}

export async function approveIntakeCase({ supabase, auth, id, requestedStoreId = null }) {
  if (!ensureRoleAllowed(auth.role)) {
    return {
      ok: false,
      status: 403,
      code: 'ROLE_NOT_ALLOWED',
      message: 'Current role cannot approve property intake cases.'
    };
  }

  const writeGuard = assertIntakeWriteAllowed(auth);
  if (!writeGuard.ok) return writeGuard;

  const normalizedCaseId = normalizeUuid(id);
  if (!normalizedCaseId) {
    return {
      ok: false,
      status: 400,
      code: 'INVALID_INTAKE_CASE_ID',
      message: 'intake case id must be a UUID string.'
    };
  }

  const scope = await resolveAdminScope({ supabase, auth, requestedStoreId });
  if (!scope.ok) return scope;

  const lookup = await fetchCaseRow(supabase, normalizedCaseId, {
    organizationId: auth.organizationId,
    storeId: scope.store_id
  });
  if (!lookup.ok) return lookup;

  if (!isPlainObject(lookup.row.reviewed_payload)) {
    return {
      ok: false,
      status: 409,
      code: 'REVIEWED_PAYLOAD_REQUIRED',
      message: 'reviewed_payload is required before approve can target a property draft.'
    };
  }

  const updated = await updateCaseRow(supabase, normalizedCaseId, {
    review_status: 'approved',
    approval_target_type: APPROVAL_TARGET_TYPE,
    approved_property_id: null,
    approved_at: new Date().toISOString()
  });

  return {
    ok: true,
    data: {
      status: updated.review_status,
      approval_target_type: updated.approval_target_type,
      approved_property_id: updated.approved_property_id,
      approved_at: updated.approved_at,
      mode: 'stub_only'
    }
  };
}
