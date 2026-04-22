export const DEMO_ORG_ID = String(process.env.DEMO_ORG_ID || '00000000-0000-4000-8000-00000000de00');
export const DEMO_ORG_CODE = 'DEMO_ORG';
export const DEMO_DATA_TYPE_SEED = 'seed';
export const DEMO_DATA_TYPE_SANDBOX = 'sandbox';
export const DEMO_VISIBLE_DATA_TYPES = [DEMO_DATA_TYPE_SEED, DEMO_DATA_TYPE_SANDBOX];

export function isDemoAuth(auth) {
  return Boolean(auth?.isDemo);
}

export function scopedOrganizationId(auth) {
  return isDemoAuth(auth) ? DEMO_ORG_ID : auth.organizationId;
}

export function applyDemoReadScope(query, auth, organizationField = 'organization_id') {
  let next = query.eq(organizationField, scopedOrganizationId(auth));
  if (isDemoAuth(auth)) {
    next = next.in('demo_data_type', DEMO_VISIBLE_DATA_TYPES);
  }
  return next;
}

export function applyDemoWriteDefaults(payload, auth, organizationField = 'organization_id') {
  const next = {
    ...payload,
    [organizationField]: scopedOrganizationId(auth)
  };
  if (isDemoAuth(auth)) {
    next.demo_data_type = DEMO_DATA_TYPE_SANDBOX;
  }
  return next;
}

export function applyDemoUpdateGuard(query, auth) {
  if (!isDemoAuth(auth)) return query;
  return query.neq('demo_data_type', DEMO_DATA_TYPE_SEED);
}

export function isDemoSeedRow(row, auth) {
  return isDemoAuth(auth) && row?.demo_data_type === DEMO_DATA_TYPE_SEED;
}
