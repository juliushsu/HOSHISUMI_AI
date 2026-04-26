import { Router } from 'express';
import { respondError, respondOk } from '../lib/http.js';
import { DEFAULT_MONTHLY_UNITS, fetchAiQuotaSnapshot } from '../services/aiQuota.js';
import { DEMO_VISIBLE_DATA_TYPES, isDemoAuth, scopedOrganizationId } from '../services/demoScope.js';

const DASHBOARD_EVENT_TYPES = new Set(['deal', 'birthday', 'ranking', 'announce']);
const DASHBOARD_EVENT_EDIT_ROLES = new Set(['owner', 'super_admin', 'manager', 'store_manager', 'store_editor']);

const ACTIVITY_PRIORITY_RANK = {
  high: 3,
  medium: 2,
  low: 1
};

const RECENT_ACTIVITY_TYPES = Object.freeze({
  CLIENT_CREATED: 'client_created',
  PROPERTY_CREATED: 'property_created',
  LEAD_CREATED: 'lead_created',
  AI_ANALYSIS_COMPLETED: 'ai_analysis_completed',
  STATUS_UPDATED: 'status_updated'
});

const ACTIVITY_SELECT = [
  'id',
  'store_id',
  'created_by_agent_id',
  'actor_name',
  'actor_role',
  'action_type',
  'target_type',
  'target_id',
  'target_name',
  'summary_text',
  'created_at',
  'priority',
  'requires_attention',
  'related_status',
  'demo_data_type'
].join(',');

const STORE_SCOPED_ROLES = new Set(['manager', 'store_manager', 'store_editor']);

function getMonthStartIsoUtc() {
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
  return monthStart.toISOString();
}

function toActivityTimestamp(value) {
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : 0;
}

function isPlainObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeOptionalText(value, maxLen = 500) {
  if (value == null) return null;
  if (typeof value !== 'string') return { invalid: true };
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > maxLen ? trimmed.slice(0, maxLen) : trimmed;
}

function parseOptionalIsoDatetime(value) {
  if (value == null) return null;
  if (typeof value !== 'string') return { invalid: true };
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return { invalid: true };
  return parsed.toISOString();
}

function isDashboardEventEditableRole(role) {
  return DASHBOARD_EVENT_EDIT_ROLES.has(String(role || '').toLowerCase());
}

