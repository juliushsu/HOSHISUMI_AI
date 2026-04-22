import { Router } from 'express';
import { respondError, respondOk } from '../lib/http.js';
import { applyDemoReadScope, applyDemoUpdateGuard, isDemoSeedRow, scopedOrganizationId } from '../services/demoScope.js';

// API contract: canonical rental stage grouping field = listing_status.
const LISTING_STATUS = new Set(['draft', 'listed', 'showing', 'negotiating', 'rented']);
const STAGES_ALLOWED_TO_MOVE_TO_RENTAL = new Set(['sale_active', 'sold', 'resale_ready']);

const RENTAL_LIST_SELECT = [
  'id',
  'property_id',
  'owner_client_id',
  'listing_status',
  'expected_rent',
  'actual_rent',
  'available_from',
  'rented_at',
  'updated_at',
  'property:properties!rental_cases_property_id_fkey(id,title,current_stage,source_partner)',
  'owner_client:clients!rental_cases_owner_client_id_fkey(id,name)'
].join(',');

const RENTAL_DETAIL_SELECT = [
  'id',
  'organization_id',
  'property_id',
  'owner_client_id',
  'listing_status',
  'expected_rent',
  'actual_rent',
  'available_from',
  'rented_at',
  'created_by_agent_id',
  'updated_by_agent_id',
  'created_at',
  'updated_at',
  'property:properties!rental_cases_property_id_fkey(id,title,current_stage,source_partner,is_rental_enabled)',
  'owner_client:clients!rental_cases_owner_client_id_fkey(id,name)'
].join(',');

const router = Router();

async function getPropertyInOrg(supabase, organizationId, propertyId) {
  const { data, error } = await supabase
    .from('properties')
    .select('id, organization_id, current_stage, demo_data_type')
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
      status: 404,
      code: 'PROPERTY_NOT_FOUND',
      message: 'Property not found in current organization scope.'
    };
  }

  return { ok: true, property: data };
}

async function validateOwnerClientInOrg(supabase, organizationId, ownerClientId) {
  if (!ownerClientId) return { ok: true };

  const { data, error } = await supabase
    .from('clients')
    .select('id, organization_id')
    .eq('id', ownerClientId)
    .maybeSingle();

  if (error) {
    return {
      ok: false,
      status: 500,
      code: 'OWNER_CLIENT_LOOKUP_FAILED',
      message: 'Failed to validate owner_client_id.',
      details: { supabase_error: error.message }
    };
  }

  if (!data || data.organization_id !== organizationId) {
    return {
      ok: false,
      status: 400,
      code: 'INVALID_OWNER_CLIENT',
      message: 'owner_client_id must belong to a client in the same organization.'
    };
  }

  return { ok: true };
}

function toRentalListItem(row) {
  return {
    id: row.id,
    property_id: row.property_id,
    property_title: row.property?.title ?? null,
    listing_status: row.listing_status,
    expected_rent: row.expected_rent,
    actual_rent: row.actual_rent,
    available_from: row.available_from,
    owner_client_id: row.owner_client_id,
    owner_client_name: row.owner_client?.name ?? null,
    current_stage: row.property?.current_stage ?? null,
    source_partner: row.property?.source_partner ?? null,
    updated_at: row.updated_at
  };
}

router.get('/', async (req, res) => {
  // Contract note:
  // - listing_status is the canonical field for Rental stage grouping.
  // - enum is fixed by DB + route validation: draft/listed/showing/negotiating/rented.
  const { supabase, auth } = req;

  const { data, error } = await supabase
    .from('rental_cases')
    .select(RENTAL_LIST_SELECT)
    .eq('organization_id', auth.organizationId)
    .order('updated_at', { ascending: false });

  if (error) {
    return respondError(res, 500, 'RENTAL_CASES_FETCH_FAILED', 'Failed to fetch rental cases.', {
      supabase_error: error.message
    });
  }

  return respondOk(res, (data ?? []).map(toRentalListItem));
});

