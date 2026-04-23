import {
  buildTranslatedFieldCoverage,
  estimateCostUsd,
  extractTokenUsage,
  normalizeConfidence,
  normalizeOptionalString,
  safeParseJSON
} from './strategyUtils.js';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY_STAGING || process.env.OPENAI_API_KEY_DEV;
const VISION_PROVIDER = String(process.env.PROPERTY_INGEST_VISION_PROVIDER || '').trim().toLowerCase();
const OPENAI_MODEL = process.env.PROPERTY_INGEST_VISION_MODEL || process.env.PROPERTY_INGEST_OCR_MODEL || process.env.OPENAI_MODEL || 'gpt-4.1-mini';

const EMPTY_FIELDS = {
  title_ja: null,
  title_zh: null,
  address_ja: null,
  address_zh: null,
  rent_jpy: null,
  area_sqm: null,
  layout: null,
  building_age: null,
  station_name: null,
  station_walk_minutes: null,
  source_agency: null,
  remarks: null
};

function buildDataUrl(buffer, mimeType) {
  return `data:${mimeType};base64,${buffer.toString('base64')}`;
}

function normalizeOptionalNumber(value, integerOnly = false) {
  if (value == null || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? (integerOnly ? Math.trunc(value) : value) : null;
  if (typeof value !== 'string') return null;
  const normalized = value.replace(/,/g, '').trim();
  if (!normalized) return null;
  const parsed = Number.parseFloat(normalized);
  if (!Number.isFinite(parsed)) return null;
  return integerOnly ? Math.trunc(parsed) : parsed;
}

function normalizeFields(parsed) {
  return {
    ...EMPTY_FIELDS,
    title_ja: normalizeOptionalString(parsed?.title_ja),
    title_zh: normalizeOptionalString(parsed?.title_zh),
    address_ja: normalizeOptionalString(parsed?.address_ja),
    address_zh: normalizeOptionalString(parsed?.address_zh),
    rent_jpy: normalizeOptionalNumber(parsed?.rent_jpy),
    area_sqm: normalizeOptionalNumber(parsed?.area_sqm),
    layout: normalizeOptionalString(parsed?.layout),
    building_age: normalizeOptionalNumber(parsed?.building_age, true),
    station_name: normalizeOptionalString(parsed?.station_name),
    station_walk_minutes: normalizeOptionalNumber(parsed?.station_walk_minutes, true),
    source_agency: normalizeOptionalString(parsed?.source_agency),
    remarks: normalizeOptionalString(parsed?.remarks, 8000)
  };
}

async function callOpenAiVision({ buffer, mimeType, fileName, rawTextJa, blocks, processingStrategy }) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: [
            'You extract Japanese property sheet fields and provide Traditional Chinese output.',
            'Return JSON only.',
            'Do not invent values. Unknown values must be null.',
            processingStrategy === 'hybrid_assist'
              ? 'OCR text is provided as a noisy hint. Use the image as the primary source when OCR conflicts.'
              : 'Use the image as the only source of truth.',
            'Schema keys must be exactly:',
            Object.keys(EMPTY_FIELDS).join(', ')
          ].join('\n')
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                file_name: fileName || 'upload',
                processing_strategy: processingStrategy,
                ocr_text_ja_hint: rawTextJa ?? null,
                ocr_blocks_hint: Array.isArray(blocks) ? blocks.slice(0, 300) : []
              }, null, 2)
            },
            {
              type: 'image_url',
              image_url: {
                url: buildDataUrl(buffer, mimeType)
              }
            }
          ]
        }
      ]
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI vision property error (${response.status}): ${errorText}`);
  }

  const rawJson = await response.json();
  const content = rawJson?.choices?.[0]?.message?.content;
  const parsed = safeParseJSON(content);
  if (!parsed) {
    throw new Error('OpenAI vision property provider returned non-JSON output.');
  }

  const translatedFields = normalizeFields(parsed);
  const tokenUsage = extractTokenUsage(rawJson);
  const estimatedCostUsd = estimateCostUsd({
    tokenUsage,
    inputCostEnvKey: 'PROPERTY_INGEST_VISION_INPUT_COST_PER_1M',
    outputCostEnvKey: 'PROPERTY_INGEST_VISION_OUTPUT_COST_PER_1M'
  });

  return {
    status: 'done',
    provider: 'openai_property_vision',
    model: OPENAI_MODEL,
    processingStrategy,
    translatedFields,
    keyFieldCoverage: buildTranslatedFieldCoverage(translatedFields),
    confidence: normalizeConfidence(parsed?.confidence),
    tokenUsage,
    estimatedCostUsd,
    rawJson,
    errorCode: null,
    errorMessage: null
  };
}

export async function extractAndTranslate({ buffer, mimeType, fileName, rawTextJa = null, blocks = [], processingStrategy = 'vision_only_fallback' }) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    return {
      status: 'failed',
      provider: null,
      model: null,
      processingStrategy,
      translatedFields: null,
      keyFieldCoverage: null,
      confidence: null,
      tokenUsage: null,
      estimatedCostUsd: null,
      rawJson: null,
      errorCode: 'VISION_EMPTY_FILE',
      errorMessage: 'No file bytes were provided for vision fallback.'
    };
  }

  if (mimeType === 'application/pdf') {
    return {
      status: 'failed',
      provider: null,
      model: null,
      processingStrategy,
      translatedFields: null,
      keyFieldCoverage: null,
      confidence: null,
      tokenUsage: null,
      estimatedCostUsd: null,
      rawJson: null,
      errorCode: 'VISION_PDF_NOT_SUPPORTED',
      errorMessage: 'The current vision provider only supports image uploads; PDF support needs a dedicated document provider.'
    };
  }

  if (!mimeType?.startsWith('image/')) {
    return {
      status: 'failed',
      provider: null,
      model: null,
      processingStrategy,
      translatedFields: null,
      keyFieldCoverage: null,
      confidence: null,
      tokenUsage: null,
      estimatedCostUsd: null,
      rawJson: null,
      errorCode: 'VISION_UNSUPPORTED_FILE_TYPE',
      errorMessage: 'Only image uploads are supported for vision fallback.'
    };
  }

  const canUseOpenAi = Boolean(OPENAI_API_KEY) && (VISION_PROVIDER === '' || VISION_PROVIDER === 'openai_property_vision');
  if (!canUseOpenAi) {
    return {
      status: 'unconfigured',
      provider: null,
      model: null,
      processingStrategy,
      translatedFields: null,
      keyFieldCoverage: null,
      confidence: null,
      tokenUsage: null,
      estimatedCostUsd: null,
      rawJson: null,
      errorCode: 'VISION_PROVIDER_NOT_CONFIGURED',
      errorMessage: 'No vision property provider is configured for property ingest.'
    };
  }

  try {
    return await callOpenAiVision({ buffer, mimeType, fileName, rawTextJa, blocks, processingStrategy });
  } catch (error) {
    return {
      status: 'failed',
      provider: 'openai_property_vision',
      model: OPENAI_MODEL,
      processingStrategy,
      translatedFields: null,
      keyFieldCoverage: null,
      confidence: null,
      tokenUsage: null,
      estimatedCostUsd: null,
      rawJson: null,
      errorCode: 'VISION_PROVIDER_ERROR',
      errorMessage: error instanceof Error ? error.message : 'Unknown vision property error.'
    };
  }
}
