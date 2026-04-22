import { Router } from 'express';
import { createPublicSupabase } from '../lib/supabase.js';
import { respondError, respondOk } from '../lib/http.js';

const PURPOSE_ENUM = new Set(['sale', 'rental', 'management']);
const LEAD_SOURCE_TYPE_ENUM = new Set(['qr', 'agent_page', 'store_contact', 'property_inquiry', 'direct']);
const LEAD_CONTACT_METHOD_ENUM = new Set(['phone', 'email', 'line']);

const STOREFRONT_STORE_SELECT = [
  'id',
  'name',
  'slug',
  'theme_key',
  'theme_overrides',
  'city',
  'district',
  'tagline',
  'introduction',
  'phone',
  'address',
  'line_url',
  'business_hours',
  'logo_url',
  'cover_image_url'
].join(',');

const STOREFRONT_SERVICE_SELECT = [
  'id',
  'service_type',
  'buy',
  'sell',
  'rental',
  'management',
  'consultation',
  'title',
  'description',
  'sort_order'
].join(',');

const STOREFRONT_AGENT_SELECT = [
  'id',
  'name',
  'slug',
  'bio',
  'service_area',
  'avatar_url',
  'phone_public',
  'line_url'
].join(',');

const STOREFRONT_PROPERTY_NESTED_SELECT = [
  'id',
  'title',
  'description',
  'price',
  'status',
  'current_stage',
  'images',
  'layout_image'
].join(',');

const STOREFRONT_PUBLICATION_SELECT = [
  'id',
  'purpose',
  'publication_type',
  'featured',
  'normal',
  'display_order',
  `property:properties!store_property_publications_property_id_fkey(${STOREFRONT_PROPERTY_NESTED_SELECT})`
].join(',');

const supabase = createPublicSupabase();
const router = Router();

function parsePaging(rawLimit, rawPage) {
  const limit = Number.parseInt(String(rawLimit ?? '12'), 10);
  const page = Number.parseInt(String(rawPage ?? '1'), 10);
  const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.min(limit, 50) : 12;
  const safePage = Number.isFinite(page) && page > 0 ? page : 1;
  return { limit: safeLimit, page: safePage };
}

function normalizeOptionalText(value, maxLen = 5000) {
  if (value == null) return null;
  if (typeof value !== 'string') return undefined;

  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > maxLen ? trimmed.slice(0, maxLen) : trimmed;
}

function isPublicationLive(row) {
  const now = Date.now();
  const publishedAt = row.published_at ? new Date(row.published_at).getTime() : null;
  const unpublishedAt = row.unpublished_at ? new Date(row.unpublished_at).getTime() : null;
  const publishedPass = publishedAt == null || publishedAt <= now;
  const unpublishedPass = unpublishedAt == null || unpublishedAt > now;
  return publishedPass && unpublishedPass;
}

function deriveDisplayStage(currentStage, status) {
  return currentStage ?? status ?? null;
}

function derivePurposeFromStage(currentStage) {
  if (typeof currentStage !== 'string') return 'sale';
  if (currentStage.startsWith('rental_') || currentStage === 'rented') return 'rental';
  if (currentStage === 'under_management' || currentStage === 'vacancy') return 'management';
  return 'sale';
}

function pickCoverImageUrl(propertyRow) {
  const firstImage = Array.isArray(propertyRow.images) ? propertyRow.images[0] : null;
  if (typeof firstImage === 'string' && firstImage.trim() !== '') return firstImage;
  if (typeof propertyRow.layout_image === 'string' && propertyRow.layout_image.trim() !== '') {
    return propertyRow.layout_image;
  }
  return null;
}

function toStorePublicDto(storeRow) {
  return {
    id: storeRow.id,
    name: storeRow.name,
    slug: storeRow.slug,
    theme_key: storeRow.theme_key,
    theme_overrides: storeRow.theme_overrides ?? {},
    city: storeRow.city ?? null,
    district: storeRow.district ?? null,
    tagline: storeRow.tagline ?? null,
    introduction: storeRow.introduction ?? null,
    phone: storeRow.phone ?? null,
    address: storeRow.address ?? null,
    line_url: storeRow.line_url ?? null,
    business_hours: storeRow.business_hours ?? null,
    cover_image_url: storeRow.cover_image_url ?? null,
    logo_url: storeRow.logo_url ?? null
  };
}