function normalizeAgentName(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toDashboardEventDto(row) {
  return {
    id: row.id,
    type: row.type,
    title: row.title ?? null,
    message: row.message,
    agent_id: row.agent_id ?? null,
    // Canonical mapping: dashboard event agent_name must come from agents.name only.
    agent_name: normalizeAgentName(row.agent?.name),
    created_at: row.created_at,
    start_at: row.start_at,
    end_at: row.end_at,
    is_active: row.is_active
  };
}

async function loadAgentProfileMap({ supabase, organizationId, agentIds }) {
  if (!Array.isArray(agentIds) || agentIds.length === 0) return new Map();
  const { data, error } = await supabase
    .from('agents')
    .select('id,name,role')
    .eq('organization_id', organizationId)
    .in('id', agentIds);

  if (error) return null;
  return new Map(
    (data ?? []).map((row) => [
      row.id,
      {
        name: normalizeAgentName(row.name),
        role: typeof row.role === 'string' && row.role.trim() ? row.role.trim() : 'agent'
      }
    ])
  );
}

function buildSummaryText({ actorName, actionType, targetName, relatedStatus }) {
  const actor = actorName || '系統';
  const target = targetName || '目標資料';
  switch (actionType) {
    case RECENT_ACTIVITY_TYPES.CLIENT_CREATED:
      return `${actor} 新增客戶「${target}」`;
    case RECENT_ACTIVITY_TYPES.PROPERTY_CREATED:
      return `${actor} 新增委託物件「${target}」`;
    case RECENT_ACTIVITY_TYPES.LEAD_CREATED:
      return `${actor} 建立詢問「${target}」`;
    case RECENT_ACTIVITY_TYPES.AI_ANALYSIS_COMPLETED:
      return `${actor} 完成 AI 分析「${target}」`;
    case RECENT_ACTIVITY_TYPES.STATUS_UPDATED:
      return `${actor} 更新狀態「${target}」${relatedStatus ? `（${relatedStatus}）` : ''}`;
    default:
      return `${actor} 於「${target}」執行 ${actionType}`;
  }
}

function toCanonicalRecentActivity(row) {
  return {
    id: row.id,
    actor_name: row.actor_name ?? '系統',
    actor_role: row.actor_role ?? 'system',
    action_type: row.action_type,
    target_type: row.target_type,
    target_id: row.target_id ?? null,
    target_name: row.target_name ?? null,
    summary_text: row.summary_text,
    created_at: row.created_at,
    priority: row.priority,
    requires_attention: Boolean(row.requires_attention),
    related_status: row.related_status ?? null,
    demo_data_type: row.demo_data_type ?? null
  };
}

function compareActivities(a, b) {
  if (a.requires_attention !== b.requires_attention) {
    return Number(b.requires_attention) - Number(a.requires_attention);
  }
  const priorityA = ACTIVITY_PRIORITY_RANK[a.priority] ?? 0;
  const priorityB = ACTIVITY_PRIORITY_RANK[b.priority] ?? 0;
  if (priorityA !== priorityB) {
    return priorityB - priorityA;
  }
  return toActivityTimestamp(b.created_at) - toActivityTimestamp(a.created_at);
}

async function resolveActorStoreContext({ supabase, auth, organizationId }) {
  const { data, error } = await supabase
    .from('agents')
    .select('id,organization_id,store_id,role')
    .eq('id', auth.agentId)
    .maybeSingle();

  if (error) return { error };
  if (!data || data.organization_id !== organizationId) return { storeId: null, role: String(auth.role || '').toLowerCase() };
  return {
    storeId: data.store_id ?? null,
    role: String(data.role || auth.role || '').toLowerCase()
  };
}

async function fetchRecentDashboardActivities({
  supabase,
  auth,
  organizationId,
  limit = 40
}) {
  if (!isDemoAuth(auth)) {
    return supabase
      .from('dashboard_activities')
      .select(ACTIVITY_SELECT)
      .eq('org_id', organizationId)
      .order('created_at', { ascending: false })
      .limit(limit);
  }

  const actorScope = await resolveActorStoreContext({ supabase, auth, organizationId });
  if (actorScope.error) {
    return { data: null, error: actorScope.error };
  }

  const seedQuery = supabase
    .from('dashboard_activities')
    .select(ACTIVITY_SELECT)
    .eq('org_id', organizationId)
    .eq('demo_data_type', 'seed')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (!STORE_SCOPED_ROLES.has(actorScope.role) || !actorScope.storeId) {
    const sandboxAllQuery = supabase
      .from('dashboard_activities')
      .select(ACTIVITY_SELECT)
      .eq('org_id', organizationId)
      .eq('demo_data_type', 'sandbox')
      .order('created_at', { ascending: false })
      .limit(limit);

    const [seedResult, sandboxResult] = await Promise.all([seedQuery, sandboxAllQuery]);
    if (seedResult.error || sandboxResult.error) {
      return { data: null, error: seedResult.error ?? sandboxResult.error };
    }
    const merged = [...(seedResult.data ?? []), ...(sandboxResult.data ?? [])]
      .sort(compareActivities)
      .slice(0, limit);
    return { data: merged, error: null };
  }

  const sandboxStoreQuery = supabase
    .from('dashboard_activities')
    .select(ACTIVITY_SELECT)
    .eq('org_id', organizationId)
    .eq('demo_data_type', 'sandbox')
    .eq('store_id', actorScope.storeId)
    .order('created_at', { ascending: false })
    .limit(limit);

  const [seedResult, sandboxResult] = await Promise.all([seedQuery, sandboxStoreQuery]);
  if (seedResult.error || sandboxResult.error) {
    return { data: null, error: seedResult.error ?? sandboxResult.error };
  }
  const merged = [...(seedResult.data ?? []), ...(sandboxResult.data ?? [])]
    .sort(compareActivities)
    .slice(0, limit);
  return { data: merged, error: null };
}

const router = Router();

router.get('/demo-feed', async (req, res) => {
  const { supabase, auth } = req;
  const organizationId = scopedOrganizationId(auth);
  const result = await fetchRecentDashboardActivities({
    supabase,
    auth,
    organizationId,
    limit: 100
  });

  if (result.error) {
    return respondError(res, 500, 'DASHBOARD_DEMO_FEED_FAILED', 'Failed to load dashboard demo feed.', {
      supabase_error: result.error.message
    });
  }

  const items = (result.data ?? []).map(toCanonicalRecentActivity);
  return respondOk(
    res,
    {
      recent_activities: items,
      count: items.length,
      // backward compatibility with legacy demo feed adapters
      dashboard_recent_activities_v1: items
    },
    200,
    {
      feed_source: 'api',
      activity_contract: 'dashboard_recent_activities_canonical_v2',
      seed_scope: 'organization',
      sandbox_scope: 'store',
      legacy_dataset_available: false
    }
  );
});

router.get('/events', async (req, res) => {
  const { supabase, auth } = req;
  const organizationId = scopedOrganizationId(auth);
  const nowMs = Date.now();

  const { data, error } = await supabase
    .from('dashboard_events')
    .select('id,type,title,message,agent_id,created_at,start_at,end_at,is_active')
    .eq('org_id', organizationId)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    return respondError(res, 500, 'DASHBOARD_EVENTS_FETCH_FAILED', 'Failed to fetch dashboard events.');
  }

  const activeRows = (data ?? []).filter((row) => {
    const startMs = row.start_at ? new Date(row.start_at).getTime() : 0;
    const endMs = row.end_at ? new Date(row.end_at).getTime() : null;
    return startMs <= nowMs && (endMs == null || endMs > nowMs);
  });

  const agentIds = Array.from(new Set(activeRows.map((row) => row.agent_id).filter(Boolean)));
  const agentProfileMap = await loadAgentProfileMap({
    supabase,
    organizationId,
    agentIds
  });
  if (agentProfileMap == null) {
    return respondError(res, 500, 'DASHBOARD_EVENTS_FETCH_FAILED', 'Failed to fetch dashboard events.');
  }

  const result = activeRows.map((row) =>
    toDashboardEventDto({
      ...row,
      agent: row.agent_id ? { name: agentProfileMap.get(row.agent_id)?.name ?? null } : null
    })
  );

  return respondOk(res, result);
});