router.get('/:id', async (req, res) => {
  const { supabase, auth } = req;
  const id = req.params.id;

  const { data, error } = await supabase
    .from('rental_cases')
    .select(RENTAL_DETAIL_SELECT)
    .eq('id', id)
    .eq('organization_id', auth.organizationId)
    .maybeSingle();

  if (error) {
    return respondError(res, 500, 'RENTAL_CASE_FETCH_FAILED', 'Failed to fetch rental case.', {
      supabase_error: error.message
    });
  }

  if (!data) return respondError(res, 404, 'RENTAL_CASE_NOT_FOUND', 'Rental case not found.');
  return respondOk(res, data);
});

router.post('/', async (req, res) => {
  const { supabase, auth } = req;
  const body = req.body || {};
  const targetOrganizationId = scopedOrganizationId(auth);

  if (!body.property_id || typeof body.property_id !== 'string') {
    return respondError(res, 400, 'INVALID_PROPERTY_ID', 'property_id is required.');
  }

  if (body.owner_client_id !== undefined && body.owner_client_id !== null && typeof body.owner_client_id !== 'string') {
    return respondError(res, 400, 'INVALID_OWNER_CLIENT', 'owner_client_id must be a UUID string when provided.');
  }

  if (body.expected_rent !== undefined && body.expected_rent !== null && (typeof body.expected_rent !== 'number' || Number.isNaN(body.expected_rent))) {
    return respondError(res, 400, 'INVALID_EXPECTED_RENT', 'expected_rent must be a number when provided.');
  }

  if (body.available_from !== undefined && body.available_from !== null && typeof body.available_from !== 'string') {
    return respondError(res, 400, 'INVALID_AVAILABLE_FROM', 'available_from must be a date string when provided.');
  }

  const propertyCheck = await getPropertyInOrg(supabase, targetOrganizationId, body.property_id);
  if (!propertyCheck.ok) {
    return respondError(
      res,
      propertyCheck.status,
      propertyCheck.code,
      propertyCheck.message,
      propertyCheck.details ?? null
    );
  }
  if (isDemoSeedRow(propertyCheck.property, auth)) {
    return respondError(res, 403, 'DEMO_SEED_IMMUTABLE', 'Demo seed data cannot be modified.');
  }

  const ownerClientCheck = await validateOwnerClientInOrg(supabase, targetOrganizationId, body.owner_client_id ?? null);
  if (!ownerClientCheck.ok) {
    return respondError(
      res,
      ownerClientCheck.status,
      ownerClientCheck.code,
      ownerClientCheck.message,
      ownerClientCheck.details ?? null
    );
  }

  const { data: created, error: insertError } = await supabase
    .from('rental_cases')
    .insert({
      organization_id: targetOrganizationId,
      property_id: body.property_id,
      owner_client_id: body.owner_client_id ?? null,
      expected_rent: body.expected_rent ?? null,
      available_from: body.available_from ?? null,
      created_by_agent_id: auth.agentId,
      updated_by_agent_id: auth.agentId
    })
    .select(RENTAL_DETAIL_SELECT)
    .single();

  if (insertError) {
    return respondError(res, 400, 'RENTAL_CASE_CREATE_FAILED', 'Failed to create rental case.', {
      supabase_error: insertError.message
    });
  }

  const stage = propertyCheck.property.current_stage;
  const nextStage =
    !stage || STAGES_ALLOWED_TO_MOVE_TO_RENTAL.has(stage)
      ? 'rental_listing'
      : stage;

  let propertyUpdateQuery = supabase
    .from('properties')
    .update({
      owner_client_id: body.owner_client_id ?? null,
      is_rental_enabled: true,
      current_stage: nextStage
    })
    .eq('id', body.property_id);
  propertyUpdateQuery = applyDemoReadScope(propertyUpdateQuery, auth, 'organization_id');
  propertyUpdateQuery = applyDemoUpdateGuard(propertyUpdateQuery, auth);
  const { error: propertyUpdateError } = await propertyUpdateQuery;

  if (propertyUpdateError) {
    return respondError(
      res,
      500,
      'PROPERTY_SYNC_FAILED',
      'Rental case created, but failed to sync property lifecycle fields.',
      { supabase_error: propertyUpdateError.message, rental_case_id: created.id }
    );
  }

  return respondOk(res, created, 201);
});

