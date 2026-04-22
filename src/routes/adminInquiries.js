import { Router } from 'express';
import { respondError, respondOk } from '../lib/http.js';

const STATUS_ALLOWLIST = new Set(['new', 'contacted', 'qualified', 'closed', 'archived']);
const SOURCE_ALLOWLIST = new Set(['partners_japan', 'for_agencies', 'contact', 'manual_admin']);
const INQUIRY_TYPE_ALLOWLIST = new Set([
  'japan_partnership',
  'agency_onboarding',
  'demo_request',
  'general_contact',
  'other'
]);
const READ_ROLES = new Set(['owner', 'super_admin', 'manager', 'store_manager', 'store_editor']);
const WRITE_ROLES = new Set(['owner', 'super_admin', 'manager']);
const PATCH_EDITABLE_FIELDS = ['status', 'assigned_agent_id', 'assigned_admin_id', 'notes', 'last_contacted_at'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

function parsePaging(rawPage, rawPageSize) {
  const page = Number.parseInt(String(rawPage ?? '1'), 10);
  const pageSize = Number.parseInt(String(rawPageSize ?? '20'), 10);
  const safePage = Number.isFinite(page) && page > 0 ? page : 1;
  const safePageSize = Number.isFinite(pageSize) && pageSize > 0 ? Math.min(pageSize, 100) : 20;
  return { page: safePage, pageSize: safePageSize };
}

function validateUuidOrNull(value) {
  if (value == null) return null;
  if (typeof value !== 'string') return { invalid: true };
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!UUID_RE.test(trimmed)) return { invalid: true };
  return trimmed;
}

function parseDatetimeOrNull(value) {
  if (value == null) return null;
  if (typeof value !== 'string') return { invalid: true };
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return { invalid: true };
  return parsed.toISOString();
}

function roleAllowed(auth, allowlist) {
  return allowlist.has(String(auth.role || '').toLowerCase());
}

function unknownFields(body, editableFields) {
  return Object.keys(body).filter((key) => !editableFields.includes(key));
}

