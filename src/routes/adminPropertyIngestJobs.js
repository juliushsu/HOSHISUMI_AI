import multer from 'multer';
import { Router } from 'express';
import { respondError, respondOk } from '../lib/http.js';
import {
  PROPERTY_INGEST_MAX_FILE_BYTES,
  approvePropertyIngestJob,
  createPropertyIngestJob,
  getPropertyIngestJobDetail,
  listPropertyIngestJobs,
  reviewPropertyIngestJob,
  runPropertyIngestOcr,
  runPropertyIngestTranslate,
  validateApproveInput,
  validateCreateInput,
  validateReviewInput,
  validateRunInput
} from '../services/propertyIngestJobs.js';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: PROPERTY_INGEST_MAX_FILE_BYTES
  }
});

router.post('/', upload.single('file'), async (req, res) => {
  const validation = validateCreateInput(req.body || {}, req.file);
  if (!validation.ok) {
    return respondError(res, validation.status, validation.code, validation.message, validation.details ?? null);
  }

  const result = await createPropertyIngestJob({
    supabase: req.supabase,
    auth: req.auth,
    body: validation.input,
    file: req.file
  });

  if (!result.ok) {
    return respondError(res, result.status, result.code, result.message, result.details ?? null);
  }

  return respondOk(res, result.data, result.status);
});

router.get('/', async (req, res) => {
  const result = await listPropertyIngestJobs({
    supabase: req.supabase,
    auth: req.auth,
    query: req.query
  });

  if (!result.ok) {
    return respondError(res, result.status, result.code, result.message, result.details ?? null);
  }

  return respondOk(res, result.data, 200, result.meta ?? null);
});

router.get('/:id', async (req, res) => {
  const result = await getPropertyIngestJobDetail({
    supabase: req.supabase,
    auth: req.auth,
    id: req.params.id,
    requestedStoreId: req.query.store_id ?? null
  });

  if (!result.ok) {
    return respondError(res, result.status, result.code, result.message, result.details ?? null);
  }

  return respondOk(res, result.data);
});

router.post('/:id/run-ocr', async (req, res) => {
  const validation = validateRunInput(req.body || {});
  if (!validation.ok) {
    return respondError(res, validation.status, validation.code, validation.message, validation.details ?? null);
  }

  const result = await runPropertyIngestOcr({
    supabase: req.supabase,
    auth: req.auth,
    id: req.params.id,
    body: {
      ...validation.input,
      requested_store_id: req.body?.store_id ?? null
    }
  });

  if (!result.ok) {
    return respondError(res, result.status, result.code, result.message, result.details ?? null);
  }

  return respondOk(res, result.data);
});

router.post('/:id/run-translate', async (req, res) => {
  const validation = validateRunInput(req.body || {});
  if (!validation.ok) {
    return respondError(res, validation.status, validation.code, validation.message, validation.details ?? null);
  }

  const result = await runPropertyIngestTranslate({
    supabase: req.supabase,
    auth: req.auth,
    id: req.params.id,
    body: {
      ...validation.input,
      requested_store_id: req.body?.store_id ?? null
    }
  });

  if (!result.ok) {
    return respondError(res, result.status, result.code, result.message, result.details ?? null);
  }

  return respondOk(res, result.data);
});

router.post('/:id/review', async (req, res) => {
  const validation = validateReviewInput(req.body || {});
  if (!validation.ok) {
    return respondError(res, validation.status, validation.code, validation.message, validation.details ?? null);
  }

  const result = await reviewPropertyIngestJob({
    supabase: req.supabase,
    auth: req.auth,
    id: req.params.id,
    body: validation.input
  });

  if (!result.ok) {
    return respondError(res, result.status, result.code, result.message, result.details ?? null);
  }

  return respondOk(res, result.data);
});

router.post('/:id/approve', async (req, res) => {
  const validation = validateApproveInput(req.body || {});
  if (!validation.ok) {
    return respondError(res, validation.status, validation.code, validation.message, validation.details ?? null);
  }

  const result = await approvePropertyIngestJob({
    supabase: req.supabase,
    auth: req.auth,
    id: req.params.id,
    body: validation.input
  });

  if (!result.ok) {
    return respondError(res, result.status, result.code, result.message, result.details ?? null);
  }

  return respondOk(res, result.data);
});

router.use((error, _req, res, _next) => {
  if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
    return respondError(res, 413, 'FILE_TOO_LARGE', `file exceeds the ${PROPERTY_INGEST_MAX_FILE_BYTES}-byte limit.`);
  }

  if (error instanceof multer.MulterError) {
    return respondError(res, 400, 'INVALID_MULTIPART_REQUEST', error.message);
  }

  return respondError(res, 500, 'PROPERTY_INGEST_MULTIPART_ERROR', error?.message || 'Failed to process multipart request.');
});

export default router;
