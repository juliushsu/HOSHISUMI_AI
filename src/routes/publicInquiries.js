import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { respondError, respondOk } from '../lib/http.js';
import { createPublicSupabase } from '../lib/supabase.js';

const PUBLIC_SOURCE_ALLOWLIST = new Set(['partners_japan', 'for_agencies', 'contact']);
const INQUIRY_TYPE_ALLOWLIST = new Set([
  'japan_partnership',
  'agency_onboarding',
  'demo_request',
  'general_contact',
  'other'
]);
const LANGUAGE_ALLOWLIST = new Set(['ja', 'zh', 'en']);
const COMPANY_REQUIRED_INQUIRY_TYPES = new Set(['japan_partnership', 'agency_onboarding']);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 10;
const requestCounters = new Map();

const router = Router();
const supabase = createPublicSupabase();

function nowMs() {
  return Date.now();
}

function compactRateCounter() {
  const minTs = nowMs() - RATE_LIMIT_WINDOW_MS;
  for (const [key, timestamps] of requestCounters.entries()) {
    const next = timestamps.filter((ts) => ts >= minTs);
    if (next.length === 0) requestCounters.delete(key);
    else requestCounters.set(key, next);
  }
}

function isRateLimited(ip) {
  compactRateCounter();
  const key = String(ip || 'unknown');
  const list = requestCounters.get(key) ?? [];
  if (list.length >= RATE_LIMIT_MAX_REQUESTS) return true;
  list.push(nowMs());
  requestCounters.set(key, list);
  return false;
}

function isPlainObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeOptionalText(value, maxLen = 5000) {
  if (value == null) return null;
  if (typeof value !== 'string') return { invalid: true };
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > maxLen ? trimmed.slice(0, maxLen) : trimmed;
}

function normalizeRequiredText(value, maxLen = 5000) {
  const normalized = normalizeOptionalText(value, maxLen);
  if (normalized?.invalid) return { invalid: true };
  if (normalized == null) return { invalid: true };
  return normalized;
}

function normalizeLanguage(language, source) {
  if (language == null || language === '') {
    if (source === 'partners_japan') return 'ja';
    return 'zh';
  }
  if (typeof language !== 'string') return { invalid: true };
  const normalized = language.trim().toLowerCase();
  if (!LANGUAGE_ALLOWLIST.has(normalized)) return { invalid: true };
  return normalized;
}

router.post('/', async (req, res) => {
  if (isRateLimited(req.ip)) {
    return respondError(res, 429, 'RATE_LIMITED', 'Too many requests. Please try again later.');
  }

  const body = req.body;
  if (!isPlainObject(body)) {
    return respondError(res, 400, 'INVALID_BODY', 'Request body must be a JSON object.');
  }

  const honeypot = normalizeOptionalText(body.website, 200);
  if (honeypot?.invalid) {
    return respondError(res, 400, 'INVALID_HONEYPOT', 'website must be a string when provided.');
  }
  if (honeypot) {
    return respondError(res, 400, 'SPAM_DETECTED', 'Spam check failed.');
  }

  const source = normalizeRequiredText(body.source, 60);
  if (source?.invalid || !PUBLIC_SOURCE_ALLOWLIST.has(source)) {
    return respondError(
      res,
      400,
      'INVALID_SOURCE',
      'source must be one of partners_japan/for_agencies/contact.'
    );
  }

  const inquiryType = normalizeRequiredText(body.inquiry_type, 80);
  if (inquiryType?.invalid || !INQUIRY_TYPE_ALLOWLIST.has(inquiryType)) {
    return respondError(
      res,
      400,
      'INVALID_INQUIRY_TYPE',
      'inquiry_type must be one of japan_partnership/agency_onboarding/demo_request/general_contact/other.'
    );
  }

  const contactName = normalizeRequiredText(body.contact_name, 120);
  if (contactName?.invalid) {
    return respondError(res, 400, 'INVALID_CONTACT_NAME', 'contact_name is required.');
  }

  const email = normalizeRequiredText(body.email, 254);
  if (email?.invalid || !EMAIL_RE.test(email)) {
    return respondError(res, 400, 'INVALID_EMAIL', 'email is required and must be valid.');
  }

  const message = normalizeRequiredText(body.message, 5000);
  if (message?.invalid) {
    return respondError(res, 400, 'INVALID_MESSAGE', 'message is required.');
  }

  const companyName = normalizeOptionalText(body.company_name, 200);
  if (companyName?.invalid) {
    return respondError(res, 400, 'INVALID_COMPANY_NAME', 'company_name must be a string when provided.');
  }
  if (COMPANY_REQUIRED_INQUIRY_TYPES.has(inquiryType) && !companyName) {
    return respondError(
      res,
      400,
      'COMPANY_NAME_REQUIRED',
      'company_name is required for japan_partnership and agency_onboarding.'
    );
  }

  const language = normalizeLanguage(body.language, source);
  if (language?.invalid) {
    return respondError(res, 400, 'INVALID_LANGUAGE', 'language must be ja/zh/en.');
  }

  const country = normalizeOptionalText(body.country, 20);
  if (country?.invalid) return respondError(res, 400, 'INVALID_COUNTRY', 'country must be a string when provided.');
  const subject = normalizeOptionalText(body.subject, 300);
  if (subject?.invalid) return respondError(res, 400, 'INVALID_SUBJECT', 'subject must be a string when provided.');
  const phone = normalizeOptionalText(body.phone, 50);
  if (phone?.invalid) return respondError(res, 400, 'INVALID_PHONE', 'phone must be a string when provided.');
  const lineId = normalizeOptionalText(body.line_id, 120);
  if (lineId?.invalid) return respondError(res, 400, 'INVALID_LINE_ID', 'line_id must be a string when provided.');

  const metadata = body.metadata == null ? {} : body.metadata;
  if (!isPlainObject(metadata)) {
    return respondError(res, 400, 'INVALID_METADATA', 'metadata must be a JSON object when provided.');
  }

  const payload = {
    id: randomUUID(),
    org_id: null,
    source,
    inquiry_type: inquiryType,
    company_name: companyName,
    contact_name: contactName,
    email,
    phone,
    line_id: lineId,
    country: country ? country.toUpperCase() : null,
    language,
    subject,
    message,
    metadata,
    status: 'new'
  };

  const { error } = await supabase.from('partner_inquiries').insert(payload);

  if (error) {
    return respondError(res, 500, 'INQUIRY_SUBMIT_FAILED', 'Unable to submit inquiry.');
  }

  // TODO: add async notification hook (email/slack/line) after submit succeeds.
  return respondOk(
    res,
    {
      id: payload.id,
      status: payload.status,
      created_at: new Date().toISOString()
    },
    201,
    { message: 'Inquiry submitted successfully.' }
  );
});

export default router;