function toServicePublicDto(serviceRow) {
  return {
    id: serviceRow.id,
    service_type: serviceRow.service_type,
    buy: serviceRow.buy,
    sell: serviceRow.sell,
    rental: serviceRow.rental,
    management: serviceRow.management,
    consultation: serviceRow.consultation,
    title: serviceRow.title,
    description: serviceRow.description ?? null,
    sort_order: serviceRow.sort_order ?? 0
  };
}

function toAgentPublicDto(agentRow) {
  return {
    id: agentRow.id,
    name: agentRow.name,
    slug: agentRow.slug,
    bio: agentRow.bio ?? null,
    service_area: agentRow.service_area ?? null,
    avatar_url: agentRow.avatar_url ?? null,
    phone_public: agentRow.phone_public ?? null,
    line_url: agentRow.line_url ?? null
  };
}

function toPublicPropertyItem({ propertyRow, purpose, district, isFeatured }) {
  const currentStage = propertyRow.current_stage ?? null;
  const status = propertyRow.status ?? null;

  return {
    id: propertyRow.id,
    title: propertyRow.title,
    purpose,
    district: district ?? null,
    price: propertyRow.price,
    cover_image_url: pickCoverImageUrl(propertyRow),
    current_stage: currentStage,
    status,
    // Canonical storefront display field.
    display_stage: deriveDisplayStage(currentStage, status),
    is_featured: Boolean(isFeatured)
  };
}

async function getActiveStoreBySlug(storeSlug) {
  const { data, error } = await supabase
    .from('stores')
    .select(`${STOREFRONT_STORE_SELECT},organization_id`)
    .eq('slug', storeSlug)
    .eq('is_active', true)
    .maybeSingle();

  if (error) {
    return {
      ok: false,
      status: 500,
      code: 'STOREFRONT_STORE_LOOKUP_FAILED',
      message: 'Failed to load storefront store profile.',
      details: { supabase_error: error.message }
    };
  }

  if (!data) {
    return {
      ok: false,
      status: 404,
      code: 'STOREFRONT_NOT_FOUND',
      message: 'Storefront not found.'
    };
  }

  return { ok: true, store: toStorePublicDto(data), store_row: data };
}

async function getEnabledServices(storeId) {
  const { data, error } = await supabase
    .from('store_services')
    .select(STOREFRONT_SERVICE_SELECT)
    .eq('store_id', storeId)
    .eq('is_enabled', true)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) {
    return {
      ok: false,
      status: 500,
      code: 'STOREFRONT_SERVICES_FETCH_FAILED',
      message: 'Failed to load storefront services.',
      details: { supabase_error: error.message }
    };
  }

  return { ok: true, services: (data ?? []).map(toServicePublicDto) };
}

async function getPublicAgents(storeId) {
  const { data, error } = await supabase
    .from('agents')
    .select(STOREFRONT_AGENT_SELECT)
    .eq('store_id', storeId)
    .eq('is_active', true)
    .eq('is_public', true)
    .order('created_at', { ascending: true });

  if (error) {
    return {
      ok: false,
      status: 500,
      code: 'STOREFRONT_AGENTS_FETCH_FAILED',
      message: 'Failed to load storefront agents.',
      details: { supabase_error: error.message }
    };
  }

  return { ok: true, agents: (data ?? []).map(toAgentPublicDto) };
}

async function getPublicProperties({ storeId, storeDistrict = null, purpose = null, publicationType = null }) {
  let query = supabase
    .from('store_property_publications')
    .select(`${STOREFRONT_PUBLICATION_SELECT},published_at,unpublished_at,is_public`)
    .eq('store_id', storeId)
    .eq('is_public', true)
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: false });

  if (purpose) query = query.eq('purpose', purpose);
  if (publicationType) query = query.eq('publication_type', publicationType);

  const { data, error } = await query;
  if (error) {
    return {
      ok: false,
      status: 500,
      code: 'STOREFRONT_PROPERTIES_FETCH_FAILED',
      message: 'Failed to load storefront properties.',
      details: { supabase_error: error.message }
    };
  }

  const items = (data ?? [])
    .filter((row) => row.property && isPublicationLive(row))
    .map((row) =>
      toPublicPropertyItem({
        propertyRow: row.property,
        purpose: row.purpose ?? derivePurposeFromStage(row.property.current_stage),
        district: storeDistrict,
        isFeatured: row.publication_type === 'featured' || row.featured === true
      })
    );

  return { ok: true, properties: items };
}

