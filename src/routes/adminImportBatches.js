import { Router } from 'express';
import { respondError, respondOk } from '../lib/http.js';
import { applyDemoReadScope, applyDemoWriteDefaults, scopedOrganizationId } from '../services/demoScope.js';

const OWNER_SCOPE_ROLES = new Set(['owner', 'super_admin']);
const STORE_SCOPE_ROLES = new Set(['manager', 'store_manager', 'store_editor']);
const ALLOWED_ROLES = new Set(['owner', 'super_admin', 'manager', 'store_manager', 'store_editor']);

const SOURCE_TYPE_ENUM = new Set(['manual', 'csv_import', 'image_draft', 'api_sync']);
const IMPORT_TYPE_ENUM = new Set(['japan_csv', 'japan_xlsx']);
const IMPORT_BATCH_STATUS_ENUM = new Set(['uploaded', 'validating', 'validated', 'imported', 'failed']);
const IMPORT_ROW_STATUS_ENUM = new Set(['valid', 'invalid', 'imported']);
const PURPOSE_ENUM = new Set(['sale', 'rental', 'management']);
const CURRENCY_ENUM = new Set(['JPY', 'TWD', 'USD']);
const COUNTRY_ENUM = new Set(['tw', 'jp']);

const POST_EDITABLE_FIELDS = [
  'source_type',
  'import_type',
  'original_filename',
  'file_url',
  'store_id',
  'rows'
];

const IMPORT_BATCH_SELECT = [
  'id',
  'organization_id',
  'store_id',
  'source_type',
  'import_type',
  'original_filename',
  'file_url',
  'status',
  'total_rows',
  'valid_rows',
  'invalid_rows',
  'created_drafts_count',
  'error_summary',
  'started_at',
  'finished_at',
  'created_by',
  'created_at',
  'updated_at',
  'store:stores!import_batches_store_id_fkey(id,name,slug)',
  'creator:agents!import_batches_created_by_fkey(id,name)'
].join(',');

const IMPORT_ROW_SELECT = [
  'id',
  'import_batch_id',
  'row_number',
  'property_code',
  'raw_row_payload',
  'normalized_payload',
  'validation_errors',
  'status',
  'created_property_id',
  'created_at',
  'created_property:properties!property_import_rows_created_property_id_fkey(id,title,purpose,intake_status)'
].join(',');

const MAX_IMPORT_ROWS = 1000;

const router = Router();

function parsePaging(rawPage, rawLimit, defaultLimit = 20, maxLimit = 200) {
  const page = Number.parseInt(String(rawPage ?? '1'), 10);
  const limit = Number.parseInt(String(rawLimit ?? String(defaultLimit)), 10);
  const safePage = Number.isFinite(page) && page > 0 ? page : 1;
  const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.min(limit, maxLimit) : defaultLimit;
  return { page: safePage, limit: safeLimit };
}

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

