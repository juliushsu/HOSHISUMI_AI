import { Router } from 'express';
import { respondError, respondOk } from '../lib/http.js';

const EVENT_TYPES = new Set(['rent_received', 'repair', 'tenant_issue', 'inspection']);
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

function isOwnerOrManager(role) {
  return role === 'owner' || role === 'manager';
}

router.get('/', async (req, res) => {
  const { supabase, auth } = req;
  const managementCaseId = req.query.management_case_id;

  if (!managementCaseId || typeof managementCaseId !== 'string') {
    return respondError(
      res,
      400,
      'INVALID_MANAGEMENT_CASE_ID',
      'management_case_id query parameter is required.'
    );
  }

  const { data, error } = await supabase
    .from('management_events')
    .select(MANAGEMENT_EVENT_SELECT)
    .eq('organization_id', auth.organizationId)
    .eq('management_case_id', managementCaseId)
    .order('event_date', { ascending: false });

  if (error) {
    return respondError(res, 500, 'MANAGEMENT_EVENTS_FETCH_FAILED', 'Failed to fetch management events.', {
      supabase_error: error.message
    });
  }

  return respondOk(res, data ?? []);
});

router.post('/', async (req, res) => {
  const { supabase, auth } = req;
  const body = req.body || {};

  if (!isOwnerOrManager(auth.role)) {
    return respondError(res, 403, 'FORBIDDEN', 'Only owner/manager can create management events.');
  }

  if (!body.management_case_id || typeof body.management_case_id !== 'string') {
    return respondError(res, 400, 'INVALID_MANAGEMENT_CASE_ID', 'management_case_id is required.');
  }

  if (!EVENT_TYPES.has(body.event_type)) {
    return respondError(
      res,
      400,
      'INVALID_EVENT_TYPE',
      'event_type must be rent_received/repair/tenant_issue/inspection.'
    );
  }

  if (!body.title || typeof body.title !== 'string') {
    return respondError(res, 400, 'INVALID_TITLE', 'title is required.');
  }

  if (body.description !== undefined && body.description !== null && typeof body.description !== 'string') {
    return respondError(res, 400, 'INVALID_DESCRIPTION', 'description must be a string when provided.');
  }

  if (body.amount !== undefined && body.amount !== null && (typeof body.amount !== 'number' || Number.isNaN(body.amount))) {
    return respondError(res, 400, 'INVALID_AMOUNT', 'amount must be a number when provided.');
  }

  if (body.event_date !== undefined && body.event_date !== null && typeof body.event_date !== 'string') {
    return respondError(res, 400, 'INVALID_EVENT_DATE', 'event_date must be an ISO datetime string when provided.');
  }

  const { data: caseRow, error: caseError } = await supabase
    .from('management_cases')
    .select('id')
    .eq('id', body.management_case_id)
    .eq('organization_id', auth.organizationId)
    .maybeSingle();

  if (caseError) {
    return respondError(res, 500, 'MANAGEMENT_CASE_LOOKUP_FAILED', 'Failed to validate management_case_id.', {
      supabase_error: caseError.message
    });
  }

  if (!caseRow) {
    return respondError(res, 404, 'MANAGEMENT_CASE_NOT_FOUND', 'Management case not found.');
  }

  const { data, error } = await supabase
    .from('management_events')
    .insert({
      organization_id: auth.organizationId,
      management_case_id: body.management_case_id,
      event_type: body.event_type,
      title: body.title,
      description: body.description ?? null,
      amount: body.amount ?? null,
      event_date: body.event_date ?? new Date().toISOString(),
      created_by_agent_id: auth.agentId
    })
    .select(MANAGEMENT_EVENT_SELECT)
    .single();

  if (error) {
    return respondError(res, 400, 'MANAGEMENT_EVENT_CREATE_FAILED', 'Failed to create management event.', {
      supabase_error: error.message
    });
  }

  return respondOk(res, data, 201);
});

export default router;