router.get('/:storeSlug', async (req, res) => {
  // Contract: storefront home payload = store profile + enabled services + featured properties + public agents.
  const { storeSlug } = req.params;

  const storeCheck = await getActiveStoreBySlug(storeSlug);
  if (!storeCheck.ok) {
    return respondError(
      res,
      storeCheck.status,
      storeCheck.code,
      storeCheck.message,
      storeCheck.details ?? null
    );
  }

  const [servicesResult, featuredPropertiesResult, agentsResult] = await Promise.all([
    getEnabledServices(storeCheck.store.id),
    getPublicProperties({
      storeId: storeCheck.store.id,
      storeDistrict: storeCheck.store.district,
      publicationType: 'featured'
    }),
    getPublicAgents(storeCheck.store.id)
  ]);

  if (!servicesResult.ok || !featuredPropertiesResult.ok || !agentsResult.ok) {
    return respondError(res, 500, 'STOREFRONT_FETCH_FAILED', 'Failed to load storefront home.', {
      services_error: servicesResult.details?.supabase_error ?? null,
      featured_properties_error: featuredPropertiesResult.details?.supabase_error ?? null,
      agents_error: agentsResult.details?.supabase_error ?? null
    });
  }

  return respondOk(res, {
    store: storeCheck.store,
    services: servicesResult.services,
    featured_properties: featuredPropertiesResult.properties,
    public_agents: agentsResult.agents
  });
});

router.get('/:storeSlug/properties', async (req, res) => {
  // Canonical filter fields:
  // - purpose: sale|rental|management
  // - district: temporary text match against title/district
  const { storeSlug } = req.params;
  const { purpose, district } = req.query;
  const { limit, page } = parsePaging(req.query.limit, req.query.page);

  if (purpose && !PURPOSE_ENUM.has(String(purpose))) {
    return respondError(
      res,
      400,
      'INVALID_PURPOSE',
      'purpose must be sale/rental/management when provided.'
    );
  }

  const storeCheck = await getActiveStoreBySlug(storeSlug);
  if (!storeCheck.ok) {
    return respondError(
      res,
      storeCheck.status,
      storeCheck.code,
      storeCheck.message,
      storeCheck.details ?? null
    );
  }

  const propertiesResult = await getPublicProperties({
    storeId: storeCheck.store.id,
    storeDistrict: storeCheck.store.district,
    purpose: purpose ? String(purpose) : null
  });
  if (!propertiesResult.ok) {
    return respondError(
      res,
      propertiesResult.status,
      propertiesResult.code,
      propertiesResult.message,
      propertiesResult.details ?? null
    );
  }

  const districtText = typeof district === 'string' ? district.trim().toLowerCase() : '';
  const districtFiltered = districtText
    ? propertiesResult.properties.filter((item) => {
        const title = String(item.title ?? '').toLowerCase();
        const districtName = String(item.district ?? '').toLowerCase();
        return title.includes(districtText) || districtName.includes(districtText);
      })
    : propertiesResult.properties;

  const total = districtFiltered.length;
  const from = (page - 1) * limit;
  const to = from + limit;
  const paged = districtFiltered.slice(from, to);

  return respondOk(
    res,
    paged,
    200,
    {
      page,
      limit,
      total,
      total_pages: total === 0 ? 0 : Math.ceil(total / limit)
    }
  );
});

router.get('/:storeSlug/services', async (req, res) => {
  const { storeSlug } = req.params;

  const storeCheck = await getActiveStoreBySlug(storeSlug);
  if (!storeCheck.ok) {
    return respondError(
      res,
      storeCheck.status,
      storeCheck.code,
      storeCheck.message,
      storeCheck.details ?? null
    );
  }

  const servicesResult = await getEnabledServices(storeCheck.store.id);
  if (!servicesResult.ok) {
    return respondError(
      res,
      servicesResult.status,
      servicesResult.code,
      servicesResult.message,
      servicesResult.details ?? null
    );
  }

  return respondOk(res, servicesResult.services);
});

