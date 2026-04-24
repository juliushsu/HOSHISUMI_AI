import { Router } from 'express';
import { respondError, respondOk } from '../lib/http.js';
import {
  applyDemoReadScope,
  applyDemoUpdateGuard,
  applyDemoWriteDefaults,
  isDemoSeedRow,
  scopedOrganizationId
} from '../services/demoScope.js';
import { applyPropertyMediaFallback, fetchIngestPreviewMediaByPropertyIds } from '../services/propertyMedia.js';

const ALLOWED_ROLES = new Set(['owner', 'super_admin', 'manager', 'store_manager', 'store_editor']);
const COUNTRY_ENUM = new Set(['tw', 'jp']);
const STATUS_ENUM = new Set(['available', 'negotiating', 'sold']);
const PURPOSE_ENUM = new Set(['sale', 'rental', 'management']);
const SOURCE_TYPE_ENUM = new Set([
  'manual',
  'import',
  'japan_line',
  'japan_api',
  'csv_import',
  'image_draft',
  'api_sync'
]);
const CURRENCY_ENUM = new Set(['JPY', 'TWD', 'USD']);
const CURRENT_STAGE_ENUM = new Set([
  'sale_active',
  'sold',
  'rental_listing',
  'rental_showing',
  'rental_negotiating',
  'rented',
  'under_management',
  'vacancy',
  'resale_ready'
]);

const EDITABLE_FIELDS = [
  'property_code',
  'title',
  'title_ja',
  'title_zh',
  'title_en',
  'description',
  'description_ja',
  'description_zh',
  'description_en',
  'country',
  'prefecture',
  'city',
  'district',
  'address_ja',
  'address_zh',
  'address_en',
  'purpose',
  'property_type',
  'price',
  'currency',
  'area_sqm',
  'layout',
  'building_age',
  'floor',
  'total_floors',
  'nearest_station',
  'walking_minutes',
  'management_fee',
  'status',
  'current_stage',
  'contact_store_id',
  'source_type',
  'source_ref',
  'import_batch_id',
  'cover_image_url',
  'floorplan_image_url',
  'gallery_urls',
  'raw_source_payload'
];

const PROPERTY_MASTER_SELECT = [
  'id',
  'organization_id',
  'demo_data_type',
  'property_code',
  'title',
  'title_ja',
  'title_zh',
  'title_en',
  'description',
  'description_ja',
  'description_zh',
  'description_en',
  'country',
  'prefecture',
  'city',
  'district',
  'address_ja',
  'address_zh',
  'address_en',
  'purpose',
  'property_type',
  'price',
  'currency',
  'area_sqm',
  'layout',
  'building_age',
  'floor',
  'total_floors',
  'nearest_station',
  'walking_minutes',
  'management_fee',
  'status',
  'current_stage',
  'contact_store_id',
  'contact_store:stores!properties_contact_store_id_fkey(id,name,slug)',
  'source_type',
  'source_ref',
  'import_batch_id',
  'cover_image_url',
  'floorplan_image_url',
  'gallery_urls',
  'raw_source_payload',
  'created_at',
  'updated_at'
].join(',');

const router = Router();

function isPlainObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeOptionalText(value, maxLen = 5000) {
  if (value == null) return null;
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > maxLen ? trimmed.slice(0, maxLen) : trimmed;
}

function unknownFields(body, editableFields) {
  return Object.keys(body).filter((key) => !editableFields.includes(key));
}

function parsePaging(rawPage, rawLimit) {
  const page = Number.parseInt(String(rawPage ?? '1'), 10);
  const limit = Number.parseInt(String(rawLimit ?? '20'), 10);
  const safePage = Number.isFinite(page) && page > 0 ? page : 1;
  const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.min(limit, 100) : 20;
  return { page: safePage, limit: safeLimit };
}

