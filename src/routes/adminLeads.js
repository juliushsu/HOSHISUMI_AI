import { Router } from 'express';
import { respondError, respondOk } from '../lib/http.js';
import { applyDemoReadScope, applyDemoUpdateGuard, isDemoSeedRow } from '../services/demoScope.js';

const LEAD_STATUS_ENUM = new Set(['new', 'contacted', 'qualified', 'closed', 'lost']);
const LEAD_SOURCE_TYPE_ENUM = new Set(['qr', 'agent_page', 'store_contact', 'property_inquiry', 'direct']);
const OWNER_SCOPE_ROLES = new Set(['owner', 'super_admin']);
const STORE_SCOPE_ROLES = new Set(['manager', 'store_manager', 'store_editor']);
const LEAD_PATCH_EDITABLE_FIELDS = ['status', 'notes'];

const LEAD_LIST_SELECT = [
  'id',
  'customer_name',
  'phone',
  'email',
  'inquiry_message',
  'preferred_contact_method',
  'source_type',
  'source_agent_slug',
  'source_store_slug',
  'status',
  'created_at',
  'store_id',
  'agent_id',
  'property_id',
  'store:stores!leads_store_id_fkey(id,name,slug)',
  'agent:agents!leads_agent_id_fkey(id,name,slug)',
  'property:properties!leads_property_id_fkey(id,title)'
].join(',');

const LEAD_DETAIL_SELECT = [
  'id',
  'customer_name',
  'phone',
  'email',
  'line_id',
  'preferred_contact_method',
  'inquiry_message',
  'source_type',
  'source_code',
  'source_store_slug',
  'source_agent_slug',
  'status',
  'notes',
  'created_at',
  'updated_at',
  'store_id',
  'agent_id',
  'property_id',
  'store:stores!leads_store_id_fkey(id,name,slug)',
  'agent:agents!leads_agent_id_fkey(id,name,slug)',
  'property:properties!leads_property_id_fkey(id,title,country,status,current_stage)'
].join(',');

const router = Router();

