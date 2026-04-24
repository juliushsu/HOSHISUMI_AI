import { Router } from 'express';
import { respondError, respondOk } from '../lib/http.js';
import {
  canAccessAiSystemSettings,
  getAiSystemSettings,
  putAiSystemSettings
} from '../services/aiSystemSettings.js';

const router = Router();

function ensureRoleAllowed(role) {
  return canAccessAiSystemSettings(role);
}

router.get('/', async (req, res) => {
  if (!ensureRoleAllowed(req.auth?.role)) {
    return respondError(res, 403, 'ROLE_NOT_ALLOWED', 'Only owner, super_admin, or system_admin can access AI system settings.');
  }

  try {
    const data = await getAiSystemSettings(req.auth.organizationId);
    return respondOk(res, data);
  } catch (error) {
    return respondError(
      res,
      error.status || 500,
      error.code || 'AI_SYSTEM_SETTINGS_FETCH_FAILED',
      error.message || 'Failed to fetch AI system settings.',
      error.details || null
    );
  }
});

router.put('/', async (req, res) => {
  if (!ensureRoleAllowed(req.auth?.role)) {
    return respondError(res, 403, 'ROLE_NOT_ALLOWED', 'Only owner, super_admin, or system_admin can edit AI system settings.');
  }

  if (req.body == null || typeof req.body !== 'object' || Array.isArray(req.body)) {
    return respondError(res, 400, 'INVALID_BODY', 'Request body must be an object.');
  }

  try {
    const data = await putAiSystemSettings({
      organizationId: req.auth.organizationId,
      agentId: req.auth.agentId,
      body: req.body
    });
    return respondOk(res, data);
  } catch (error) {
    return respondError(
      res,
      error.status || 500,
      error.code || 'AI_SYSTEM_SETTINGS_SAVE_FAILED',
      error.message || 'Failed to save AI system settings.',
      error.details || null
    );
  }
});

export default router;
