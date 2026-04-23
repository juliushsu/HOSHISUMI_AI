const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OCR_PROVIDER = String(process.env.OCR_PROVIDER || process.env.PROPERTY_INTAKE_OCR_PROVIDER || '').trim().toLowerCase();
const OPENAI_MODEL = process.env.PROPERTY_INGEST_OCR_MODEL || process.env.PROPERTY_INTAKE_OCR_MODEL || process.env.OPENAI_MODEL || 'gpt-4.1-mini';

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

function normalizeOptionalString(value, maxLength = 30000) {
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
  if (!Array.isArray(value)) return [];
  return value
    .map((item, index) => {
      const text = normalizeOptionalString(item?.text, 5000);
      if (!text) return null;
      return {
        page_number: Number.isInteger(item?.page_number) ? item.page_number : null,
        block_index: Number.isInteger(item?.block_index) ? item.block_index : index,
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
            'You are an OCR adapter for Japanese property documents.',
            'Return JSON only.',
            'Do not translate or infer missing content.',
            'Schema:',
            '{',
            '  "raw_text_ja": string|null,',
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
                'Extract visible Japanese real-estate document text.',
                'Keep reading order as close to the document layout as possible.'
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

  const rawJson = await response.json();
  const content = rawJson?.choices?.[0]?.message?.content;
  const parsed = safeParseJSON(content);

  if (!parsed) {
    throw new Error('OpenAI OCR returned non-JSON output.');
  }

  return {
    status: 'done',
    provider: 'openai_vision',
    model: OPENAI_MODEL,
    rawText: normalizeOptionalString(parsed.raw_text_ja, 60000),
    blocks: normalizeBlocks(parsed.blocks),
    confidence: normalizeConfidence(parsed.confidence),
    rawJson,
    errorCode: null,
    errorMessage: null
  };
}

export async function extractText({ buffer, mimeType, fileName }) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    return {
      status: 'failed',
      provider: null,
      model: null,
      rawText: null,
      blocks: [],
      confidence: null,
      rawJson: null,
      errorCode: 'OCR_EMPTY_FILE',
      errorMessage: 'No file bytes were provided for OCR.'
    };
  }

  const canUseOpenAi = Boolean(OPENAI_API_KEY) && (OCR_PROVIDER === '' || OCR_PROVIDER === 'openai_vision');

  if (mimeType === 'application/pdf') {
    return {
      status: canUseOpenAi ? 'failed' : 'unconfigured',
      provider: canUseOpenAi ? 'openai_vision' : null,
      model: canUseOpenAi ? OPENAI_MODEL : null,
      rawText: null,
      blocks: [],
      confidence: null,
      rawJson: null,
      errorCode: canUseOpenAi ? 'OCR_PDF_NOT_SUPPORTED' : 'OCR_PROVIDER_NOT_CONFIGURED',
      errorMessage: canUseOpenAi
        ? 'The current OCR adapter only supports image uploads; PDF OCR needs a dedicated provider.'
        : 'No OCR provider is configured for property ingest.'
    };
  }

  if (!mimeType?.startsWith('image/')) {
    return {
      status: 'failed',
      provider: null,
      model: null,
      rawText: null,
      blocks: [],
      confidence: null,
      rawJson: null,
      errorCode: 'OCR_UNSUPPORTED_FILE_TYPE',
      errorMessage: 'Only image or PDF uploads are supported for OCR.'
    };
  }

  if (!canUseOpenAi) {
    return {
      status: 'unconfigured',
      provider: null,
      model: null,
      rawText: null,
      blocks: [],
      confidence: null,
      rawJson: null,
      errorCode: 'OCR_PROVIDER_NOT_CONFIGURED',
      errorMessage: 'No OCR provider is configured for property ingest.'
    };
  }

  try {
    const result = await callOpenAiImageOcr({ buffer, mimeType, fileName });
    if (!result.rawText) {
      return {
        ...result,
        status: 'failed',
        errorCode: 'OCR_EMPTY_RESULT',
        errorMessage: 'OCR completed but did not return usable text.'
      };
    }
    return result;
  } catch (error) {
    return {
      status: 'failed',
      provider: 'openai_vision',
      model: OPENAI_MODEL,
      rawText: null,
      blocks: [],
      confidence: null,
      rawJson: null,
      errorCode: 'OCR_PROVIDER_ERROR',
      errorMessage: error instanceof Error ? error.message : 'Unknown OCR error.'
    };
  }
}