router.post('/events', async (req, res) => {
  const { supabase, auth } = req;
  const organizationId = scopedOrganizationId(auth);
  if (!isDashboardEventEditableRole(auth.role)) {
    return respondError(res, 403, 'FORBIDDEN', 'Current role cannot create dashboard events.');
  }

  const body = req.body;
  if (!isPlainObject(body)) {
    return respondError(res, 400, 'INVALID_BODY', 'Request body must be a JSON object.');
  }

  const type = String(body.type || '').trim();
  if (!DASHBOARD_EVENT_TYPES.has(type)) {
    return respondError(res, 400, 'INVALID_EVENT_TYPE', 'type must be deal/birthday/ranking/announce.');
  }

  const message = normalizeOptionalText(body.message, 500);
  if (message?.invalid || message == null) {
    return respondError(res, 400, 'INVALID_MESSAGE', 'message is required and must be a non-empty string.');
  }

  const title = normalizeOptionalText(body.title, 200);
  if (title?.invalid) {
    return respondError(res, 400, 'INVALID_TITLE', 'title must be a string or null.');
  }

  const startAt = parseOptionalIsoDatetime(body.start_at);
  if (startAt?.invalid) {
    return respondError(res, 400, 'INVALID_START_AT', 'start_at must be an ISO datetime string when provided.');
  }
  const endAt = parseOptionalIsoDatetime(body.end_at);
  if (endAt?.invalid) {
    return respondError(res, 400, 'INVALID_END_AT', 'end_at must be an ISO datetime string when provided.');
  }

  const normalizedStartAt = startAt ?? new Date().toISOString();
  if (endAt && new Date(endAt).getTime() <= new Date(normalizedStartAt).getTime()) {
    return respondError(res, 400, 'INVALID_TIME_WINDOW', 'end_at must be later than start_at.');
  }

  let normalizedAgentId = null;
  let normalizedAgentName = null;
  if (body.agent_id !== undefined && body.agent_id !== null) {
    if (typeof body.agent_id !== 'string' || body.agent_id.trim() === '') {
      return respondError(res, 400, 'INVALID_AGENT_ID', 'agent_id must be a UUID string or null.');
    }

    const { data: agentRow, error: agentError } = await supabase
      .from('agents')
      .select('id,name')
      .eq('id', body.agent_id)
      .eq('organization_id', organizationId)
      .maybeSingle();

    if (agentError) {
      return respondError(res, 500, 'AGENT_LOOKUP_FAILED', 'Failed to validate agent_id.');
    }
    if (!agentRow) {
      return respondError(res, 400, 'INVALID_AGENT_ID', 'agent_id must belong to current organization.');
    }
    normalizedAgentId = body.agent_id;
    normalizedAgentName = normalizeAgentName(agentRow.name);
  }

  if (body.is_active !== undefined && typeof body.is_active !== 'boolean') {
    return respondError(res, 400, 'INVALID_IS_ACTIVE', 'is_active must be a boolean when provided.');
  }

  const payload = {
    org_id: organizationId,
    type,
    title,
    message,
    agent_id: normalizedAgentId,
    start_at: normalizedStartAt,
    end_at: endAt,
    is_active: body.is_active ?? true
  };

  const { data, error } = await supabase
    .from('dashboard_events')
    .insert(payload)
    .select('id,type,title,message,agent_id,created_at,start_at,end_at,is_active')
    .single();

  if (error) {
    return respondError(res, 400, 'DASHBOARD_EVENT_CREATE_FAILED', 'Failed to create dashboard event.');
  }

  return respondOk(
    res,
    toDashboardEventDto({
      ...data,
      agent: normalizedAgentId ? { name: normalizedAgentName } : null
    }),
    201
  );
});

