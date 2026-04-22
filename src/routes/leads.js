import { Router } from 'express';
import { respondError, respondOk } from '../lib/http.js';
import { createPublicSupabase } from '../lib/supabase.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[0-9+()\-\s]{6,30}$/;

const router = Router();
const supabase = createPublicSupabase();

function normalizeOptionalString(value, maxLen = 5000) {
  if (value == null) return null;
  if (typeof value !== 'string') return undefined;

  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > maxLen ? trimmed.slice(0, maxLen) : trimmed;
}

router.post('/', async (req, res) => {
  const body = req.body || {};

  const name = normalizeOptionalString(body.name, 120);
  const company = normalizeOptionalString(body.company, 200);
  const phone = normalizeOptionalString(body.phone, 40);
  const email = normalizeOptionalString(body.email, 254);
  const message = normalizeOptionalString(body.message, 5000);
  const sourcePage = normalizeOptionalString(body.source_page, 500);
  const language = normalizeOptionalString(body.language, 40);

  if (!name) {
    return respondError(res, 400, 'INVALID_LEAD_NAME', 'name is required.');
  }

  if (!email && !phone) {
    return respondError(res, 400, 'MISSING_CONTACT', 'email or phone is required.');
  }

  if (email && !EMAIL_RE.test(email)) {
    return respondError(res, 400, 'INVALID_EMAIL', 'email format is invalid.');
  }

  if (phone && !PHONE_RE.test(phone)) {
    return respondError(res, 400, 'INVALID_PHONE', 'phone format is invalid.');
  }

  if (
    (body.company != null && company === undefined) ||
    (body.phone != null && phone === undefined) ||
    (body.email != null && email === undefined) ||
    (body.message != null && message === undefined) ||
    (body.source_page != null && sourcePage === undefined) ||
    (body.language != null && language === undefined)
  ) {
    return respondError(res, 400, 'INVALID_FIELD_TYPE', 'lead fields must be strings when provided.');
  }

  const payload = {
    name,
    company,
    phone,
    email,
    message,
    source_page: sourcePage,
    language
  };

  const { error } = await supabase.from('leads').insert(payload);

  if (error) {
    return respondError(res, 500, 'LEAD_CREATE_FAILED', 'Failed to create lead.', {
      supabase_error: error.message
    });
  }

  return respondOk(res, { accepted: true }, 201);
});

export default router;
