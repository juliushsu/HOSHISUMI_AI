import { Router } from 'express';
import { respondError, respondOk } from '../lib/http.js';
import { applyDemoReadScope, scopedOrganizationId } from '../services/demoScope.js';

const OWNER_SCOPE_ROLES = new Set(['owner', 'super_admin']);
const STORE_SCOPE_ROLES = new Set(['manager', 'store_manager', 'store_editor']);
const THEME_EDIT_ROLES = new Set(['owner', 'super_admin']);
const SERVICE_TYPE_ENUM = new Set(['buy', 'sell', 'rental', 'management', 'consultation']);
const PURPOSE_ENUM = new Set(['sale', 'rental', 'management']);
const PUBLICATION_TYPE_ENUM = new Set(['featured', 'normal']);
const THEME_KEY_ENUM = new Set([
  // Canonical preset keys used by current storefront UI
  'franchise_green_red',
  'franchise_yellow_red',
  'franchise_yellow_black',
  'franchise_blue_white',
  'franchise_green_gold',
  'neutral_modern_ivory',
  'neutral_warm_teak',
  'neutral_urban_sage',
  'neutral_luxury_black_gold',
  'neutral_trust_indigo',
  // Legacy keys kept for backward compatibility
  'tw_classic_green',
  'tw_bright_green',
  'global_orange_white',
  'jp_fresh_green',
  'jp_deep_blue_gray',
  'luxury_black_gold',
  'warm_wood',
  'modern_cream',
  'urban_gray_green',
  'trust_blue'
]);
const AGENT_SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const LEAD_SOURCE_TYPES = ['qr', 'agent_page', 'store_contact', 'property_inquiry', 'direct'];

const STORE_PROFILE_EDITABLE_FIELDS = [
  'name',
  'city',
  'district',
  'service_area_text',
  'tagline',
  'introduction',
  'phone',
  'email',
  'address',
  'line_url',
  'business_hours',
  'logo_url',
  'cover_image_url',
  'is_active',
  'theme_key',
  'theme_overrides'
];

const SERVICE_EDITABLE_FIELDS = ['service_type', 'title', 'description', 'is_enabled', 'sort_order'];
const PUBLICATION_EDITABLE_FIELDS = [
  'property_id',
  'purpose',
  'publication_type',
  'is_public',
  'display_order',
  'published_at',
  'unpublished_at'
];
const AGENT_EDITABLE_FIELDS = [
  'slug',
  'bio',
  'service_area',
  'avatar_url',
  'phone_public',
  'line_url',
  'is_public',
  'is_active'
];

const STORE_PROFILE_SELECT = [
  'id',
  'organization_id',
  'name',
  'slug',
  'city',
  'district',
  'service_area_text',
  'tagline',
  'introduction',
  'phone',
  'email',
  'address',
  'line_url',
  'business_hours',
  'logo_url',
  'cover_image_url',
  'theme_key',
  'theme_overrides',
  'is_active',
  'created_at',
  'updated_at'
].join(',');

const STORE_SERVICE_SELECT = [
  'id',
  'store_id',
  'service_type',
  'title',
  'description',
  'is_enabled',
  'sort_order',
  'created_at',
  'updated_at'
].join(',');

const STORE_PROPERTY_PUBLICATION_SELECT = [
  'id',
  'store_id',
  'property_id',
  'purpose',
  'publication_type',
  'is_public',
  'display_order',
  'published_at',
  'unpublished_at',
  'created_at',
  'updated_at',
  'property:properties!store_property_publications_property_id_fkey(id,title,country,price,current_stage,status)'
].join(',');

const STORE_AGENT_SELECT = [
  'id',
  'organization_id',
  'store_id',
  'name',
  'role',
  'slug',
  'bio',
  'service_area',
  'avatar_url',
  'phone_public',
  'line_url',
  'is_public',
  'is_active',
  'created_at',
  'updated_at'
].join(',');

const router = Router();

function isPlainObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function unknownFields(body, editableFields) {
  return Object.keys(body).filter((key) => !editableFields.includes(key));
}

function normalizeOptionalText(value) {
  if (value == null) return null;
  if (typeof value !== 'string') return { invalid: true };
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function parseIsoTimestamp(value) {
  if (value == null) return null;
  if (typeof value !== 'string') return { invalid: true };
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return { invalid: true };
  return parsed.toISOString();
}

function validateSortOrder(value) {
  return Number.isInteger(value) && value >= 0;
}

function getUtcDayStart(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0));
}

function getUtcWeekStart(date = new Date()) {
  const day = date.getUTCDay();
  const diffToMonday = day === 0 ? 6 : day - 1;
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - diffToMonday, 0, 0, 0, 0)
  );
}

function toStoreProfileAdminDto(storeRow) {
  return {
    id: storeRow.id,
    slug: storeRow.slug,
    name: storeRow.name,
    city: storeRow.city ?? null,
    district: storeRow.district ?? null,
    service_area_text: storeRow.service_area_text ?? null,
    tagline: storeRow.tagline ?? null,
    introduction: storeRow.introduction ?? null,
    phone: storeRow.phone ?? null,
    email: storeRow.email ?? null,
    address: storeRow.address ?? null,
    line_url: storeRow.line_url ?? null,
    business_hours: storeRow.business_hours ?? null,
    logo_url: storeRow.logo_url ?? null,
    cover_image_url: storeRow.cover_image_url ?? null,
    theme_key: storeRow.theme_key,
    theme_overrides: storeRow.theme_overrides ?? {},
    is_active: storeRow.is_active,
    updated_at: storeRow.updated_at
  };
}

