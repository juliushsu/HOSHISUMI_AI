const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.PROPERTY_INTAKE_PARSE_MODEL || process.env.OPENAI_MODEL || 'gpt-4.1-mini';

const EMPTY_PAYLOAD = {
  property_type: null,
  building_name: null,
  price_jpy: null,
  layout: null,
  area_sqm: null,
  balcony_sqm: null,
  address_text: null,
  prefecture: null,
  city: null,
  ward: null,
  nearest_stations: [],
  building_year: null,
  floor_plan_notes: [],
  orientation: null,
  current_status: null,
  management_fee_jpy: null,
  repair_reserve_fee_jpy: null,
  land_rights: null,
  structure: null,
  floor_info: null,
  total_floors: null,
  remarks: [],
  source_language: 'ja'
};

function safeParseJSON(content) {
  if (!content || typeof content !== 'string') return null;

  try {
    return JSON.parse(content);
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function normalizeOptionalString(value, maxLength = 2000) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > maxLength ? trimmed.slice(0, maxLength) : trimmed;
}

function normalizeOptionalNumber(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;

  const normalized = value.replace(/,/g, '').trim();
  if (!normalized) return null;

  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeOptionalInteger(value) {
  const parsed = normalizeOptionalNumber(value);
  if (parsed == null) return null;
  return Number.isInteger(parsed) ? parsed : Math.trunc(parsed);
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => normalizeOptionalString(item, 1000))
    .filter(Boolean);
}

function normalizePayload(parsed) {
  const payload = {
    ...EMPTY_PAYLOAD,
    property_type: normalizeOptionalString(parsed?.property_type),
    building_name: normalizeOptionalString(parsed?.building_name),
    price_jpy: normalizeOptionalNumber(parsed?.price_jpy),
    layout: normalizeOptionalString(parsed?.layout),
    area_sqm: normalizeOptionalNumber(parsed?.area_sqm),
    balcony_sqm: normalizeOptionalNumber(parsed?.balcony_sqm),
    address_text: normalizeOptionalString(parsed?.address_text, 4000),
    prefecture: normalizeOptionalString(parsed?.prefecture),
    city: normalizeOptionalString(parsed?.city),
    ward: normalizeOptionalString(parsed?.ward),
    nearest_stations: normalizeStringArray(parsed?.nearest_stations),
    building_year: normalizeOptionalInteger(parsed?.building_year),
    floor_plan_notes: normalizeStringArray(parsed?.floor_plan_notes),
    orientation: normalizeOptionalString(parsed?.orientation),
    current_status: normalizeOptionalString(parsed?.current_status),
    management_fee_jpy: normalizeOptionalNumber(parsed?.management_fee_jpy),
    repair_reserve_fee_jpy: normalizeOptionalNumber(parsed?.repair_reserve_fee_jpy),
    land_rights: normalizeOptionalString(parsed?.land_rights),
    structure: normalizeOptionalString(parsed?.structure),
    floor_info: normalizeOptionalString(parsed?.floor_info),
    total_floors: normalizeOptionalInteger(parsed?.total_floors),
    remarks: normalizeStringArray(parsed?.remarks),
    source_language: normalizeOptionalString(parsed?.source_language) || 'ja'
  };

  return payload;
}

function normalizeConfidence(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  if (value < 0 || value > 1) return null;
  return value;
}

async function callOpenAiParser({ ocrText, ocrBlocks }) {
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
            'You normalize Japanese property-sheet OCR into a strict JSON object.',
            'Return JSON only.',
            'Do not invent values. Unknown or missing values must be null.',
            'Arrays must stay arrays. Empty arrays are allowed.',
            'Schema keys must be exactly:',
            Object.keys(EMPTY_PAYLOAD).join(', ')
          ].join('\n')
        },
        {
          role: 'user',
          content: JSON.stringify(
            {
              ocr_text: ocrText,
              ocr_blocks: Array.isArray(ocrBlocks) ? ocrBlocks.slice(0, 300) : []
            },
            null,
            2
          )
        }
      ]
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI parse error (${response.status}): ${errorText}`);
  }

  const json = await response.json();
  const content = json?.choices?.[0]?.message?.content;
  const parsed = safeParseJSON(content);

  if (!parsed) {
    throw new Error('OpenAI parser returned non-JSON output.');
  }

  return {
    payload: normalizePayload(parsed),
    confidence: normalizeConfidence(parsed?.confidence),
    meta: {
      model: OPENAI_MODEL,
      finish_reason: json?.choices?.[0]?.finish_reason ?? null,
      usage: json?.usage ?? null
    }
  };
}

export async function parseJapanesePropertySheet({ ocrText, ocrBlocks }) {
  const normalizedText = normalizeOptionalString(ocrText, 50000);

  if (!normalizedText) {
    return {
      status: 'failed',
      provider: null,
      payload: null,
      confidence: null,
      meta: null,
      errorCode: 'PARSE_INPUT_MISSING',
      errorMessage: 'OCR text is required before parsing can start.'
    };
  }

  if (!OPENAI_API_KEY) {
    return {
      status: 'unconfigured',
      provider: null,
      payload: null,
      confidence: null,
      meta: null,
      errorCode: 'PARSER_PROVIDER_NOT_CONFIGURED',
      errorMessage: 'No AI parsing provider is configured for property intake.'
    };
  }

  try {
    const result = await callOpenAiParser({ ocrText: normalizedText, ocrBlocks });

    return {
      status: 'success',
      provider: 'openai_structured_parser',
      payload: result.payload,
      confidence: result.confidence,
      meta: result.meta,
      errorCode: null,
      errorMessage: null
    };
  } catch (error) {
    return {
      status: 'failed',
      provider: 'openai_structured_parser',
      payload: null,
      confidence: null,
      meta: null,
      errorCode: 'PARSER_PROVIDER_ERROR',
      errorMessage: error instanceof Error ? error.message : 'Unknown AI parsing error.'
    };
  }
}
