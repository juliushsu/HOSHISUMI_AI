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

// API contract: country enum (canonical) for GET/POST /api/properties.
const COUNTRY_TYPES = new Set(['tw', 'jp']);
const PROPERTY_STATUS = new Set(['available', 'negotiating', 'sold']);
const LEGACY_PROPERTY_SOURCE = new Set(['manual', 'import', 'api']);
const SOURCE_TYPES = new Set(['manual', 'import', 'japan_line', 'japan_api']);
const INTAKE_STATUS = new Set(['imported', 'analyzing', 'pending_review', 'ready_to_publish', 'assigned']);
const PROPERTY_SELECT = [
  'id',
  'organization_id',
  'demo_data_type',
  'owner_agent_id',
  'owner_agent:agents!properties_owner_agent_id_fkey(id,name,role,is_active)',
  'partner_id',
  'partner:partners!properties_partner_id_fkey(id,display_name,status)',
  'title',
  'description',
  'price',
  'country',
  'status',
  // Phase 3 lifecycle fields:
  // - current_stage: lifecycle stage (buy/sell -> rental -> management)
  // - status: sale/listing status for legacy sale flow
  'service_types',
  'current_stage',
  'owner_client_id',
  'is_rental_enabled',
  'is_management_enabled',
  'source',
  'source_type',
  'source_partner',
  'cross_border_fee_percent',
  'intake_status',
  'raw_source_files_count',
  'updated_at',
  'images',
  'layout_image',
  'created_at'
].join(',');

const router = Router();

function isOwnerOrManager(role) {
  return role === 'owner' || role === 'manager';
}

function deriveSourceTypeFromLegacySource(source) {
  if (source === 'manual' || source === 'import') return source;
  if (source === 'api') return 'japan_api';
  return 'manual';
}

function deriveLegacySourceFromSourceType(sourceType) {
  if (sourceType === 'manual' || sourceType === 'import') return sourceType;
  return 'api';
}

async function validateOwnerAgent({ supabase, organizationId, ownerAgentId }) {
  if (!ownerAgentId) return { ok: true };

  const { data: ownerAgent, error } = await supabase
    .from('agents')
    .select('id, organization_id')
    .eq('id', ownerAgentId)
    .maybeSingle();

  if (error) {
    return {
      ok: false,
      status: 500,
      code: 'OWNER_AGENT_LOOKUP_FAILED',
      message: 'Failed to validate owner_agent_id.',
      details: { supabase_error: error.message }
    };
  }

  if (!ownerAgent || ownerAgent.organization_id !== organizationId) {
    return {
      ok: false,
      status: 400,
      code: 'INVALID_OWNER_AGENT',
      message: 'owner_agent_id must belong to an agent in the same organization.'
    };
  }

  return { ok: true };
}

async function validatePartner({ supabase, partnerId }) {
  if (!partnerId) return { ok: true };

  const { data: partner, error } = await supabase
    .from('partners')
    .select('id, status')
    .eq('id', partnerId)
    .maybeSingle();

  if (error) {
    return {
      ok: false,
      status: 500,
      code: 'PARTNER_LOOKUP_FAILED',
      message: 'Failed to validate partner_id.',
      details: { supabase_error: error.message }
    };
  }

  if (!partner) {
    return {
      ok: false,
      status: 400,
      code: 'INVALID_PARTNER',
      message: 'partner_id is invalid or not authorized for current organization.'
    };
  }

  if (partner.status !== 'active') {
    return {
      ok: false,
      status: 400,
      code: 'PARTNER_INACTIVE',
      message: 'partner_id must reference an active partner.'
    };
  }

  return { ok: true };
}

router.get('/', async (req, res) => {
  // Contract note:
  // - current_stage = lifecycle stage
  // - status = sale/listing status
  // Frontend display priority should be current_stage ?? status.
  const { supabase, auth } = req;
  const {
    status,
    country,
    owner_agent_id: ownerAgentId,
    source_type: sourceType,
    source_partner: sourcePartner,
    partner_id: partnerId,
    intake_status: intakeStatus
  } = req.query;

  let query = supabase
    .from('properties')
    .select(PROPERTY_SELECT)
    .order('created_at', { ascending: false });
  query = applyDemoReadScope(query, auth, 'organization_id');

  if (status) query = query.eq('status', status);
  if (country) query = query.eq('country', country);
  if (ownerAgentId) query = query.eq('owner_agent_id', ownerAgentId);
  if (partnerId) query = query.eq('partner_id', partnerId);
  if (sourceType) query = query.eq('source_type', sourceType);
  if (sourcePartner) query = query.eq('source_partner', sourcePartner);
  if (intakeStatus) query = query.eq('intake_status', intakeStatus);

  const { data, error } = await query;
  if (error) {
    return respondError(res, 500, 'PROPERTIES_FETCH_FAILED', 'Failed to fetch properties.', {
      supabase_error: error.message
    });
  }

  try {
    const previewMediaByPropertyId = await fetchIngestPreviewMediaByPropertyIds((data ?? []).map((row) => row.id));
    const rows = (data ?? []).map((row) => applyPropertyMediaFallback(row, previewMediaByPropertyId.get(row.id) ?? [], 'public'));
    return respondOk(res, rows);
  } catch (mediaError) {
    return respondError(res, 500, 'PROPERTY_MEDIA_ENRICH_FAILED', 'Failed to build property media previews.', {
      message: mediaError instanceof Error ? mediaError.message : 'Unknown property media error.'
    });
  }
});

