export const PROCESSING_STRATEGY_ENUM = new Set(['ocr_then_ai', 'hybrid_assist', 'vision_only_fallback']);
export const RECOMMENDED_NEXT_STEP_ENUM = new Set(['ocr_then_ai', 'hybrid_assist', 'vision_only_fallback', 'manual_review']);

const TEXT_COVERAGE_PATTERNS = {
  title_or_building_name: [/マンション/u, /アパート/u, /ハイツ/u, /レジデンス/u, /ビル/u, /コーポ/u, /号室/u],
  address: [/都/u, /道/u, /府/u, /県/u, /市/u, /区/u, /町/u, /丁目/u],
  rent_or_price: [/賃料/u, /家賃/u, /価格/u, /販売価格/u, /万円/u, /円/u],
  area_sqm: [/㎡/u, /m2/i, /専有面積/u, /面積/u],
  layout: [/[0-9]+\s*[SLDKR]/i, /間取り/u],
  station_access: [/駅/u, /徒歩/u, /路線/u],
  building_age: [/築/u, /年/u]
};

export function safeParseJSON(content) {
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

export function normalizeOptionalString(value, maxLength = 20000) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > maxLength ? trimmed.slice(0, maxLength) : trimmed;
}

export function normalizeConfidence(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  if (value < 0 || value > 1) return null;
  return value;
}

export function normalizeBlocks(value) {
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

function normalizeNonNegativeInteger(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
  return Math.trunc(value);
}

function normalizeCost(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
  return Number(value.toFixed(6));
}

function readCostEnv(key) {
  const raw = String(process.env[key] || '').trim();
  if (!raw) return null;
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function extractTokenUsage(rawJson) {
  const usage = rawJson?.usage ?? null;
  const inputTokens = normalizeNonNegativeInteger(usage?.prompt_tokens);
  const outputTokens = normalizeNonNegativeInteger(usage?.completion_tokens);
  const totalTokens = normalizeNonNegativeInteger(usage?.total_tokens ?? ((inputTokens ?? 0) + (outputTokens ?? 0)));

  if (inputTokens == null && outputTokens == null && totalTokens == null) {
    return null;
  }

  return {
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    total_tokens: totalTokens
  };
}

export function estimateCostUsd({ tokenUsage, inputCostEnvKey, outputCostEnvKey }) {
  if (!tokenUsage) return null;

  const inputCostPer1M = readCostEnv(inputCostEnvKey);
  const outputCostPer1M = readCostEnv(outputCostEnvKey);
  if (inputCostPer1M == null && outputCostPer1M == null) return null;

  const inputCost = ((tokenUsage.input_tokens ?? 0) / 1_000_000) * (inputCostPer1M ?? 0);
  const outputCost = ((tokenUsage.output_tokens ?? 0) / 1_000_000) * (outputCostPer1M ?? 0);
  return normalizeCost(inputCost + outputCost);
}

export function buildTextCoverage(rawText) {
  const text = normalizeOptionalString(rawText, 60000) || '';
  const entries = Object.entries(TEXT_COVERAGE_PATTERNS).map(([key, patterns]) => {
    const matched = patterns.some((pattern) => pattern.test(text));
    return [key, matched];
  });

  const matchedCount = entries.filter(([, matched]) => matched).length;
  const totalFields = entries.length;

  return {
    ...Object.fromEntries(entries),
    matched_count: matchedCount,
    total_fields: totalFields,
    coverage_ratio: totalFields === 0 ? 0 : Number((matchedCount / totalFields).toFixed(4))
  };
}

export function buildTranslatedFieldCoverage(fields) {
  const normalized = fields && typeof fields === 'object' && !Array.isArray(fields) ? fields : {};
  const checks = {
    title_zh: Boolean(normalized.title_zh),
    address_zh: Boolean(normalized.address_zh),
    rent_jpy: typeof normalized.rent_jpy === 'number',
    area_sqm: typeof normalized.area_sqm === 'number',
    layout: Boolean(normalized.layout),
    station_name: Boolean(normalized.station_name),
    building_age: typeof normalized.building_age === 'number'
  };
  const matchedCount = Object.values(checks).filter(Boolean).length;
  const totalFields = Object.keys(checks).length;

  return {
    ...checks,
    matched_count: matchedCount,
    total_fields: totalFields,
    coverage_ratio: totalFields === 0 ? 0 : Number((matchedCount / totalFields).toFixed(4))
  };
}

export function recommendNextStep({ confidence, keyFieldCoverage, rawText }) {
  const hasText = Boolean(normalizeOptionalString(rawText, 60000));
  const coverageRatio = typeof keyFieldCoverage?.coverage_ratio === 'number' ? keyFieldCoverage.coverage_ratio : 0;
  const normalizedConfidence = typeof confidence === 'number' ? confidence : 0;

  if (!hasText) return 'vision_only_fallback';
  if (normalizedConfidence >= 0.75 && coverageRatio >= 0.45) return 'ocr_then_ai';
  if (normalizedConfidence >= 0.35 || coverageRatio >= 0.2) return 'hybrid_assist';
  return 'vision_only_fallback';
}
