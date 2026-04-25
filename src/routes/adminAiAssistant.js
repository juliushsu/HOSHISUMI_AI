import { Router } from 'express';
import { respondError, respondOk } from '../lib/http.js';
import { analyzePropertyForAssistant, generateAssistantCopy } from '../services/ai.js';
import {
  applyDemoReadScope,
  applyDemoWriteDefaults,
  scopedOrganizationId
} from '../services/demoScope.js';

const ALLOWED_ROLES = new Set(['owner', 'super_admin', 'manager', 'store_manager', 'store_editor']);
const CHANNELS = new Set(['fb', 'ig', 'line']);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DEFAULT_MONTHLY_UNITS = 100;
const UNIT_COST = 1;

const PROPERTY_SNAPSHOT_SELECT = [
  'id',
  'organization_id',
  'demo_data_type',
  'property_code',
  'title',
  'title_ja',
  'title_zh',
  'title_en',
  'description',
  'description_ja',
  'description_zh',
  'description_en',
  'country',
  'prefecture',
  'city',
  'district',
  'address_ja',
  'address_zh',
  'address_en',
  'purpose',
  'property_type',
  'price',
  'currency',
  'area_sqm',
  'layout',
  'building_age',
  'floor',
  'total_floors',
  'nearest_station',
  'walking_minutes',
  'management_fee',
  'status',
  'current_stage',
  'source_type',
  'source_ref',
  'cover_image_url',
  'floorplan_image_url',
  'gallery_urls',
  'updated_at',
  'created_at'
].join(',');

const ANALYSIS_SELECT = [
  'id',
  'organization_id',
  'demo_data_type',
  'property_id',
  'status',
  'analysis_version',
  'property_snapshot_json',
  'result_json',
  'compliance_flags_json',
  'risk_score',
  'provider',
  'model',
  'input_tokens',
  'output_tokens',
  'total_tokens',
  'estimated_cost_usd',
  'generated_by',
  'superseded_by',
  'superseded_at',
  'created_at',
  'updated_at'
].join(',');

const COPY_SELECT = [
  'id',
  'organization_id',
  'demo_data_type',
  'property_id',
  'analysis_id',
  'channel',
  'prompt_context_json',
  'ai_output_text',
  'edited_output_text',
  'compliance_flags_json',
  'risk_score',
  'provider',
  'model',
  'input_tokens',
  'output_tokens',
  'total_tokens',
  'estimated_cost_usd',
  'generated_by',
  'created_at',
  'updated_at'
].join(',');

const VERSION_SELECT = [
  'id',
  'organization_id',
  'demo_data_type',
  'copy_generation_id',
  'version_number',
  'source',
  'output_text',
  'compliance_flags_json',
  'risk_score',
  'edited_by',
  'edit_reason',
  'audit_metadata_json',
  'created_at'
].join(',');

const router = Router();

function ensureRoleAllowed(role) {
  return ALLOWED_ROLES.has(String(role || '').toLowerCase());
}

function isPlainObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function isUuid(value) {
  return typeof value === 'string' && UUID_RE.test(value);
}

