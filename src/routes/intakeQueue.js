import { Router } from 'express';
import { respondError, respondOk } from '../lib/http.js';
import { applyDemoReadScope } from '../services/demoScope.js';

const INTAKE_SOURCE_TYPES = ['japan_line', 'japan_api', 'import'];

function isOwnerOrManager(role) {
  return role === 'owner' || role === 'manager';
}

const router = Router();

router.get('/', async (req, res) => {
  const { supabase, auth } = req;
  const requestedLimit = Number(req.query.limit ?? 50);
  const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 200) : 50;

  if (!isOwnerOrManager(auth.role)) {
    return respondError(res, 403, 'FORBIDDEN', 'Only owner/manager can access intake queue.');
  }

  let query = supabase
    .from('properties')
    .select(
      'id, organization_id, owner_agent_id, partner_id, title, description, price, country, status, source, source_type, source_partner, cross_border_fee_percent, intake_status, raw_source_files_count, updated_at, created_at, partner:partners!properties_partner_id_fkey(id,display_name,status), owner_agent:agents!properties_owner_agent_id_fkey(id,name,role,is_active), organization:organizations(id,name,plan_type)'
    )
    .in('source_type', INTAKE_SOURCE_TYPES)
    .neq('intake_status', 'assigned')
    .order('updated_at', { ascending: false })
    .limit(limit);
  query = applyDemoReadScope(query, auth, 'organization_id');

  const { data, error } = await query;

  if (error) {
    return respondError(res, 500, 'INTAKE_QUEUE_FETCH_FAILED', 'Failed to fetch intake queue.', {
      supabase_error: error.message
    });
  }

  return respondOk(res, data);
});

export default router;