router.post('/', async (req, res) => {
  const { supabase, auth } = req;
  const body = req.body || {};
  const targetOrganizationId = scopedOrganizationId(auth);

  if (!body.title || typeof body.title !== 'string') {
    return respondError(res, 400, 'INVALID_TITLE', 'title is required.');
  }

  if (typeof body.price !== 'number' || Number.isNaN(body.price) || body.price < 0) {
    return respondError(res, 400, 'INVALID_PRICE', 'price must be a non-negative number.');
  }

  if (!COUNTRY_TYPES.has(body.country)) {
    return respondError(res, 400, 'INVALID_COUNTRY', 'country must be tw/jp.');
  }

  if (!PROPERTY_STATUS.has(body.status)) {
    return respondError(res, 400, 'INVALID_STATUS', 'status must be available/negotiating/sold.');
  }

  if (body.source !== undefined && !LEGACY_PROPERTY_SOURCE.has(body.source)) {
    return respondError(res, 400, 'INVALID_SOURCE', 'source must be manual/import/api when provided.');
  }

  if (body.source_type !== undefined && !SOURCE_TYPES.has(body.source_type)) {
    return respondError(
      res,
      400,
      'INVALID_SOURCE_TYPE',
      'source_type must be manual/import/japan_line/japan_api when provided.'
    );
  }

  if (body.images !== undefined && !Array.isArray(body.images)) {
    return respondError(res, 400, 'INVALID_IMAGES', 'images must be an array when provided.');
  }

  if (body.layout_image !== undefined && body.layout_image !== null && typeof body.layout_image !== 'string') {
    return respondError(res, 400, 'INVALID_LAYOUT_IMAGE', 'layout_image must be a string when provided.');
  }

  if (
    body.partner_id !== undefined &&
    body.partner_id !== null &&
    typeof body.partner_id !== 'string'
  ) {
    return respondError(res, 400, 'INVALID_PARTNER', 'partner_id must be a UUID string when provided.');
  }

  if (
    body.source_partner !== undefined &&
    body.source_partner !== null &&
    typeof body.source_partner !== 'string'
  ) {
    return respondError(res, 400, 'INVALID_SOURCE_PARTNER', 'source_partner must be a string when provided.');
  }

  if (
    body.cross_border_fee_percent !== undefined &&
    (typeof body.cross_border_fee_percent !== 'number' ||
      Number.isNaN(body.cross_border_fee_percent) ||
      body.cross_border_fee_percent < 0)
  ) {
    return respondError(
      res,
      400,
      'INVALID_CROSS_BORDER_FEE',
      'cross_border_fee_percent must be a non-negative number when provided.'
    );
  }

  if (body.intake_status !== undefined && !INTAKE_STATUS.has(body.intake_status)) {
    return respondError(
      res,
      400,
      'INVALID_INTAKE_STATUS',
      'intake_status must be imported/analyzing/pending_review/ready_to_publish/assigned when provided.'
    );
  }

  if (
    body.raw_source_files_count !== undefined &&
    (!Number.isInteger(body.raw_source_files_count) || body.raw_source_files_count < 0)
  ) {
    return respondError(
      res,
      400,
      'INVALID_RAW_SOURCE_FILES_COUNT',
      'raw_source_files_count must be a non-negative integer when provided.'
    );
  }

  if (body.owner_agent_id !== undefined && body.owner_agent_id !== null && typeof body.owner_agent_id !== 'string') {
    return respondError(res, 400, 'INVALID_OWNER_AGENT', 'owner_agent_id must be a UUID string when provided.');
  }

  const ownerAgentCheck = await validateOwnerAgent({
    supabase,
    organizationId: targetOrganizationId,
    ownerAgentId: body.owner_agent_id
  });
  if (!ownerAgentCheck.ok) {
    return respondError(
      res,
      ownerAgentCheck.status,
      ownerAgentCheck.code,
      ownerAgentCheck.message,
      ownerAgentCheck.details ?? null
    );
  }

  const partnerCheck = await validatePartner({
    supabase,
    partnerId: body.partner_id
  });
  if (!partnerCheck.ok) {
    return respondError(
      res,
      partnerCheck.status,
      partnerCheck.code,
      partnerCheck.message,
      partnerCheck.details ?? null
    );
  }

  const normalizedSourceType = body.source_type ?? deriveSourceTypeFromLegacySource(body.source);
  const normalizedSource = body.source ?? deriveLegacySourceFromSourceType(normalizedSourceType);

  const insertPayload = applyDemoWriteDefaults({
    owner_agent_id: body.owner_agent_id ?? null,
    partner_id: body.partner_id ?? null,
    title: body.title,
    description: body.description ?? null,
    price: body.price,
    country: body.country,
    status: body.status,
    source: normalizedSource,
    source_type: normalizedSourceType,
    source_partner: body.source_partner ?? null,
    cross_border_fee_percent: body.cross_border_fee_percent ?? 1.0,
    intake_status: body.intake_status ?? 'imported',
    raw_source_files_count: body.raw_source_files_count ?? 0,
    images: body.images ?? [],
    layout_image: body.layout_image ?? null
  }, auth, 'organization_id');

  const { data, error } = await supabase
    .from('properties')
    .insert(insertPayload)
    .select(PROPERTY_SELECT)
    .single();

  if (error) {
    return respondError(res, 400, 'PROPERTY_CREATE_FAILED', 'Failed to create property.', {
      supabase_error: error.message
    });
  }

  return respondOk(res, data, 201);
});

