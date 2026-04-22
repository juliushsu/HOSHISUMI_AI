import { Router } from 'express';
import { respondError, respondOk } from '../lib/http.js';
import { applyDemoReadScope, applyDemoUpdateGuard, isDemoSeedRow, scopedOrganizationId } from '../services/demoScope.js';

const MANAGEMENT_STATUS = new Set(['active', 'vacancy', 'terminated']);
const MANAGEMENT_DETAIL_SELECT = [
  'id',
  'organization_id',
  'property_id',
  'owner_client_id',
  'rent',
  'rent_due_day',
  'management_fee',
  'lease_start',
  'lease_end',
  'status',
  'tenant_name',
  'created_by_agent_id',
  'updated_by_agent_id',
  'created_at',
  'updated_at',
  'property:properties!management_cases_property_id_fkey(id,title,current_stage,is_management_enabled)',
  'owner_client:clients!management_cases_owner_client_id_fkey(id,name)'
].join(',');

const MANAGEMENT_LIST_SELECT = [
  'id',
  'property_id',
  'owner_client_id',
  'rent',
  'rent_due_day',
  'management_fee',
  'lease_start',
  'lease_end',
  'status',
  'tenant_name',
  'updated_at',
  'property:properties!management_cases_property_id_fkey(id,title)',
  'owner_client:clients!management_cases_owner_client_id_fkey(id,name)'
].join(',');

const MANAGEMENT_EVENT_SELECT = [
  'id',
  'organization_id',
  'management_case_id',
  'event_type',
  'title',
  'description',
  'amount',
  'event_date',
  'created_by_agent_id',
  'created_at'
].join(',');

const router = Router();

