import {
  buildTranslatedFieldCoverage,
  estimateCostUsd,
  extractTokenUsage,
  normalizeConfidence,
  normalizeOptionalString,
  safeParseJSON
} from './strategyUtils.js';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY_STAGING || process.env.OPENAI_API_KEY_DEV;
const TRANSLATOR_PROVIDER = String(process.env.PROPERTY_INGEST_TRANSLATOR_PROVIDER || '').trim().toLowerCase();
const OPENAI_MODEL = process.env.PROPERTY_INGEST_TRANSLATOR_MODEL || process.env.PROPERTY_INTAKE_PARSE_MODEL || process.env.OPENAI_MODEL || 'gpt-4.1-mini';

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

async function callOpenAiTranslator({ rawTextJa, blocks, processingStrategy }) {
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
            'You convert Japanese real estate OCR text into Traditional Chinese property fields.',
            'Return JSON only.',
            'Do not invent values.',
            'Unknown values must be null.',
            processingStrategy === 'hybrid_assist'
              ? 'OCR text may be incomplete; preserve OCR-grounded values and avoid guessing.'
              : 'Use OCR text as the only source of truth.',
            'Schema keys must be exactly:',
            Object.keys(EMPTY_FIELDS).join(', ')
          ].join('\n')
        },
        {
          role: 'user',
          content: JSON.stringify({
            ocr_text_ja: rawTextJa,
            ocr_blocks: Array.isArray(blocks) ? blocks.slice(0, 300) : [],
            processing_strategy: processingStrategy
          }, null, 2)
        }
      ]
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI translation error (${response.status}): ${errorText}`);
  }

  const rawJson = await response.json();
  const content = rawJson?.choices?.[0]?.message?.content;
  const parsed = safeParseJSON(content);
  if (!parsed) {
    throw new Error('OpenAI translator returned non-JSON output.');
  }

  const translatedFields = normalizeFields(parsed);
  const tokenUsage = extractTokenUsage(rawJson);
  const estimatedCostUsd = estimateCostUsd({
    tokenUsage,
    inputCostEnvKey: 'PROPERTY_INGEST_TRANSLATOR_INPUT_COST_PER_1M',
    outputCostEnvKey: 'PROPERTY_INGEST_TRANSLATOR_OUTPUT_COST_PER_1M'
  });

  return {
    status: 'done',
    provider: 'openai_property_translator',
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

export async function translatePropertyFields({ rawTextJa, blocks, processingStrategy = 'ocr_then_ai' }) {
  const text = normalizeOptionalString(rawTextJa, 60000);
  if (!text) {
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
      errorCode: 'TRANSLATION_INPUT_MISSING',
      errorMessage: 'OCR text is required before translation can start.'
    };
  }

  const canUseOpenAi = Boolean(OPENAI_API_KEY) && (TRANSLATOR_PROVIDER === '' || TRANSLATOR_PROVIDER === 'openai_property_translator');
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
      errorCode: 'TRANSLATOR_PROVIDER_NOT_CONFIGURED',
      errorMessage: 'No translation provider is configured for property ingest.'
    };
  }

  try {
    return await callOpenAiTranslator({ rawTextJa: text, blocks, processingStrategy });
  } catch (error) {
    return {
      status: 'failed',
      provider: 'openai_property_translator',
      model: OPENAI_MODEL,
      processingStrategy,
      translatedFields: null,
      keyFieldCoverage: null,
      confidence: null,
      tokenUsage: null,
      estimatedCostUsd: null,
      rawJson: null,
      errorCode: 'TRANSLATOR_PROVIDER_ERROR',
      errorMessage: error instanceof Error ? error.message : 'Unknown translation error.'
    };
  }
}
