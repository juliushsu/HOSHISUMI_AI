import { Router } from 'express';
import { respondError, respondOk } from '../lib/http.js';
import { applyDemoReadScope } from '../services/demoScope.js';

const GENERATE_POST_ACTIONS = new Set(['generate_post']);
const OWNER_SCOPE_ROLES = new Set(['owner', 'super_admin']);
const STORE_SCOPE_ROLES = new Set(['manager', 'store_manager', 'store_editor']);
const AVATAR_ALLOWED_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp']);
const AVATAR_ALLOWED_CONTENT_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const AGENT_PROFILE_BIO_MAX_LENGTH = 500;
const AGENT_PROFILE_PHONE_MIN_LENGTH = 6;
const AGENT_PROFILE_PHONE_MAX_LENGTH = 32;
const AVATAR_MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const ARRAY_FIELDS = ['languages', 'service_areas', 'specialties'];
const AGENT_PROFILE_EDITABLE_FIELDS = [
  'title',
  'phone',
  'line_id',
  'languages',
  'service_areas',
  'specialties',
  'bio',
  'office_name',
  'license_note',
  'is_visible_on_card',
  'avatar_url'
];

const AGENT_PROFILE_SELECT = [
  'id',
  'organization_id',
  'store_id',
  'name',
  'name_en',
  'email',
  'role',
  'title',
  'phone',
  'phone_public',
  'line_id',
  'line_url',
  'languages',
  'service_areas',
  'specialties',
  'bio',
  'service_area',
  'office_name',
  'license_note',
  'is_visible_on_card',
  'avatar_url',
  'is_public',
  'is_active',
  'created_at',
  'updated_at'
].join(',');

function isOwnerScopeRole(role) {
  return OWNER_SCOPE_ROLES.has(String(role || '').toLowerCase());
}

function isStoreScopeRole(role) {
  return STORE_SCOPE_ROLES.has(String(role || '').toLowerCase());
}

function getWeekStartIsoUtc() {
  const now = new Date();
  const day = now.getUTCDay();
  const diffToMonday = day === 0 ? 6 : day - 1;
  const monday = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - diffToMonday, 0, 0, 0, 0)
  );
  return monday.toISOString();
}

const router = Router();

function isPlainObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function unknownFields(body, editableFields) {
  return Object.keys(body).filter((key) => !editableFields.includes(key));
}

function normalizeOptionalText(value, maxLen = 500) {
  if (value == null) return null;
  if (typeof value !== 'string') return { invalid: true };
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > maxLen ? trimmed.slice(0, maxLen) : trimmed;
}

function normalizePhone(value) {
  const normalized = normalizeOptionalText(value, AGENT_PROFILE_PHONE_MAX_LENGTH);
  if (normalized?.invalid) return { invalid: true };
  if (normalized == null) return null;
  if (normalized.length < AGENT_PROFILE_PHONE_MIN_LENGTH || normalized.length > AGENT_PROFILE_PHONE_MAX_LENGTH) {
    return { invalid: true };
  }
  return normalized;
}

function isValidHttpUrl(value) {
  if (typeof value !== 'string' || value.trim() === '') return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) return { invalid: true };
  const normalized = [];
  for (const item of value) {
    if (typeof item !== 'string') return { invalid: true };
    const trimmed = item.trim();
    if (!trimmed) return { invalid: true };
    if (!normalized.includes(trimmed)) normalized.push(trimmed);
  }
  return { value: normalized };
}