async function getPropertyInOrg(supabase, organizationId, propertyId) {
  const { data, error } = await supabase
    .from('properties')
    .select('id, organization_id, demo_data_type')
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

function validateRentDueDay(value) {
  return value == null || (Number.isInteger(value) && value >= 1 && value <= 31);
}

function toManagementListItem(row) {
  const rawOwnerClientName = row.owner_client?.name;
  const ownerClientName =
    typeof rawOwnerClientName === 'string' && rawOwnerClientName.trim() !== ''
      ? rawOwnerClientName
      : null;

  return {
    id: row.id,
    property_id: row.property_id,
    property_title: row.property?.title ?? null,
    status: row.status,
    rent: row.rent,
    rent_due_day: row.rent_due_day,
    management_fee: row.management_fee,
    lease_start: row.lease_start,
    lease_end: row.lease_end,
    tenant_name: row.tenant_name,
    // Contract: always string|null, never empty string.
    owner_client_name: ownerClientName,
    updated_at: row.updated_at
  };
}

router.get('/', async (req, res) => {
  const { supabase, auth } = req;

  const { data, error } = await supabase
    .from('management_cases')
    .select(MANAGEMENT_LIST_SELECT)
    .eq('organization_id', auth.organizationId)
    .order('updated_at', { ascending: false });

  if (error) {
    return respondError(res, 500, 'MANAGEMENT_CASES_FETCH_FAILED', 'Failed to fetch management cases.', {
      supabase_error: error.message
    });
  }

  return respondOk(res, (data ?? []).map(toManagementListItem));
});

router.get('/:id', async (req, res) => {
  const { supabase, auth } = req;
  const id = req.params.id;

  const { data, error } = await supabase
    .from('management_cases')
    .select(MANAGEMENT_DETAIL_SELECT)
    .eq('id', id)
    .eq('organization_id', auth.organizationId)
    .maybeSingle();

  if (error) {
    return respondError(res, 500, 'MANAGEMENT_CASE_FETCH_FAILED', 'Failed to fetch management case.', {
      supabase_error: error.message
    });
  }

  if (!data) return respondError(res, 404, 'MANAGEMENT_CASE_NOT_FOUND', 'Management case not found.');

  const { data: events, error: eventsError } = await supabase
    .from('management_events')
    .select(MANAGEMENT_EVENT_SELECT)
    .eq('organization_id', auth.organizationId)
    .eq('management_case_id', id)
    .order('event_date', { ascending: false })
    .limit(10);

  if (eventsError) {
    return respondError(res, 500, 'MANAGEMENT_EVENTS_FETCH_FAILED', 'Failed to fetch management events.', {
      supabase_error: eventsError.message
    });
  }

  return respondOk(res, {
    ...data,
    recent_management_events: events ?? []
  });
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

  if (body.rent !== undefined && body.rent !== null && (typeof body.rent !== 'number' || Number.isNaN(body.rent))) {
    return respondError(res, 400, 'INVALID_RENT', 'rent must be a number when provided.');
  }

  if (body.management_fee !== undefined && body.management_fee !== null && (typeof body.management_fee !== 'number' || Number.isNaN(body.management_fee))) {
    return respondError(res, 400, 'INVALID_MANAGEMENT_FEE', 'management_fee must be a number when provided.');
  }

  if (!validateRentDueDay(body.rent_due_day)) {
    return respondError(res, 400, 'INVALID_RENT_DUE_DAY', 'rent_due_day must be an integer from 1 to 31.');
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
    .from('management_cases')
    .insert({
      organization_id: targetOrganizationId,
      property_id: body.property_id,
      owner_client_id: body.owner_client_id ?? null,
      rent: body.rent ?? null,
      rent_due_day: body.rent_due_day ?? null,
      management_fee: body.management_fee ?? null,
      lease_start: body.lease_start ?? null,
      lease_end: body.lease_end ?? null,
      tenant_name: body.tenant_name ?? null,
      created_by_agent_id: auth.agentId,
      updated_by_agent_id: auth.agentId
    })
    .select(MANAGEMENT_DETAIL_SELECT)
    .single();

  if (insertError) {
    return respondError(res, 400, 'MANAGEMENT_CASE_CREATE_FAILED', 'Failed to create management case.', {
      supabase_error: insertError.message
    });
  }

  let propertyUpdateQuery = supabase
    .from('properties')
    .update({
      owner_client_id: body.owner_client_id ?? null,
      is_management_enabled: true,
      current_stage: 'under_management'
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
      'Management case created, but failed to sync property lifecycle fields.',
      { supabase_error: propertyUpdateError.message, management_case_id: created.id }
    );
  }

  return respondOk(res, created, 201);
});

router.patch('/:id', async (req, res) => {
  const { supabase, auth } = req;
  const id = req.params.id;
  const body = req.body || {};
  const updates = {};

  if (body.rent !== undefined) {
    if (body.rent !== null && (typeof body.rent !== 'number' || Number.isNaN(body.rent))) {
      return respondError(res, 400, 'INVALID_RENT', 'rent must be a number or null.');
    }
    updates.rent = body.rent;
  }

  if (body.rent_due_day !== undefined) {
    if (!validateRentDueDay(body.rent_due_day)) {
      return respondError(res, 400, 'INVALID_RENT_DUE_DAY', 'rent_due_day must be an integer from 1 to 31 or null.');
    }
    updates.rent_due_day = body.rent_due_day;
  }

  if (body.management_fee !== undefined) {
    if (body.management_fee !== null && (typeof body.management_fee !== 'number' || Number.isNaN(body.management_fee))) {
      return respondError(res, 400, 'INVALID_MANAGEMENT_FEE', 'management_fee must be a number or null.');
    }
    updates.management_fee = body.management_fee;
  }

  if (body.lease_start !== undefined) updates.lease_start = body.lease_start;
  if (body.lease_end !== undefined) updates.lease_end = body.lease_end;

  if (body.status !== undefined) {
    if (!MANAGEMENT_STATUS.has(body.status)) {
      return respondError(res, 400, 'INVALID_STATUS', 'status must be active/vacancy/terminated.');
    }
    updates.status = body.status;
  }

  if (body.tenant_name !== undefined) updates.tenant_name = body.tenant_name;

  if (Object.keys(updates).length === 0) {
    return respondError(res, 400, 'NO_UPDATABLE_FIELDS', 'No updatable management fields were provided.');
  }

  updates.updated_by_agent_id = auth.agentId;

  const { data, error } = await supabase
    .from('management_cases')
    .update(updates)
    .eq('id', id)
    .eq('organization_id', auth.organizationId)
    .select(MANAGEMENT_DETAIL_SELECT)
    .maybeSingle();

  if (error) {
    return respondError(res, 400, 'MANAGEMENT_CASE_UPDATE_FAILED', 'Failed to update management case.', {
      supabase_error: error.message
    });
  }

  if (!data) return respondError(res, 404, 'MANAGEMENT_CASE_NOT_FOUND', 'Management case not found.');

  if (updates.status === 'vacancy') {
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
      .update({ current_stage: 'vacancy' })
      .eq('id', data.property_id);
    propertyUpdateQuery = applyDemoReadScope(propertyUpdateQuery, auth, 'organization_id');
    propertyUpdateQuery = applyDemoUpdateGuard(propertyUpdateQuery, auth);
    const { error: propertyUpdateError } = await propertyUpdateQuery;

    if (propertyUpdateError) {
      return respondError(
        res,
        500,
        'PROPERTY_STAGE_SYNC_FAILED',
        'Management case updated, but failed to sync property stage.',
        { supabase_error: propertyUpdateError.message, management_case_id: data.id }
      );
    }
  }

  return respondOk(res, data);
});

export default router;