function parsePaging(rawPage, rawLimit) {
  const page = Number.parseInt(String(rawPage ?? '1'), 10);
  const limit = Number.parseInt(String(rawLimit ?? '20'), 10);
  const safePage = Number.isFinite(page) && page > 0 ? page : 1;
  const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.min(limit, 100) : 20;
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

function unknownFields(body, editableFields) {
  return Object.keys(body).filter((key) => !editableFields.includes(key));
}

function toAdminLeadListItem(row) {
  return {
    id: row.id,
    customer_name: row.customer_name,
    phone: row.phone ?? null,
    email: row.email ?? null,
    inquiry_message: row.inquiry_message ?? null,
    preferred_contact_method: row.preferred_contact_method ?? null,
    property_id: row.property_id ?? null,
    property_title: row.property?.title ?? null,
    source_agent_slug: row.source_agent_slug ?? null,
    source_store_slug: row.source_store_slug ?? null,
    source_type: row.source_type,
    status: row.status,
    created_at: row.created_at,
    store_id: row.store_id ?? null,
    agent_id: row.agent_id ?? null,
    agent_name: row.agent?.name ?? null,
    store_name: row.store?.name ?? null
  };
}

function toAdminLeadDetailDto(row) {
  return {
    id: row.id,
    customer_name: row.customer_name,
    phone: row.phone ?? null,
    email: row.email ?? null,
    line_id: row.line_id ?? null,
    preferred_contact_method: row.preferred_contact_method ?? null,
    inquiry_message: row.inquiry_message ?? null,
    source_type: row.source_type,
    source_code: row.source_code ?? null,
    source_store_slug: row.source_store_slug ?? null,
    source_agent_slug: row.source_agent_slug ?? null,
    status: row.status,
    notes: row.notes ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    store_id: row.store_id ?? null,
    store_name: row.store?.name ?? null,
    store_slug: row.store?.slug ?? null,
    agent_id: row.agent_id ?? null,
    agent_name: row.agent?.name ?? null,
    agent_slug: row.agent?.slug ?? null,
    property_id: row.property_id ?? null,
    property_title: row.property?.title ?? null,
    property_country: row.property?.country ?? null,
    property_status: row.property?.status ?? null,
    property_current_stage: row.property?.current_stage ?? null
  };
}

async function resolveLeadsScope(supabase, auth) {
  const { data: actor, error } = await supabase
    .from('agents')
    .select('id,organization_id,role,store_id,is_active')
    .eq('id', auth.agentId)
    .maybeSingle();

  if (error) {
    return {
      ok: false,
      status: 500,
      code: 'LEADS_SCOPE_LOOKUP_FAILED',
      message: 'Failed to resolve leads scope.',
      details: { supabase_error: error.message }
    };
  }

  if (!actor || !actor.is_active || actor.organization_id !== auth.organizationId) {
    return {
      ok: false,
      status: 403,
      code: 'LEADS_SCOPE_FORBIDDEN',
      message: 'Current actor cannot access admin leads.'
    };
  }

  const role = String(actor.role || '').toLowerCase();
  if (OWNER_SCOPE_ROLES.has(role)) {
    return { ok: true, mode: 'cross_store_owner', store_id: null };
  }

  if (STORE_SCOPE_ROLES.has(role)) {
    if (!actor.store_id) {
      return {
        ok: false,
        status: 403,
        code: 'STORE_SCOPE_NOT_ASSIGNED',
        message: 'Current role requires a bound store_id for admin leads.'
      };
    }
    return { ok: true, mode: 'store_scoped', store_id: actor.store_id };
  }

  return {
    ok: false,
    status: 403,
    code: 'ROLE_NOT_ALLOWED',
    message: 'Current role cannot access admin leads.'
  };
}

router.get('/', async (req, res) => {
  const { supabase, auth } = req;
  const { page, limit } = parsePaging(req.query.page, req.query.limit);
  const status = req.query.status ? String(req.query.status) : null;
  const sourceType = req.query.source_type ? String(req.query.source_type) : null;
  const agentId = req.query.agent_id ? String(req.query.agent_id) : null;

  if (status && !LEAD_STATUS_ENUM.has(status)) {
    return respondError(res, 400, 'INVALID_STATUS', 'status must be new/contacted/qualified/closed/lost.');
  }

  if (sourceType && !LEAD_SOURCE_TYPE_ENUM.has(sourceType)) {
    return respondError(
      res,
      400,
      'INVALID_SOURCE_TYPE',
      'source_type must be qr/agent_page/store_contact/property_inquiry/direct.'
    );
  }

  const scope = await resolveLeadsScope(supabase, auth);
  if (!scope.ok) {
    return respondError(res, scope.status, scope.code, scope.message, scope.details ?? null);
  }

  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let query = supabase
    .from('leads')
    .select(LEAD_LIST_SELECT, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to);
  query = applyDemoReadScope(query, auth, 'organization_id');

  if (scope.store_id) query = query.eq('store_id', scope.store_id);
  if (status) query = query.eq('status', status);
  if (sourceType) query = query.eq('source_type', sourceType);
  if (agentId) query = query.eq('agent_id', agentId);

  const { data, error, count } = await query;

  if (error) {
    return respondError(res, 500, 'ADMIN_LEADS_FETCH_FAILED', 'Failed to fetch admin leads.', {
      supabase_error: error.message
    });
  }

  const total = Number(count ?? 0);
  return respondOk(
    res,
    (data ?? []).map(toAdminLeadListItem),
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
  const leadId = String(req.params.id || '');
  if (!leadId) {
    return respondError(res, 400, 'INVALID_LEAD_ID', 'Lead id is required.');
  }

  const scope = await resolveLeadsScope(supabase, auth);
  if (!scope.ok) {
    return respondError(res, scope.status, scope.code, scope.message, scope.details ?? null);
  }

  let query = supabase
    .from('leads')
    .select(LEAD_DETAIL_SELECT)
    .eq('id', leadId);
  query = applyDemoReadScope(query, auth, 'organization_id');

  if (scope.store_id) query = query.eq('store_id', scope.store_id);

  const { data, error } = await query.maybeSingle();
  if (error) {
    return respondError(res, 500, 'ADMIN_LEAD_DETAIL_FETCH_FAILED', 'Failed to fetch lead detail.', {
      supabase_error: error.message
    });
  }

  if (!data) return respondError(res, 404, 'ADMIN_LEAD_NOT_FOUND', 'Lead not found in current scope.');
  return respondOk(res, toAdminLeadDetailDto(data));
});

router.patch('/:id', async (req, res) => {
  const { supabase, auth } = req;
  const leadId = String(req.params.id || '');
  if (!leadId) {
    return respondError(res, 400, 'INVALID_LEAD_ID', 'Lead id is required.');
  }

  const body = req.body;
  if (!isPlainObject(body)) {
    return respondError(res, 400, 'INVALID_BODY', 'Request body must be a JSON object.');
  }

  const extra = unknownFields(body, LEAD_PATCH_EDITABLE_FIELDS);
  if (extra.length > 0) {
    return respondError(res, 400, 'UNSUPPORTED_FIELDS', 'Request includes unsupported lead fields.', {
      unsupported_fields: extra,
      editable_fields: LEAD_PATCH_EDITABLE_FIELDS
    });
  }

  if (Object.keys(body).length === 0) {
    return respondError(res, 400, 'EMPTY_PATCH_BODY', 'At least one editable field is required.');
  }

  if (body.status !== undefined && !LEAD_STATUS_ENUM.has(String(body.status))) {
    return respondError(res, 400, 'INVALID_STATUS', 'status must be new/contacted/qualified/closed/lost.');
  }

  const normalizedNotes = body.notes !== undefined ? normalizeOptionalText(body.notes, 5000) : undefined;
  if (normalizedNotes === undefined && body.notes !== undefined) {
    return respondError(res, 400, 'INVALID_NOTES', 'notes must be a string or null.');
  }

  const scope = await resolveLeadsScope(supabase, auth);
  if (!scope.ok) {
    return respondError(res, scope.status, scope.code, scope.message, scope.details ?? null);
  }

  let existingQuery = supabase
    .from('leads')
    .select('id,organization_id,store_id,status,notes,demo_data_type')
    .eq('id', leadId);
  existingQuery = applyDemoReadScope(existingQuery, auth, 'organization_id');

  if (scope.store_id) existingQuery = existingQuery.eq('store_id', scope.store_id);

  const { data: existing, error: existingError } = await existingQuery.maybeSingle();
  if (existingError) {
    return respondError(res, 500, 'ADMIN_LEAD_LOOKUP_FAILED', 'Failed to verify lead scope.', {
      supabase_error: existingError.message
    });
  }

  if (!existing) return respondError(res, 404, 'ADMIN_LEAD_NOT_FOUND', 'Lead not found in current scope.');
  if (isDemoSeedRow(existing, auth)) {
    return respondError(res, 403, 'DEMO_SEED_IMMUTABLE', 'Demo seed data cannot be modified.');
  }

  const updates = {};
  const events = [];

  if (body.status !== undefined && String(body.status) !== existing.status) {
    updates.status = String(body.status);
    events.push({
      event_type: 'lead_status_changed',
      payload: {
        previous_status: existing.status,
        next_status: String(body.status),
        changed_by_agent_id: auth.agentId
      }
    });
  }

  if (body.notes !== undefined && normalizedNotes !== existing.notes) {
    updates.notes = normalizedNotes;
    events.push({
      event_type: 'lead_note_updated',
      payload: {
        previous_notes: existing.notes,
        next_notes: normalizedNotes,
        changed_by_agent_id: auth.agentId
      }
    });
  }

  if (Object.keys(updates).length === 0) {
    let currentQuery = supabase
      .from('leads')
      .select(LEAD_DETAIL_SELECT)
      .eq('id', leadId);
    currentQuery = applyDemoReadScope(currentQuery, auth, 'organization_id');

    if (scope.store_id) currentQuery = currentQuery.eq('store_id', scope.store_id);

    const { data: current, error: currentError } = await currentQuery.maybeSingle();

    if (currentError || !current) {
      return respondError(res, 500, 'ADMIN_LEAD_FETCH_AFTER_PATCH_FAILED', 'Failed to fetch lead detail.', {
        supabase_error: currentError?.message ?? null
      });
    }

    return respondOk(res, toAdminLeadDetailDto(current));
  }

  let updateQuery = supabase
    .from('leads')
    .update(updates)
    .eq('id', leadId)
    .select(LEAD_DETAIL_SELECT);
  updateQuery = applyDemoReadScope(updateQuery, auth, 'organization_id');
  updateQuery = applyDemoUpdateGuard(updateQuery, auth);

  if (scope.store_id) updateQuery = updateQuery.eq('store_id', scope.store_id);

  const { data: updated, error: updateError } = await updateQuery.single();

  if (updateError) {
    return respondError(res, 500, 'ADMIN_LEAD_UPDATE_FAILED', 'Failed to update lead.', {
      supabase_error: updateError.message
    });
  }

  if (events.length > 0) {
    const eventRows = events.map((event) => ({
      lead_id: leadId,
      event_type: event.event_type,
      payload: event.payload
    }));

    const { error: eventError } = await supabase.from('lead_events').insert(eventRows);
    if (eventError) {
      return respondError(
        res,
        500,
        'LEAD_EVENT_CREATE_FAILED',
        'Lead updated, but failed to create lead events.',
        { supabase_error: eventError.message, lead_id: leadId }
      );
    }
  }

  return respondOk(res, toAdminLeadDetailDto(updated));
});

export default router;
