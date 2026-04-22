import { Router } from 'express';
import { respondError, respondOk } from '../lib/http.js';
import { applyDemoReadScope, scopedOrganizationId } from '../services/demoScope.js';

const INTAKE_SOURCE_TYPES = ['japan_line', 'japan_api', 'import'];
const PARTNER_SELECT = [
  'id',
  'company_name',
  'display_name',
  'country',
  'status',
  'default_fee_percent',
  'line_intake_enabled',
  'upload_intake_enabled',
  'api_intake_enabled',
  'partner_slug',
  'contact_email'
].join(',');

function isOwnerOrManager(role) {
  return role === 'owner' || role === 'manager';
}

function subtractDaysIso(days) {
  const now = new Date();
  const result = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  return result.toISOString();
}

const router = Router();

router.get('/', async (req, res) => {
  const { supabase, auth } = req;
  const organizationId = scopedOrganizationId(auth);

  if (!isOwnerOrManager(auth.role)) {
    return respondError(res, 403, 'FORBIDDEN', 'Only owner/manager can access partners.');
  }

  const { data: authorizationRows, error: authorizationError } = await supabase
    .from('partner_authorizations')
    .select(`partner_id, partner:partners!partner_authorizations_partner_id_fkey(${PARTNER_SELECT})`)
    .eq('organization_id', organizationId)
    .eq('is_active', true);

  if (authorizationError) {
    return respondError(res, 500, 'PARTNERS_FETCH_FAILED', 'Failed to fetch partner authorizations.', {
      supabase_error: authorizationError.message
    });
  }

  const partnersById = new Map();
  for (const row of authorizationRows ?? []) {
    if (row.partner) partnersById.set(row.partner_id, row.partner);
  }

  const partnerIds = [...partnersById.keys()];
  if (partnerIds.length === 0) return respondOk(res, []);

  let recentPropertiesQuery = supabase
    .from('properties')
    .select('partner_id')
    .in('partner_id', partnerIds)
    .in('source_type', INTAKE_SOURCE_TYPES)
    .gte('created_at', subtractDaysIso(30));
  recentPropertiesQuery = applyDemoReadScope(recentPropertiesQuery, auth, 'organization_id');

  const [{ data: authorizationCountsRows, error: authorizationCountsError }, { data: recentPropertiesRows, error: recentPropertiesError }] =
    await Promise.all([
      supabase
        .from('partner_authorizations')
        .select('partner_id')
        .in('partner_id', partnerIds)
        .eq('organization_id', organizationId)
        .eq('is_active', true),
      recentPropertiesQuery
    ]);

  if (authorizationCountsError || recentPropertiesError) {
    return respondError(res, 500, 'PARTNERS_FETCH_FAILED', 'Failed to build partners summary.', {
      authorization_counts_error: authorizationCountsError?.message ?? null,
      recent_intake_error: recentPropertiesError?.message ?? null
    });
  }

  const authorizationCountByPartnerId = (authorizationCountsRows ?? []).reduce((acc, row) => {
    acc.set(row.partner_id, (acc.get(row.partner_id) ?? 0) + 1);
    return acc;
  }, new Map());

  const recentIntakeCountByPartnerId = (recentPropertiesRows ?? []).reduce((acc, row) => {
    acc.set(row.partner_id, (acc.get(row.partner_id) ?? 0) + 1);
    return acc;
  }, new Map());

  const result = partnerIds
    .map((partnerId) => {
      const partner = partnersById.get(partnerId);
      return {
        ...partner,
        authorized_organizations_count: authorizationCountByPartnerId.get(partnerId) ?? 0,
        recent_intake_count: recentIntakeCountByPartnerId.get(partnerId) ?? 0
      };
    })
    .sort((a, b) => a.display_name.localeCompare(b.display_name, 'zh-Hant'));

  return respondOk(res, result);
});

router.get('/:id', async (req, res) => {
  const { supabase, auth } = req;
  const organizationId = scopedOrganizationId(auth);
  const partnerId = req.params.id;

  if (!isOwnerOrManager(auth.role)) {
    return respondError(res, 403, 'FORBIDDEN', 'Only owner/manager can access partners.');
  }

  const [partnerResult, authorizationResult, recentPropertiesResult] = await Promise.all([
    supabase
      .from('partners')
      .select(PARTNER_SELECT)
      .eq('id', partnerId)
      .maybeSingle(),
    supabase
      .from('partner_authorizations')
      .select(
        'id, partner_id, organization_id, is_exclusive, is_active, default_owner_agent_id, created_at, organization:organizations!partner_authorizations_organization_id_fkey(id,name,plan_type)'
      )
      .eq('partner_id', partnerId)
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false }),
    applyDemoReadScope(
      supabase
      .from('properties')
      .select(
        'id, organization_id, owner_agent_id, partner_id, title, country, status, source_type, source_partner, intake_status, raw_source_files_count, created_at, updated_at, owner_agent:agents!properties_owner_agent_id_fkey(id,name,role,is_active)'
      )
      .eq('partner_id', partnerId)
      .order('created_at', { ascending: false })
      .limit(10),
      auth,
      'organization_id'
    )
  ]);

  if (partnerResult.error || authorizationResult.error || recentPropertiesResult.error) {
    return respondError(res, 500, 'PARTNER_DETAIL_FETCH_FAILED', 'Failed to fetch partner detail.', {
      partner_error: partnerResult.error?.message ?? null,
      authorization_error: authorizationResult.error?.message ?? null,
      recent_properties_error: recentPropertiesResult.error?.message ?? null
    });
  }

  const partner = partnerResult.data;
  const authorizations = authorizationResult.data ?? [];

  if (!partner || authorizations.length === 0) {
    return respondError(res, 404, 'PARTNER_NOT_FOUND', 'Partner not found in current organization scope.');
  }

  return respondOk(res, {
    ...partner,
    authorizations,
    recent_properties: recentPropertiesResult.data ?? []
  });
});

export default router;
