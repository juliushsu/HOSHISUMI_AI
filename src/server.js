import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import clientsRouter from './routes/clients.js';
import propertiesRouter from './routes/properties.js';
import aiRouter from './routes/ai.js';
import dashboardRouter from './routes/dashboard.js';
import leadsRouter from './routes/leads.js';
import partnersRouter from './routes/partners.js';
import intakeQueueRouter from './routes/intakeQueue.js';
import agentsRouter from './routes/agents.js';
import rentalRouter from './routes/rental.js';
import managementRouter from './routes/management.js';
import managementEventsRouter from './routes/managementEvents.js';
import storefrontRouter from './routes/storefront.js';
import adminStorefrontRouter from './routes/adminStorefront.js';
import adminLeadsRouter from './routes/adminLeads.js';
import adminPropertiesRouter from './routes/adminProperties.js';
import adminImportBatchesRouter from './routes/adminImportBatches.js';
import adminIntakeCasesRouter from './routes/adminIntakeCases.js';
import adminPropertyIngestJobsRouter from './routes/adminPropertyIngestJobs.js';
import adminAiAssistantRouter from './routes/adminAiAssistant.js';
import publicInquiriesRouter from './routes/publicInquiries.js';
import adminInquiriesRouter from './routes/adminInquiries.js';
import { requireAuth } from './middleware/auth.js';
import { respondError, respondOk } from './lib/http.js';

const app = express();
const port = Number(process.env.PORT || 8080);
const appEnv = String(process.env.APP_ENV || process.env.NODE_ENV || '').toLowerCase();
const railwayProjectName = String(process.env.RAILWAY_PROJECT_NAME || '').toLowerCase();
const isStaging = appEnv === 'staging' || railwayProjectName.includes('staging');
const isProduction = appEnv === 'production' && !isStaging;
const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS || 'https://preview.readdy.ai,https://hoshisumi.com,https://www.hoshisumi.com')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);
const allowedOriginSuffixes = (process.env.CORS_ALLOWED_SUFFIXES || '.readdy.ai')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);
const allowNoOrigin = process.env.CORS_ALLOW_NO_ORIGIN !== 'false';

function isAllowedOrigin(origin) {
  if (isStaging) return true;
  if (!origin) return allowNoOrigin;
  if (allowedOrigins.includes(origin)) return true;
  return allowedOriginSuffixes.some((suffix) => origin.endsWith(suffix));
}

function requireStagingFeature(_req, res, next) {
  if (!isStaging) {
    return respondError(res, 404, 'STAGING_FEATURE_NOT_FOUND', 'Route is available in staging only.');
  }
  return next();
}

const corsOptions = {
  origin(origin, callback) {
    if (isAllowedOrigin(origin)) {
      return callback(null, true);
    }

    return callback(new Error('Not allowed by CORS'));
  },
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['authorization', 'content-type', 'x-organization-id'],
  credentials: true,
  optionsSuccessStatus: 200
};

app.use((req, res, next) => {
  const isApiPreflight = req.method === 'OPTIONS' && req.path.startsWith('/api/');
  if (!isApiPreflight) return next();

  if (!isProduction) {
    console.log('[cors:preflight]', {
      method: req.method,
      path: req.path,
      origin: req.headers.origin || null,
      access_control_request_method: req.headers['access-control-request-method'] || null,
      access_control_request_headers: req.headers['access-control-request-headers'] || null
    });
  }

  if (!isStaging) return next();

  const requestOrigin = req.headers.origin;
  if (requestOrigin) {
    res.setHeader('Access-Control-Allow-Origin', requestOrigin);
    res.setHeader('Vary', 'Origin');
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Headers', 'authorization,content-type,x-organization-id');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  return res.status(200).end();
});

app.use(cors(corsOptions));
app.options('/api/*', cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json({ limit: '1mb' }));

app.get('/health', (_req, res) => {
  return respondOk(res, { ok: true, service: 'hoshisumi-mvp-backend' });
});

app.get('/api/health', (_req, res) => {
  return respondOk(res, { status: 'ok' });
});

app.use('/api/leads', leadsRouter);
app.use('/api/public/inquiries', publicInquiriesRouter);
app.use('/api/storefront', storefrontRouter);
app.use('/api/admin/storefront', requireAuth, adminStorefrontRouter);
app.use('/api/admin/leads', requireAuth, adminLeadsRouter);
app.use('/api/admin/inquiries', requireAuth, adminInquiriesRouter);
app.use('/api/admin/properties', requireAuth, adminPropertiesRouter);
app.use('/api/admin/import-batches', requireAuth, adminImportBatchesRouter);
app.use('/api/admin/intake-cases', requireAuth, adminIntakeCasesRouter);
app.use('/api/admin/property-ingest/jobs', requireAuth, adminPropertyIngestJobsRouter);
app.use('/api/admin/ai-assistant', requireStagingFeature, requireAuth, adminAiAssistantRouter);
app.use('/api/clients', requireAuth, clientsRouter);
app.use('/api/properties', requireAuth, propertiesRouter);
app.use('/api/partners', requireAuth, partnersRouter);
app.use('/api/intake-queue', requireAuth, intakeQueueRouter);
app.use('/api/ai', requireAuth, aiRouter);
app.use('/api/dashboard', requireAuth, dashboardRouter);
app.use('/api/agents', requireAuth, agentsRouter);
app.use('/api/rental', requireAuth, rentalRouter);
app.use('/api/management', requireAuth, managementRouter);
app.use('/api/management-events', requireAuth, managementEventsRouter);

app.use((err, _req, res, _next) => {
  if (err?.message === 'Not allowed by CORS') {
    return respondError(res, 403, 'CORS_ORIGIN_NOT_ALLOWED', 'Origin is not allowed.');
  }

  console.error(err);
  return respondError(res, 500, 'INTERNAL_SERVER_ERROR', 'Internal server error.');
});

app.listen(port, () => {
  console.log(`HOSHISUMI MVP backend listening on :${port}`);
});