function deriveLegacySource(sourceType) {
  if (sourceType === 'api_sync' || sourceType === 'japan_api') return 'api';
  if (sourceType === 'csv_import' || sourceType === 'import' || sourceType === 'japan_line') return 'import';
  return 'manual';
}

function deriveCurrencyFromCountry(country) {
  return country === 'jp' ? 'JPY' : 'TWD';
}

function deriveServiceTypesFromPurpose(purpose) {
  if (purpose === 'rental') return ['rental'];
  if (purpose === 'management') return ['management'];
  return ['sale'];
}

function validateGalleryUrls(value) {
  if (!Array.isArray(value)) return false;
  return value.every((item) => typeof item === 'string');
}

function ensureRoleAllowed(role) {
  return ALLOWED_ROLES.has(String(role || '').toLowerCase());
}

function toPropertyMasterDto(row) {
  return {
    id: row.id,
    property_code: row.property_code ?? null,
    title: row.title,
    title_ja: row.title_ja ?? null,
    title_zh: row.title_zh ?? null,
    title_en: row.title_en ?? null,
    description: row.description ?? null,
    description_ja: row.description_ja ?? null,
    description_zh: row.description_zh ?? null,
    description_en: row.description_en ?? null,
    country: row.country,
    prefecture: row.prefecture ?? null,
    city: row.city ?? null,
    district: row.district ?? null,
    address_ja: row.address_ja ?? null,
    address_zh: row.address_zh ?? null,
    address_en: row.address_en ?? null,
    purpose: row.purpose,
    property_type: row.property_type ?? null,
    price: row.price,
    currency: row.currency,
    area_sqm: row.area_sqm ?? null,
    layout: row.layout ?? null,
    building_age: row.building_age ?? null,
    floor: row.floor ?? null,
    total_floors: row.total_floors ?? null,
    nearest_station: row.nearest_station ?? null,
    walking_minutes: row.walking_minutes ?? null,
    management_fee: row.management_fee ?? null,
    status: row.status,
    current_stage: row.current_stage ?? null,
    contact_store_id: row.contact_store_id ?? null,
    contact_store_name: row.contact_store?.name ?? null,
    source_type: row.source_type,
    source_ref: row.source_ref ?? null,
    import_batch_id: row.import_batch_id ?? null,
    cover_image_url: row.cover_image_url ?? null,
    floorplan_image_url: row.floorplan_image_url ?? null,
    gallery_urls: row.gallery_urls ?? [],
    primary_image_url: row.cover_image_url ?? (Array.isArray(row.gallery_urls) ? row.gallery_urls[0] ?? null : null),
    image_url: row.cover_image_url ?? (Array.isArray(row.gallery_urls) ? row.gallery_urls[0] ?? null : null),
    property_media: [],
    raw_source_payload: row.raw_source_payload ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

async function validateContactStoreInOrg(supabase, organizationId, contactStoreId) {
  if (!contactStoreId) return { ok: true };

  const { data, error } = await supabase
    .from('stores')
    .select('id,organization_id')
    .eq('id', contactStoreId)
    .maybeSingle();

  if (error) {
    return {
      ok: false,
      status: 500,
      code: 'CONTACT_STORE_LOOKUP_FAILED',
      message: 'Failed to validate contact_store_id.',
      details: { supabase_error: error.message }
    };
  }

  if (!data || data.organization_id !== organizationId) {
    return {
      ok: false,
      status: 400,
      code: 'INVALID_CONTACT_STORE',
      message: 'contact_store_id must belong to the same organization.'
    };
  }

  return { ok: true };
}

router.get('/', async (req, res) => {
  const { supabase, auth } = req;
  if (!ensureRoleAllowed(auth.role)) {
    return respondError(res, 403, 'ROLE_NOT_ALLOWED', 'Current role cannot access property master admin APIs.');
  }

  const { page, limit } = parsePaging(req.query.page, req.query.limit);
  const purpose = req.query.purpose ? String(req.query.purpose) : null;
  const status = req.query.status ? String(req.query.status) : null;
  const country = req.query.country ? String(req.query.country) : null;

  if (purpose && !PURPOSE_ENUM.has(purpose)) {
    return respondError(res, 400, 'INVALID_PURPOSE', 'purpose must be sale/rental/management.');
  }
  if (status && !STATUS_ENUM.has(status)) {
    return respondError(res, 400, 'INVALID_STATUS', 'status must be available/negotiating/sold.');
  }
  if (country && !COUNTRY_ENUM.has(country)) {
    return respondError(res, 400, 'INVALID_COUNTRY', 'country must be tw/jp.');
  }

  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let query = supabase
    .from('properties')
    .select(PROPERTY_MASTER_SELECT, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to);
  query = applyDemoReadScope(query, auth, 'organization_id');

  if (purpose) query = query.eq('purpose', purpose);
  if (status) query = query.eq('status', status);
  if (country) query = query.eq('country', country);

  const { data, error, count } = await query;
  if (error) {
    return respondError(res, 500, 'ADMIN_PROPERTIES_FETCH_FAILED', 'Failed to fetch property master list.', {
      supabase_error: error.message
    });
  }

  const total = Number(count ?? 0);
  try {
    const baseRows = (data ?? []).map(toPropertyMasterDto);
    const previewMediaByPropertyId = await fetchIngestPreviewMediaByPropertyIds(baseRows.map((row) => row.id));
    const rows = baseRows.map((row) => applyPropertyMediaFallback(row, previewMediaByPropertyId.get(row.id) ?? [], 'admin'));
    return respondOk(
      res,
      rows,
      200,
      {
        page,
        limit,
        total,
        total_pages: total === 0 ? 0 : Math.ceil(total / limit)
      }
    );
  } catch (mediaError) {
    return respondError(res, 500, 'ADMIN_PROPERTY_MEDIA_ENRICH_FAILED', 'Failed to build property media previews.', {
      message: mediaError instanceof Error ? mediaError.message : 'Unknown property media error.'
    });
  }
});

router.get('/:id', async (req, res) => {
  const { supabase, auth } = req;
  if (!ensureRoleAllowed(auth.role)) {
    return respondError(res, 403, 'ROLE_NOT_ALLOWED', 'Current role cannot access property master admin APIs.');
  }

  const id = req.params.id;
  let query = supabase
    .from('properties')
    .select(PROPERTY_MASTER_SELECT)
    .eq('id', id);
  query = applyDemoReadScope(query, auth, 'organization_id');
  const { data, error } = await query.maybeSingle();

  if (error) {
    return respondError(res, 500, 'ADMIN_PROPERTY_FETCH_FAILED', 'Failed to fetch property master detail.', {
      supabase_error: error.message
    });
  }

  if (!data) return respondError(res, 404, 'ADMIN_PROPERTY_NOT_FOUND', 'Property not found.');

  try {
    const baseRow = toPropertyMasterDto(data);
    const previewMediaByPropertyId = await fetchIngestPreviewMediaByPropertyIds([baseRow.id]);
    return respondOk(res, applyPropertyMediaFallback(baseRow, previewMediaByPropertyId.get(baseRow.id) ?? [], 'admin'));
  } catch (mediaError) {
    return respondError(res, 500, 'ADMIN_PROPERTY_MEDIA_ENRICH_FAILED', 'Failed to build property media previews.', {
      message: mediaError instanceof Error ? mediaError.message : 'Unknown property media error.'
    });
  }
});

router.post('/', async (req, res) => {
  const { supabase, auth } = req;
  const targetOrganizationId = scopedOrganizationId(auth);
  if (!ensureRoleAllowed(auth.role)) {
    return respondError(res, 403, 'ROLE_NOT_ALLOWED', 'Current role cannot access property master admin APIs.');
  }

  const body = req.body;
  if (!isPlainObject(body)) {
    return respondError(res, 400, 'INVALID_BODY', 'Request body must be a JSON object.');
  }

  const extra = unknownFields(body, EDITABLE_FIELDS);
  if (extra.length > 0) {
    return respondError(res, 400, 'UNSUPPORTED_FIELDS', 'Request includes unsupported property fields.', {
      unsupported_fields: extra,
      editable_fields: EDITABLE_FIELDS
    });
  }

  const title = normalizeOptionalText(body.title, 255);
  const titleJa = normalizeOptionalText(body.title_ja, 255);
  const titleZh = normalizeOptionalText(body.title_zh, 255);
  const titleEn = normalizeOptionalText(body.title_en, 255);
  const canonicalTitle = title ?? titleZh ?? titleJa ?? titleEn;
  if (!canonicalTitle) {
    return respondError(res, 400, 'INVALID_TITLE', 'title or at least one localized title is required.');
  }

  const country = String(body.country ?? '');
  if (!COUNTRY_ENUM.has(country)) {
    return respondError(res, 400, 'INVALID_COUNTRY', 'country must be tw/jp.');
  }

  const status = body.status === undefined ? 'available' : String(body.status);
  if (!STATUS_ENUM.has(status)) {
    return respondError(res, 400, 'INVALID_STATUS', 'status must be available/negotiating/sold.');
  }

  const purpose = body.purpose === undefined ? 'sale' : String(body.purpose);
  if (!PURPOSE_ENUM.has(purpose)) {
    return respondError(res, 400, 'INVALID_PURPOSE', 'purpose must be sale/rental/management.');
  }

  if (typeof body.price !== 'number' || Number.isNaN(body.price) || body.price < 0) {
    return respondError(res, 400, 'INVALID_PRICE', 'price is required and must be a non-negative number.');
  }

  const sourceType = body.source_type === undefined ? 'manual' : String(body.source_type);
  if (!SOURCE_TYPE_ENUM.has(sourceType)) {
    return respondError(
      res,
      400,
      'INVALID_SOURCE_TYPE',
      'source_type must be manual/import/japan_line/japan_api/csv_import/image_draft/api_sync.'
    );
  }

  const currency = body.currency === undefined ? deriveCurrencyFromCountry(country) : String(body.currency);
  if (!CURRENCY_ENUM.has(currency)) {
    return respondError(res, 400, 'INVALID_CURRENCY', 'currency must be JPY/TWD/USD.');
  }

  if (body.current_stage !== undefined && body.current_stage !== null && !CURRENT_STAGE_ENUM.has(String(body.current_stage))) {
    return respondError(
      res,
      400,
      'INVALID_CURRENT_STAGE',
      'current_stage must be sale_active/sold/rental_listing/rental_showing/rental_negotiating/rented/under_management/vacancy/resale_ready.'
    );
  }

  const numericFieldChecks = [
    ['area_sqm', false],
    ['building_age', true],
    ['floor', true],
    ['total_floors', true],
    ['walking_minutes', true],
    ['management_fee', false]
  ];
  for (const [field, intOnly] of numericFieldChecks) {
    if (body[field] !== undefined && body[field] !== null) {
      if (typeof body[field] !== 'number' || Number.isNaN(body[field])) {
        return respondError(res, 400, 'INVALID_NUMERIC_FIELD', `${field} must be a number when provided.`);
      }
      if (body[field] < 0 && field !== 'floor') {
        return respondError(res, 400, 'INVALID_NUMERIC_FIELD', `${field} must be >= 0 when provided.`);
      }
      if (intOnly && !Number.isInteger(body[field])) {
        return respondError(res, 400, 'INVALID_NUMERIC_FIELD', `${field} must be an integer when provided.`);
      }
    }
  }

  if (body.gallery_urls !== undefined && !validateGalleryUrls(body.gallery_urls)) {
    return respondError(res, 400, 'INVALID_GALLERY_URLS', 'gallery_urls must be an array of URL strings.');
  }

  if (
    body.raw_source_payload !== undefined &&
    body.raw_source_payload !== null &&
    typeof body.raw_source_payload !== 'object'
  ) {
    return respondError(
      res,
      400,
      'INVALID_RAW_SOURCE_PAYLOAD',
      'raw_source_payload must be an object/array or null when provided.'
    );
  }

  if (body.contact_store_id !== undefined && body.contact_store_id !== null && typeof body.contact_store_id !== 'string') {
    return respondError(res, 400, 'INVALID_CONTACT_STORE', 'contact_store_id must be a UUID string when provided.');
  }

  const contactStoreCheck = await validateContactStoreInOrg(
    supabase,
    targetOrganizationId,
    body.contact_store_id ?? null
  );
  if (!contactStoreCheck.ok) {
    return respondError(
      res,
      contactStoreCheck.status,
      contactStoreCheck.code,
      contactStoreCheck.message,
      contactStoreCheck.details ?? null
    );
  }

  const insertPayload = applyDemoWriteDefaults({
    property_code: normalizeOptionalText(body.property_code, 100),
    title: canonicalTitle,
    title_ja: titleJa,
    title_zh: titleZh,
    title_en: titleEn,
    description: normalizeOptionalText(body.description, 10000) ?? normalizeOptionalText(body.description_zh, 10000),
    description_ja: normalizeOptionalText(body.description_ja, 10000),
    description_zh: normalizeOptionalText(body.description_zh, 10000),
    description_en: normalizeOptionalText(body.description_en, 10000),
    country,
    prefecture: normalizeOptionalText(body.prefecture, 120),
    city: normalizeOptionalText(body.city, 120),
    district: normalizeOptionalText(body.district, 120),
    address_ja: normalizeOptionalText(body.address_ja, 500),
    address_zh: normalizeOptionalText(body.address_zh, 500),
    address_en: normalizeOptionalText(body.address_en, 500),
    purpose,
    property_type: normalizeOptionalText(body.property_type, 120),
    price: body.price,
    currency,
    area_sqm: body.area_sqm ?? null,
    layout: normalizeOptionalText(body.layout, 120),
    building_age: body.building_age ?? null,
    floor: body.floor ?? null,
    total_floors: body.total_floors ?? null,
    nearest_station: normalizeOptionalText(body.nearest_station, 255),
    walking_minutes: body.walking_minutes ?? null,
    management_fee: body.management_fee ?? null,
    status,
    current_stage: body.current_stage ?? null,
    contact_store_id: body.contact_store_id ?? null,
    source_type: sourceType,
    source: deriveLegacySource(sourceType),
    source_ref: normalizeOptionalText(body.source_ref, 255),
    import_batch_id: normalizeOptionalText(body.import_batch_id, 120),
    cover_image_url: normalizeOptionalText(body.cover_image_url, 1000),
    floorplan_image_url: normalizeOptionalText(body.floorplan_image_url, 1000),
    gallery_urls: body.gallery_urls ?? [],
    raw_source_payload: body.raw_source_payload ?? null,
    service_types: deriveServiceTypesFromPurpose(purpose),
    is_rental_enabled: purpose === 'rental',
    is_management_enabled: purpose === 'management'
  }, auth, 'organization_id');

  const { data, error } = await supabase
    .from('properties')
    .insert(insertPayload)
    .select(PROPERTY_MASTER_SELECT)
    .single();

  if (error) {
    return respondError(res, 400, 'ADMIN_PROPERTY_CREATE_FAILED', 'Failed to create property master record.', {
      supabase_error: error.message
    });
  }

  return respondOk(res, toPropertyMasterDto(data), 201);
});

router.patch('/:id', async (req, res) => {
  const { supabase, auth } = req;
  const targetOrganizationId = scopedOrganizationId(auth);
  if (!ensureRoleAllowed(auth.role)) {
    return respondError(res, 403, 'ROLE_NOT_ALLOWED', 'Current role cannot access property master admin APIs.');
  }

  const body = req.body;
  if (!isPlainObject(body)) {
    return respondError(res, 400, 'INVALID_BODY', 'Request body must be a JSON object.');
  }

  const extra = unknownFields(body, EDITABLE_FIELDS);
  if (extra.length > 0) {
    return respondError(res, 400, 'UNSUPPORTED_FIELDS', 'Request includes unsupported property fields.', {
      unsupported_fields: extra,
      editable_fields: EDITABLE_FIELDS
    });
  }

  if (Object.keys(body).length === 0) {
    return respondError(res, 400, 'EMPTY_PATCH_BODY', 'At least one editable field is required.');
  }

  const propertyId = req.params.id;
  let existingQuery = supabase
    .from('properties')
    .select('id,organization_id,country,purpose,demo_data_type')
    .eq('id', propertyId);
  existingQuery = applyDemoReadScope(existingQuery, auth, 'organization_id');
  const { data: existing, error: existingError } = await existingQuery.maybeSingle();

  if (existingError) {
    return respondError(res, 500, 'ADMIN_PROPERTY_LOOKUP_FAILED', 'Failed to verify property.', {
      supabase_error: existingError.message
    });
  }
  if (!existing) return respondError(res, 404, 'ADMIN_PROPERTY_NOT_FOUND', 'Property not found.');
  if (isDemoSeedRow(existing, auth)) {
    return respondError(res, 403, 'DEMO_SEED_IMMUTABLE', 'Demo seed data cannot be modified.');
  }

  const updates = {};

  const textFields = [
    'property_code',
    'title',
    'title_ja',
    'title_zh',
    'title_en',
    'description',
    'description_ja',
    'description_zh',
    'description_en',
    'prefecture',
    'city',
    'district',
    'address_ja',
    'address_zh',
    'address_en',
    'property_type',
    'layout',
    'nearest_station',
    'source_ref',
    'import_batch_id',
    'cover_image_url',
    'floorplan_image_url'
  ];

  for (const field of textFields) {
    if (body[field] !== undefined) {
      const normalized = normalizeOptionalText(body[field], 10000);
      if (normalized === undefined) {
        return respondError(res, 400, 'INVALID_TEXT_FIELD', `${field} must be a string or null.`);
      }
      updates[field] = normalized;
    }
  }

  if (body.country !== undefined) {
    if (!COUNTRY_ENUM.has(String(body.country))) {
      return respondError(res, 400, 'INVALID_COUNTRY', 'country must be tw/jp.');
    }
    updates.country = String(body.country);
  }

  if (body.purpose !== undefined) {
    if (!PURPOSE_ENUM.has(String(body.purpose))) {
      return respondError(res, 400, 'INVALID_PURPOSE', 'purpose must be sale/rental/management.');
    }
    updates.purpose = String(body.purpose);
    updates.service_types = deriveServiceTypesFromPurpose(String(body.purpose));
    updates.is_rental_enabled = String(body.purpose) === 'rental';
    updates.is_management_enabled = String(body.purpose) === 'management';
  }

  if (body.status !== undefined) {
    if (!STATUS_ENUM.has(String(body.status))) {
      return respondError(res, 400, 'INVALID_STATUS', 'status must be available/negotiating/sold.');
    }
    updates.status = String(body.status);
  }

  if (body.currency !== undefined) {
    if (!CURRENCY_ENUM.has(String(body.currency))) {
      return respondError(res, 400, 'INVALID_CURRENCY', 'currency must be JPY/TWD/USD.');
    }
    updates.currency = String(body.currency);
  } else if (body.country !== undefined) {
    updates.currency = deriveCurrencyFromCountry(String(body.country));
  }

  if (body.source_type !== undefined) {
    if (!SOURCE_TYPE_ENUM.has(String(body.source_type))) {
      return respondError(
        res,
        400,
        'INVALID_SOURCE_TYPE',
        'source_type must be manual/import/japan_line/japan_api/csv_import/image_draft/api_sync.'
      );
    }
    updates.source_type = String(body.source_type);
    updates.source = deriveLegacySource(String(body.source_type));
  }

  if (body.current_stage !== undefined) {
    if (body.current_stage !== null && !CURRENT_STAGE_ENUM.has(String(body.current_stage))) {
      return respondError(
        res,
        400,
        'INVALID_CURRENT_STAGE',
        'current_stage must be sale_active/sold/rental_listing/rental_showing/rental_negotiating/rented/under_management/vacancy/resale_ready.'
      );
    }
    updates.current_stage = body.current_stage;
  }

  const numericFields = ['price', 'area_sqm', 'building_age', 'floor', 'total_floors', 'walking_minutes', 'management_fee'];
  for (const field of numericFields) {
    if (body[field] !== undefined) {
      if (body[field] !== null && (typeof body[field] !== 'number' || Number.isNaN(body[field]))) {
        return respondError(res, 400, 'INVALID_NUMERIC_FIELD', `${field} must be a number or null.`);
      }
      if (body[field] !== null && body[field] < 0 && field !== 'floor') {
        return respondError(res, 400, 'INVALID_NUMERIC_FIELD', `${field} must be >= 0.`);
      }
      if (
        body[field] !== null &&
        ['building_age', 'floor', 'total_floors', 'walking_minutes'].includes(field) &&
        !Number.isInteger(body[field])
      ) {
        return respondError(res, 400, 'INVALID_NUMERIC_FIELD', `${field} must be an integer.`);
      }
      updates[field] = body[field];
    }
  }

  if (body.gallery_urls !== undefined) {
    if (!validateGalleryUrls(body.gallery_urls)) {
      return respondError(res, 400, 'INVALID_GALLERY_URLS', 'gallery_urls must be an array of URL strings.');
    }
    updates.gallery_urls = body.gallery_urls;
  }

  if (body.raw_source_payload !== undefined) {
    if (body.raw_source_payload !== null && typeof body.raw_source_payload !== 'object') {
      return respondError(
        res,
        400,
        'INVALID_RAW_SOURCE_PAYLOAD',
        'raw_source_payload must be an object/array or null when provided.'
      );
    }
    updates.raw_source_payload = body.raw_source_payload;
  }

  if (body.contact_store_id !== undefined) {
    if (body.contact_store_id !== null && typeof body.contact_store_id !== 'string') {
      return respondError(res, 400, 'INVALID_CONTACT_STORE', 'contact_store_id must be a UUID string or null.');
    }

    const contactStoreCheck = await validateContactStoreInOrg(
      supabase,
      targetOrganizationId,
      body.contact_store_id ?? null
    );
    if (!contactStoreCheck.ok) {
      return respondError(
        res,
        contactStoreCheck.status,
        contactStoreCheck.code,
        contactStoreCheck.message,
        contactStoreCheck.details ?? null
      );
    }
    updates.contact_store_id = body.contact_store_id ?? null;
  }

  const nextTitle =
    updates.title ??
    updates.title_zh ??
    updates.title_ja ??
    updates.title_en;
  if (nextTitle !== undefined && !nextTitle) {
    return respondError(res, 400, 'INVALID_TITLE', 'title cannot be empty.');
  }

  let query = supabase
    .from('properties')
    .update(updates)
    .eq('id', propertyId)
    .select(PROPERTY_MASTER_SELECT)
    .single();
  query = applyDemoReadScope(query, auth, 'organization_id');
  query = applyDemoUpdateGuard(query, auth);

  const { data, error } = await query;
  if (error) {
    return respondError(res, 400, 'ADMIN_PROPERTY_UPDATE_FAILED', 'Failed to update property master record.', {
      supabase_error: error.message
    });
  }

  return respondOk(res, toPropertyMasterDto(data));
});

export default router;