router.get('/:storeSlug/agents', async (req, res) => {
  const { storeSlug } = req.params;

  const storeCheck = await getActiveStoreBySlug(storeSlug);
  if (!storeCheck.ok) {
    return respondError(
      res,
      storeCheck.status,
      storeCheck.code,
      storeCheck.message,
      storeCheck.details ?? null
    );
  }

  const agentsResult = await getPublicAgents(storeCheck.store.id);
  if (!agentsResult.ok) {
    return respondError(
      res,
      agentsResult.status,
      agentsResult.code,
      agentsResult.message,
      agentsResult.details ?? null
    );
  }

  return respondOk(res, agentsResult.agents);
});

router.get('/:storeSlug/agents/:agentSlug', async (req, res) => {
  const { storeSlug, agentSlug } = req.params;

  const storeCheck = await getActiveStoreBySlug(storeSlug);
  if (!storeCheck.ok) {
    return respondError(
      res,
      storeCheck.status,
      storeCheck.code,
      storeCheck.message,
      storeCheck.details ?? null
    );
  }

  const { data: agent, error: agentError } = await supabase
    .from('agents')
    .select(STOREFRONT_AGENT_SELECT)
    .eq('store_id', storeCheck.store.id)
    .eq('slug', agentSlug)
    .eq('is_active', true)
    .eq('is_public', true)
    .maybeSingle();

  if (agentError) {
    return respondError(res, 500, 'STOREFRONT_AGENT_FETCH_FAILED', 'Failed to load storefront agent.', {
      supabase_error: agentError.message
    });
  }

  if (!agent) {
    return respondError(res, 404, 'STOREFRONT_AGENT_NOT_FOUND', 'Storefront agent not found.');
  }

  const { data: publicationRows, error: publicationError } = await supabase
    .from('agent_publications')
    .select(
      `is_featured,display_order,property:properties!agent_publications_property_id_fkey(${STOREFRONT_PROPERTY_NESTED_SELECT})`
    )
    .eq('agent_id', agent.id)
    .eq('is_public', true)
    .order('is_featured', { ascending: false })
    .order('display_order', { ascending: true })
    .limit(12);

  if (publicationError) {
    return respondError(res, 500, 'STOREFRONT_AGENT_PUBLICATIONS_FETCH_FAILED', 'Failed to load agent publications.', {
      supabase_error: publicationError.message
    });
  }

  const publishedProperties = (publicationRows ?? [])
    .filter((row) => row.property)
    .map((row) =>
      toPublicPropertyItem({
        propertyRow: row.property,
        purpose: derivePurposeFromStage(row.property.current_stage),
        district: storeCheck.store.district,
        isFeatured: row.is_featured ?? false
      })
    );

  return respondOk(res, {
    agent: toAgentPublicDto(agent),
    published_properties: publishedProperties
  });
});

