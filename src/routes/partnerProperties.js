import { Router } from 'express';
import { respondError, respondOk } from '../lib/http.js';
import { createServiceSupabase } from '../lib/supabase.js';

const ALLOWED_AGENT_ROLES = new Set(['owner', 'super_admin', 'manager']);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STATUS_ENUM = new Set(['available', 'sold', 'off_market']);
const EDITABLE_FIELDS = new Set([
  'source_property_ref',
  'title_ja',
  'title_zh',
  'address_ja',
  'address_zh',
  'price',
  'currency',
  'layout',
  'area_sqm',
  'description_ja',
  'description_zh',
  'image_urls',
  'canonical_payload_json',
  'raw_source_payload',
  'source_updated_at'
]);

const MASTER_SELECT = [
  'id',
  'source_partner_id',
  'source_of_truth',
  'source_property_ref',
  'country',
  'status',
  'canonical_payload_json',
  'title_ja',
  'title_zh',
  'address_ja',
  'address_zh',
  'price',
  'currency',
  'layout',
  'area_sqm',
  'description_ja',
  'description_zh',
  'image_urls',
  'raw_source_payload',
  'source_updated_at',
  'created_at',
  'updated_at'
].join(',');

const router = Router();

function isPlainObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function isUuid(value) {
  return typeof value === 'string' && UUID_RE.test(value);
}

function normalizeOptionalText(value, maxLen = 5000) {
  if (value == null) return null;
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > maxLen ? trimmed.slice(0, maxLen) : trimmed;
}

function parseIsoDateTime(value) {
  const normalized = normalizeOptionalText(value, 100);
  if (!normalized) return normalized;
  const timestamp = Date.parse(normalized);
  if (Number.isNaN(timestamp)) return undefined;
  return new Date(timestamp).toISOString();
}

function parsePaging(rawPage, rawPageSize) {
  const page = Number.parseInt(String(rawPage ?? '1'), 10);
  const pageSize = Number.parseInt(String(rawPageSize ?? '20'), 10);
  return {
    page: Number.isFinite(page) && page > 0 ? page : 1,
    pageSize: Number.isFinite(pageSize) && pageSize > 0 ? Math.min(pageSize, 100) : 20
  };
}

function isModelInitializationError(error) {
  const message = String(error?.message || '').toLowerCase();
  return message.includes('properties_master')
    || message.includes('tenant_property_bindings')
    || message.includes('partner_users')
    || message.includes('column organization_id does not exist')
    || message.includes('column agent_id does not exist');
}

function handleModelError(error) {
  if (isModelInitializationError(error)) {
    return {
      status: 503,
      code: 'PARTNER_MODEL_NOT_INITIALIZED',
      message: 'Japan partner management model is not initialized in this staging database yet.',
      details: { supabase_error: error.message }
    };
  }

  return {
    status: 500,
    code: 'PARTNER_PROPERTIES_QUERY_FAILED',
    message: 'Failed to query Japan partner properties.',
    details: { supabase_error: error.message }
  };
}

function toMasterDto(row, bindingSummary = null) {
  return {
    id: row.id,
    source_partner_id: row.source_partner_id,
    source_of_truth: row.source_of_truth,
    source_property_ref: row.source_property_ref,
    country: row.country,
    status: row.status,
    title_ja: row.title_ja ?? null,
    title_zh: row.title_zh ?? null,
    address_ja: row.address_ja ?? null,
    address_zh: row.address_zh ?? null,
    price: row.price ?? null,
    currency: row.currency,
    layout: row.layout ?? null,
    area_sqm: row.area_sqm ?? null,
    description_ja: row.description_ja ?? null,
    description_zh: row.description_zh ?? null,
    image_urls: row.image_urls ?? [],
    canonical_payload_json: row.canonical_payload_json ?? {},
    raw_source_payload: row.raw_source_payload ?? null,
    source_updated_at: row.source_updated_at ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    tenant_binding_summary: bindingSummary
  };
}

