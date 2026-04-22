import { Router } from 'express';
import { generatePost, translateProperty } from '../services/ai.js';
import { respondError, respondOk } from '../lib/http.js';
import { applyDemoReadScope, applyDemoWriteDefaults } from '../services/demoScope.js';

const router = Router();

router.post('/translate-property', async (req, res) => {
  const { supabase, auth } = req;
  const payload = req.body || {};

  if (!payload.jp_title && !payload.jp_description && !payload.title && !payload.description) {
    return respondError(
      res,
      400,
      'INVALID_TRANSLATE_PAYLOAD',
      'At least one of jp_title/jp_description/title/description is required.'
    );
  }

  try {
    const { result, tokensUsed } = await translateProperty(payload);

    const { error: logError } = await supabase.from('ai_usage_logs').insert(applyDemoWriteDefaults({
      agent_id: auth.agentId,
      action_type: 'translate_property',
      tokens_used: tokensUsed
    }, auth, 'organization_id'));

    if (logError) {
      return respondError(res, 500, 'AI_USAGE_LOG_FAILED', 'AI response generated but usage log failed.', {
        supabase_error: logError.message
      });
    }

    return respondOk(res, result, 200, { tokens_used: tokensUsed });
  } catch (error) {
    return respondError(res, 500, 'TRANSLATE_PROPERTY_FAILED', error.message || 'translate-property failed.');
  }
});

router.post('/generate-post', async (req, res) => {
  const { supabase, auth } = req;
  const { property_id: propertyId } = req.body || {};

  if (!propertyId) {
    return respondError(res, 400, 'MISSING_PROPERTY_ID', 'property_id is required.');
  }

  let propertyQuery = supabase
    .from('properties')
    .select('*')
    .eq('id', propertyId);
  propertyQuery = applyDemoReadScope(propertyQuery, auth, 'organization_id');
  const { data: property, error: propertyError } = await propertyQuery.maybeSingle();

  if (propertyError) {
    return respondError(res, 400, 'PROPERTY_FETCH_FAILED', 'Failed to fetch property.', {
      supabase_error: propertyError.message
    });
  }

  if (!property) {
    return respondError(res, 404, 'PROPERTY_NOT_FOUND', 'Property not found.');
  }

  try {
    const { result, tokensUsed } = await generatePost(property);

    const { error: logError } = await supabase.from('ai_usage_logs').insert(applyDemoWriteDefaults({
      agent_id: auth.agentId,
      action_type: 'generate_post',
      tokens_used: tokensUsed
    }, auth, 'organization_id'));

    if (logError) {
      return respondError(res, 500, 'AI_USAGE_LOG_FAILED', 'AI response generated but usage log failed.', {
        supabase_error: logError.message
      });
    }

    return respondOk(res, result, 200, { tokens_used: tokensUsed });
  } catch (error) {
    return respondError(res, 500, 'GENERATE_POST_FAILED', error.message || 'generate-post failed.');
  }
});

export default router;