router.patch('/:id/assign', async (req, res) => {
  const { supabase, auth } = req;
  const propertyId = req.params.id;
  const { organization_id: organizationId, owner_agent_id: ownerAgentId } = req.body || {};
  const targetOrganizationId = scopedOrganizationId(auth);

  if (!isOwnerOrManager(auth.role)) {
    return respondError(
      res,
      403,
      'ASSIGN_FORBIDDEN',
      'Only owner/manager can assign intake properties.'
    );
  }

  if (!auth.isDemo && (!organizationId || typeof organizationId !== 'string')) {
    return respondError(res, 400, 'INVALID_ORGANIZATION', 'organization_id is required.');
  }

  if (!ownerAgentId || typeof ownerAgentId !== 'string') {
    return respondError(res, 400, 'INVALID_OWNER_AGENT', 'owner_agent_id is required.');
  }

  if (!auth.isDemo && organizationId !== auth.organizationId) {
    return respondError(
      res,
      403,
      'CROSS_ORGANIZATION_ASSIGN_FORBIDDEN',
      'organization_id must match current authenticated organization.'
    );
  }

  const ownerAgentCheck = await validateOwnerAgent({
    supabase,
    organizationId: targetOrganizationId,
    ownerAgentId
  });
  if (!ownerAgentCheck.ok) {
    return respondError(
      res,
      ownerAgentCheck.status,
      ownerAgentCheck.code,
      ownerAgentCheck.message,
      ownerAgentCheck.details ?? null
    );
  }

  let existingQuery = supabase
    .from('properties')
    .select('id,demo_data_type')
    .eq('id', propertyId);
  existingQuery = applyDemoReadScope(existingQuery, auth, 'organization_id');
  const { data: existing, error: existingError } = await existingQuery.maybeSingle();

  if (existingError) {
    return respondError(res, 500, 'PROPERTY_LOOKUP_FAILED', 'Failed to verify property scope.', {
      supabase_error: existingError.message
    });
  }

  if (!existing) {
    return respondError(res, 404, 'PROPERTY_NOT_FOUND', 'Property not found.');
  }

  if (isDemoSeedRow(existing, auth)) {
    return respondError(res, 403, 'DEMO_SEED_IMMUTABLE', 'Demo seed data cannot be modified.');
  }

  let updateQuery = supabase
    .from('properties')
    .update({
      organization_id: targetOrganizationId,
      owner_agent_id: ownerAgentId,
      intake_status: 'assigned'
    })
    .eq('id', propertyId)
    .select(PROPERTY_SELECT);
  updateQuery = applyDemoReadScope(updateQuery, auth, 'organization_id');
  updateQuery = applyDemoUpdateGuard(updateQuery, auth);
  const { data, error } = await updateQuery.maybeSingle();

  if (error) {
    return respondError(res, 400, 'PROPERTY_ASSIGN_FAILED', 'Failed to assign property.', {
      supabase_error: error.message
    });
  }

  if (!data) return respondError(res, 404, 'PROPERTY_NOT_FOUND', 'Property not found.');

  return respondOk(res, data);
});

export default router;