async function resolvePartnerScope(auth) {
  if (!ALLOWED_AGENT_ROLES.has(String(auth.role || '').toLowerCase())) {
    return {
      ok: false,
      status: 403,
      code: 'ROLE_NOT_ALLOWED',
      message: 'Current role cannot access partner property APIs.'
    };
  }

  let serviceSupabase;
  try {
    serviceSupabase = createServiceSupabase();
  } catch (error) {
    return {
      ok: false,
      status: 500,
      code: 'PARTNER_SERVICE_NOT_CONFIGURED',
      message: 'SUPABASE_SERVICE_ROLE_KEY is required for partner property APIs.',
      details: { message: error instanceof Error ? error.message : 'Missing service role key.' }
    };
  }

  const { data: membership, error } = await serviceSupabase
    .from('partner_users')
    .select('id,partner_id,organization_id,agent_id,email,role,is_active,partner:partners!partner_users_partner_id_fkey(id,company_name,display_name,status,partner_slug)')
    .eq('organization_id', auth.organizationId)
    .eq('agent_id', auth.agentId)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();

  if (error) {
    const handled = handleModelError(error);
    return { ok: false, ...handled };
  }

  if (!membership || !membership.partner || membership.partner.status !== 'active') {
    return {
      ok: false,
      status: 403,
      code: 'PARTNER_SCOPE_NOT_FOUND',
      message: 'No active Japan partner membership found for current organization.'
    };
  }

  return { ok: true, serviceSupabase, membership };
}

async function fetchPropertyMasterById(serviceSupabase, partnerId, id) {
  const { data, error } = await serviceSupabase
    .from('properties_master')
    .select(MASTER_SELECT)
    .eq('id', id)
    .eq('source_partner_id', partnerId)
    .maybeSingle();

  if (error) {
    const handled = handleModelError(error);
    return { ok: false, ...handled };
  }

  if (!data) {
    return {
      ok: false,
      status: 404,
      code: 'PARTNER_PROPERTY_NOT_FOUND',
      message: 'Japan partner property not found in current scope.'
    };
  }

  return { ok: true, row: data };
}

router.get('/', async (req, res) => {
  const scope = await resolvePartnerScope(req.auth);
  if (!scope.ok) {
    return respondError(res, scope.status, scope.code, scope.message, scope.details ?? null);
  }

  const { page, pageSize } = parsePaging(req.query.page, req.query.pageSize ?? req.query.page_size);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let request = scope.serviceSupabase
    .from('properties_master')
    .select(MASTER_SELECT, { count: 'exact' })
    .eq('source_partner_id', scope.membership.partner_id)
    .order('updated_at', { ascending: false })
    .range(from, to);

  const status = req.query.status ? String(req.query.status) : null;
  if (status) {
    if (!STATUS_ENUM.has(status)) {
      return respondError(res, 400, 'INVALID_STATUS', 'status must be available/sold/off_market.');
    }
    request = request.eq('status', status);
  }

  const search = normalizeOptionalText(req.query.search, 100);
  if (search) {
    request = request.or(`source_property_ref.ilike.%${search}%,title_ja.ilike.%${search}%,title_zh.ilike.%${search}%,address_ja.ilike.%${search}%,address_zh.ilike.%${search}%`);
  }

  const { data, error, count } = await request;
  if (error) {
    const handled = handleModelError(error);
    return respondError(res, handled.status, handled.code, handled.message, handled.details ?? null);
  }

  return respondOk(
    res,
    (data ?? []).map((row) => toMasterDto(row)),
    200,
    {
      page,
      pageSize,
      page_size: pageSize,
      total: Number(count ?? 0),
      total_pages: Number(count ?? 0) === 0 ? 0 : Math.ceil(Number(count ?? 0) / pageSize),
      partner: {
        id: scope.membership.partner.id,
        display_name: scope.membership.partner.display_name,
        partner_slug: scope.membership.partner.partner_slug
      }
    }
  );
});

