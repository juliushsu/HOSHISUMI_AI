import { Router } from 'express';
import { respondError, respondOk } from '../lib/http.js';
import { applyDemoReadScope, applyDemoUpdateGuard, applyDemoWriteDefaults, isDemoSeedRow } from '../services/demoScope.js';

const CLIENT_TYPES = new Set(['investment', 'self_use', 'japan']);
const CONSENT_FIELDS = [
  'consent_property_tw',
  'consent_property_jp',
  'consent_contact_line',
  'consent_contact_phone',
  'consent_post_sale_follow',
  'unsubscribe_all'
];
const EDITABLE_FIELDS = [
  'assigned_agent_id',
  'name',
  'phone',
  'line_id',
  'client_type',
  ...CONSENT_FIELDS,
  'consent_timestamp',
  'consent_source'
];
const CLIENT_SELECT = [
  'id',
  'organization_id',
  'demo_data_type',
  'assigned_agent_id',
  'assigned_agent:agents!clients_assigned_agent_id_fkey(id,name,role,is_active)',
  'name',
  'phone',
  'line_id',
  'client_type',
  'consent_property_tw',
  'consent_property_jp',
  'consent_contact_line',
  'consent_contact_phone',
  'consent_post_sale_follow',
  'unsubscribe_all',
  'consent_timestamp',
  'consent_source',
  'created_at'
].join(',');

function isOwnerOrManager(role) {
  return role === 'owner' || role === 'manager';
}

function sanitizePayload(body) {
  const payload = {};
  for (const field of EDITABLE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(body, field)) {
      payload[field] = body[field];
    }
  }
  return payload;
}

function containsConsentChanges(payload) {
  return CONSENT_FIELDS.some((field) => Object.prototype.hasOwnProperty.call(payload, field));
}

async function validateAssignedAgent({ supabase, organizationId, assignedAgentId }) {
  if (!assignedAgentId) return { ok: true };

  const { data: assignedAgent, error } = await supabase
    .from('agents')
    .select('id, organization_id, is_active')
    .eq('id', assignedAgentId)
    .maybeSingle();

  if (error) {
    return {
      ok: false,
      status: 500,
      code: 'AGENT_LOOKUP_FAILED',
      message: 'Failed to validate assigned agent.',
      details: { supabase_error: error.message }
    };
  }

  if (!assignedAgent || !assignedAgent.is_active || assignedAgent.organization_id !== organizationId) {
    return {
      ok: false,
      status: 400,
      code: 'INVALID_ASSIGNED_AGENT',
      message: 'assigned_agent_id must belong to an active agent in the same organization.'
    };
  }

  return { ok: true };
}

const router = Router();

router.get('/', async (req, res) => {
  const { supabase, auth } = req;
  const { assigned_agent_id: assignedAgentId, q } = req.query;

  let query = supabase
    .from('clients')
    .select(CLIENT_SELECT)
    .order('created_at', { ascending: false });
  query = applyDemoReadScope(query, auth, 'organization_id');

  if (!isOwnerOrManager(auth.role)) {
    query = query.eq('assigned_agent_id', auth.agentId);
  } else if (assignedAgentId) {
    query = query.eq('assigned_agent_id', assignedAgentId);
  }

  if (q) {
    query = query.ilike('name', `%${q}%`);
  }

  const { data, error } = await query;
  if (error) {
    return respondError(res, 500, 'CLIENTS_FETCH_FAILED', 'Failed to fetch clients.', {
      supabase_error: error.message
    });
  }

  return respondOk(res, data);
});