router.patch('/:id', async (req, res) => {
  const { supabase, auth } = req;
  const id = req.params.id;
  const body = req.body || {};

  const updates = {};

  if (body.listing_status !== undefined) {
    if (!LISTING_STATUS.has(body.listing_status)) {
      return respondError(
        res,
        400,
        'INVALID_LISTING_STATUS',
        'listing_status must be draft/listed/showing/negotiating/rented.'
      );
    }
    updates.listing_status = body.listing_status;
  }

  if (body.expected_rent !== undefined) {
    if (body.expected_rent !== null && (typeof body.expected_rent !== 'number' || Number.isNaN(body.expected_rent))) {
      return respondError(res, 400, 'INVALID_EXPECTED_RENT', 'expected_rent must be a number or null.');
    }
    updates.expected_rent = body.expected_rent;
  }

  if (body.actual_rent !== undefined) {
    if (body.actual_rent !== null && (typeof body.actual_rent !== 'number' || Number.isNaN(body.actual_rent))) {
      return respondError(res, 400, 'INVALID_ACTUAL_RENT', 'actual_rent must be a number or null.');
    }
    updates.actual_rent = body.actual_rent;
  }

  if (body.available_from !== undefined) {
    if (body.available_from !== null && typeof body.available_from !== 'string') {
      return respondError(res, 400, 'INVALID_AVAILABLE_FROM', 'available_from must be a date string or null.');
    }
    updates.available_from = body.available_from;
  }

  if (body.rented_at !== undefined) {
    if (body.rented_at !== null && typeof body.rented_at !== 'string') {
      return respondError(res, 400, 'INVALID_RENTED_AT', 'rented_at must be an ISO datetime string or null.');
    }
    updates.rented_at = body.rented_at;
  }

  if (Object.keys(updates).length === 0) {
    return respondError(res, 400, 'NO_UPDATABLE_FIELDS', 'No updatable rental fields were provided.');
  }

  updates.updated_by_agent_id = auth.agentId;

  const { data, error } = await supabase
    .from('rental_cases')
    .update(updates)
    .eq('id', id)
    .eq('organization_id', auth.organizationId)
    .select(RENTAL_DETAIL_SELECT)
    .maybeSingle();

  if (error) {
    return respondError(res, 400, 'RENTAL_CASE_UPDATE_FAILED', 'Failed to update rental case.', {
      supabase_error: error.message
    });
  }

  if (!data) return respondError(res, 404, 'RENTAL_CASE_NOT_FOUND', 'Rental case not found.');

  if (updates.listing_status === 'rented') {
    const propertyCheck = await getPropertyInOrg(supabase, scopedOrganizationId(auth), data.property_id);
    if (!propertyCheck.ok) {
      return respondError(
        res,
        propertyCheck.status,
        propertyCheck.code,
        propertyCheck.message,
        propertyCheck.details ?? null
      );
    }
    if (isDemoSeedRow(propertyCheck.property, auth)) {
      return respondError(res, 403, 'DEMO_SEED_IMMUTABLE', 'Demo seed data cannot be modified.');
    }

    let propertyUpdateQuery = supabase
      .from('properties')
      .update({ current_stage: 'rented' })
      .eq('id', data.property_id);
    propertyUpdateQuery = applyDemoReadScope(propertyUpdateQuery, auth, 'organization_id');
    propertyUpdateQuery = applyDemoUpdateGuard(propertyUpdateQuery, auth);
    const { error: propertyUpdateError } = await propertyUpdateQuery;

    if (propertyUpdateError) {
      return respondError(
        res,
        500,
        'PROPERTY_STAGE_SYNC_FAILED',
        'Rental case updated, but failed to sync property stage.',
        { supabase_error: propertyUpdateError.message, rental_case_id: data.id }
      );
    }
  }

  return respondOk(res, data);
});

export default router;