router.get('/summary', async (req, res) => {
  const { supabase, auth } = req;
  const organizationId = scopedOrganizationId(auth);
  const monthStartIso = getMonthStartIsoUtc();
  const scopeDemoType = (query) => {
    if (!isDemoAuth(auth)) return query;
    return query.in('demo_data_type', DEMO_VISIBLE_DATA_TYPES);
  };

  const [
    organizationResult,
    clientsCountResult,
    propertiesCountResult,
    publishedPropertiesCountResult,
    rentalCasesCountResult,
    managementCasesCountResult,
    vacancyCountResult,
    managementEventsThisMonthCountResult,
    aiQuotaResult,
    recentClientsResult,
    recentPropertiesResult,
    recentLeadsResult,
    recentAiLogsResult,
    recentDashboardActivitiesResult
  ] = await Promise.all([
    supabase
      .from('organizations')
      .select('plan_type')
      .eq('id', organizationId)
      .maybeSingle(),
    scopeDemoType(
      supabase
      .from('clients')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
    ),
    scopeDemoType(
      supabase
      .from('properties')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
    ),
    scopeDemoType(
      supabase
      .from('properties')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .eq('status', 'available')
    ),
    supabase
      .from('rental_cases')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', organizationId),
    supabase
      .from('management_cases')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', organizationId),
    supabase
      .from('management_cases')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .eq('status', 'vacancy'),
    supabase
      .from('management_events')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .gte('event_date', monthStartIso),
    fetchAiQuotaSnapshot({
      supabase,
      auth,
      defaultMonthlyUnits: DEFAULT_MONTHLY_UNITS
    }),
    scopeDemoType(
      supabase
      .from('clients')
      .select('id, name, created_at, assigned_agent_id, demo_data_type')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
      .limit(5)
    ),
    scopeDemoType(
      supabase
      .from('properties')
      .select('id, title, created_at, owner_agent_id, status, demo_data_type')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
      .limit(5)
    ),
    scopeDemoType(
      supabase
      .from('leads')
      .select('id, customer_name, created_at, status, agent_id, demo_data_type')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
      .limit(5)
    ),
    scopeDemoType(
      supabase
      .from('ai_usage_logs')
      .select('id, action_type, tokens_used, created_at, agent_id, demo_data_type')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
      .limit(5)
    ),
    fetchRecentDashboardActivities({
      supabase,
      auth,
      organizationId,
      limit: 40
    })
  ]);

  if (
    organizationResult.error ||
    clientsCountResult.error ||
    propertiesCountResult.error ||
    publishedPropertiesCountResult.error ||
    rentalCasesCountResult.error ||
    managementCasesCountResult.error ||
    vacancyCountResult.error ||
    managementEventsThisMonthCountResult.error ||
    aiQuotaResult.error ||
    recentClientsResult.error ||
    recentPropertiesResult.error ||
    recentLeadsResult.error ||
    recentAiLogsResult.error ||
    recentDashboardActivitiesResult.error
  ) {
    return respondError(res, 500, 'DASHBOARD_SUMMARY_FAILED', 'Failed to load dashboard summary.', {
      organization_error: organizationResult.error?.message ?? null,
      clients_error: clientsCountResult.error?.message ?? null,
      properties_error: propertiesCountResult.error?.message ?? null,
      published_properties_error: publishedPropertiesCountResult.error?.message ?? null,
      rental_cases_error: rentalCasesCountResult.error?.message ?? null,
      management_cases_error: managementCasesCountResult.error?.message ?? null,
      vacancy_count_error: vacancyCountResult.error?.message ?? null,
      management_events_this_month_error: managementEventsThisMonthCountResult.error?.message ?? null,
      ai_usage_error: aiQuotaResult.error?.message ?? null,
      recent_clients_error: recentClientsResult.error?.message ?? null,
      recent_properties_error: recentPropertiesResult.error?.message ?? null,
      recent_leads_error: recentLeadsResult.error?.message ?? null,
      recent_ai_logs_error: recentAiLogsResult.error?.message ?? null,
      recent_dashboard_activities_error: recentDashboardActivitiesResult.error?.message ?? null
    });
  }

  const planType = organizationResult.data?.plan_type ?? 'basic';
  const aiUsageThisMonth = Number(aiQuotaResult.data?.used_units ?? 0);
  const aiUsageLimit = Number(aiQuotaResult.data?.monthly_unit_limit ?? 0);
  const aiUsageRemaining = Number(aiQuotaResult.data?.remaining_units ?? 0);

  const agentIds = Array.from(
    new Set([
      ...(recentClientsResult.data ?? []).map((row) => row.assigned_agent_id).filter(Boolean),
      ...(recentPropertiesResult.data ?? []).map((row) => row.owner_agent_id).filter(Boolean),
      ...(recentLeadsResult.data ?? []).map((row) => row.agent_id).filter(Boolean),
      ...(recentAiLogsResult.data ?? []).map((row) => row.agent_id).filter(Boolean)
    ])
  );

  const agentProfileMap = await loadAgentProfileMap({
    supabase,
    organizationId,
    agentIds
  });
  if (agentProfileMap == null) {
    return respondError(res, 500, 'DASHBOARD_SUMMARY_FAILED', 'Failed to resolve activity actor names.');
  }

  const derivedActivities = [
    ...(recentClientsResult.data ?? []).map((row) => {
      const actor = row.assigned_agent_id ? agentProfileMap.get(row.assigned_agent_id) ?? null : null;
      return {
        id: `client:${row.id}`,
        actor_name: actor?.name ?? '系統',
        actor_role: actor?.role ?? 'system',
        action_type: RECENT_ACTIVITY_TYPES.CLIENT_CREATED,
        target_type: 'client',
        target_id: row.id,
        target_name: row.name || '未命名客戶',
        summary_text: buildSummaryText({
          actorName: actor?.name ?? '系統',
          actionType: RECENT_ACTIVITY_TYPES.CLIENT_CREATED,
          targetName: row.name || '未命名客戶'
        }),
        created_at: row.created_at,
        priority: 'medium',
        requires_attention: false,
        related_status: null,
        demo_data_type: row.demo_data_type ?? null
      };
    }),
    ...(recentPropertiesResult.data ?? []).map((row) => {
      const actor = row.owner_agent_id ? agentProfileMap.get(row.owner_agent_id) ?? null : null;
      const requiresAttention = row.status === 'negotiating' || row.status === 'vacancy';
      return {
        id: `property:${row.id}`,
        actor_name: actor?.name ?? '系統',
        actor_role: actor?.role ?? 'system',
        action_type: RECENT_ACTIVITY_TYPES.PROPERTY_CREATED,
        target_type: 'property',
        target_id: row.id,
        target_name: row.title || '未命名物件',
        summary_text: buildSummaryText({
          actorName: actor?.name ?? '系統',
          actionType: RECENT_ACTIVITY_TYPES.PROPERTY_CREATED,
          targetName: row.title || '未命名物件'
        }),
        created_at: row.created_at,
        priority: requiresAttention ? 'high' : 'medium',
        requires_attention: requiresAttention,
        related_status: row.status ?? null,
        demo_data_type: row.demo_data_type ?? null
      };
    }),
    ...(recentLeadsResult.data ?? []).map((row) => {
      const actor = row.agent_id ? agentProfileMap.get(row.agent_id) ?? null : null;
      const requiresAttention = row.status === 'new';
      return {
        id: `lead:${row.id}`,
        actor_name: actor?.name ?? '系統',
        actor_role: actor?.role ?? 'system',
        action_type: RECENT_ACTIVITY_TYPES.LEAD_CREATED,
        target_type: 'lead',
        target_id: row.id,
        target_name: row.customer_name || '未命名詢問',
        summary_text: buildSummaryText({
          actorName: actor?.name ?? '系統',
          actionType: RECENT_ACTIVITY_TYPES.LEAD_CREATED,
          targetName: row.customer_name || '未命名詢問'
        }),
        created_at: row.created_at,
        priority: requiresAttention ? 'high' : 'medium',
        requires_attention: requiresAttention,
        related_status: row.status ?? null,
        demo_data_type: row.demo_data_type ?? null
      };
    }),
    ...(recentAiLogsResult.data ?? []).map((row) => {
      const actor = row.agent_id ? agentProfileMap.get(row.agent_id) ?? null : null;
      const actionType = row.action_type === 'analyze_client'
        ? RECENT_ACTIVITY_TYPES.AI_ANALYSIS_COMPLETED
        : row.action_type === 'mark_high_intent'
          ? RECENT_ACTIVITY_TYPES.STATUS_UPDATED
          : RECENT_ACTIVITY_TYPES.AI_ANALYSIS_COMPLETED;
      return {
        id: `ai:${row.id}`,
        actor_name: actor?.name ?? 'AI 助理',
        actor_role: actor?.role ?? 'system',
        action_type: actionType,
        target_type: 'ai_log',
        target_id: row.id,
        target_name: row.action_type || 'ai_task',
        summary_text: buildSummaryText({
          actorName: actor?.name ?? 'AI 助理',
          actionType,
          targetName: row.action_type || 'ai_task'
        }),
        created_at: row.created_at,
        priority: 'low',
        requires_attention: false,
        related_status: null,
        demo_data_type: row.demo_data_type ?? null
      };
    })
  ];

  const seededActivities = (recentDashboardActivitiesResult.data ?? []).map(toCanonicalRecentActivity);
  const activities = [...seededActivities, ...derivedActivities]
    .sort(compareActivities)
    .slice(0, 20);

  const seedCount = activities.filter((item) => item.demo_data_type === 'seed').length;
  const sandboxCount = activities.filter((item) => item.demo_data_type === 'sandbox').length;
  const nonDemoCount = activities.filter((item) => item.demo_data_type == null).length;

  return respondOk(
    res,
    {
      plan_type: planType,
      client_count: clientsCountResult.count ?? 0,
      property_count: propertiesCountResult.count ?? 0,
      published_property_count: publishedPropertiesCountResult.count ?? 0,
      rental_case_count: rentalCasesCountResult.count ?? 0,
      management_case_count: managementCasesCountResult.count ?? 0,
      vacancy_count: vacancyCountResult.count ?? 0,
      management_event_count_this_month: managementEventsThisMonthCountResult.count ?? 0,
      ai_usage_this_month: aiUsageThisMonth,
      ai_usage_limit: aiUsageLimit,
      ai_usage_remaining: aiUsageRemaining,
      ai_quota: aiQuotaResult.data,
      recent_activities: activities
    },
    200,
    {
      feed_source: 'api',
      activity_contract: 'dashboard_recent_activities_canonical_v2',
      activity_mix: {
        seed_count: seedCount,
        sandbox_count: sandboxCount,
        non_demo_count: nonDemoCount
      }
    }
  );
});

export default router;
