import { createAuthedSupabase, createServiceSupabase } from '../lib/supabase.js';
import { respondError } from '../lib/http.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function pickClaim(user, key) {
  return user?.app_metadata?.[key] ?? user?.user_metadata?.[key] ?? null;
}

function readBearerToken(req) {
  const raw = req.headers.authorization || '';
  if (!raw.toLowerCase().startsWith('bearer ')) return null;
  return raw.slice(7).trim();
}

function normalizeEmail(value) {
  if (typeof value !== 'string') return null;
  const next = value.trim().toLowerCase();
  return next || null;
}

export async function requireAuth(req, res, next) {
  const accessToken = readBearerToken(req);
  const organizationId = req.headers['x-organization-id'];

  if (!accessToken) {
    return respondError(res, 401, 'UNAUTHORIZED', 'Missing Bearer token.');
  }

  if (!organizationId || !UUID_RE.test(organizationId)) {
    return respondError(res, 400, 'INVALID_ORGANIZATION_HEADER', 'Missing or invalid x-organization-id header.');
  }

  const supabase = createAuthedSupabase(accessToken);
  const { data, error } = await supabase.auth.getUser();

  if (error || !data?.user) {
    return respondError(res, 401, 'INVALID_TOKEN', 'Invalid token.');
  }

  const user = data.user;
  const tokenOrgId = pickClaim(user, 'organization_id');
  const tokenAgentId = pickClaim(user, 'agent_id');
  const normalizedUserEmail = normalizeEmail(user.email);
  const tokenAgentIdValid = typeof tokenAgentId === 'string' && UUID_RE.test(tokenAgentId);
  const canUseTokenScopedAgent = Boolean(tokenOrgId && tokenOrgId === organizationId && tokenAgentIdValid);
  const serviceSupabase = canUseTokenScopedAgent ? null : createServiceSupabase();
  const scopedSupabase = canUseTokenScopedAgent ? supabase : serviceSupabase;

  let agent = null;

  if (canUseTokenScopedAgent) {
    const { data: scopedAgent, error: scopedAgentError } = await scopedSupabase
      .from('agents')
      .select('id, organization_id, role, is_active, is_demo')
      .eq('id', tokenAgentId)
      .maybeSingle();

    if (scopedAgentError) {
      return respondError(res, 500, 'AGENT_VALIDATION_FAILED', 'Failed to validate agent.', {
        supabase_error: scopedAgentError.message
      });
    }

    if (!scopedAgent || !scopedAgent.is_active || scopedAgent.organization_id !== organizationId) {
      return respondError(res, 403, 'AGENT_NOT_ALLOWED', 'Agent is not active or not in this organization.');
    }

    agent = scopedAgent;
  } else {
    if (!normalizedUserEmail) {
      return respondError(res, 403, 'ORGANIZATION_MISMATCH', 'Organization mismatch.');
    }

    const { data: scopedAgent, error: scopedAgentError } = await scopedSupabase
      .from('agents')
      .select('id, organization_id, role, is_active, is_demo')
      .eq('organization_id', organizationId)
      .eq('email', normalizedUserEmail)
      .eq('is_active', true)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (scopedAgentError) {
      return respondError(res, 500, 'AGENT_VALIDATION_FAILED', 'Failed to validate agent.', {
        supabase_error: scopedAgentError.message
      });
    }

    if (!scopedAgent) {
      return respondError(
        res,
        403,
        'AGENT_NOT_ALLOWED',
        'No active agent profile found for this organization. Please contact admin.'
      );
    }

    agent = scopedAgent;
  }

  const { data: organization, error: organizationError } = await scopedSupabase
    .from('organizations')
    .select('id,is_demo')
    .eq('id', organizationId)
    .maybeSingle();

  if (organizationError) {
    return respondError(res, 500, 'ORGANIZATION_VALIDATION_FAILED', 'Failed to validate organization.', {
      supabase_error: organizationError.message
    });
  }

  if (!organization) {
    return respondError(res, 403, 'ORGANIZATION_NOT_FOUND', 'Organization not found for current token scope.');
  }

  req.supabase = scopedSupabase;
  req.auth = {
    userId: user.id,
    organizationId,
    agentId: agent.id,
    role: agent.role,
    isDemo: Boolean(agent.is_demo || organization.is_demo),
    authMode: canUseTokenScopedAgent ? 'token_scope' : 'cross_org_membership'
  };

  return next();
}