router.get('/:id', async (req, res) => {
  if (!isUuid(req.params.id)) {
    return respondError(res, 400, 'INVALID_PROPERTY_MASTER_ID', 'property master id must be a UUID.');
  }

  const scope = await resolvePartnerScope(req.auth);
  if (!scope.ok) {
    return respondError(res, scope.status, scope.code, scope.message, scope.details ?? null);
  }

  const property = await fetchPropertyMasterById(scope.serviceSupabase, scope.membership.partner_id, req.params.id);
  if (!property.ok) {
    return respondError(res, property.status, property.code, property.message, property.details ?? null);
  }

  const { data: bindings, error: bindingsError } = await scope.serviceSupabase
    .from('tenant_property_bindings')
    .select('id,organization_id,linked_property_id,visibility,tenant_status,source_status,effective_status,source_lock_reason,source_locked_at,created_at,updated_at')
    .eq('property_master_id', property.row.id)
    .order('created_at', { ascending: false });

  if (bindingsError) {
    const handled = handleModelError(bindingsError);
    return respondError(res, handled.status, handled.code, handled.message, handled.details ?? null);
  }

  const bindingSummary = {
    total_count: (bindings ?? []).length,
    available_count: (bindings ?? []).filter((row) => row.effective_status === 'available').length,
    sold_count: (bindings ?? []).filter((row) => row.effective_status === 'sold').length,
    off_market_count: (bindings ?? []).filter((row) => row.effective_status === 'off_market').length,
    hidden_count: (bindings ?? []).filter((row) => row.effective_status === 'hidden').length,
    archived_count: (bindings ?? []).filter((row) => row.effective_status === 'archived').length
  };

  return respondOk(res, {
    property: toMasterDto(property.row, bindingSummary),
    tenant_bindings: bindings ?? []
  });
});

router.patch('/:id', async (req, res) => {
  if (!isUuid(req.params.id)) {
    return respondError(res, 400, 'INVALID_PROPERTY_MASTER_ID', 'property master id must be a UUID.');
  }
  if (!isPlainObject(req.body)) {
    return respondError(res, 400, 'INVALID_BODY', 'Request body must be a JSON object.');
  }
  if ('status' in req.body) {
    return respondError(res, 400, 'STATUS_PATCH_NOT_ALLOWED', 'Use mark-sold or mark-off-market routes to change source status.');
  }

  const unknown = Object.keys(req.body).filter((key) => !EDITABLE_FIELDS.has(key));
  if (unknown.length > 0) {
    return respondError(res, 400, 'UNKNOWN_FIELDS', 'Request contains unsupported fields.', { fields: unknown });
  }

  const scope = await resolvePartnerScope(req.auth);
  if (!scope.ok) {
    return respondError(res, scope.status, scope.code, scope.message, scope.details ?? null);
  }

  const property = await fetchPropertyMasterById(scope.serviceSupabase, scope.membership.partner_id, req.params.id);
  if (!property.ok) {
    return respondError(res, property.status, property.code, property.message, property.details ?? null);
  }

  const updates = {};
  const textFields = ['source_property_ref', 'title_ja', 'title_zh', 'address_ja', 'address_zh', 'description_ja', 'description_zh', 'layout'];
  for (const field of textFields) {
    if (field in req.body) {
      const normalized = normalizeOptionalText(req.body[field], 5000);
      if (normalized === undefined) {
        return respondError(res, 400, 'INVALID_TEXT_FIELD', `${field} must be a string when provided.`);
      }
      updates[field] = normalized;
    }
  }

  if ('price' in req.body) {
    const price = req.body.price;
    if (price != null && (!Number.isFinite(Number(price)) || Number(price) < 0)) {
      return respondError(res, 400, 'INVALID_PRICE', 'price must be a non-negative number when provided.');
    }
    updates.price = price == null ? null : Number(price);
  }

  if ('area_sqm' in req.body) {
    const area = req.body.area_sqm;
    if (area != null && (!Number.isFinite(Number(area)) || Number(area) < 0)) {
      return respondError(res, 400, 'INVALID_AREA_SQM', 'area_sqm must be a non-negative number when provided.');
    }
    updates.area_sqm = area == null ? null : Number(area);
  }

  if ('currency' in req.body) {
    const currency = String(req.body.currency || '').trim().toUpperCase();
    if (currency !== 'JPY') {
      return respondError(res, 400, 'INVALID_CURRENCY', 'currency must be JPY for Japan partner properties.');
    }
    updates.currency = currency;
  }

  if ('image_urls' in req.body) {
    if (!Array.isArray(req.body.image_urls) || !req.body.image_urls.every((item) => typeof item === 'string')) {
      return respondError(res, 400, 'INVALID_IMAGE_URLS', 'image_urls must be a string array when provided.');
    }
    updates.image_urls = req.body.image_urls;
  }

  if ('canonical_payload_json' in req.body) {
    if (!isPlainObject(req.body.canonical_payload_json)) {
      return respondError(res, 400, 'INVALID_CANONICAL_PAYLOAD', 'canonical_payload_json must be a JSON object when provided.');
    }
    updates.canonical_payload_json = req.body.canonical_payload_json;
  }

  if ('raw_source_payload' in req.body) {
    if (req.body.raw_source_payload !== null && !isPlainObject(req.body.raw_source_payload)) {
      return respondError(res, 400, 'INVALID_RAW_SOURCE_PAYLOAD', 'raw_source_payload must be a JSON object when provided.');
    }
    updates.raw_source_payload = req.body.raw_source_payload;
  }

  if ('source_updated_at' in req.body) {
    const sourceUpdatedAt = parseIsoDateTime(req.body.source_updated_at);
    if (req.body.source_updated_at !== null && sourceUpdatedAt === undefined) {
      return respondError(res, 400, 'INVALID_SOURCE_UPDATED_AT', 'source_updated_at must be a valid ISO datetime string when provided.');
    }
    updates.source_updated_at = sourceUpdatedAt;
  }

  if (Object.keys(updates).length === 0) {
    return respondOk(res, toMasterDto(property.row));
  }

  const { data, error } = await scope.serviceSupabase
    .from('properties_master')
    .update(updates)
    .eq('id', property.row.id)
    .eq('source_partner_id', scope.membership.partner_id)
    .select(MASTER_SELECT)
    .maybeSingle();

  if (error) {
    const handled = handleModelError(error);
    return respondError(res, handled.status, handled.code, handled.message, handled.details ?? null);
  }

  return respondOk(res, toMasterDto(data));
});