function currentPeriodMonth(now = new Date()) {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}-01`;
}

function normalizeOptionalObject(value, fallback = {}) {
  if (value === undefined || value === null) return fallback;
  return isPlainObject(value) ? value : undefined;
}

function normalizeOptionalArray(value, fallback = []) {
  if (value === undefined || value === null) return fallback;
  return Array.isArray(value) ? value : undefined;
}

function normalizeRiskScore(value) {
  if (value === undefined || value === null) return null;
  const score = Number(value);
  if (!Number.isFinite(score) || score < 0 || score > 100) return undefined;
  return score;
}

function normalizeUsage(usage = {}) {
  return {
    provider: usage.provider ?? null,
    model: usage.model ?? null,
    input_tokens: Number(usage.input_tokens ?? 0),
    output_tokens: Number(usage.output_tokens ?? 0),
    total_tokens: Number(usage.total_tokens ?? 0),
    estimated_cost_usd: usage.estimated_cost_usd ?? null
  };
}

function toSnapshot(property) {
  return {
    snapshot_at: new Date().toISOString(),
    source: 'properties',
    property
  };
}

function quotaDto(quota, eventRows = []) {
  const usedFromEvents = eventRows.reduce((sum, row) => sum + Number(row.units || 0), 0);
  const estimatedCostUsd = eventRows.reduce((sum, row) => sum + Number(row.estimated_cost_usd || 0), 0);
  const monthlyLimit = Number(quota?.monthly_unit_limit ?? DEFAULT_MONTHLY_UNITS);
  const usedUnits = Number(quota?.used_units ?? usedFromEvents);

  return {
    period_month: quota?.period_month ?? currentPeriodMonth(),
    monthly_unit_limit: monthlyLimit,
    used_units: usedUnits,
    remaining_units: Math.max(monthlyLimit - usedUnits, 0),
    reserved_units: Number(quota?.reserved_units ?? 0),
    reset_at: quota?.reset_at ?? null,
    estimated_cost_usd: estimatedCostUsd
  };
}

async function fetchProperty(req, propertyId) {
  const { supabase, auth } = req;
  let query = supabase
    .from('properties')
    .select(PROPERTY_SNAPSHOT_SELECT)
    .eq('id', propertyId);
  query = applyDemoReadScope(query, auth, 'organization_id');
  const { data, error } = await query.maybeSingle();

  if (error) {
    return {
      ok: false,
      status: 500,
      code: 'PROPERTY_FETCH_FAILED',
      message: 'Failed to fetch property.',
      details: { supabase_error: error.message }
    };
  }

  if (!data) {
    return { ok: false, status: 404, code: 'PROPERTY_NOT_FOUND', message: 'Property not found.' };
  }

  return { ok: true, property: data };
}

async function fetchActiveAnalysis(req, propertyId) {
  let query = req.supabase
    .from('property_ai_analyses')
    .select(ANALYSIS_SELECT)
    .eq('property_id', propertyId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1);
  query = applyDemoReadScope(query, req.auth, 'organization_id');
  return query.maybeSingle();
}

async function getNextAnalysisVersion(req, propertyId) {
  let query = req.supabase
    .from('property_ai_analyses')
    .select('analysis_version')
    .eq('property_id', propertyId)
    .order('analysis_version', { ascending: false })
    .limit(1);
  query = applyDemoReadScope(query, req.auth, 'organization_id');
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return Number(data?.analysis_version || 0) + 1;
}

async function consumeQuota(req, eventType) {
  const periodMonth = currentPeriodMonth();
  const { data, error } = await req.supabase.rpc('consume_ai_usage_quota', {
    p_organization_id: scopedOrganizationId(req.auth),
    p_period_month: periodMonth,
    p_units: UNIT_COST,
    p_default_limit: DEFAULT_MONTHLY_UNITS
  });

  if (error) {
    return {
      ok: false,
      status: 500,
      code: 'AI_QUOTA_CHECK_FAILED',
      message: 'Failed to check AI usage quota.',
      details: { supabase_error: error.message }
    };
  }

  const quota = Array.isArray(data) ? data[0] : data;
  if (!quota?.allowed) {
    return {
      ok: false,
      status: 402,
      code: 'AI_QUOTA_EXCEEDED',
      message: `Monthly AI ${eventType} quota exceeded.`,
      details: quota ?? null
    };
  }

  return { ok: true, periodMonth, quota };
}

async function refundQuota(req, periodMonth) {
  if (!periodMonth) return;
  const { error } = await req.supabase.rpc('refund_ai_usage_quota', {
    p_organization_id: scopedOrganizationId(req.auth),
    p_period_month: periodMonth,
    p_units: UNIT_COST
  });
  if (error) {
    console.warn('[ai-assistant] quota refund failed', error.message);
  }
}

async function insertUsageEvent(req, payload) {
  const eventPayload = applyDemoWriteDefaults({
    agent_id: req.auth.agentId,
    period_month: payload.periodMonth,
    event_type: payload.eventType,
    units: UNIT_COST,
    property_id: payload.propertyId,
    analysis_id: payload.analysisId ?? null,
    copy_generation_id: payload.copyGenerationId ?? null,
    provider: payload.usage.provider,
    model: payload.usage.model,
    input_tokens: payload.usage.input_tokens,
    output_tokens: payload.usage.output_tokens,
    total_tokens: payload.usage.total_tokens,
    estimated_cost_usd: payload.usage.estimated_cost_usd,
    metadata_json: payload.metadata ?? {}
  }, req.auth, 'organization_id');

  return req.supabase.from('ai_usage_events').insert(eventPayload).select('id').single();
}

router.use((req, res, next) => {
  if (!ensureRoleAllowed(req.auth.role)) {
    return respondError(res, 403, 'ROLE_NOT_ALLOWED', 'Current role cannot access AI assistant admin APIs.');
  }
  return next();
});

router.get('/quota', async (req, res) => {
  const periodMonth = currentPeriodMonth();
  const { data: quotaRows, error: quotaError } = await req.supabase.rpc('ensure_ai_usage_quota', {
    p_organization_id: scopedOrganizationId(req.auth),
    p_period_month: periodMonth,
    p_default_limit: DEFAULT_MONTHLY_UNITS
  });

  if (quotaError) {
    return respondError(res, 500, 'AI_QUOTA_FETCH_FAILED', 'Failed to fetch AI quota.', {
      supabase_error: quotaError.message
    });
  }
  const quota = Array.isArray(quotaRows) ? quotaRows[0] : quotaRows;

  let eventsQuery = req.supabase
    .from('ai_usage_events')
    .select('units,estimated_cost_usd')
    .eq('period_month', periodMonth);
  eventsQuery = applyDemoReadScope(eventsQuery, req.auth, 'organization_id');
  const { data: events, error: eventsError } = await eventsQuery;

  if (eventsError) {
    return respondError(res, 500, 'AI_USAGE_EVENTS_FETCH_FAILED', 'Failed to fetch AI usage events.', {
      supabase_error: eventsError.message
    });
  }

  return respondOk(res, quotaDto(quota, events ?? []));
});

router.post('/analyses', async (req, res) => {
  const body = req.body || {};
  const propertyId = body.property_id;
  const forceRegenerate = Boolean(body.force_regenerate);

  if (!isUuid(propertyId)) {
    return respondError(res, 400, 'INVALID_PROPERTY_ID', 'property_id must be a UUID.');
  }

  const propertyResult = await fetchProperty(req, propertyId);
  if (!propertyResult.ok) {
    return respondError(
      res,
      propertyResult.status,
      propertyResult.code,
      propertyResult.message,
      propertyResult.details ?? null
    );
  }

  if (!forceRegenerate) {
    const { data: active, error: activeError } = await fetchActiveAnalysis(req, propertyId);
    if (activeError) {
      return respondError(res, 500, 'ACTIVE_ANALYSIS_FETCH_FAILED', 'Failed to fetch active analysis.', {
        supabase_error: activeError.message
      });
    }
    if (active) return respondOk(res, active, 200, { reused: true, charged_units: 0 });
  }

  return createAnalysis(req, res, propertyResult.property);
});

router.get('/analyses', async (req, res) => {
  const propertyId = req.query.property_id ? String(req.query.property_id) : null;
  if (propertyId && !isUuid(propertyId)) {
    return respondError(res, 400, 'INVALID_PROPERTY_ID', 'property_id must be a UUID.');
  }

  let query = req.supabase
    .from('property_ai_analyses')
    .select(ANALYSIS_SELECT)
    .order('created_at', { ascending: false })
    .limit(100);
  query = applyDemoReadScope(query, req.auth, 'organization_id');
  if (propertyId) query = query.eq('property_id', propertyId);

  const { data, error } = await query;
  if (error) {
    return respondError(res, 500, 'ANALYSES_FETCH_FAILED', 'Failed to fetch analyses.', {
      supabase_error: error.message
    });
  }

  return respondOk(res, data ?? []);
});

router.get('/analyses/:id', async (req, res) => {
  const id = req.params.id;
  if (!isUuid(id)) return respondError(res, 400, 'INVALID_ANALYSIS_ID', 'analysis id must be a UUID.');

  let query = req.supabase
    .from('property_ai_analyses')
    .select(ANALYSIS_SELECT)
    .eq('id', id);
  query = applyDemoReadScope(query, req.auth, 'organization_id');
  const { data, error } = await query.maybeSingle();

  if (error) {
    return respondError(res, 500, 'ANALYSIS_FETCH_FAILED', 'Failed to fetch analysis.', {
      supabase_error: error.message
    });
  }
  if (!data) return respondError(res, 404, 'ANALYSIS_NOT_FOUND', 'Analysis not found.');

  return respondOk(res, data);
});

router.post('/analyses/:id/regenerate', async (req, res) => {
  const id = req.params.id;
  if (!isUuid(id)) return respondError(res, 400, 'INVALID_ANALYSIS_ID', 'analysis id must be a UUID.');

  let analysisQuery = req.supabase
    .from('property_ai_analyses')
    .select('id,property_id')
    .eq('id', id);
  analysisQuery = applyDemoReadScope(analysisQuery, req.auth, 'organization_id');
  const { data: analysis, error: analysisError } = await analysisQuery.maybeSingle();

  if (analysisError) {
    return respondError(res, 500, 'ANALYSIS_FETCH_FAILED', 'Failed to fetch analysis.', {
      supabase_error: analysisError.message
    });
  }
  if (!analysis) return respondError(res, 404, 'ANALYSIS_NOT_FOUND', 'Analysis not found.');

  const propertyResult = await fetchProperty(req, analysis.property_id);
  if (!propertyResult.ok) {
    return respondError(
      res,
      propertyResult.status,
      propertyResult.code,
      propertyResult.message,
      propertyResult.details ?? null
    );
  }

  return createAnalysis(req, res, propertyResult.property);
});

router.post('/copy-generations', async (req, res) => {
  const body = req.body || {};
  const propertyId = body.property_id;
  const analysisId = body.analysis_id ?? null;
  const channel = String(body.channel || '');
  const promptContext = normalizeOptionalObject(body.prompt_context, {});

  if (!isUuid(propertyId)) {
    return respondError(res, 400, 'INVALID_PROPERTY_ID', 'property_id must be a UUID.');
  }
  if (analysisId && !isUuid(analysisId)) {
    return respondError(res, 400, 'INVALID_ANALYSIS_ID', 'analysis_id must be a UUID.');
  }
  if (!CHANNELS.has(channel)) {
    return respondError(res, 400, 'INVALID_CHANNEL', 'channel must be fb/ig/line.');
  }
  if (promptContext === undefined) {
    return respondError(res, 400, 'INVALID_PROMPT_CONTEXT', 'prompt_context must be a JSON object when provided.');
  }

  const propertyResult = await fetchProperty(req, propertyId);
  if (!propertyResult.ok) {
    return respondError(
      res,
      propertyResult.status,
      propertyResult.code,
      propertyResult.message,
      propertyResult.details ?? null
    );
  }

  const analysisResult = await resolveAnalysisForCopy(req, propertyId, analysisId);
  if (!analysisResult.ok) {
    return respondError(
      res,
      analysisResult.status,
      analysisResult.code,
      analysisResult.message,
      analysisResult.details ?? null
    );
  }

  const quotaResult = await consumeQuota(req, 'copy_generation');
  if (!quotaResult.ok) {
    return respondError(
      res,
      quotaResult.status,
      quotaResult.code,
      quotaResult.message,
      quotaResult.details ?? null
    );
  }

  let copy = null;
  try {
    const aiCopy = await generateAssistantCopy({
      property: propertyResult.property,
      analysis: analysisResult.analysis?.result_json ?? null,
      channel,
      promptContext
    });
    const usage = normalizeUsage(aiCopy.usage);
    const responseMeta = {
      provider: aiCopy.meta?.provider ?? usage.provider,
      model: aiCopy.meta?.model ?? usage.model,
      is_fallback: Boolean(aiCopy.meta?.is_fallback ?? (usage.provider === 'fallback' || usage.model === 'local-fallback')),
      analysis_version: analysisResult.analysis?.analysis_version ?? aiCopy.meta?.analysis_version ?? null,
      data_sources: aiCopy.meta?.data_sources ?? {
        property: true,
        analysis: Boolean(analysisResult.analysis?.result_json),
        prompt_context: Object.keys(promptContext || {}).length > 0
      }
    };
    const copyPayload = applyDemoWriteDefaults({
      property_id: propertyId,
      analysis_id: analysisResult.analysis?.id ?? null,
      channel,
      prompt_context_json: promptContext,
      ai_output_text: aiCopy.result.text,
      edited_output_text: null,
      compliance_flags_json: aiCopy.result.compliance_flags,
      risk_score: aiCopy.result.risk_score,
      provider: usage.provider,
      model: usage.model,
      input_tokens: usage.input_tokens,
      output_tokens: usage.output_tokens,
      total_tokens: usage.total_tokens,
      estimated_cost_usd: usage.estimated_cost_usd,
      generated_by: req.auth.agentId
    }, req.auth, 'organization_id');

    const { data: copyData, error: copyError } = await req.supabase
      .from('property_ai_copy_generations')
      .insert(copyPayload)
      .select(COPY_SELECT)
      .single();

    if (copyError) throw copyError;
    copy = copyData;

    const versionPayload = applyDemoWriteDefaults({
      copy_generation_id: copy.id,
      version_number: 1,
      source: 'ai',
      output_text: copy.ai_output_text,
      compliance_flags_json: copy.compliance_flags_json,
      risk_score: copy.risk_score,
      edited_by: req.auth.agentId,
      edit_reason: null,
      audit_metadata_json: { action: 'initial_ai_generation', channel }
    }, req.auth, 'organization_id');

    const { data: version, error: versionError } = await req.supabase
      .from('property_ai_copy_versions')
      .insert(versionPayload)
      .select(VERSION_SELECT)
      .single();

    if (versionError) throw versionError;

    const { error: usageError } = await insertUsageEvent(req, {
      periodMonth: quotaResult.periodMonth,
      eventType: 'copy_generation',
      propertyId,
      copyGenerationId: copy.id,
      usage,
      metadata: { channel }
    });

    if (usageError) {
      return respondError(res, 500, 'AI_USAGE_EVENT_INSERT_FAILED', 'Copy generated but usage event logging failed.', {
        supabase_error: usageError.message
      });
    }

    return respondOk(res, {
      ...copy,
      is_fallback: responseMeta.is_fallback,
      analysis_version: responseMeta.analysis_version,
      data_sources: responseMeta.data_sources,
      versions: [version]
    }, 201, {
      reused: false,
      charged_units: UNIT_COST,
      quota: quotaResult.quota,
      provider: responseMeta.provider,
      model: responseMeta.model,
      is_fallback: responseMeta.is_fallback,
      analysis_version: responseMeta.analysis_version,
      data_sources: responseMeta.data_sources
    });
  } catch (error) {
    if (!copy) await refundQuota(req, quotaResult.periodMonth);
    return respondError(res, 500, 'COPY_GENERATION_FAILED', error.message || 'Copy generation failed.');
  }
});

router.post('/copy-generations/:id/save-edit', async (req, res) => {
  const id = req.params.id;
  if (!isUuid(id)) return respondError(res, 400, 'INVALID_COPY_GENERATION_ID', 'copy generation id must be a UUID.');

  const body = req.body || {};
  const editedOutputText = typeof body.edited_output_text === 'string' ? body.edited_output_text.trim() : '';
  const editReason = body.edit_reason == null ? null : String(body.edit_reason).trim().slice(0, 1000) || null;
  const complianceFlags = normalizeOptionalArray(body.compliance_flags_json, null);
  const riskScore = normalizeRiskScore(body.risk_score);

  if (!editedOutputText) {
    return respondError(res, 400, 'INVALID_EDITED_OUTPUT_TEXT', 'edited_output_text is required.');
  }
  if (complianceFlags === undefined) {
    return respondError(res, 400, 'INVALID_COMPLIANCE_FLAGS', 'compliance_flags_json must be an array when provided.');
  }
  if (riskScore === undefined) {
    return respondError(res, 400, 'INVALID_RISK_SCORE', 'risk_score must be between 0 and 100 when provided.');
  }

  let copyQuery = req.supabase
    .from('property_ai_copy_generations')
    .select(COPY_SELECT)
    .eq('id', id);
  copyQuery = applyDemoReadScope(copyQuery, req.auth, 'organization_id');
  const { data: copy, error: copyError } = await copyQuery.maybeSingle();

  if (copyError) {
    return respondError(res, 500, 'COPY_GENERATION_FETCH_FAILED', 'Failed to fetch copy generation.', {
      supabase_error: copyError.message
    });
  }
  if (!copy) return respondError(res, 404, 'COPY_GENERATION_NOT_FOUND', 'Copy generation not found.');

  let latestVersionQuery = req.supabase
    .from('property_ai_copy_versions')
    .select('version_number')
    .eq('copy_generation_id', id)
    .order('version_number', { ascending: false })
    .limit(1);
  latestVersionQuery = applyDemoReadScope(latestVersionQuery, req.auth, 'organization_id');
  const { data: latestVersion, error: latestVersionError } = await latestVersionQuery.maybeSingle();

  if (latestVersionError) {
    return respondError(res, 500, 'COPY_VERSION_FETCH_FAILED', 'Failed to fetch latest copy version.', {
      supabase_error: latestVersionError.message
    });
  }

  const nextVersionNumber = Number(latestVersion?.version_number || 0) + 1;
  const nextComplianceFlags = complianceFlags ?? copy.compliance_flags_json ?? [];
  const nextRiskScore = riskScore ?? copy.risk_score ?? null;
  const versionPayload = applyDemoWriteDefaults({
    copy_generation_id: id,
    version_number: nextVersionNumber,
    source: 'manual_edit',
    output_text: editedOutputText,
    compliance_flags_json: nextComplianceFlags,
    risk_score: nextRiskScore,
    edited_by: req.auth.agentId,
    edit_reason: editReason,
    audit_metadata_json: {
      action: 'manual_save_edit',
      previous_version_number: latestVersion?.version_number ?? null
    }
  }, req.auth, 'organization_id');

  const { data: version, error: versionError } = await req.supabase
    .from('property_ai_copy_versions')
    .insert(versionPayload)
    .select(VERSION_SELECT)
    .single();

  if (versionError) {
    return respondError(res, 500, 'COPY_VERSION_INSERT_FAILED', 'Failed to save copy version.', {
      supabase_error: versionError.message
    });
  }

  let updateQuery = req.supabase
    .from('property_ai_copy_generations')
    .update({
      edited_output_text: editedOutputText,
      compliance_flags_json: nextComplianceFlags,
      risk_score: nextRiskScore
    })
    .eq('id', id);
  updateQuery = applyDemoReadScope(updateQuery, req.auth, 'organization_id');
  const { data: updated, error: updateError } = await updateQuery.select(COPY_SELECT).single();

  if (updateError) {
    return respondError(res, 500, 'COPY_GENERATION_UPDATE_FAILED', 'Copy version saved but generation update failed.', {
      supabase_error: updateError.message
    });
  }

  return respondOk(res, { ...updated, latest_version: version }, 200, { charged_units: 0 });
});

router.get('/copy-generations', async (req, res) => {
  const propertyId = req.query.property_id ? String(req.query.property_id) : null;
  if (propertyId && !isUuid(propertyId)) {
    return respondError(res, 400, 'INVALID_PROPERTY_ID', 'property_id must be a UUID.');
  }

  let query = req.supabase
    .from('property_ai_copy_generations')
    .select(COPY_SELECT)
    .order('created_at', { ascending: false })
    .limit(100);
  query = applyDemoReadScope(query, req.auth, 'organization_id');
  if (propertyId) query = query.eq('property_id', propertyId);

  const { data: copies, error } = await query;
  if (error) {
    return respondError(res, 500, 'COPY_GENERATIONS_FETCH_FAILED', 'Failed to fetch copy generations.', {
      supabase_error: error.message
    });
  }

  const ids = (copies ?? []).map((copy) => copy.id);
  if (ids.length === 0) return respondOk(res, []);

  let versionsQuery = req.supabase
    .from('property_ai_copy_versions')
    .select(VERSION_SELECT)
    .in('copy_generation_id', ids)
    .order('version_number', { ascending: false });
  versionsQuery = applyDemoReadScope(versionsQuery, req.auth, 'organization_id');
  const { data: versions, error: versionsError } = await versionsQuery;

  if (versionsError) {
    return respondError(res, 500, 'COPY_VERSIONS_FETCH_FAILED', 'Failed to fetch copy versions.', {
      supabase_error: versionsError.message
    });
  }

  const versionsByCopy = new Map();
  for (const version of versions ?? []) {
    if (!versionsByCopy.has(version.copy_generation_id)) versionsByCopy.set(version.copy_generation_id, []);
    versionsByCopy.get(version.copy_generation_id).push(version);
  }

  return respondOk(res, (copies ?? []).map((copy) => ({
    ...copy,
    versions: versionsByCopy.get(copy.id) ?? []
  })));
});

async function createAnalysis(req, res, property) {
  const quotaResult = await consumeQuota(req, 'analysis');
  if (!quotaResult.ok) {
    return respondError(
      res,
      quotaResult.status,
      quotaResult.code,
      quotaResult.message,
      quotaResult.details ?? null
    );
  }

  const supersededIds = [];
  let insertedAnalysis = null;

  try {
    const aiAnalysis = await analyzePropertyForAssistant(property);
    const usage = normalizeUsage(aiAnalysis.usage);
    const nextVersion = await getNextAnalysisVersion(req, property.id);

    let supersedeQuery = req.supabase
      .from('property_ai_analyses')
      .update({ status: 'superseded', superseded_at: new Date().toISOString() })
      .eq('property_id', property.id)
      .eq('status', 'active');
    supersedeQuery = applyDemoReadScope(supersedeQuery, req.auth, 'organization_id');
    const { data: supersededRows, error: supersedeError } = await supersedeQuery.select('id');
    if (supersedeError) throw supersedeError;
    for (const row of supersededRows ?? []) supersededIds.push(row.id);

    const analysisPayload = applyDemoWriteDefaults({
      property_id: property.id,
      status: 'active',
      analysis_version: nextVersion,
      property_snapshot_json: toSnapshot(property),
      result_json: aiAnalysis.result,
      compliance_flags_json: aiAnalysis.complianceFlags,
      risk_score: aiAnalysis.riskScore,
      provider: usage.provider,
      model: usage.model,
      input_tokens: usage.input_tokens,
      output_tokens: usage.output_tokens,
      total_tokens: usage.total_tokens,
      estimated_cost_usd: usage.estimated_cost_usd,
      generated_by: req.auth.agentId
    }, req.auth, 'organization_id');

    const { data, error } = await req.supabase
      .from('property_ai_analyses')
      .insert(analysisPayload)
      .select(ANALYSIS_SELECT)
      .single();
    if (error) throw error;
    insertedAnalysis = data;

    if (supersededIds.length > 0) {
      let linkQuery = req.supabase
        .from('property_ai_analyses')
        .update({ superseded_by: insertedAnalysis.id })
        .in('id', supersededIds);
      linkQuery = applyDemoReadScope(linkQuery, req.auth, 'organization_id');
      const { error: linkError } = await linkQuery;
      if (linkError) throw linkError;
    }

    const { error: usageError } = await insertUsageEvent(req, {
      periodMonth: quotaResult.periodMonth,
      eventType: 'analysis',
      propertyId: property.id,
      analysisId: insertedAnalysis.id,
      usage,
      metadata: { analysis_version: insertedAnalysis.analysis_version }
    });

    if (usageError) {
      return respondError(res, 500, 'AI_USAGE_EVENT_INSERT_FAILED', 'Analysis generated but usage event logging failed.', {
        supabase_error: usageError.message
      });
    }

    return respondOk(res, insertedAnalysis, 201, {
      reused: false,
      charged_units: UNIT_COST,
      quota: quotaResult.quota
    });
  } catch (error) {
    if (!insertedAnalysis) {
      await refundQuota(req, quotaResult.periodMonth);
      if (supersededIds.length > 0) {
        let restoreQuery = req.supabase
          .from('property_ai_analyses')
          .update({ status: 'active', superseded_at: null, superseded_by: null })
          .in('id', supersededIds);
        restoreQuery = applyDemoReadScope(restoreQuery, req.auth, 'organization_id');
        await restoreQuery;
      }
    }
    return respondError(res, 500, 'ANALYSIS_GENERATION_FAILED', error.message || 'Analysis generation failed.');
  }
}

async function resolveAnalysisForCopy(req, propertyId, analysisId) {
  if (analysisId) {
    let query = req.supabase
      .from('property_ai_analyses')
      .select(ANALYSIS_SELECT)
      .eq('id', analysisId)
      .eq('property_id', propertyId);
    query = applyDemoReadScope(query, req.auth, 'organization_id');
    const { data, error } = await query.maybeSingle();
    if (error) {
      return {
        ok: false,
        status: 500,
        code: 'ANALYSIS_FETCH_FAILED',
        message: 'Failed to fetch analysis.',
        details: { supabase_error: error.message }
      };
    }
    if (!data) return { ok: false, status: 404, code: 'ANALYSIS_NOT_FOUND', message: 'Analysis not found.' };
    return { ok: true, analysis: data };
  }

  const { data, error } = await fetchActiveAnalysis(req, propertyId);
  if (error) {
    return {
      ok: false,
      status: 500,
      code: 'ACTIVE_ANALYSIS_FETCH_FAILED',
      message: 'Failed to fetch active analysis.',
      details: { supabase_error: error.message }
    };
  }
  return { ok: true, analysis: data ?? null };
}

export default router;