function toStoreServiceAdminDto(row) {
  return {
    id: row.id,
    store_id: row.store_id,
    service_type: row.service_type,
    title: row.title,
    description: row.description ?? null,
    is_enabled: row.is_enabled,
    sort_order: row.sort_order,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

function toStorePropertyPublicationAdminDto(row) {
  return {
    id: row.id,
    store_id: row.store_id,
    publication: {
      property_id: row.property_id,
      purpose: row.purpose,
      publication_type: row.publication_type,
      is_public: row.is_public,
      display_order: row.display_order,
      published_at: row.published_at,
      unpublished_at: row.unpublished_at
    },
    property_summary: row.property
      ? {
          id: row.property.id,
          title: row.property.title,
          country: row.property.country,
          price: row.property.price,
          current_stage: row.property.current_stage ?? null,
          status: row.property.status ?? null
        }
      : null,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

function toStoreAgentAdminDto(row) {
  return {
    id: row.id,
    store_id: row.store_id,
    name: row.name,
    role: row.role,
    slug: row.slug ?? null,
    bio: row.bio ?? null,
    service_area: row.service_area ?? null,
    avatar_url: row.avatar_url ?? null,
    phone_public: row.phone_public ?? null,
    line_url: row.line_url ?? null,
    is_public: row.is_public,
    is_active: row.is_active,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

async function fetchStoreByIdInOrg(supabase, organizationId, storeId) {
  const { data, error } = await supabase
    .from('stores')
    .select(STORE_PROFILE_SELECT)
    .eq('id', storeId)
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (error) {
    return {
      ok: false,
      status: 500,
      code: 'STOREFRONT_STORE_FETCH_FAILED',
      message: 'Failed to resolve storefront store scope.',
      details: { supabase_error: error.message }
    };
  }

  if (!data) {
    return {
      ok: false,
      status: 404,
      code: 'STOREFRONT_STORE_NOT_FOUND',
      message: 'Store not found in current organization scope.'
    };
  }

  return { ok: true, store: data };
}

async function resolveStoreScope({ supabase, auth, requestedStoreId }) {
  const { data: actor, error: actorError } = await supabase
    .from('agents')
    .select('id, organization_id, role, store_id, is_active')
    .eq('id', auth.agentId)
    .maybeSingle();

  if (actorError) {
    return {
      ok: false,
      status: 500,
      code: 'ACTOR_SCOPE_LOOKUP_FAILED',
      message: 'Failed to resolve actor storefront scope.',
      details: { supabase_error: actorError.message }
    };
  }

  if (!actor || !actor.is_active || actor.organization_id !== auth.organizationId) {
    return {
      ok: false,
      status: 403,
      code: 'ACTOR_NOT_ALLOWED',
      message: 'Current actor cannot manage storefront settings.'
    };
  }

  const actorRole = String(actor.role || '').toLowerCase();
  const requested = typeof requestedStoreId === 'string' && requestedStoreId.trim() !== '' ? requestedStoreId : null;

  if (OWNER_SCOPE_ROLES.has(actorRole)) {
    if (requested) {
      const check = await fetchStoreByIdInOrg(supabase, auth.organizationId, requested);
      if (!check.ok) return check;
      return { ok: true, store: check.store, scope_mode: 'cross_store_owner', actor_role: actorRole };
    }

    if (actor.store_id) {
      const own = await fetchStoreByIdInOrg(supabase, auth.organizationId, actor.store_id);
      if (own.ok) return { ok: true, store: own.store, scope_mode: 'owner_default_store', actor_role: actorRole };
    }

    const { data: fallback, error: fallbackError } = await supabase
      .from('stores')
      .select(STORE_PROFILE_SELECT)
      .eq('organization_id', auth.organizationId)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (fallbackError) {
      return {
        ok: false,
        status: 500,
        code: 'STOREFRONT_STORE_FALLBACK_FAILED',
        message: 'Failed to resolve default storefront store scope.',
        details: { supabase_error: fallbackError.message }
      };
    }

    if (!fallback) {
      return {
        ok: false,
        status: 404,
        code: 'STOREFRONT_STORE_NOT_CONFIGURED',
        message: 'No store is configured in current organization.'
      };
    }

    return { ok: true, store: fallback, scope_mode: 'owner_first_store', actor_role: actorRole };
  }

  if (STORE_SCOPE_ROLES.has(actorRole)) {
    if (!actor.store_id) {
      return {
        ok: false,
        status: 403,
        code: 'STORE_SCOPE_NOT_ASSIGNED',
        message: 'Current role requires a bound store_id for storefront admin.'
      };
    }

    if (requested && requested !== actor.store_id) {
      return {
        ok: false,
        status: 403,
        code: 'STORE_SCOPE_FORBIDDEN',
        message: 'Current role can only manage its own store.'
      };
    }

    const own = await fetchStoreByIdInOrg(supabase, auth.organizationId, actor.store_id);
    if (!own.ok) return own;
    return { ok: true, store: own.store, scope_mode: 'store_scoped', actor_role: actorRole };
  }

  return {
    ok: false,
    status: 403,
    code: 'ROLE_NOT_ALLOWED',
    message: 'Current role cannot manage storefront admin APIs.'
  };
}

async function validatePropertyInOrg(supabase, organizationId, propertyId) {
  const { data, error } = await supabase
    .from('properties')
    .select('id, organization_id')
    .eq('id', propertyId)
    .maybeSingle();

  if (error) {
    return {
      ok: false,
      status: 500,
      code: 'PROPERTY_LOOKUP_FAILED',
      message: 'Failed to validate property.',
      details: { supabase_error: error.message }
    };
  }

  if (!data || data.organization_id !== organizationId) {
    return {
      ok: false,
      status: 400,
      code: 'INVALID_PROPERTY_ID',
      message: 'property_id must belong to current organization.'
    };
  }

  return { ok: true };
}

function mapPublicationTypeFlags(publicationType) {
  return {
    publication_type: publicationType,
    featured: publicationType === 'featured',
    normal: publicationType === 'normal'
  };
}

function buildScopedLeadsCountQuery({ supabase, auth, organizationId, storeId }) {
  let query = supabase
    .from('leads')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', organizationId);
  if (storeId) query = query.eq('store_id', storeId);
  return applyDemoReadScope(query, auth, 'organization_id');
}

function toRecentLeadPreview(row) {
  return {
    id: row.id,
    customer_name: row.customer_name,
    source_type: row.source_type,
    status: row.status,
    created_at: row.created_at,
    agent_id: row.agent_id ?? null,
    agent_name: row.agent?.name ?? null,
    property_id: row.property_id ?? null,
    property_title: row.property?.title ?? null
  };
}

router.get('/overview', async (req, res) => {
  const { supabase, auth } = req;
  const organizationId = scopedOrganizationId(auth);
  const scope = await resolveStoreScope({
    supabase,
    auth,
    requestedStoreId: req.query.store_id
  });
  if (!scope.ok) return respondError(res, scope.status, scope.code, scope.message, scope.details ?? null);

  const todayStartIso = getUtcDayStart().toISOString();
  const weekStartIso = getUtcWeekStart().toISOString();

  const metricsQueries = [
    buildScopedLeadsCountQuery({
      supabase,
      auth,
      organizationId,
      storeId: scope.store.id
    }).gte('created_at', todayStartIso),
    buildScopedLeadsCountQuery({
      supabase,
      auth,
      organizationId,
      storeId: scope.store.id
    }).gte('created_at', weekStartIso),
    buildScopedLeadsCountQuery({
      supabase,
      auth,
      organizationId,
      storeId: scope.store.id
    }).eq('status', 'new'),
    buildScopedLeadsCountQuery({
      supabase,
      auth,
      organizationId,
      storeId: scope.store.id
    }).eq('status', 'contacted'),
    buildScopedLeadsCountQuery({
      supabase,
      auth,
      organizationId,
      storeId: scope.store.id
    }).eq('status', 'qualified')
  ];

  const sourceTypeQueries = LEAD_SOURCE_TYPES.map((sourceType) =>
    buildScopedLeadsCountQuery({
      supabase,
      auth,
      organizationId,
      storeId: scope.store.id
    }).eq('source_type', sourceType)
  );

  let recentQuery = supabase
    .from('leads')
    .select(
      'id,customer_name,source_type,status,created_at,agent_id,property_id,agent:agents!leads_agent_id_fkey(id,name),property:properties!leads_property_id_fkey(id,title)'
    )
    .eq('organization_id', organizationId)
    .eq('store_id', scope.store.id)
    .order('created_at', { ascending: false })
    .limit(5);
  recentQuery = applyDemoReadScope(recentQuery, auth, 'organization_id');

  const [metricResults, sourceResults, recentResult] = await Promise.all([
    Promise.all(metricsQueries),
    Promise.all(sourceTypeQueries),
    recentQuery
  ]);

  const metricError = metricResults.find((result) => result.error);
  const sourceError = sourceResults.find((result) => result.error);
  if (metricError || sourceError || recentResult.error) {
    return respondError(
      res,
      500,
      'STOREFRONT_OVERVIEW_FETCH_FAILED',
      'Failed to fetch storefront overview metrics.',
      {
        metrics_error: metricError?.error?.message ?? null,
        source_breakdown_error: sourceError?.error?.message ?? null,
        recent_error: recentResult.error?.message ?? null
      }
    );
  }

  const sourceTypeBreakdown = LEAD_SOURCE_TYPES.map((sourceType, index) => ({
    source_type: sourceType,
    count: Number(sourceResults[index]?.count ?? 0)
  }));

  return respondOk(
    res,
    {
      today_leads_count: Number(metricResults[0]?.count ?? 0),
      week_leads_count: Number(metricResults[1]?.count ?? 0),
      new_leads_count: Number(metricResults[2]?.count ?? 0),
      contacted_leads_count: Number(metricResults[3]?.count ?? 0),
      qualified_leads_count: Number(metricResults[4]?.count ?? 0),
      source_type_breakdown: sourceTypeBreakdown,
      recent_leads_preview: (recentResult.data ?? []).map(toRecentLeadPreview)
    },
    200,
    {
      store_scope: { store_id: scope.store.id, mode: scope.scope_mode },
      period_anchor: {
        day_start_utc: todayStartIso,
        week_start_utc: weekStartIso
      }
    }
  );
});

router.get('/profile', async (req, res) => {
  const { supabase, auth } = req;
  const scope = await resolveStoreScope({
    supabase,
    auth,
    requestedStoreId: req.query.store_id
  });
  if (!scope.ok) return respondError(res, scope.status, scope.code, scope.message, scope.details ?? null);

  return respondOk(
    res,
    toStoreProfileAdminDto(scope.store),
    200,
    { store_scope: { store_id: scope.store.id, mode: scope.scope_mode } }
  );
});

router.patch('/profile', async (req, res) => {
  // Canonical editable fields: STORE_PROFILE_EDITABLE_FIELDS.
  const { supabase, auth } = req;
  const body = req.body;
  if (!isPlainObject(body)) {
    return respondError(res, 400, 'INVALID_BODY', 'Request body must be a JSON object.');
  }

  const extra = unknownFields(body, STORE_PROFILE_EDITABLE_FIELDS);
  if (extra.length > 0) {
    return respondError(res, 400, 'UNSUPPORTED_FIELDS', 'Request includes unsupported profile fields.', {
      unsupported_fields: extra,
      editable_fields: STORE_PROFILE_EDITABLE_FIELDS
    });
  }

  if (Object.keys(body).length === 0) {
    return respondError(res, 400, 'EMPTY_PATCH_BODY', 'At least one editable field is required.');
  }

  const scope = await resolveStoreScope({
    supabase,
    auth,
    requestedStoreId: req.query.store_id
  });
  if (!scope.ok) return respondError(res, scope.status, scope.code, scope.message, scope.details ?? null);

  const isThemeMutation =
    Object.prototype.hasOwnProperty.call(body, 'theme_key') ||
    Object.prototype.hasOwnProperty.call(body, 'theme_overrides');
  const actorRole = String(scope.actor_role || auth.role || '').toLowerCase();
  if (isThemeMutation && !THEME_EDIT_ROLES.has(actorRole)) {
    return respondError(
      res,
      403,
      'THEME_UPDATE_FORBIDDEN',
      'Only owner/super_admin can update storefront theme settings.'
    );
  }

  const updates = {};
  if (body.name !== undefined) {
    if (typeof body.name !== 'string' || body.name.trim() === '') {
      return respondError(res, 400, 'INVALID_NAME', 'name must be a non-empty string when provided.');
    }
    updates.name = body.name.trim();
  }

  const textFields = [
    'city',
    'district',
    'service_area_text',
    'tagline',
    'introduction',
    'phone',
    'email',
    'address',
    'line_url',
    'business_hours',
    'logo_url',
    'cover_image_url'
  ];
  for (const key of textFields) {
    if (body[key] !== undefined) {
      const normalized = normalizeOptionalText(body[key]);
      if (normalized?.invalid) {
        return respondError(res, 400, 'INVALID_TEXT_FIELD', `${key} must be a string or null.`);
      }
      updates[key] = normalized;
    }
  }

  if (body.is_active !== undefined) {
    if (typeof body.is_active !== 'boolean') {
      return respondError(res, 400, 'INVALID_IS_ACTIVE', 'is_active must be a boolean.');
    }
    updates.is_active = body.is_active;
  }

  if (body.theme_key !== undefined) {
    if (typeof body.theme_key !== 'string' || !THEME_KEY_ENUM.has(body.theme_key)) {
      return respondError(
        res,
        400,
        'INVALID_THEME_KEY',
        'theme_key must be one of the configured storefront theme presets.',
        {
          allowed_theme_keys: Array.from(THEME_KEY_ENUM)
        }
      );
    }
    updates.theme_key = body.theme_key;
  }

  if (body.theme_overrides !== undefined) {
    if (body.theme_overrides !== null && (typeof body.theme_overrides !== 'object' || Array.isArray(body.theme_overrides))) {
      return respondError(res, 400, 'INVALID_THEME_OVERRIDES', 'theme_overrides must be an object or null.');
    }
    updates.theme_overrides = body.theme_overrides ?? {};
  }

  if (Object.keys(updates).length === 0) {
    return respondError(res, 400, 'EMPTY_PATCH_BODY', 'At least one valid editable field is required.');
  }

  const { data, error } = await supabase
    .from('stores')
    .update(updates)
    .eq('id', scope.store.id)
    .eq('organization_id', auth.organizationId)
    .select(STORE_PROFILE_SELECT)
    .single();

  if (error) {
    return respondError(res, 400, 'STOREFRONT_PROFILE_UPDATE_FAILED', 'Failed to update storefront profile.', {
      supabase_error: error.message
    });
  }

  return respondOk(
    res,
    toStoreProfileAdminDto(data),
    200,
    { store_scope: { store_id: scope.store.id, mode: scope.scope_mode } }
  );
});

router.get('/services', async (req, res) => {
  const { supabase, auth } = req;
  const scope = await resolveStoreScope({
    supabase,
    auth,
    requestedStoreId: req.query.store_id
  });
  if (!scope.ok) return respondError(res, scope.status, scope.code, scope.message, scope.details ?? null);

  const { data, error } = await supabase
    .from('store_services')
    .select(STORE_SERVICE_SELECT)
    .eq('store_id', scope.store.id)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) {
    return respondError(res, 500, 'STOREFRONT_SERVICES_FETCH_FAILED', 'Failed to fetch storefront services.', {
      supabase_error: error.message
    });
  }

  return respondOk(
    res,
    (data ?? []).map(toStoreServiceAdminDto),
    200,
    { store_scope: { store_id: scope.store.id, mode: scope.scope_mode } }
  );
});

router.post('/services', async (req, res) => {
  // Canonical editable fields: SERVICE_EDITABLE_FIELDS.
  const { supabase, auth } = req;
  const body = req.body;
  if (!isPlainObject(body)) {
    return respondError(res, 400, 'INVALID_BODY', 'Request body must be a JSON object.');
  }

  const extra = unknownFields(body, SERVICE_EDITABLE_FIELDS);
  if (extra.length > 0) {
    return respondError(res, 400, 'UNSUPPORTED_FIELDS', 'Request includes unsupported service fields.', {
      unsupported_fields: extra,
      editable_fields: SERVICE_EDITABLE_FIELDS
    });
  }

  if (!body.service_type || !SERVICE_TYPE_ENUM.has(String(body.service_type))) {
    return respondError(
      res,
      400,
      'INVALID_SERVICE_TYPE',
      'service_type must be buy/sell/rental/management/consultation.'
    );
  }

  if (typeof body.title !== 'string' || body.title.trim() === '') {
    return respondError(res, 400, 'INVALID_TITLE', 'title is required and must be a non-empty string.');
  }

  if (body.description !== undefined) {
    const normalizedDescription = normalizeOptionalText(body.description);
    if (normalizedDescription?.invalid) {
      return respondError(res, 400, 'INVALID_DESCRIPTION', 'description must be a string or null.');
    }
  }

  if (body.is_enabled !== undefined && typeof body.is_enabled !== 'boolean') {
    return respondError(res, 400, 'INVALID_IS_ENABLED', 'is_enabled must be a boolean when provided.');
  }

  if (body.sort_order !== undefined && !validateSortOrder(body.sort_order)) {
    return respondError(res, 400, 'INVALID_SORT_ORDER', 'sort_order must be an integer >= 0.');
  }

  const scope = await resolveStoreScope({
    supabase,
    auth,
    requestedStoreId: req.query.store_id
  });
  if (!scope.ok) return respondError(res, scope.status, scope.code, scope.message, scope.details ?? null);

  const serviceType = String(body.service_type);
  const payload = {
    store_id: scope.store.id,
    service_type: serviceType,
    buy: serviceType === 'buy',
    sell: serviceType === 'sell',
    rental: serviceType === 'rental',
    management: serviceType === 'management',
    consultation: serviceType === 'consultation',
    title: body.title.trim(),
    description: normalizeOptionalText(body.description),
    is_enabled: body.is_enabled ?? true,
    sort_order: body.sort_order ?? 0
  };

  const { data, error } = await supabase
    .from('store_services')
    .insert(payload)
    .select(STORE_SERVICE_SELECT)
    .single();

  if (error) {
    return respondError(res, 400, 'STOREFRONT_SERVICE_CREATE_FAILED', 'Failed to create storefront service.', {
      supabase_error: error.message
    });
  }

  return respondOk(
    res,
    toStoreServiceAdminDto(data),
    201,
    { store_scope: { store_id: scope.store.id, mode: scope.scope_mode } }
  );
});

router.patch('/services/:id', async (req, res) => {
  // Canonical editable fields: SERVICE_EDITABLE_FIELDS.
  const { supabase, auth } = req;
  const body = req.body;
  if (!isPlainObject(body)) {
    return respondError(res, 400, 'INVALID_BODY', 'Request body must be a JSON object.');
  }

  const extra = unknownFields(body, SERVICE_EDITABLE_FIELDS);
  if (extra.length > 0) {
    return respondError(res, 400, 'UNSUPPORTED_FIELDS', 'Request includes unsupported service fields.', {
      unsupported_fields: extra,
      editable_fields: SERVICE_EDITABLE_FIELDS
    });
  }

  if (Object.keys(body).length === 0) {
    return respondError(res, 400, 'EMPTY_PATCH_BODY', 'At least one editable field is required.');
  }

  if (body.service_type !== undefined && !SERVICE_TYPE_ENUM.has(String(body.service_type))) {
    return respondError(
      res,
      400,
      'INVALID_SERVICE_TYPE',
      'service_type must be buy/sell/rental/management/consultation.'
    );
  }

  if (body.title !== undefined && (typeof body.title !== 'string' || body.title.trim() === '')) {
    return respondError(res, 400, 'INVALID_TITLE', 'title must be a non-empty string.');
  }

  if (body.description !== undefined) {
    const normalizedDescription = normalizeOptionalText(body.description);
    if (normalizedDescription?.invalid) {
      return respondError(res, 400, 'INVALID_DESCRIPTION', 'description must be a string or null.');
    }
  }

  if (body.is_enabled !== undefined && typeof body.is_enabled !== 'boolean') {
    return respondError(res, 400, 'INVALID_IS_ENABLED', 'is_enabled must be a boolean.');
  }

  if (body.sort_order !== undefined && !validateSortOrder(body.sort_order)) {
    return respondError(res, 400, 'INVALID_SORT_ORDER', 'sort_order must be an integer >= 0.');
  }

  const scope = await resolveStoreScope({
    supabase,
    auth,
    requestedStoreId: req.query.store_id
  });
  if (!scope.ok) return respondError(res, scope.status, scope.code, scope.message, scope.details ?? null);

  const { data: existing, error: existingError } = await supabase
    .from('store_services')
    .select('id, store_id')
    .eq('id', req.params.id)
    .eq('store_id', scope.store.id)
    .maybeSingle();

  if (existingError) {
    return respondError(res, 500, 'STOREFRONT_SERVICE_LOOKUP_FAILED', 'Failed to verify storefront service.', {
      supabase_error: existingError.message
    });
  }
  if (!existing) {
    return respondError(res, 404, 'STOREFRONT_SERVICE_NOT_FOUND', 'Storefront service not found.');
  }

  const updates = {};
  if (body.service_type !== undefined) {
    const serviceType = String(body.service_type);
    updates.service_type = serviceType;
    updates.buy = serviceType === 'buy';
    updates.sell = serviceType === 'sell';
    updates.rental = serviceType === 'rental';
    updates.management = serviceType === 'management';
    updates.consultation = serviceType === 'consultation';
  }
  if (body.title !== undefined) updates.title = body.title.trim();
  if (body.description !== undefined) updates.description = normalizeOptionalText(body.description);
  if (body.is_enabled !== undefined) updates.is_enabled = body.is_enabled;
  if (body.sort_order !== undefined) updates.sort_order = body.sort_order;

  const { data, error } = await supabase
    .from('store_services')
    .update(updates)
    .eq('id', existing.id)
    .eq('store_id', scope.store.id)
    .select(STORE_SERVICE_SELECT)
    .single();

  if (error) {
    return respondError(res, 400, 'STOREFRONT_SERVICE_UPDATE_FAILED', 'Failed to update storefront service.', {
      supabase_error: error.message
    });
  }

  return respondOk(
    res,
    toStoreServiceAdminDto(data),
    200,
    { store_scope: { store_id: scope.store.id, mode: scope.scope_mode } }
  );
});

router.get('/properties', async (req, res) => {
  const { supabase, auth } = req;
  const scope = await resolveStoreScope({
    supabase,
    auth,
    requestedStoreId: req.query.store_id
  });
  if (!scope.ok) return respondError(res, scope.status, scope.code, scope.message, scope.details ?? null);

  const { data, error } = await supabase
    .from('store_property_publications')
    .select(STORE_PROPERTY_PUBLICATION_SELECT)
    .eq('store_id', scope.store.id)
    .order('display_order', { ascending: true })
    .order('updated_at', { ascending: false });

  if (error) {
    return respondError(
      res,
      500,
      'STOREFRONT_PUBLICATIONS_FETCH_FAILED',
      'Failed to fetch storefront property publications.',
      { supabase_error: error.message }
    );
  }

  return respondOk(
    res,
    (data ?? []).map(toStorePropertyPublicationAdminDto),
    200,
    { store_scope: { store_id: scope.store.id, mode: scope.scope_mode } }
  );
});

router.post('/properties', async (req, res) => {
  // Canonical editable fields: PUBLICATION_EDITABLE_FIELDS.
  const { supabase, auth } = req;
  const body = req.body;
  if (!isPlainObject(body)) {
    return respondError(res, 400, 'INVALID_BODY', 'Request body must be a JSON object.');
  }

  const extra = unknownFields(body, PUBLICATION_EDITABLE_FIELDS);
  if (extra.length > 0) {
    return respondError(res, 400, 'UNSUPPORTED_FIELDS', 'Request includes unsupported publication fields.', {
      unsupported_fields: extra,
      editable_fields: PUBLICATION_EDITABLE_FIELDS
    });
  }

  if (!body.property_id || typeof body.property_id !== 'string') {
    return respondError(res, 400, 'INVALID_PROPERTY_ID', 'property_id is required and must be a UUID string.');
  }
  if (!PURPOSE_ENUM.has(String(body.purpose))) {
    return respondError(res, 400, 'INVALID_PURPOSE', 'purpose must be sale/rental/management.');
  }
  if (!PUBLICATION_TYPE_ENUM.has(String(body.publication_type))) {
    return respondError(res, 400, 'INVALID_PUBLICATION_TYPE', 'publication_type must be featured/normal.');
  }
  if (body.is_public !== undefined && typeof body.is_public !== 'boolean') {
    return respondError(res, 400, 'INVALID_IS_PUBLIC', 'is_public must be a boolean when provided.');
  }
  if (body.display_order !== undefined && !validateSortOrder(body.display_order)) {
    return respondError(res, 400, 'INVALID_DISPLAY_ORDER', 'display_order must be an integer >= 0.');
  }

  const parsedPublishedAt = parseIsoTimestamp(body.published_at);
  if (parsedPublishedAt?.invalid) {
    return respondError(res, 400, 'INVALID_PUBLISHED_AT', 'published_at must be an ISO timestamp or null.');
  }
  const parsedUnpublishedAt = parseIsoTimestamp(body.unpublished_at);
  if (parsedUnpublishedAt?.invalid) {
    return respondError(res, 400, 'INVALID_UNPUBLISHED_AT', 'unpublished_at must be an ISO timestamp or null.');
  }
  if (parsedPublishedAt && parsedUnpublishedAt && new Date(parsedUnpublishedAt) <= new Date(parsedPublishedAt)) {
    return respondError(res, 400, 'INVALID_PUBLISH_WINDOW', 'unpublished_at must be later than published_at.');
  }

  const scope = await resolveStoreScope({
    supabase,
    auth,
    requestedStoreId: req.query.store_id
  });
  if (!scope.ok) return respondError(res, scope.status, scope.code, scope.message, scope.details ?? null);

  const propertyCheck = await validatePropertyInOrg(supabase, auth.organizationId, body.property_id);
  if (!propertyCheck.ok) {
    return respondError(
      res,
      propertyCheck.status,
      propertyCheck.code,
      propertyCheck.message,
      propertyCheck.details ?? null
    );
  }

  const payload = {
    store_id: scope.store.id,
    property_id: body.property_id,
    purpose: String(body.purpose),
    ...mapPublicationTypeFlags(String(body.publication_type)),
    is_public: body.is_public ?? true,
    display_order: body.display_order ?? 0,
    published_at: parsedPublishedAt,
    unpublished_at: parsedUnpublishedAt
  };

  const { data, error } = await supabase
    .from('store_property_publications')
    .upsert(payload, { onConflict: 'store_id,property_id,purpose' })
    .select(STORE_PROPERTY_PUBLICATION_SELECT)
    .single();

  if (error) {
    return respondError(
      res,
      400,
      'STOREFRONT_PUBLICATION_UPSERT_FAILED',
      'Failed to create or update storefront publication.',
      { supabase_error: error.message }
    );
  }

  return respondOk(
    res,
    toStorePropertyPublicationAdminDto(data),
    201,
    { store_scope: { store_id: scope.store.id, mode: scope.scope_mode } }
  );
});

router.patch('/properties/:id', async (req, res) => {
  // Canonical editable fields: PUBLICATION_EDITABLE_FIELDS.
  const { supabase, auth } = req;
  const body = req.body;
  if (!isPlainObject(body)) {
    return respondError(res, 400, 'INVALID_BODY', 'Request body must be a JSON object.');
  }

  const extra = unknownFields(body, PUBLICATION_EDITABLE_FIELDS);
  if (extra.length > 0) {
    return respondError(res, 400, 'UNSUPPORTED_FIELDS', 'Request includes unsupported publication fields.', {
      unsupported_fields: extra,
      editable_fields: PUBLICATION_EDITABLE_FIELDS
    });
  }

  if (Object.keys(body).length === 0) {
    return respondError(res, 400, 'EMPTY_PATCH_BODY', 'At least one editable field is required.');
  }

  if (body.purpose !== undefined && !PURPOSE_ENUM.has(String(body.purpose))) {
    return respondError(res, 400, 'INVALID_PURPOSE', 'purpose must be sale/rental/management.');
  }
  if (body.publication_type !== undefined && !PUBLICATION_TYPE_ENUM.has(String(body.publication_type))) {
    return respondError(res, 400, 'INVALID_PUBLICATION_TYPE', 'publication_type must be featured/normal.');
  }
  if (body.is_public !== undefined && typeof body.is_public !== 'boolean') {
    return respondError(res, 400, 'INVALID_IS_PUBLIC', 'is_public must be a boolean.');
  }
  if (body.display_order !== undefined && !validateSortOrder(body.display_order)) {
    return respondError(res, 400, 'INVALID_DISPLAY_ORDER', 'display_order must be an integer >= 0.');
  }
  if (body.property_id !== undefined && typeof body.property_id !== 'string') {
    return respondError(res, 400, 'INVALID_PROPERTY_ID', 'property_id must be a UUID string.');
  }

  const parsedPublishedAt = body.published_at !== undefined ? parseIsoTimestamp(body.published_at) : undefined;
  if (parsedPublishedAt?.invalid) {
    return respondError(res, 400, 'INVALID_PUBLISHED_AT', 'published_at must be an ISO timestamp or null.');
  }
  const parsedUnpublishedAt = body.unpublished_at !== undefined ? parseIsoTimestamp(body.unpublished_at) : undefined;
  if (parsedUnpublishedAt?.invalid) {
    return respondError(res, 400, 'INVALID_UNPUBLISHED_AT', 'unpublished_at must be an ISO timestamp or null.');
  }
  if (
    parsedPublishedAt !== undefined &&
    parsedPublishedAt &&
    parsedUnpublishedAt !== undefined &&
    parsedUnpublishedAt &&
    new Date(parsedUnpublishedAt) <= new Date(parsedPublishedAt)
  ) {
    return respondError(res, 400, 'INVALID_PUBLISH_WINDOW', 'unpublished_at must be later than published_at.');
  }

  const scope = await resolveStoreScope({
    supabase,
    auth,
    requestedStoreId: req.query.store_id
  });
  if (!scope.ok) return respondError(res, scope.status, scope.code, scope.message, scope.details ?? null);

  const { data: existing, error: existingError } = await supabase
    .from('store_property_publications')
    .select('id, store_id, property_id, purpose, published_at, unpublished_at')
    .eq('id', req.params.id)
    .eq('store_id', scope.store.id)
    .maybeSingle();

  if (existingError) {
    return respondError(
      res,
      500,
      'STOREFRONT_PUBLICATION_LOOKUP_FAILED',
      'Failed to verify storefront publication.',
      { supabase_error: existingError.message }
    );
  }
  if (!existing) {
    return respondError(res, 404, 'STOREFRONT_PUBLICATION_NOT_FOUND', 'Storefront publication not found.');
  }

  if (body.property_id !== undefined) {
    const propertyCheck = await validatePropertyInOrg(supabase, auth.organizationId, body.property_id);
    if (!propertyCheck.ok) {
      return respondError(
        res,
        propertyCheck.status,
        propertyCheck.code,
        propertyCheck.message,
        propertyCheck.details ?? null
      );
    }
  }

  const updates = {};
  if (body.property_id !== undefined) updates.property_id = body.property_id;
  if (body.purpose !== undefined) updates.purpose = String(body.purpose);
  if (body.publication_type !== undefined) {
    Object.assign(updates, mapPublicationTypeFlags(String(body.publication_type)));
  }
  if (body.is_public !== undefined) updates.is_public = body.is_public;
  if (body.display_order !== undefined) updates.display_order = body.display_order;
  if (parsedPublishedAt !== undefined) updates.published_at = parsedPublishedAt;
  if (parsedUnpublishedAt !== undefined) updates.unpublished_at = parsedUnpublishedAt;

  const nextPublishedAt =
    updates.published_at !== undefined ? updates.published_at : existing.published_at;
  const nextUnpublishedAt =
    updates.unpublished_at !== undefined ? updates.unpublished_at : existing.unpublished_at;
  if (nextPublishedAt && nextUnpublishedAt && new Date(nextUnpublishedAt) <= new Date(nextPublishedAt)) {
    return respondError(res, 400, 'INVALID_PUBLISH_WINDOW', 'unpublished_at must be later than published_at.');
  }

  const { data, error } = await supabase
    .from('store_property_publications')
    .update(updates)
    .eq('id', existing.id)
    .eq('store_id', scope.store.id)
    .select(STORE_PROPERTY_PUBLICATION_SELECT)
    .single();

  if (error) {
    return respondError(
      res,
      400,
      'STOREFRONT_PUBLICATION_UPDATE_FAILED',
      'Failed to update storefront publication.',
      { supabase_error: error.message }
    );
  }

  return respondOk(
    res,
    toStorePropertyPublicationAdminDto(data),
    200,
    { store_scope: { store_id: scope.store.id, mode: scope.scope_mode } }
  );
});

router.get('/agents', async (req, res) => {
  const { supabase, auth } = req;
  const scope = await resolveStoreScope({
    supabase,
    auth,
    requestedStoreId: req.query.store_id
  });
  if (!scope.ok) return respondError(res, scope.status, scope.code, scope.message, scope.details ?? null);

  const { data, error } = await supabase
    .from('agents')
    .select(STORE_AGENT_SELECT)
    .eq('organization_id', auth.organizationId)
    .eq('store_id', scope.store.id)
    .order('created_at', { ascending: true });

  if (error) {
    return respondError(res, 500, 'STOREFRONT_AGENTS_FETCH_FAILED', 'Failed to fetch storefront agents.', {
      supabase_error: error.message
    });
  }

  return respondOk(
    res,
    (data ?? []).map(toStoreAgentAdminDto),
    200,
    { store_scope: { store_id: scope.store.id, mode: scope.scope_mode } }
  );
});

router.patch('/agents/:id', async (req, res) => {
  // Canonical editable fields: AGENT_EDITABLE_FIELDS.
  const { supabase, auth } = req;
  const body = req.body;
  if (!isPlainObject(body)) {
    return respondError(res, 400, 'INVALID_BODY', 'Request body must be a JSON object.');
  }

  const extra = unknownFields(body, AGENT_EDITABLE_FIELDS);
  if (extra.length > 0) {
    return respondError(res, 400, 'UNSUPPORTED_FIELDS', 'Request includes unsupported agent fields.', {
      unsupported_fields: extra,
      editable_fields: AGENT_EDITABLE_FIELDS
    });
  }

  if (Object.keys(body).length === 0) {
    return respondError(res, 400, 'EMPTY_PATCH_BODY', 'At least one editable field is required.');
  }

  if (body.slug !== undefined) {
    if (body.slug !== null && (typeof body.slug !== 'string' || !AGENT_SLUG_RE.test(body.slug))) {
      return respondError(res, 400, 'INVALID_AGENT_SLUG', 'slug must match ^[a-z0-9]+(?:-[a-z0-9]+)*$ or null.');
    }
  }

  const textFields = ['bio', 'service_area', 'avatar_url', 'phone_public', 'line_url'];
  for (const key of textFields) {
    if (body[key] !== undefined) {
      const normalized = normalizeOptionalText(body[key]);
      if (normalized?.invalid) {
        return respondError(res, 400, 'INVALID_TEXT_FIELD', `${key} must be a string or null.`);
      }
    }
  }

  if (body.is_public !== undefined && typeof body.is_public !== 'boolean') {
    return respondError(res, 400, 'INVALID_IS_PUBLIC', 'is_public must be a boolean.');
  }
  if (body.is_active !== undefined && typeof body.is_active !== 'boolean') {
    return respondError(res, 400, 'INVALID_IS_ACTIVE', 'is_active must be a boolean.');
  }

  const scope = await resolveStoreScope({
    supabase,
    auth,
    requestedStoreId: req.query.store_id
  });
  if (!scope.ok) return respondError(res, scope.status, scope.code, scope.message, scope.details ?? null);

  const { data: existing, error: existingError } = await supabase
    .from('agents')
    .select('id, organization_id, store_id')
    .eq('id', req.params.id)
    .eq('organization_id', auth.organizationId)
    .eq('store_id', scope.store.id)
    .maybeSingle();

  if (existingError) {
    return respondError(res, 500, 'STOREFRONT_AGENT_LOOKUP_FAILED', 'Failed to verify storefront agent.', {
      supabase_error: existingError.message
    });
  }
  if (!existing) {
    return respondError(res, 404, 'STOREFRONT_AGENT_NOT_FOUND', 'Storefront agent not found in current store scope.');
  }

  const updates = {};
  if (body.slug !== undefined) updates.slug = normalizeOptionalText(body.slug);
  for (const key of textFields) {
    if (body[key] !== undefined) updates[key] = normalizeOptionalText(body[key]);
  }
  if (body.is_public !== undefined) updates.is_public = body.is_public;
  if (body.is_active !== undefined) updates.is_active = body.is_active;

  const { data, error } = await supabase
    .from('agents')
    .update(updates)
    .eq('id', existing.id)
    .eq('organization_id', auth.organizationId)
    .eq('store_id', scope.store.id)
    .select(STORE_AGENT_SELECT)
    .single();

  if (error) {
    return respondError(res, 400, 'STOREFRONT_AGENT_UPDATE_FAILED', 'Failed to update storefront agent profile.', {
      supabase_error: error.message
    });
  }

  return respondOk(
    res,
    toStoreAgentAdminDto(data),
    200,
    { store_scope: { store_id: scope.store.id, mode: scope.scope_mode } }
  );
});

export default router;
