function normalizeDetails(details) {
  if (details == null) return null;
  if (typeof details === 'string') return { message: details };
  return details;
}

export function respondOk(res, data, status = 200, meta = null) {
  return res.status(status).json({
    data,
    error: null,
    meta
  });
}

export function respondError(res, status, code, message, details = null) {
  return res.status(status).json({
    data: null,
    error: {
      code,
      message,
      details: normalizeDetails(details)
    },
    meta: null
  });
}