function toInquiryListItem(row, agentMap) {
  return {
    id: row.id,
    org_id: row.org_id ?? null,
    source: row.source,
    inquiry_type: row.inquiry_type,
    company_name: row.company_name ?? null,
    contact_name: row.contact_name,
    email: row.email,
    phone: row.phone ?? null,
    language: row.language ?? null,
    country: row.country ?? null,
    subject: row.subject ?? null,
    status: row.status,
    assigned_agent_id: row.assigned_agent_id ?? null,
    assigned_agent_name: row.assigned_agent_id ? agentMap.get(row.assigned_agent_id) ?? null : null,
    assigned_admin_id: row.assigned_admin_id ?? null,
    assigned_admin_name: row.assigned_admin_id ? agentMap.get(row.assigned_admin_id) ?? null : null,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

async function loadAgentMap(supabase, organizationId, ids) {
  if (ids.length === 0) return new Map();
  const { data, error } = await supabase
    .from('agents')
    .select('id,name')
    .eq('organization_id', organizationId)
    .in('id', ids);
  if (error) return null;
  return new Map((data ?? []).map((row) => [row.id, row.name ?? null]));
}

router.get('/', async (req, res) => {
  const { supabase, auth } = req;
  if (!roleAllowed(auth, READ_ROLES)) {
    return respondError(res, 403, 'FORBIDDEN', 'Current role cannot read inquiries.');
  }

  const status = req.query.status ? String(req.query.status) : null;
  const source = req.query.source ? String(req.query.source) : null;
  const inquiryType = req.query.inquiry_type ? String(req.query.inquiry_type) : null;
  const q = req.query.q ? String(req.query.q).trim() : null;
  const { page, pageSize } = parsePaging(req.query.page, req.query.page_size);

  if (status && !STATUS_ALLOWLIST.has(status)) {
    return respondError(res, 400, 'INVALID_STATUS', 'status must be new/contacted/qualified/closed/archived.');
  }
  if (source && !SOURCE_ALLOWLIST.has(source)) {
    return respondError(
      res,
      400,
      'INVALID_SOURCE',
      'source must be partners_japan/for_agencies/contact/manual_admin.'
    );
  }
  if (inquiryType && !INQUIRY_TYPE_ALLOWLIST.has(inquiryType)) {
    return respondError(
      res,
      400,
      'INVALID_INQUIRY_TYPE',
      'inquiry_type must be japan_partnership/agency_onboarding/demo_request/general_contact/other.'
    );
  }

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from('partner_inquiries')
    .select(
      'id,org_id,source,inquiry_type,company_name,contact_name,email,phone,language,country,subject,status,assigned_agent_id,assigned_admin_id,created_at,updated_at',
      { count: 'exact' }
    )
    .order('created_at', { ascending: false })
    .range(from, to);

  if (status) query = query.eq('status', status);
  if (source) query = query.eq('source', source);
  if (inquiryType) query = query.eq('inquiry_type', inquiryType);
  if (q) {
    const escaped = q.replaceAll(',', ' ').replaceAll('%', ' ');
    query = query.or(`company_name.ilike.%${escaped}%,contact_name.ilike.%${escaped}%,email.ilike.%${escaped}%`);
  }

  const { data, error, count } = await query;
  if (error) {
    return respondError(res, 500, 'INQUIRIES_FETCH_FAILED', 'Failed to fetch inquiries.');
  }

  const ids = Array.from(
    new Set(
      (data ?? [])
        .flatMap((row) => [row.assigned_agent_id, row.assigned_admin_id])
        .filter((value) => typeof value === 'string')
    )
  );
  const agentMap = await loadAgentMap(supabase, auth.organizationId, ids);
  if (agentMap == null) {
    return respondError(res, 500, 'AGENT_LOOKUP_FAILED', 'Failed to resolve assigned names.');
  }

  const total = Number(count ?? 0);
  return respondOk(res, {
    items: (data ?? []).map((row) => toInquiryListItem(row, agentMap)),
    page,
    page_size: pageSize,
    total,
    total_pages: total === 0 ? 0 : Math.ceil(total / pageSize)
  });
});

router.patch('/:id', async (req, res) => {
  const { supabase, auth } = req;
  if (!roleAllowed(auth, WRITE_ROLES)) {
    return respondError(res, 403, 'FORBIDDEN', 'Current role cannot update inquiries.');
  }

  const inquiryId = String(req.params.id || '');
  if (!UUID_RE.test(inquiryId)) {
    return respondError(res, 400, 'INVALID_INQUIRY_ID', 'inquiry id must be a UUID.');
  }

  const body = req.body;
  if (!isPlainObject(body)) {
    return respondError(res, 400, 'INVALID_BODY', 'Request body must be a JSON object.');
  }

  const extra = unknownFields(body, PATCH_EDITABLE_FIELDS);
  if (extra.length > 0) {
    return respondError(res, 400, 'UNSUPPORTED_FIELDS', 'Request includes unsupported fields.', {
      unsupported_fields: extra,
      editable_fields: PATCH_EDITABLE_FIELDS
    });
  }
  if (Object.keys(body).length === 0) {
    return respondError(res, 400, 'EMPTY_PATCH_BODY', 'At least one editable field is required.');
  }

  const updates = {};
  if (body.status !== undefined) {
    const status = String(body.status);
    if (!STATUS_ALLOWLIST.has(status)) {
      return respondError(res, 400, 'INVALID_STATUS', 'status must be new/contacted/qualified/closed/archived.');
    }
    updates.status = status;
  }

  if (body.assigned_agent_id !== undefined) {
    const assignedAgentId = validateUuidOrNull(body.assigned_agent_id);
    if (assignedAgentId?.invalid) {
      return respondError(res, 400, 'INVALID_ASSIGNED_AGENT_ID', 'assigned_agent_id must be a UUID or null.');
    }
    updates.assigned_agent_id = assignedAgentId;
  }

  if (body.assigned_admin_id !== undefined) {
    const assignedAdminId = validateUuidOrNull(body.assigned_admin_id);
    if (assignedAdminId?.invalid) {
      return respondError(res, 400, 'INVALID_ASSIGNED_ADMIN_ID', 'assigned_admin_id must be a UUID or null.');
    }
    updates.assigned_admin_id = assignedAdminId;
  }

  if (body.notes !== undefined) {
    const notes = normalizeOptionalText(body.notes, 5000);
    if (notes === undefined) {
      return respondError(res, 400, 'INVALID_NOTES', 'notes must be a string or null.');
    }
    updates.notes = notes;
  }

  if (body.last_contacted_at !== undefined) {
    const lastContactedAt = parseDatetimeOrNull(body.last_contacted_at);
    if (lastContactedAt?.invalid) {
      return respondError(res, 400, 'INVALID_LAST_CONTACTED_AT', 'last_contacted_at must be ISO datetime or null.');
    }
    updates.last_contacted_at = lastContactedAt;
  }

  const targetOrg = updates.assigned_agent_id || updates.assigned_admin_id ? auth.organizationId : null;
  if (updates.assigned_agent_id) {
    const { data, error } = await supabase
      .from('agents')
      .select('id')
      .eq('id', updates.assigned_agent_id)
      .eq('organization_id', targetOrg)
      .eq('is_active', true)
      .maybeSingle();
    if (error) return respondError(res, 500, 'AGENT_LOOKUP_FAILED', 'Failed to validate assigned_agent_id.');
    if (!data) return respondError(res, 400, 'INVALID_ASSIGNED_AGENT_ID', 'assigned_agent_id is not valid in scope.');
  }

  if (updates.assigned_admin_id) {
    const { data, error } = await supabase
      .from('agents')
      .select('id')
      .eq('id', updates.assigned_admin_id)
      .eq('organization_id', targetOrg)
      .eq('is_active', true)
      .maybeSingle();
    if (error) return respondError(res, 500, 'AGENT_LOOKUP_FAILED', 'Failed to validate assigned_admin_id.');
    if (!data) return respondError(res, 400, 'INVALID_ASSIGNED_ADMIN_ID', 'assigned_admin_id is not valid in scope.');
  }

  const { data: updated, error: updateError } = await supabase
    .from('partner_inquiries')
    .update(updates)
    .eq('id', inquiryId)
    .select(
      'id,org_id,source,inquiry_type,company_name,contact_name,email,phone,line_id,country,language,subject,message,metadata,status,assigned_agent_id,assigned_admin_id,last_contacted_at,notes,created_at,updated_at'
    )
    .maybeSingle();

  if (updateError) {
    return respondError(res, 500, 'INQUIRY_UPDATE_FAILED', 'Failed to update inquiry.');
  }
  if (!updated) {
    return respondError(res, 404, 'INQUIRY_NOT_FOUND', 'Inquiry not found in current scope.');
  }

  return respondOk(res, updated);
});

export default router;