function toAgentProfileDto(row) {
  const baseServiceAreas = Array.isArray(row.service_areas) ? row.service_areas.filter((item) => typeof item === 'string') : [];
  const fallbackServiceArea = typeof row.service_area === 'string' && row.service_area.trim() !== '' ? [row.service_area.trim()] : [];
  const serviceAreas = baseServiceAreas.length > 0 ? baseServiceAreas : fallbackServiceArea;

  return {
    id: row.id,
    name: row.name,
    name_en: row.name_en ?? null,
    email: row.email ?? null,
    role: row.role,
    title: row.title ?? null,
    phone: row.phone ?? row.phone_public ?? null,
    line_id: row.line_id ?? null,
    languages: Array.isArray(row.languages) ? row.languages : [],
    service_areas: serviceAreas,
    specialties: Array.isArray(row.specialties) ? row.specialties : [],
    bio: row.bio ?? null,
    office_name: row.office_name ?? null,
    license_note: row.license_note ?? null,
    is_visible_on_card: row.is_visible_on_card ?? true,
    avatar_url: row.avatar_url ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

function toPublicReadableAgentDto(row) {
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    title: row.title ?? null,
    bio: row.bio ?? null,
    avatar_url: row.avatar_url ?? null,
    service_area: row.service_area ?? null,
    phone_public: row.phone_public ?? null,
    line_url: row.line_url ?? null
  };
}

async function resolveActor(supabase, auth) {
  const { data, error } = await supabase
    .from('agents')
    .select('id, organization_id, role, store_id, is_active')
    .eq('id', auth.agentId)
    .maybeSingle();

  if (error) {
    return {
      ok: false,
      status: 500,
      code: 'ACTOR_LOOKUP_FAILED',
      message: 'Failed to resolve actor authorization scope.'
    };
  }

  if (!data || !data.is_active || data.organization_id !== auth.organizationId) {
    return {
      ok: false,
      status: 403,
      code: 'ACTOR_NOT_ALLOWED',
      message: 'Current actor cannot access agent profile APIs.'
    };
  }

  return {
    ok: true,
    actor: {
      id: data.id,
      organization_id: data.organization_id,
      role: String(data.role || '').toLowerCase(),
      store_id: data.store_id ?? null
    }
  };
}

function canReadFullProfile(actor, target) {
  if (isOwnerScopeRole(actor.role)) return true;
  if (actor.id === target.id) return true;
  if (isStoreScopeRole(actor.role) && actor.store_id && target.store_id === actor.store_id) return true;
  return false;
}

function canWriteProfile(actor, target) {
  if (isOwnerScopeRole(actor.role)) return true;
  if (actor.id === target.id) return true;
  if (isStoreScopeRole(actor.role) && actor.store_id && target.store_id === actor.store_id) return true;
  return false;
}

function canReadPublic(target) {
  return Boolean(target.is_active && target.is_public);
}

function avatarPublicUrl(supabaseUrl, bucket, fileKey) {
  const root = String(supabaseUrl || '').replace(/\/+$/, '');
  return `${root}/storage/v1/object/public/${bucket}/${fileKey}`;
}

router.get('/', async (req, res) => {
  // Contract note:
  // - recent_activity is the canonical latest activity field per agent.
  // - success/empty keeps envelope: { data: [], error: null, meta: null }.
  // - failure keeps standard error envelope.
  const { supabase, auth } = req;
  const actorScope = await resolveActor(supabase, auth);
  if (!actorScope.ok) {
    return respondError(res, actorScope.status, actorScope.code, actorScope.message);
  }

  const actor = actorScope.actor;
  const weekStartIso = getWeekStartIsoUtc();

  let agentsQuery = supabase
    .from('agents')
    .select('id, name, role, is_active, created_at, store_id')
    .eq('organization_id', auth.organizationId)
    .order('created_at', { ascending: true });

  if (isOwnerScopeRole(actor.role)) {
    // owner/super_admin: full organization scope
  } else if (isStoreScopeRole(actor.role) && actor.store_id) {
    agentsQuery = agentsQuery.eq('store_id', actor.store_id);
  } else {
    agentsQuery = agentsQuery.eq('id', auth.agentId);
  }

  const { data: agents, error: agentsError } = await agentsQuery;
  if (agentsError) {
    return respondError(res, 500, 'AGENTS_FETCH_FAILED', 'Failed to fetch agents.');
  }

  const agentIds = (agents ?? []).map((row) => row.id);
  if (agentIds.length === 0) return respondOk(res, []);

  let clientsQuery = supabase
      .from('clients')
      .select('assigned_agent_id')
      .in('assigned_agent_id', agentIds);
  clientsQuery = applyDemoReadScope(clientsQuery, auth, 'organization_id');

  let aiUsageQuery = supabase
      .from('ai_usage_logs')
      .select('agent_id, action_type, tokens_used, created_at')
      .in('agent_id', agentIds)
      .order('created_at', { ascending: false });
  aiUsageQuery = applyDemoReadScope(aiUsageQuery, auth, 'organization_id');

  const [clientsResult, aiUsageResult] = await Promise.all([clientsQuery, aiUsageQuery]);

  if (clientsResult.error || aiUsageResult.error) {
    return respondError(res, 500, 'AGENTS_SUMMARY_FAILED', 'Failed to build agents summary.');
  }

  const assignedClientsCountByAgent = new Map();
  for (const row of clientsResult.data ?? []) {
    const key = row.assigned_agent_id;
    assignedClientsCountByAgent.set(key, (assignedClientsCountByAgent.get(key) ?? 0) + 1);
  }

  const generatedPostsByAgent = new Map();
  const recentActivityByAgent = new Map();
  const weekStartMs = new Date(weekStartIso).getTime();
  for (const row of aiUsageResult.data ?? []) {
    const agentId = row.agent_id;
    const actionType = row.action_type ?? '';
    const createdAt = row.created_at ?? null;
    const createdAtMs = createdAt ? new Date(createdAt).getTime() : 0;

    if (!recentActivityByAgent.has(agentId) && createdAt) {
      recentActivityByAgent.set(agentId, {
        action_type: actionType,
        tokens_used: Number(row.tokens_used ?? 0),
        occurred_at: createdAt
      });
    }

    if (GENERATE_POST_ACTIONS.has(actionType) && createdAtMs >= weekStartMs) {
      generatedPostsByAgent.set(agentId, (generatedPostsByAgent.get(agentId) ?? 0) + 1);
    }
  }

  const result = (agents ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    role: row.role,
    is_active: row.is_active,
    assigned_clients_count: assignedClientsCountByAgent.get(row.id) ?? 0,
    generated_posts_count_this_week: generatedPostsByAgent.get(row.id) ?? 0,
    recent_activity: recentActivityByAgent.get(row.id) ?? null
  }));

  return respondOk(res, result);
});

