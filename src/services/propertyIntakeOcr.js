const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.PROPERTY_INTAKE_OCR_MODEL || process.env.OPENAI_MODEL || 'gpt-4.1-mini';

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

function normalizeOptionalString(value, maxLength = 20000) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > maxLength ? trimmed.slice(0, maxLength) : trimmed;
}

function normalizeConfidence(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  if (value < 0 || value > 1) return null;
  return value;
}

function normalizeBlocks(value) {
  if (!Array.isArray(value)) return null;

  return value
    .map((item, index) => {
      const text = normalizeOptionalString(item?.text, 5000);
      if (!text) return null;
      const pageNumber = Number.isInteger(item?.page_number) && item.page_number > 0 ? item.page_number : null;
      const blockIndex = Number.isInteger(item?.block_index) && item.block_index >= 0 ? item.block_index : index;

      return {
        page_number: pageNumber,
        block_index: blockIndex,
        text
      };
    })
    .filter(Boolean);
}

function buildDataUrl(buffer, mimeType) {
  return `data:${mimeType};base64,${buffer.toString('base64')}`;
}

async function callOpenAiImageOcr({ buffer, mimeType, fileName }) {
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
            'You are an OCR adapter for Japanese real estate intake files.',
            'Return JSON only.',
            'Do not translate or infer missing text.',
            'Schema:',
            '{',
            '  "raw_text": string|null,',
            '  "blocks": [{"page_number": number|null, "block_index": number|null, "text": string}]|[],',
            '  "confidence": number|null',
            '}'
          ].join('\n')
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: [
                `File name: ${fileName || 'upload'}`,
                'Extract visible Japanese text from this property sheet image.',
                'Keep layout order as much as possible.',
                'If confidence is unknown, return null.'
              ].join('\n')
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
    throw new Error(`OpenAI OCR error (${response.status}): ${errorText}`);
  }

  const json = await response.json();
  const content = json?.choices?.[0]?.message?.content;
  const parsed = safeParseJSON(content);

  if (!parsed) {
    throw new Error('OpenAI OCR returned non-JSON output.');
  }

  return {
    provider: 'openai_vision',
    rawText: normalizeOptionalString(parsed.raw_text, 50000),
    blocks: normalizeBlocks(parsed.blocks),
    confidence: normalizeConfidence(parsed.confidence),
    meta: {
      model: OPENAI_MODEL,
      finish_reason: json?.choices?.[0]?.finish_reason ?? null,
      usage: json?.usage ?? null
    }
  };
}

export async function extractTextFromDocument({ buffer, mimeType, fileName }) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    return {
      status: 'failed',
      provider: null,
      rawText: null,
      blocks: null,
      confidence: null,
      meta: null,
      errorCode: 'OCR_EMPTY_FILE',
      errorMessage: 'No file bytes were provided for OCR.'
    };
  }

  const configuredProvider = String(process.env.PROPERTY_INTAKE_OCR_PROVIDER || '').trim().toLowerCase();
  const canUseOpenAi = Boolean(OPENAI_API_KEY) && (configuredProvider === '' || configuredProvider === 'openai_vision');

  if (mimeType === 'application/pdf') {
    return {
      status: canUseOpenAi ? 'failed' : 'unconfigured',
      provider: canUseOpenAi ? 'openai_vision' : null,
      rawText: null,
      blocks: null,
      confidence: null,
      meta: null,
      errorCode: canUseOpenAi ? 'OCR_PDF_NOT_SUPPORTED' : 'OCR_PROVIDER_NOT_CONFIGURED',
      errorMessage: canUseOpenAi
        ? 'The current OCR adapter only supports image uploads; PDF OCR needs a dedicated provider.'
        : 'No OCR provider is configured for property intake.'
    };
  }

  if (!mimeType?.startsWith('image/')) {
    return {
      status: 'failed',
      provider: null,
      rawText: null,
      blocks: null,
      confidence: null,
      meta: null,
      errorCode: 'OCR_UNSUPPORTED_FILE_TYPE',
      errorMessage: 'Only image or PDF uploads are supported for property intake OCR.'
    };
  }

  if (!canUseOpenAi) {
    return {
      status: 'unconfigured',
      provider: null,
      rawText: null,
      blocks: null,
      confidence: null,
      meta: null,
      errorCode: 'OCR_PROVIDER_NOT_CONFIGURED',
      errorMessage: 'No OCR provider is configured for property intake.'
    };
  }

  try {
    const result = await callOpenAiImageOcr({ buffer, mimeType, fileName });

    if (!result.rawText) {
      return {
        status: 'failed',
        provider: result.provider,
        rawText: null,
        blocks: result.blocks,
        confidence: result.confidence,
        meta: result.meta,
        errorCode: 'OCR_EMPTY_RESULT',
        errorMessage: 'OCR completed but did not return usable text.'
      };
    }

    return {
      status: 'success',
      provider: result.provider,
      rawText: result.rawText,
      blocks: result.blocks,
      confidence: result.confidence,
      meta: result.meta,
      errorCode: null,
      errorMessage: null
    };
  } catch (error) {
    return {
      status: 'failed',
      provider: 'openai_vision',
      rawText: null,
      blocks: null,
      confidence: null,
      meta: null,
      errorCode: 'OCR_PROVIDER_ERROR',
      errorMessage: error instanceof Error ? error.message : 'Unknown OCR error.'
    };
  }
}
