import { Router } from 'express';
import { respondError, respondOk } from '../lib/http.js';

const router = Router();

router.get('/', async (req, res) => {
  const { supabase, auth } = req;

  const { data: agent, error: agentError } = await supabase
    .from('agents')
    .select('id,organization_id,store_id,name,email,role,is_active')
    .eq('id', auth.agentId)
    .maybeSingle();

  if (agentError) {
    return respondError(res, 500, 'ME_AGENT_FETCH_FAILED', 'Failed to fetch current agent context.', {
      supabase_error: agentError.message
    });
  }

  const { data: organization, error: organizationError } = await supabase
    .from('organizations')
    .select('id,name,organization_code,is_demo')
    .eq('id', auth.organizationId)
    .maybeSingle();

  if (organizationError) {
    return respondError(res, 500, 'ME_ORGANIZATION_FETCH_FAILED', 'Failed to fetch current organization context.', {
      supabase_error: organizationError.message
    });
  }

  let store = null;
  if (agent?.store_id) {
    const { data: storeRow, error: storeError } = await supabase
      .from('stores')
      .select('id,name,slug,city,district,is_active')
      .eq('id', agent.store_id)
      .maybeSingle();

    if (storeError) {
      return respondError(res, 500, 'ME_STORE_FETCH_FAILED', 'Failed to fetch current store context.', {
        supabase_error: storeError.message
      });
    }

    store = storeRow
      ? {
          id: storeRow.id,
          name: storeRow.name,
          slug: storeRow.slug,
          city: storeRow.city ?? null,
          district: storeRow.district ?? null,
          is_active: storeRow.is_active
        }
      : null;
  }

  return respondOk(res, {
    user: {
      id: auth.userId,
      agent_id: auth.agentId,
      organization_id: auth.organizationId,
      role: auth.role,
      auth_mode: auth.authMode
    },
    agent: agent
      ? {
          id: agent.id,
          name: agent.name,
          email: agent.email ?? null,
          role: agent.role,
          store_id: agent.store_id ?? null,
          is_active: agent.is_active
        }
      : null,
    organization: organization
      ? {
          id: organization.id,
          name: organization.name,
          display_name: organization.name,
          organization_code: organization.organization_code ?? null,
          is_demo: Boolean(organization.is_demo)
        }
      : null,
    store
  });
});

export default router;
