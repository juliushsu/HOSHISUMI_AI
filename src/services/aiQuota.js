import { applyDemoReadScope, scopedOrganizationId } from './demoScope.js';

export const DEFAULT_MONTHLY_UNITS = 100;

export function currentQuotaPeriodMonth(now = new Date()) {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}-01`;
}

function normalizeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function quotaDto(quota, eventRows = []) {
  const usedFromEvents = Array.isArray(eventRows)
    ? eventRows.reduce((sum, row) => sum + Number(row.units || 0), 0)
    : 0;
  const estimatedCostUsd = Array.isArray(eventRows)
    ? eventRows.reduce((sum, row) => sum + Number(row.estimated_cost_usd || 0), 0)
    : 0;

  const monthlyLimit = normalizeNumber(quota?.monthly_unit_limit, DEFAULT_MONTHLY_UNITS);
  const usedUnits = normalizeNumber(quota?.used_units, usedFromEvents);
  const remainingUnits = Number.isFinite(Number(quota?.remaining_units))
    ? Math.max(Number(quota.remaining_units), 0)
    : Math.max(monthlyLimit - usedUnits, 0);

  return {
    period_month: quota?.period_month ?? currentQuotaPeriodMonth(),
    monthly_unit_limit: monthlyLimit,
    used_units: usedUnits,
    remaining_units: remainingUnits,
    reserved_units: normalizeNumber(quota?.reserved_units, 0),
    reset_at: quota?.reset_at ?? null,
    estimated_cost_usd: estimatedCostUsd
  };
}

export async function fetchAiQuotaSnapshot({ supabase, auth, defaultMonthlyUnits = DEFAULT_MONTHLY_UNITS }) {
  const periodMonth = currentQuotaPeriodMonth();
  const { data: quotaRows, error: quotaError } = await supabase.rpc('ensure_ai_usage_quota', {
    p_organization_id: scopedOrganizationId(auth),
    p_period_month: periodMonth,
    p_default_limit: defaultMonthlyUnits
  });

  if (quotaError) {
    return { data: null, error: quotaError };
  }

  const quota = Array.isArray(quotaRows) ? quotaRows[0] : quotaRows;

  let eventsQuery = supabase
    .from('ai_usage_events')
    .select('units,estimated_cost_usd')
    .eq('period_month', periodMonth);
  eventsQuery = applyDemoReadScope(eventsQuery, auth, 'organization_id');

  const { data: events, error: eventsError } = await eventsQuery;
  if (eventsError) {
    return { data: null, error: eventsError };
  }

  return {
    data: quotaDto(quota, events ?? []),
    error: null
  };
}