router.post('/:storeSlug/leads', async (req, res) => {
  const { storeSlug } = req.params;
  const body = req.body || {};

  const storeCheck = await getActiveStoreBySlug(storeSlug);
  if (!storeCheck.ok) {
    return respondError(
      res,
      storeCheck.status,
      storeCheck.code,
      storeCheck.message,
      storeCheck.details ?? null
    );
  }

  const sourceType = normalizeOptionalText(body.source_type, 60);
  if (!sourceType || !LEAD_SOURCE_TYPE_ENUM.has(sourceType)) {
    return respondError(
      res,
      400,
      'INVALID_SOURCE_TYPE',
      'source_type must be qr/agent_page/store_contact/property_inquiry/direct.'
    );
  }

  const agentSlug = normalizeOptionalText(body.agent_slug, 120);
  const customerName = normalizeOptionalText(body.customer_name, 120);
  const phone = normalizeOptionalText(body.phone, 40);
  const email = normalizeOptionalText(body.email, 254);
  const lineId = normalizeOptionalText(body.line_id, 120);
  const preferredContactMethod = normalizeOptionalText(body.preferred_contact_method, 20);
  const inquiryMessage = normalizeOptionalText(body.inquiry_message, 5000);
  const sourceCode = normalizeOptionalText(body.source_code, 200);
  const propertyId = normalizeOptionalText(body.property_id, 120);

  if (!customerName) {
    return respondError(res, 400, 'INVALID_CUSTOMER_NAME', 'customer_name is required.');
  }

  if (!phone && !email && !lineId) {
    return respondError(res, 400, 'MISSING_CONTACT', 'phone/email/line_id at least one is required.');
  }

  if (body.preferred_contact_method != null) {
    if (!preferredContactMethod || !LEAD_CONTACT_METHOD_ENUM.has(preferredContactMethod)) {
      return respondError(
        res,
        400,
        'INVALID_PREFERRED_CONTACT_METHOD',
        'preferred_contact_method must be phone/email/line when provided.'
      );
    }
  }

  if (
    (body.agent_slug != null && agentSlug === undefined) ||
    (body.property_id != null && propertyId === undefined) ||
    (body.source_code != null && sourceCode === undefined) ||
    (body.customer_name != null && customerName === undefined) ||
    (body.phone != null && phone === undefined) ||
    (body.email != null && email === undefined) ||
    (body.line_id != null && lineId === undefined) ||
    (body.preferred_contact_method != null && preferredContactMethod === undefined) ||
    (body.inquiry_message != null && inquiryMessage === undefined)
  ) {
    return respondError(res, 400, 'INVALID_FIELD_TYPE', 'lead fields must be strings when provided.');
  }

  let resolvedAgentId = null;
  if (agentSlug) {
    const { data: agent, error: agentError } = await supabase
      .from('agents')
      .select('id')
      .eq('store_id', storeCheck.store.id)
      .eq('slug', agentSlug)
      .eq('is_active', true)
      .eq('is_public', true)
      .maybeSingle();

    if (agentError) {
      return respondError(res, 500, 'LEAD_AGENT_LOOKUP_FAILED', 'Failed to validate agent attribution.', {
        supabase_error: agentError.message
      });
    }

    if (!agent) {
      return respondError(
        res,
        400,
        'INVALID_AGENT_SLUG',
        'agent_slug must belong to a public active agent in current store.'
      );
    }

    resolvedAgentId = agent.id;
  }

  if (propertyId) {
    const { data: property, error: propertyError } = await supabase
      .from('store_property_publications')
      .select('property_id')
      .eq('store_id', storeCheck.store.id)
      .eq('property_id', propertyId)
      .eq('is_public', true)
      .limit(1)
      .maybeSingle();

    if (propertyError) {
      return respondError(res, 500, 'LEAD_PROPERTY_LOOKUP_FAILED', 'Failed to validate property attribution.', {
        supabase_error: propertyError.message
      });
    }

    if (!property) {
      return respondError(
        res,
        400,
        'INVALID_PROPERTY_ID',
        'property_id must belong to current storefront publication scope.'
      );
    }
  }

  const preferredMethod = preferredContactMethod ?? (lineId ? 'line' : email ? 'email' : 'phone');

  const leadPayload = {
    organization_id: storeCheck.store_row?.organization_id ?? null,
    store_id: storeCheck.store.id,
    agent_id: resolvedAgentId,
    property_id: propertyId,
    source_type: sourceType,
    source_code: sourceCode,
    source_store_slug: storeSlug,
    source_agent_slug: agentSlug,
    customer_name: customerName,
    name: customerName,
    phone,
    email,
    line_id: lineId,
    preferred_contact_method: preferredMethod,
    inquiry_message: inquiryMessage,
    message: inquiryMessage,
    status: 'new'
  };

  const { data: createdLead, error: leadError } = await supabase
    .from('leads')
    .insert(leadPayload)
    .select('id,store_id,agent_id,property_id,source_type,status,created_at')
    .single();

  if (leadError) {
    return respondError(res, 500, 'LEAD_CREATE_FAILED', 'Failed to create storefront lead.', {
      supabase_error: leadError.message
    });
  }

  const { error: leadEventError } = await supabase
    .from('lead_events')
    .insert({
      lead_id: createdLead.id,
      event_type: 'lead_created',
      payload: {
        source_type: sourceType,
        store_slug: storeSlug,
        agent_slug: agentSlug,
        property_id: propertyId
      }
    });

  if (leadEventError) {
    return respondError(
      res,
      500,
      'LEAD_EVENT_CREATE_FAILED',
      'Lead created, but failed to create lead event.',
      { supabase_error: leadEventError.message, lead_id: createdLead.id }
    );
  }

  return respondOk(res, createdLead, 201);
});

export default router;