router.post('/:id/avatar-upload-url', async (req, res) => {
  // Minimal upload-reserve endpoint for front-end adapter:
  // returns signed upload URL + file key + expected final avatar URL.
  const { supabase, auth } = req;
  const agentId = req.params.id;
  const body = req.body;

  if (!isPlainObject(body)) {
    return respondError(res, 400, 'INVALID_BODY', 'Request body must be a JSON object.');
  }

  const actorScope = await resolveActor(supabase, auth);
  if (!actorScope.ok) {
    return respondError(res, actorScope.status, actorScope.code, actorScope.message);
  }

  const { data: target, error: targetError } = await supabase
    .from('agents')
    .select(AGENT_PROFILE_SELECT)
    .eq('id', agentId)
    .eq('organization_id', auth.organizationId)
    .maybeSingle();

  if (targetError) {
    return respondError(res, 500, 'AGENT_PROFILE_FETCH_FAILED', 'Failed to fetch agent profile.');
  }
  if (!target) {
    return respondError(res, 404, 'AGENT_NOT_FOUND', 'Agent not found in current scope.');
  }

  if (!canWriteProfile(actorScope.actor, target)) {
    return respondError(res, 403, 'FORBIDDEN', 'You do not have permission to upload avatar for this agent.');
  }

  const fileName = normalizeOptionalText(body.file_name, 200);
  if (fileName?.invalid || fileName == null) {
    return respondError(res, 400, 'INVALID_FILE_NAME', 'file_name is required.');
  }
  const extension = fileName.includes('.') ? fileName.split('.').pop().toLowerCase() : '';
  if (!AVATAR_ALLOWED_EXTENSIONS.has(extension)) {
    return respondError(res, 400, 'INVALID_FILE_EXTENSION', 'Avatar file extension must be jpg/jpeg/png/webp.');
  }

  if (body.content_type !== undefined) {
    const contentType = normalizeOptionalText(body.content_type, 100);
    if (contentType?.invalid || contentType == null || !AVATAR_ALLOWED_CONTENT_TYPES.has(contentType)) {
      return respondError(
        res,
        400,
        'INVALID_CONTENT_TYPE',
        'content_type must be image/jpeg, image/png, or image/webp.'
      );
    }
  }

  if (body.file_size !== undefined) {
    if (!Number.isInteger(body.file_size) || body.file_size <= 0 || body.file_size > AVATAR_MAX_FILE_SIZE_BYTES) {
      return respondError(
        res,
        400,
        'INVALID_FILE_SIZE',
        `file_size must be a positive integer and <= ${AVATAR_MAX_FILE_SIZE_BYTES} bytes.`
      );
    }
  }

  const bucket = String(process.env.SUPABASE_AVATAR_BUCKET || 'agent-avatars').trim();
  const randomPart = Math.random().toString(36).slice(2, 10);
  const fileKey = `agents/${target.id}/avatar-${Date.now()}-${randomPart}.${extension}`;
  const signed = await supabase.storage.from(bucket).createSignedUploadUrl(fileKey);
  if (signed.error || !signed.data?.signedUrl) {
    return respondError(
      res,
      500,
      'AVATAR_UPLOAD_URL_CREATE_FAILED',
      'Unable to create avatar upload URL. Please verify storage bucket policy.'
    );
  }

  return respondOk(res, {
    bucket,
    file_key: fileKey,
    upload_url: signed.data.signedUrl,
    upload_token: signed.data.token ?? null,
    avatar_url: avatarPublicUrl(process.env.SUPABASE_URL, bucket, fileKey),
    constraints: {
      max_file_size_bytes: AVATAR_MAX_FILE_SIZE_BYTES,
      allowed_extensions: Array.from(AVATAR_ALLOWED_EXTENSIONS),
      allowed_content_types: Array.from(AVATAR_ALLOWED_CONTENT_TYPES)
    }
  });
});