function normalizeStringArray(value) {
  if (value == null) return [];

  if (Array.isArray(value)) {
    const normalized = value
      .filter((item) => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean);
    return normalized;
  }

  if (typeof value === 'string') {
    return value
      .split(/\r?\n|,/g)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return null;
}

function parseOptionalNumber(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value === 'string') {
    const normalized = value.replace(/,/g, '').trim();
    if (!normalized) return null;
    const parsed = Number.parseFloat(normalized);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function parseOptionalInteger(value) {
  const parsed = parseOptionalNumber(value);
  if (parsed == null) return parsed;
  if (!Number.isInteger(parsed)) return undefined;
  return parsed;
}

function unknownFields(body, editableFields) {
  return Object.keys(body).filter((key) => !editableFields.includes(key));
}

function deriveLegacySourceFromSourceType(sourceType) {
  if (sourceType === 'api_sync') return 'api';
  if (sourceType === 'csv_import') return 'import';
  return 'manual';
}

function deriveServiceTypesFromPurpose(purpose) {
  if (purpose === 'rental') return ['rental'];
  if (purpose === 'management') return ['management'];
  return ['sale'];
}

function deriveCurrentStageFromPurpose(purpose) {
  if (purpose === 'rental') return 'rental_listing';
  if (purpose === 'management') return 'under_management';
  return 'sale_active';
}

function ensureRoleAllowed(role) {
  return ALLOWED_ROLES.has(String(role || '').toLowerCase());
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
      message: 'Failed to resolve store scope.',
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

async function resolveImportScope({ supabase, auth, requestedStoreId }) {
  const { data: actor, error } = await supabase
    .from('agents')
    .select('id,organization_id,role,store_id,is_active')
    .eq('id', auth.agentId)
    .maybeSingle();

  if (error) {
    return {
      ok: false,
      status: 500,
      code: 'IMPORT_SCOPE_LOOKUP_FAILED',
      message: 'Failed to resolve import scope.',
      details: { supabase_error: error.message }
    };
  }

  if (!actor || !actor.is_active || actor.organization_id !== auth.organizationId) {
    return {
      ok: false,
      status: 403,
      code: 'ACTOR_NOT_ALLOWED',
      message: 'Current actor cannot access import batch APIs.'
    };
  }

  const role = String(actor.role || '').toLowerCase();
  const normalizedRequestedStoreId = typeof requestedStoreId === 'string' && requestedStoreId.trim() !== ''
    ? requestedStoreId.trim()
    : null;

  if (OWNER_SCOPE_ROLES.has(role)) {
    if (normalizedRequestedStoreId) {
      const check = await fetchStoreByIdInOrg(supabase, auth.organizationId, normalizedRequestedStoreId);
      if (!check.ok) return check;
      return {
        ok: true,
        mode: 'cross_store_owner',
        store_id: check.store.id,
        store: check.store
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
        message: 'Current role requires a bound store_id for import batches.'
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

    const check = await fetchStoreByIdInOrg(supabase, auth.organizationId, actor.store_id);
    if (!check.ok) return check;
    return {
      ok: true,
      mode: 'store_scoped',
      store_id: check.store.id,
      store: check.store
    };
  }

  return {
    ok: false,
    status: 403,
    code: 'ROLE_NOT_ALLOWED',
    message: 'Current role cannot access import batch APIs.'
  };
}

function toImportBatchDto(row) {
  return {
    id: row.id,
    organization_id: row.organization_id,
    store_id: row.store_id ?? null,
    store_name: row.store?.name ?? null,
    store_slug: row.store?.slug ?? null,
    source_type: row.source_type,
    import_type: row.import_type,
    original_filename: row.original_filename,
    file_url: row.file_url ?? null,
    status: row.status,
    total_rows: row.total_rows,
    valid_rows: row.valid_rows,
    invalid_rows: row.invalid_rows,
    created_drafts_count: row.created_drafts_count,
    error_summary: row.error_summary ?? null,
    started_at: row.started_at,
    finished_at: row.finished_at ?? null,
    created_by: row.created_by ?? null,
    created_by_name: row.creator?.name ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

function toImportRowDto(row) {
  return {
    id: row.id,
    import_batch_id: row.import_batch_id,
    row_number: row.row_number,
    property_code: row.property_code ?? null,
    raw_row_payload: row.raw_row_payload,
    normalized_payload: row.normalized_payload ?? null,
    validation_errors: row.validation_errors ?? [],
    status: row.status,
    created_property_id: row.created_property_id ?? null,
    created_property_title: row.created_property?.title ?? null,
    created_property_purpose: row.created_property?.purpose ?? null,
    created_property_intake_status: row.created_property?.intake_status ?? null,
    created_at: row.created_at
  };
}

function addValidationError(target, code, message, field = null) {
  target.push({ code, message, field });
}

function pickFirst(row, keys) {
  for (const key of keys) {
    if (row[key] !== undefined) return row[key];
  }
  return undefined;
}

function normalizeImportRow(rawRow) {
  if (!isPlainObject(rawRow)) {
    return {
      normalized: null,
      errors: [{ code: 'INVALID_ROW', message: 'Each row must be a JSON object.', field: null }]
    };
  }

  const errors = [];

  const propertyCode = normalizeOptionalText(pickFirst(rawRow, ['property_code']), 120);
  const title = normalizeOptionalText(pickFirst(rawRow, ['title']), 255);
  const titleJa = normalizeOptionalText(pickFirst(rawRow, ['title_ja']), 255);
  const titleZh = normalizeOptionalText(pickFirst(rawRow, ['title_zh']), 255);
  const titleEn = normalizeOptionalText(pickFirst(rawRow, ['title_en']), 255);

  const description = normalizeOptionalText(pickFirst(rawRow, ['description']), 10000);
  const descriptionJa = normalizeOptionalText(pickFirst(rawRow, ['description_ja']), 10000);
  const descriptionZh = normalizeOptionalText(pickFirst(rawRow, ['description_zh']), 10000);
  const descriptionEn = normalizeOptionalText(pickFirst(rawRow, ['description_en']), 10000);

  const countryRaw = normalizeOptionalText(pickFirst(rawRow, ['country']), 16);
  const purposeRaw = normalizeOptionalText(pickFirst(rawRow, ['purpose']), 32);
  const currencyRaw = normalizeOptionalText(pickFirst(rawRow, ['currency']), 8);

  const country = countryRaw ? countryRaw.toLowerCase() : null;
  const purpose = purposeRaw ? purposeRaw.toLowerCase() : null;
  const currency = currencyRaw ? currencyRaw.toUpperCase() : null;

  const prefecture = normalizeOptionalText(pickFirst(rawRow, ['prefecture']), 120);
  const city = normalizeOptionalText(pickFirst(rawRow, ['city']), 120);
  const district = normalizeOptionalText(pickFirst(rawRow, ['district']), 120);
  const addressJa = normalizeOptionalText(pickFirst(rawRow, ['address_ja']), 500);
  const addressZh = normalizeOptionalText(pickFirst(rawRow, ['address_zh']), 500);
  const addressEn = normalizeOptionalText(pickFirst(rawRow, ['address_en']), 500);

  const propertyType = normalizeOptionalText(pickFirst(rawRow, ['property_type']), 120);
  const layout = normalizeOptionalText(pickFirst(rawRow, ['layout']), 120);
  const nearestStation = normalizeOptionalText(pickFirst(rawRow, ['nearest_station']), 255);
  const coverImageUrl = normalizeOptionalText(pickFirst(rawRow, ['cover_image_url']), 1000);
  const floorplanImageUrl = normalizeOptionalText(pickFirst(rawRow, ['floorplan_image_url']), 1000);

  const price = parseOptionalNumber(pickFirst(rawRow, ['price']));
  const areaSqm = parseOptionalNumber(pickFirst(rawRow, ['area_sqm']));
  const buildingAge = parseOptionalInteger(pickFirst(rawRow, ['building_age']));
  const floor = parseOptionalInteger(pickFirst(rawRow, ['floor']));
  const totalFloors = parseOptionalInteger(pickFirst(rawRow, ['total_floors']));
  const walkingMinutes = parseOptionalInteger(pickFirst(rawRow, ['walking_minutes']));
  const managementFee = parseOptionalNumber(pickFirst(rawRow, ['management_fee']));

  const galleryUrls = normalizeStringArray(pickFirst(rawRow, ['gallery_urls']));

  const canonicalTitle = title ?? titleZh ?? titleJa ?? titleEn;
  if (!propertyCode) {
    addValidationError(errors, 'MISSING_PROPERTY_CODE', 'property_code is required.', 'property_code');
  }
  if (!canonicalTitle) {
    addValidationError(
      errors,
      'MISSING_TITLE',
      'title or one localized title (title_ja/title_zh/title_en) is required.',
      'title'
    );
  }
  if (!country) {
    addValidationError(errors, 'MISSING_COUNTRY', 'country is required.', 'country');
  } else if (!COUNTRY_ENUM.has(country)) {
    addValidationError(errors, 'INVALID_COUNTRY', 'country must be tw/jp.', 'country');
  }

  if (!purpose) {
    addValidationError(errors, 'MISSING_PURPOSE', 'purpose is required.', 'purpose');
  } else if (!PURPOSE_ENUM.has(purpose)) {
    addValidationError(errors, 'INVALID_PURPOSE', 'purpose must be sale/rental/management.', 'purpose');
  }

  if (!currency) {
    addValidationError(errors, 'MISSING_CURRENCY', 'currency is required.', 'currency');
  } else if (!CURRENCY_ENUM.has(currency)) {
    addValidationError(errors, 'INVALID_CURRENCY', 'currency must be JPY/TWD/USD.', 'currency');
  }

  if (price == null) {
    addValidationError(errors, 'MISSING_PRICE', 'price is required.', 'price');
  } else if (price < 0) {
    addValidationError(errors, 'INVALID_PRICE', 'price must be a non-negative number.', 'price');
  }

  if (areaSqm === undefined) {
    addValidationError(errors, 'INVALID_AREA_SQM', 'area_sqm must be a number when provided.', 'area_sqm');
  } else if (areaSqm != null && areaSqm < 0) {
    addValidationError(errors, 'INVALID_AREA_SQM', 'area_sqm must be >= 0.', 'area_sqm');
  }

  if (buildingAge === undefined) {
    addValidationError(errors, 'INVALID_BUILDING_AGE', 'building_age must be an integer when provided.', 'building_age');
  } else if (buildingAge != null && buildingAge < 0) {
    addValidationError(errors, 'INVALID_BUILDING_AGE', 'building_age must be >= 0.', 'building_age');
  }

  if (floor === undefined) {
    addValidationError(errors, 'INVALID_FLOOR', 'floor must be an integer when provided.', 'floor');
  }
  if (totalFloors === undefined) {
    addValidationError(
      errors,
      'INVALID_TOTAL_FLOORS',
      'total_floors must be an integer when provided.',
      'total_floors'
    );
  } else if (totalFloors != null && totalFloors < 0) {
    addValidationError(errors, 'INVALID_TOTAL_FLOORS', 'total_floors must be >= 0.', 'total_floors');
  }

  if (walkingMinutes === undefined) {
    addValidationError(
      errors,
      'INVALID_WALKING_MINUTES',
      'walking_minutes must be an integer when provided.',
      'walking_minutes'
    );
  } else if (walkingMinutes != null && walkingMinutes < 0) {
    addValidationError(errors, 'INVALID_WALKING_MINUTES', 'walking_minutes must be >= 0.', 'walking_minutes');
  }

  if (managementFee === undefined) {
    addValidationError(
      errors,
      'INVALID_MANAGEMENT_FEE',
      'management_fee must be a number when provided.',
      'management_fee'
    );
  } else if (managementFee != null && managementFee < 0) {
    addValidationError(errors, 'INVALID_MANAGEMENT_FEE', 'management_fee must be >= 0.', 'management_fee');
  }

  if (galleryUrls == null) {
    addValidationError(
      errors,
      'INVALID_GALLERY_URLS',
      'gallery_urls must be an array of strings or comma/newline separated string.',
      'gallery_urls'
    );
  }

  const hasAddress = Boolean(addressJa || addressZh || addressEn || (city && district));
  if (!hasAddress) {
    addValidationError(
      errors,
      'INCOMPLETE_ADDRESS',
      'address completeness requires address_ja/address_zh/address_en or city + district.',
      'address'
    );
  }

  return {
    normalized: {
      property_code: propertyCode,
      title: canonicalTitle,
      title_ja: titleJa,
      title_zh: titleZh,
      title_en: titleEn,
      description: description ?? descriptionZh ?? descriptionJa ?? descriptionEn,
      description_ja: descriptionJa,
      description_zh: descriptionZh,
      description_en: descriptionEn,
      country,
      prefecture,
      city,
      district,
      address_ja: addressJa,
      address_zh: addressZh,
      address_en: addressEn,
      purpose,
      property_type: propertyType,
      price,
      currency,
      area_sqm: areaSqm,
      layout,
      building_age: buildingAge,
      floor,
      total_floors: totalFloors,
      nearest_station: nearestStation,
      walking_minutes: walkingMinutes,
      management_fee: managementFee,
      cover_image_url: coverImageUrl,
      floorplan_image_url: floorplanImageUrl,
      gallery_urls: galleryUrls ?? [],
      raw_source_payload: rawRow
    },
    errors
  };
}

function summarizeValidationErrors(rows) {
  const codeCounts = new Map();
  let validationErrorRows = 0;
  let draftCreateErrorRows = 0;

  for (const row of rows) {
    if (!Array.isArray(row.validation_errors) || row.validation_errors.length === 0) continue;

    const hasDraftError = row.validation_errors.some((err) => err?.code === 'DRAFT_CREATE_FAILED');
    if (hasDraftError) {
      draftCreateErrorRows += 1;
    } else {
      validationErrorRows += 1;
    }

    for (const err of row.validation_errors) {
      const code = typeof err?.code === 'string' ? err.code : 'UNKNOWN';
      codeCounts.set(code, (codeCounts.get(code) ?? 0) + 1);
    }
  }

  return {
    validation_error_rows: validationErrorRows,
    draft_create_error_rows: draftCreateErrorRows,
    top_errors: Array.from(codeCounts.entries())
      .map(([code, count]) => ({ code, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
  };
}

async function fetchBatchWithScopeCheck(supabase, organizationId, scopeStoreId, batchId) {
  let query = supabase
    .from('import_batches')
    .select(IMPORT_BATCH_SELECT)
    .eq('organization_id', organizationId)
    .eq('id', batchId);

  if (scopeStoreId) query = query.eq('store_id', scopeStoreId);
  return query.maybeSingle();
}

router.get('/', async (req, res) => {
  const { supabase, auth } = req;
  const organizationId = scopedOrganizationId(auth);
  if (!ensureRoleAllowed(auth.role)) {
    return respondError(res, 403, 'ROLE_NOT_ALLOWED', 'Current role cannot access import batch admin APIs.');
  }

  const scope = await resolveImportScope({
    supabase,
    auth,
    requestedStoreId: req.query.store_id
  });
  if (!scope.ok) return respondError(res, scope.status, scope.code, scope.message, scope.details ?? null);

  const { page, limit } = parsePaging(req.query.page, req.query.limit);
  const status = req.query.status ? String(req.query.status) : null;
  const importType = req.query.import_type ? String(req.query.import_type) : null;
  const sourceType = req.query.source_type ? String(req.query.source_type) : null;

  if (status && !IMPORT_BATCH_STATUS_ENUM.has(status)) {
    return respondError(
      res,
      400,
      'INVALID_BATCH_STATUS',
      'status must be uploaded/validating/validated/imported/failed.'
    );
  }
  if (importType && !IMPORT_TYPE_ENUM.has(importType)) {
    return respondError(res, 400, 'INVALID_IMPORT_TYPE', 'import_type must be japan_csv/japan_xlsx.');
  }
  if (sourceType && !SOURCE_TYPE_ENUM.has(sourceType)) {
    return respondError(res, 400, 'INVALID_SOURCE_TYPE', 'source_type must be manual/csv_import/image_draft/api_sync.');
  }

  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let query = supabase
    .from('import_batches')
    .select(IMPORT_BATCH_SELECT, { count: 'exact' })
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })
    .range(from, to);

  if (scope.store_id) query = query.eq('store_id', scope.store_id);
  if (status) query = query.eq('status', status);
  if (importType) query = query.eq('import_type', importType);
  if (sourceType) query = query.eq('source_type', sourceType);

  const { data, error, count } = await query;
  if (error) {
    return respondError(res, 500, 'IMPORT_BATCHES_FETCH_FAILED', 'Failed to fetch import batches.', {
      supabase_error: error.message
    });
  }

  const total = Number(count ?? 0);
  return respondOk(
    res,
    (data ?? []).map(toImportBatchDto),
    200,
    {
      page,
      limit,
      total,
      total_pages: total === 0 ? 0 : Math.ceil(total / limit),
      scope_mode: scope.mode,
      scope_store_id: scope.store_id
    }
  );
});

router.get('/:id', async (req, res) => {
  const { supabase, auth } = req;
  const organizationId = scopedOrganizationId(auth);
  if (!ensureRoleAllowed(auth.role)) {
    return respondError(res, 403, 'ROLE_NOT_ALLOWED', 'Current role cannot access import batch admin APIs.');
  }

  const batchId = String(req.params.id || '');
  if (!batchId) {
    return respondError(res, 400, 'INVALID_BATCH_ID', 'Batch id is required.');
  }

  const scope = await resolveImportScope({
    supabase,
    auth,
    requestedStoreId: req.query.store_id
  });
  if (!scope.ok) return respondError(res, scope.status, scope.code, scope.message, scope.details ?? null);

  const { data: batch, error: batchError } = await fetchBatchWithScopeCheck(
    supabase,
    organizationId,
    scope.store_id,
    batchId
  );

  if (batchError) {
    return respondError(res, 500, 'IMPORT_BATCH_FETCH_FAILED', 'Failed to fetch import batch detail.', {
      supabase_error: batchError.message
    });
  }
  if (!batch) {
    return respondError(res, 404, 'IMPORT_BATCH_NOT_FOUND', 'Import batch not found in current scope.');
  }

  const { page, limit } = parsePaging(req.query.row_page, req.query.row_limit, 100, 500);
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  const { data: rows, error: rowsError, count: rowsCount } = await supabase
    .from('property_import_rows')
    .select(IMPORT_ROW_SELECT, { count: 'exact' })
    .eq('import_batch_id', batch.id)
    .order('row_number', { ascending: true })
    .range(from, to);

  if (rowsError) {
    return respondError(res, 500, 'IMPORT_BATCH_ROWS_FETCH_FAILED', 'Failed to fetch import batch rows.', {
      supabase_error: rowsError.message
    });
  }

  const totalRows = Number(rowsCount ?? 0);
  return respondOk(
    res,
    {
      batch: toImportBatchDto(batch),
      rows: (rows ?? []).map(toImportRowDto)
    },
    200,
    {
      row_page: page,
      row_limit: limit,
      row_total: totalRows,
      row_total_pages: totalRows === 0 ? 0 : Math.ceil(totalRows / limit),
      scope_mode: scope.mode,
      scope_store_id: scope.store_id
    }
  );
});

router.post('/', async (req, res) => {
  const { supabase, auth } = req;
  const organizationId = scopedOrganizationId(auth);
  if (!ensureRoleAllowed(auth.role)) {
    return respondError(res, 403, 'ROLE_NOT_ALLOWED', 'Current role cannot access import batch admin APIs.');
  }

  const body = req.body;
  if (!isPlainObject(body)) {
    return respondError(res, 400, 'INVALID_BODY', 'Request body must be a JSON object.');
  }

  const extra = unknownFields(body, POST_EDITABLE_FIELDS);
  if (extra.length > 0) {
    return respondError(res, 400, 'UNSUPPORTED_FIELDS', 'Request includes unsupported import fields.', {
      unsupported_fields: extra,
      editable_fields: POST_EDITABLE_FIELDS
    });
  }

  const importType = String(body.import_type ?? '');
  if (!IMPORT_TYPE_ENUM.has(importType)) {
    return respondError(res, 400, 'INVALID_IMPORT_TYPE', 'import_type must be japan_csv/japan_xlsx.');
  }

  const sourceType = body.source_type === undefined ? 'csv_import' : String(body.source_type);
  if (!SOURCE_TYPE_ENUM.has(sourceType)) {
    return respondError(res, 400, 'INVALID_SOURCE_TYPE', 'source_type must be manual/csv_import/image_draft/api_sync.');
  }

  const originalFilename = normalizeOptionalText(body.original_filename, 255);
  if (!originalFilename) {
    return respondError(res, 400, 'INVALID_ORIGINAL_FILENAME', 'original_filename is required.');
  }

  const fileUrl = body.file_url === undefined ? null : normalizeOptionalText(body.file_url, 2000);
  if (fileUrl === undefined) {
    return respondError(res, 400, 'INVALID_FILE_URL', 'file_url must be a string or null when provided.');
  }

  if (!Array.isArray(body.rows)) {
    return respondError(
      res,
      400,
      'INVALID_ROWS',
      'rows is required and must be an array. This skeleton currently accepts pre-parsed CSV/XLSX rows.'
    );
  }

  if (body.rows.length === 0) {
    return respondError(res, 400, 'EMPTY_ROWS', 'rows must contain at least one row.');
  }

  if (body.rows.length > MAX_IMPORT_ROWS) {
    return respondError(res, 400, 'ROWS_LIMIT_EXCEEDED', `rows cannot exceed ${MAX_IMPORT_ROWS} rows per batch.`);
  }

  const scope = await resolveImportScope({
    supabase,
    auth,
    requestedStoreId: body.store_id
  });
  if (!scope.ok) return respondError(res, scope.status, scope.code, scope.message, scope.details ?? null);

  const nowIso = new Date().toISOString();
  const { data: insertedBatch, error: batchInsertError } = await supabase
    .from('import_batches')
    .insert({
      organization_id: organizationId,
      store_id: scope.store_id,
      source_type: sourceType,
      import_type: importType,
      original_filename: originalFilename,
      file_url: fileUrl,
      status: 'validating',
      total_rows: body.rows.length,
      valid_rows: 0,
      invalid_rows: 0,
      created_drafts_count: 0,
      error_summary: null,
      started_at: nowIso,
      finished_at: null,
      created_by: auth.agentId
    })
    .select(IMPORT_BATCH_SELECT)
    .single();

  if (batchInsertError) {
    return respondError(res, 500, 'IMPORT_BATCH_CREATE_FAILED', 'Failed to create import batch.', {
      supabase_error: batchInsertError.message
    });
  }

  const incomingCodes = new Set();
  for (const row of body.rows) {
    if (!isPlainObject(row)) continue;
    const propertyCode = normalizeOptionalText(row.property_code, 120);
    if (propertyCode) incomingCodes.add(propertyCode);
  }

  let existingCodeSet = new Set();
  if (incomingCodes.size > 0) {
    let existingCodesQuery = supabase
      .from('properties')
      .select('property_code')
      .in('property_code', Array.from(incomingCodes));
    existingCodesQuery = applyDemoReadScope(existingCodesQuery, auth, 'organization_id');

    const { data: existingCodes, error: existingCodesError } = await existingCodesQuery;

    if (existingCodesError) {
      await supabase
        .from('import_batches')
        .update({
          status: 'failed',
          valid_rows: 0,
          invalid_rows: body.rows.length,
          created_drafts_count: 0,
          error_summary: {
            fatal_error: 'EXISTING_PROPERTY_CODE_LOOKUP_FAILED',
            supabase_error: existingCodesError.message
          },
          finished_at: new Date().toISOString()
        })
        .eq('id', insertedBatch.id);

      return respondError(res, 500, 'EXISTING_PROPERTY_CODE_LOOKUP_FAILED', 'Failed to validate property_code uniqueness.', {
        supabase_error: existingCodesError.message,
        import_batch_id: insertedBatch.id
      });
    }

    existingCodeSet = new Set((existingCodes ?? []).map((row) => row.property_code).filter(Boolean));
  }

  const seenCodesInFile = new Set();
  const rowResults = [];

  for (let i = 0; i < body.rows.length; i += 1) {
    const rawRow = body.rows[i];
    const rowNumber = i + 1;
    const normalizedResult = normalizeImportRow(rawRow);
    const normalized = normalizedResult.normalized;
    const errors = [...normalizedResult.errors];

    const propertyCode = normalized?.property_code ?? null;
    if (propertyCode) {
      if (seenCodesInFile.has(propertyCode)) {
        addValidationError(errors, 'DUPLICATE_PROPERTY_CODE_IN_FILE', 'property_code is duplicated in this file.', 'property_code');
      } else {
        seenCodesInFile.add(propertyCode);
      }

      if (existingCodeSet.has(propertyCode)) {
        addValidationError(
          errors,
          'DUPLICATE_PROPERTY_CODE_EXISTING',
          'property_code already exists in current organization.',
          'property_code'
        );
      }
    }

    rowResults.push({
      row_number: rowNumber,
      property_code: propertyCode,
      raw_row_payload: rawRow,
      normalized_payload: normalized,
      validation_errors: errors,
      status: errors.length > 0 ? 'invalid' : 'valid',
      created_property_id: null
    });
  }

  let createdDraftsCount = 0;
  for (const row of rowResults) {
    if (row.status !== 'valid') continue;

    const payload = row.normalized_payload;
    const purpose = payload.purpose;
    const serviceTypes = deriveServiceTypesFromPurpose(purpose);
    const currentStage = deriveCurrentStageFromPurpose(purpose);

    const insertPayload = applyDemoWriteDefaults({
      organization_id: organizationId,
      owner_agent_id: auth.agentId,
      property_code: payload.property_code,
      title: payload.title,
      title_ja: payload.title_ja,
      title_zh: payload.title_zh,
      title_en: payload.title_en,
      description: payload.description,
      description_ja: payload.description_ja,
      description_zh: payload.description_zh,
      description_en: payload.description_en,
      country: payload.country,
      prefecture: payload.prefecture,
      city: payload.city,
      district: payload.district,
      address_ja: payload.address_ja,
      address_zh: payload.address_zh,
      address_en: payload.address_en,
      purpose,
      property_type: payload.property_type,
      price: payload.price,
      currency: payload.currency,
      area_sqm: payload.area_sqm,
      layout: payload.layout,
      building_age: payload.building_age,
      floor: payload.floor,
      total_floors: payload.total_floors,
      nearest_station: payload.nearest_station,
      walking_minutes: payload.walking_minutes,
      management_fee: payload.management_fee,
      status: 'available',
      current_stage: currentStage,
      contact_store_id: scope.store_id,
      source_type: sourceType,
      source: deriveLegacySourceFromSourceType(sourceType),
      source_ref: `${insertedBatch.id}:row:${row.row_number}`,
      import_batch_id: insertedBatch.id,
      cover_image_url: payload.cover_image_url,
      floorplan_image_url: payload.floorplan_image_url,
      gallery_urls: payload.gallery_urls ?? [],
      raw_source_payload: payload.raw_source_payload ?? null,
      intake_status: 'pending_review',
      service_types: serviceTypes,
      is_rental_enabled: purpose === 'rental',
      is_management_enabled: purpose === 'management'
    }, auth, 'organization_id');

    const { data: createdProperty, error: createPropertyError } = await supabase
      .from('properties')
      .insert(insertPayload)
      .select('id')
      .single();

    if (createPropertyError) {
      row.status = 'invalid';
      row.created_property_id = null;
      row.validation_errors = [
        ...(row.validation_errors ?? []),
        {
          code: 'DRAFT_CREATE_FAILED',
          message: 'Failed to create property draft.',
          field: null,
          details: createPropertyError.message
        }
      ];
      continue;
    }

    row.status = 'imported';
    row.created_property_id = createdProperty.id;
    createdDraftsCount += 1;
  }

  const rowInsertPayload = rowResults.map((row) => ({
    import_batch_id: insertedBatch.id,
    row_number: row.row_number,
    property_code: row.property_code,
    raw_row_payload: row.raw_row_payload,
    normalized_payload: row.normalized_payload,
    validation_errors: row.validation_errors.length > 0 ? row.validation_errors : null,
    status: IMPORT_ROW_STATUS_ENUM.has(row.status) ? row.status : 'invalid',
    created_property_id: row.created_property_id
  }));

  const { error: rowsInsertError } = await supabase
    .from('property_import_rows')
    .insert(rowInsertPayload);

  if (rowsInsertError) {
    await supabase
      .from('import_batches')
      .update({
        status: 'failed',
        valid_rows: 0,
        invalid_rows: rowResults.length,
        created_drafts_count: 0,
        error_summary: {
          fatal_error: 'IMPORT_ROWS_PERSIST_FAILED',
          supabase_error: rowsInsertError.message
        },
        finished_at: new Date().toISOString()
      })
      .eq('id', insertedBatch.id);

    return respondError(res, 500, 'IMPORT_ROWS_PERSIST_FAILED', 'Failed to persist import row details.', {
      supabase_error: rowsInsertError.message,
      import_batch_id: insertedBatch.id
    });
  }

  const validRowsCount = rowResults.filter((row) => row.status === 'valid' || row.status === 'imported').length;
  const invalidRowsCount = rowResults.filter((row) => row.status === 'invalid').length;
  const summary = summarizeValidationErrors(rowResults);
  const finalStatus = createdDraftsCount > 0 ? 'imported' : 'failed';

  const { data: updatedBatch, error: batchUpdateError } = await supabase
    .from('import_batches')
    .update({
      status: finalStatus,
      valid_rows: validRowsCount,
      invalid_rows: invalidRowsCount,
      created_drafts_count: createdDraftsCount,
      error_summary: summary,
      finished_at: new Date().toISOString()
    })
    .eq('id', insertedBatch.id)
    .select(IMPORT_BATCH_SELECT)
    .single();

  if (batchUpdateError) {
    return respondError(res, 500, 'IMPORT_BATCH_FINALIZE_FAILED', 'Failed to finalize import batch status.', {
      supabase_error: batchUpdateError.message,
      import_batch_id: insertedBatch.id
    });
  }

  const { data: detailRows, error: detailRowsError } = await supabase
    .from('property_import_rows')
    .select(IMPORT_ROW_SELECT)
    .eq('import_batch_id', insertedBatch.id)
    .order('row_number', { ascending: true });

  if (detailRowsError) {
    return respondError(res, 500, 'IMPORT_BATCH_ROWS_FETCH_FAILED', 'Batch created but failed to fetch row details.', {
      supabase_error: detailRowsError.message,
      import_batch_id: insertedBatch.id
    });
  }

  return respondOk(
    res,
    {
      batch: toImportBatchDto(updatedBatch),
      rows: (detailRows ?? []).map(toImportRowDto)
    },
    201,
    {
      scope_mode: scope.mode,
      scope_store_id: scope.store_id
    }
  );
});

export default router;