router.post('/', async (req, res) => {
  const { supabase, auth } = req;
  const payload = sanitizePayload(req.body || {});

  if (!payload.name || typeof payload.name !== 'string') {
    return respondError(res, 400, 'INVALID_NAME', 'name is required.');
  }

  if (!payload.client_type || !CLIENT_TYPES.has(payload.client_type)) {
    return respondError(res, 400, 'INVALID_CLIENT_TYPE', 'client_type must be investment/self_use/japan.');
  }

  if (!isOwnerOrManager(auth.role)) {
    if (!payload.assigned_agent_id) payload.assigned_agent_id = auth.agentId;
    if (payload.assigned_agent_id !== auth.agentId) {
      return respondError(res, 403, 'AGENT_ASSIGNMENT_FORBIDDEN', 'Agents can only assign clients to themselves.');
    }
  }

  const assignmentCheck = await validateAssignedAgent({
    supabase,
    organizationId: auth.organizationId,
    assignedAgentId: payload.assigned_agent_id
  });
  if (!assignmentCheck.ok) {
    return respondError(
      res,
      assignmentCheck.status,
      assignmentCheck.code,
      assignmentCheck.message,
      assignmentCheck.details ?? null
    );
  }

  if (containsConsentChanges(payload) && !payload.consent_source) {
    payload.consent_source = 'api';
  }

  const insertPayload = applyDemoWriteDefaults(
    {
      ...payload
    },
    auth,
    'organization_id'
  );

  const { data, error } = await supabase
    .from('clients')
    .insert(insertPayload)
    .select(CLIENT_SELECT)
    .single();

  if (error) {
    return respondError(res, 400, 'CLIENT_CREATE_FAILED', 'Failed to create client.', {
      supabase_error: error.message
    });
  }

  return respondOk(res, data, 201);
});

router.patch('/:id', async (req, res) => {
  const { supabase, auth } = req;
  const clientId = req.params.id;
  const payload = sanitizePayload(req.body || {});

  if (Object.keys(payload).length === 0) {
    return respondError(res, 400, 'EMPTY_PATCH', 'No editable fields provided.');
  }

  if (payload.client_type && !CLIENT_TYPES.has(payload.client_type)) {
    return respondError(res, 400, 'INVALID_CLIENT_TYPE', 'client_type must be investment/self_use/japan.');
  }

  if (
    !isOwnerOrManager(auth.role) &&
    Object.prototype.hasOwnProperty.call(payload, 'assigned_agent_id') &&
    payload.assigned_agent_id !== auth.agentId
  ) {
    return respondError(res, 403, 'AGENT_ASSIGNMENT_FORBIDDEN', 'Agents can only keep assignment to themselves.');
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'assigned_agent_id')) {
    const assignmentCheck = await validateAssignedAgent({
      supabase,
      organizationId: auth.organizationId,
      assignedAgentId: payload.assigned_agent_id
    });
    if (!assignmentCheck.ok) {
      return respondError(
        res,
        assignmentCheck.status,
        assignmentCheck.code,
        assignmentCheck.message,
        assignmentCheck.details ?? null
      );
    }
  }

  if (containsConsentChanges(payload) && !payload.consent_source) {
    payload.consent_source = 'api';
  }

  let existingQuery = supabase
    .from('clients')
    .select('id,demo_data_type')
    .eq('id', clientId);
  existingQuery = applyDemoReadScope(existingQuery, auth, 'organization_id');
  const { data: existing, error: existingError } = await existingQuery.maybeSingle();

  if (existingError) {
    return respondError(res, 500, 'CLIENT_LOOKUP_FAILED', 'Failed to verify client scope.', {
      supabase_error: existingError.message
    });
  }

  if (!existing) {
    return respondError(res, 404, 'CLIENT_NOT_FOUND', 'Client not found.');
  }

  if (isDemoSeedRow(existing, auth)) {
    return respondError(res, 403, 'DEMO_SEED_IMMUTABLE', 'Demo seed data cannot be modified.');
  }

  let updateQuery = supabase
    .from('clients')
    .update(payload)
    .eq('id', clientId)
    .select(CLIENT_SELECT);
  updateQuery = applyDemoReadScope(updateQuery, auth, 'organization_id');
  updateQuery = applyDemoUpdateGuard(updateQuery, auth);
  const { data, error } = await updateQuery.maybeSingle();

  if (error) {
    return respondError(res, 400, 'CLIENT_UPDATE_FAILED', 'Failed to update client.', {
      supabase_error: error.message
    });
  }

  if (!data) return respondError(res, 404, 'CLIENT_NOT_FOUND', 'Client not found.');

  return respondOk(res, data);
});

export default router;