async function markStatus(req, res, nextStatus) {
  if (!isUuid(req.params.id)) {
    return respondError(res, 400, 'INVALID_PROPERTY_MASTER_ID', 'property master id must be a UUID.');
  }

  const scope = await resolvePartnerScope(req.auth);
  if (!scope.ok) {
    return respondError(res, scope.status, scope.code, scope.message, scope.details ?? null);
  }

  const property = await fetchPropertyMasterById(scope.serviceSupabase, scope.membership.partner_id, req.params.id);
  if (!property.ok) {
    return respondError(res, property.status, property.code, property.message, property.details ?? null);
  }

  const { data, error } = await scope.serviceSupabase
    .from('properties_master')
    .update({
      status: nextStatus,
      source_updated_at: new Date().toISOString(),
      raw_source_payload: {
        ...(isPlainObject(property.row.raw_source_payload) ? property.row.raw_source_payload : {}),
        last_partner_status_action: nextStatus
      }
    })
    .eq('id', property.row.id)
    .eq('source_partner_id', scope.membership.partner_id)
    .select(MASTER_SELECT)
    .maybeSingle();

  if (error) {
    const handled = handleModelError(error);
    return respondError(res, handled.status, handled.code, handled.message, handled.details ?? null);
  }

  const { count, error: bindingCountError } = await scope.serviceSupabase
    .from('tenant_property_bindings')
    .select('id', { count: 'exact', head: true })
    .eq('property_master_id', property.row.id);

  if (bindingCountError) {
    const handled = handleModelError(bindingCountError);
    return respondError(res, handled.status, handled.code, handled.message, handled.details ?? null);
  }

  return respondOk(res, {
    property: toMasterDto(data),
    synced_binding_count: Number(count ?? 0)
  });
}

router.post('/:id/mark-sold', async (req, res) => {
  return markStatus(req, res, 'sold');
});

router.post('/:id/mark-off-market', async (req, res) => {
  return markStatus(req, res, 'off_market');
});

export default router;