router.get('/:id', async (req, res) => {
  const { supabase, auth } = req;
  const agentId = req.params.id;

  const actorScope = await resolveActor(supabase, auth);
  if (!actorScope.ok) {
    return respondError(res, actorScope.status, actorScope.code, actorScope.message);
  }

  const { data: target, error: targetError } = await supabase
    .from('agents')
    .select(AGENT_PROFILE_SELECT)
    .eq('id', agentId)
    .eq('organization_id', auth.organizationId)
    .maybeSingle();

  if (targetError) {
    return respondError(res, 500, 'AGENT_PROFILE_FETCH_FAILED', 'Failed to fetch agent profile.');
  }
  if (!target) {
    return respondError(res, 404, 'AGENT_NOT_FOUND', 'Agent not found in current scope.');
  }

  if (canReadFullProfile(actorScope.actor, target)) {
    return respondOk(res, toAgentProfileDto(target));
  }

  if (canReadPublic(target)) {
    return respondOk(res, toPublicReadableAgentDto(target), 200, { visibility: 'public_limited' });
  }

  return respondError(res, 403, 'FORBIDDEN', 'You do not have permission to view this agent profile.');
});

router.patch('/:id', async (req, res) => {
  const { supabase, auth } = req;
  const agentId = req.params.id;
  const body = req.body;

  if (!isPlainObject(body)) {
    return respondError(res, 400, 'INVALID_BODY', 'Request body must be a JSON object.');
  }

  const extra = unknownFields(body, AGENT_PROFILE_EDITABLE_FIELDS);
  if (extra.length > 0) {
    return respondError(res, 400, 'UNSUPPORTED_FIELDS', 'Request includes unsupported profile fields.', {
      unsupported_fields: extra,
      editable_fields: AGENT_PROFILE_EDITABLE_FIELDS
    });
  }

  if (Object.keys(body).length === 0) {
    return respondError(res, 400, 'EMPTY_PATCH_BODY', 'At least one editable field is required.');
  }

  const actorScope = await resolveActor(supabase, auth);
  if (!actorScope.ok) {
    return respondError(res, actorScope.status, actorScope.code, actorScope.message);
  }

  const { data: target, error: targetError } = await supabase
    .from('agents')
    .select(AGENT_PROFILE_SELECT)
    .eq('id', agentId)
    .eq('organization_id', auth.organizationId)
    .maybeSingle();

  if (targetError) {
    return respondError(res, 500, 'AGENT_PROFILE_FETCH_FAILED', 'Failed to fetch agent profile.');
  }
  if (!target) {
    return respondError(res, 404, 'AGENT_NOT_FOUND', 'Agent not found in current scope.');
  }

  if (!canWriteProfile(actorScope.actor, target)) {
    return respondError(res, 403, 'FORBIDDEN', 'You do not have permission to update this agent profile.');
  }

  const updates = {};

  if (body.title !== undefined) {
    const normalized = normalizeOptionalText(body.title, 120);
    if (normalized?.invalid) {
      return respondError(res, 400, 'INVALID_TITLE', 'title must be a string or null.');
    }
    updates.title = normalized;
  }

  if (body.phone !== undefined) {
    const normalized = normalizePhone(body.phone);
    if (normalized?.invalid) {
      return respondError(
        res,
        400,
        'INVALID_PHONE',
        `phone must be a string length ${AGENT_PROFILE_PHONE_MIN_LENGTH}-${AGENT_PROFILE_PHONE_MAX_LENGTH}, or null.`
      );
    }
    updates.phone = normalized;
  }

  if (body.line_id !== undefined) {
    const normalized = normalizeOptionalText(body.line_id, 120);
    if (normalized?.invalid) {
      return respondError(res, 400, 'INVALID_LINE_ID', 'line_id must be a string or null.');
    }
    updates.line_id = normalized;
  }

  if (body.bio !== undefined) {
    const normalized = normalizeOptionalText(body.bio, AGENT_PROFILE_BIO_MAX_LENGTH);
    if (normalized?.invalid) {
      return respondError(res, 400, 'INVALID_BIO', 'bio must be a string or null.');
    }
    if (normalized != null && normalized.length > AGENT_PROFILE_BIO_MAX_LENGTH) {
      return respondError(res, 400, 'INVALID_BIO', `bio must be <= ${AGENT_PROFILE_BIO_MAX_LENGTH} characters.`);
    }
    updates.bio = normalized;
  }

  if (body.office_name !== undefined) {
    const normalized = normalizeOptionalText(body.office_name, 120);
    if (normalized?.invalid) {
      return respondError(res, 400, 'INVALID_OFFICE_NAME', 'office_name must be a string or null.');
    }
    updates.office_name = normalized;
  }

  if (body.license_note !== undefined) {
    const normalized = normalizeOptionalText(body.license_note, 200);
    if (normalized?.invalid) {
      return respondError(res, 400, 'INVALID_LICENSE_NOTE', 'license_note must be a string or null.');
    }
    updates.license_note = normalized;
  }

  if (body.is_visible_on_card !== undefined) {
    if (typeof body.is_visible_on_card !== 'boolean') {
      return respondError(res, 400, 'INVALID_IS_VISIBLE_ON_CARD', 'is_visible_on_card must be a boolean.');
    }
    updates.is_visible_on_card = body.is_visible_on_card;
  }

  if (body.avatar_url !== undefined) {
    const normalized = normalizeOptionalText(body.avatar_url, 2000);
    if (normalized?.invalid) {
      return respondError(res, 400, 'INVALID_AVATAR_URL', 'avatar_url must be a URL string or null.');
    }
    if (normalized != null && !isValidHttpUrl(normalized)) {
      return respondError(res, 400, 'INVALID_AVATAR_URL', 'avatar_url must be a valid http/https URL.');
    }
    updates.avatar_url = normalized;
  }

  for (const field of ARRAY_FIELDS) {
    if (body[field] !== undefined) {
      const normalized = normalizeStringArray(body[field]);
      if (normalized.invalid) {
        return respondError(res, 400, `INVALID_${field.toUpperCase()}`, `${field} must be an array of non-empty strings.`);
      }
      updates[field] = normalized.value;
      if (field === 'service_areas') {
        updates.service_area = normalized.value[0] ?? null;
      }
    }
  }

  if (Object.keys(updates).length === 0) {
    return respondError(res, 400, 'EMPTY_PATCH_BODY', 'No valid editable fields were provided.');
  }

  const { data: updated, error: updateError } = await supabase
    .from('agents')
    .update(updates)
    .eq('id', target.id)
    .eq('organization_id', auth.organizationId)
    .select(AGENT_PROFILE_SELECT)
    .single();

  if (updateError) {
    return respondError(res, 400, 'AGENT_PROFILE_UPDATE_FAILED', 'Unable to update agent profile.');
  }

  return respondOk(res, toAgentProfileDto(updated), 200, { message: 'Agent profile updated successfully.' });
});

export default router;
