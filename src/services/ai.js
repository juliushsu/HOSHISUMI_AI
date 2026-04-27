const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4.1-mini';
const OPENAI_INPUT_COST_PER_1M = Number(process.env.OPENAI_INPUT_COST_PER_1M || '');
const OPENAI_OUTPUT_COST_PER_1M = Number(process.env.OPENAI_OUTPUT_COST_PER_1M || '');

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

async function callOpenAI(systemPrompt, userPrompt) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      temperature: 0.5,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API error (${response.status}): ${errorText}`);
  }

  const json = await response.json();
  const content = json?.choices?.[0]?.message?.content;
  const parsed = safeParseJSON(content);
  const usage = json?.usage || {};
  const inputTokens = Number(usage.prompt_tokens ?? 0);
  const outputTokens = Number(usage.completion_tokens ?? 0);
  const totalTokens = Number(usage.total_tokens ?? inputTokens + outputTokens);

  if (!parsed) {
    throw new Error('OpenAI returned non-JSON output.');
  }

  return {
    parsed,
    tokensUsed: totalTokens,
    usage: {
      provider: 'openai',
      model: OPENAI_MODEL,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      total_tokens: totalTokens,
      estimated_cost_usd: estimateCostUsd(inputTokens, outputTokens)
    }
  };
}

function estimateCostUsd(inputTokens, outputTokens) {
  if (!Number.isFinite(OPENAI_INPUT_COST_PER_1M) || !Number.isFinite(OPENAI_OUTPUT_COST_PER_1M)) {
    return null;
  }

  return ((inputTokens / 1_000_000) * OPENAI_INPUT_COST_PER_1M) +
    ((outputTokens / 1_000_000) * OPENAI_OUTPUT_COST_PER_1M);
}

function fallbackUsage() {
  return {
    provider: 'fallback',
    model: 'local-fallback',
    input_tokens: 0,
    output_tokens: 0,
    total_tokens: 0,
    estimated_cost_usd: null
  };
}

function normalizeTranslateShape(parsed) {
  return {
    title: parsed.title ?? '',
    overview: parsed.overview ?? '',
    description: parsed.description ?? '',
    highlights: Array.isArray(parsed.highlights) ? parsed.highlights : [],
    risk_notes: Array.isArray(parsed.risk_notes)
      ? parsed.risk_notes
      : Array.isArray(parsed.risk)
        ? parsed.risk
        : [],
    cta: parsed.cta ?? parsed.CTA ?? ''
  };
}

function normalizeGeneratePostShape(parsed) {
  return {
    facebook_post: parsed.facebook_post ?? parsed.fb_post ?? '',
    instagram_post: parsed.instagram_post ?? parsed.ig_post ?? '',
    line_message: parsed.line_message ?? ''
  };
}

function normalizeArray(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => typeof item === 'string' && item.trim()).map((item) => item.trim());
}

function normalizeRiskScore(value) {
  const score = Number(value);
  if (!Number.isFinite(score)) return null;
  return Math.max(0, Math.min(100, score));
}

function normalizeComplianceFlags(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === 'string') return { code: item, severity: 'info' };
      if (!item || typeof item !== 'object') return null;
      return {
        code: String(item.code || item.type || 'compliance_note'),
        severity: String(item.severity || 'info'),
        message: String(item.message || item.note || '')
      };
    })
    .filter(Boolean);
}

function normalizeAnalysisShape(parsed) {
  return {
    highlights: normalizeArray(parsed.highlights),
    target_buyers: normalizeArray(parsed.target_buyers),
    locality_angles: normalizeArray(parsed.locality_angles),
    risk_notes: normalizeArray(parsed.risk_notes),
    communication_tips: normalizeArray(parsed.communication_tips),
    compliance_notes: normalizeArray(parsed.compliance_notes),
    suggested_marketing_angles: normalizeArray(parsed.suggested_marketing_angles)
  };
}

function normalizeCopyShape(parsed) {
  return {
    text: String(parsed.text || parsed.output_text || parsed.copy || ''),
    compliance_flags: normalizeComplianceFlags(parsed.compliance_flags || parsed.compliance_flags_json),
    risk_score: normalizeRiskScore(parsed.risk_score)
  };
}

function isPlainObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function cleanText(value, maxLen = 220) {
  if (typeof value !== 'string') return null;
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized) return null;
  return normalized.length > maxLen ? `${normalized.slice(0, maxLen - 1).trim()}…` : normalized;
}

function pickFirstText(...values) {
  for (const value of values) {
    const normalized = cleanText(value);
    if (normalized) return normalized;
  }
  return null;
}

function pickFirstNumber(...values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

function safeObject(value) {
  return isPlainObject(value) ? value : {};
}

function readPath(source, path) {
  if (!source) return null;
  const segments = path.split('.');
  let current = source;
  for (const segment of segments) {
    if (!isPlainObject(current) && !Array.isArray(current)) return null;
    current = current?.[segment];
    if (current === undefined || current === null) return null;
  }
  return current;
}

function formatCurrency(value, currency = 'TWD') {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;

  try {
    return new Intl.NumberFormat('zh-TW', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0
    }).format(number);
  } catch {
    return `${number.toLocaleString('zh-TW')} ${currency}`;
  }
}

function formatPercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return `${number.toFixed(number % 1 === 0 ? 0 : 1)}%`;
}

function joinClauses(parts, separator = '，') {
  return parts.filter(Boolean).join(separator);
}

function withSentenceEnding(text) {
  const normalized = cleanText(text, 500);
  if (!normalized) return '';
  return /[。！？!?]$/.test(normalized) ? normalized : `${normalized}。`;
}

function extractLocationHighlights(locationEnrichment) {
  const source = safeObject(locationEnrichment);
  const candidates = [];
  const summary = pickFirstText(source.summary_zh, source.summary, source.overview_zh, source.overview);
  if (summary) candidates.push(summary);

  const nearby = Array.isArray(source.nearby_highlights)
    ? source.nearby_highlights
    : Array.isArray(source.highlights)
      ? source.highlights
      : [];

  for (const item of nearby) {
    const normalized = cleanText(typeof item === 'string' ? item : item?.label || item?.name, 40);
    if (normalized) candidates.push(normalized);
    if (candidates.length >= 3) break;
  }

  return candidates.slice(0, 3);
}

function sanitizeAnalysis(analysis) {
  if (!isPlainObject(analysis)) return null;
  const keys = [
    'highlights',
    'target_buyers',
    'locality_angles',
    'communication_tips',
    'suggested_marketing_angles'
  ];

  const result = {};
  for (const key of keys) {
    const values = Array.isArray(analysis[key])
      ? analysis[key].map((item) => cleanText(item, 80)).filter(Boolean).slice(0, 3)
      : [];
    if (values.length > 0) result[key] = values;
  }
  return Object.keys(result).length > 0 ? result : null;
}

function buildSalesDirectorFacts(property, analysis = null, promptContext = {}) {
  const canonicalPayload = safeObject(property?.canonical_payload_json);
  const masterRawPayload = safeObject(property?.property_master_raw_source_payload);
  const propertyRawPayload = safeObject(property?.raw_source_payload);
  const locationEnrichment = safeObject(
    propertyRawPayload.location_enrichment ||
      masterRawPayload.location_enrichment ||
      canonicalPayload.location_enrichment
  );

  const sources = [property, canonicalPayload, masterRawPayload, propertyRawPayload];
  const country = pickFirstText(property?.country, canonicalPayload.country, masterRawPayload.country, propertyRawPayload.country) || 'tw';
  const isJapan = property?.property_source_type === 'partner' || country === 'jp';

  const title = pickFirstText(
    property?.title_zh,
    property?.master_title_zh,
    property?.title,
    canonicalPayload.title,
    property?.title_ja,
    property?.master_title_ja
  ) || '精選物件';

  const titleJa = pickFirstText(property?.title_ja, property?.master_title_ja, canonicalPayload.title_ja);
  const nearestStation = pickFirstText(
    property?.nearest_station,
    canonicalPayload.nearest_station,
    canonicalPayload.station_name,
    masterRawPayload.nearest_station,
    masterRawPayload.station_name,
    propertyRawPayload.nearest_station,
    propertyRawPayload.station_name
  );
  const walkMinutes = pickFirstNumber(
    property?.walking_minutes,
    property?.walk_minutes,
    canonicalPayload.walking_minutes,
    canonicalPayload.walk_minutes,
    canonicalPayload.station_walk_minutes,
    masterRawPayload.walking_minutes,
    masterRawPayload.walk_minutes,
    masterRawPayload.station_walk_minutes,
    propertyRawPayload.walking_minutes,
    propertyRawPayload.walk_minutes,
    propertyRawPayload.station_walk_minutes
  );
  const priceAmount = pickFirstNumber(
    property?.price,
    property?.master_price,
    canonicalPayload.price_jpy,
    masterRawPayload.price_jpy,
    propertyRawPayload.price_jpy
  );
  const currency = pickFirstText(property?.currency, property?.master_currency) || (country === 'jp' ? 'JPY' : 'TWD');
  const monthlyRent = pickFirstNumber(
    property?.rent_jpy,
    canonicalPayload.rent_jpy,
    canonicalPayload.monthly_rent_jpy,
    canonicalPayload.rent,
    masterRawPayload.rent_jpy,
    masterRawPayload.monthly_rent_jpy,
    masterRawPayload.rent,
    propertyRawPayload.rent_jpy,
    propertyRawPayload.monthly_rent_jpy,
    propertyRawPayload.rent
  );
  const yieldPercent = pickFirstNumber(
    property?.gross_yield,
    property?.yield_percent,
    property?.yield,
    canonicalPayload.gross_yield,
    canonicalPayload.gross_yield_percent,
    canonicalPayload.yield_percent,
    canonicalPayload.yield,
    masterRawPayload.gross_yield,
    masterRawPayload.gross_yield_percent,
    masterRawPayload.yield_percent,
    masterRawPayload.yield,
    propertyRawPayload.gross_yield,
    propertyRawPayload.gross_yield_percent,
    propertyRawPayload.yield_percent,
    propertyRawPayload.yield
  );
  const roiPercent = pickFirstNumber(
    property?.roi,
    property?.roi_percent,
    canonicalPayload.roi,
    canonicalPayload.roi_percent,
    masterRawPayload.roi,
    masterRawPayload.roi_percent,
    propertyRawPayload.roi,
    propertyRawPayload.roi_percent
  );
  const layout = pickFirstText(property?.layout, property?.master_layout, canonicalPayload.layout);
  const areaSqm = pickFirstNumber(property?.area_sqm, property?.master_area_sqm, canonicalPayload.area_sqm);
  const buildingAge = pickFirstNumber(property?.building_age, canonicalPayload.building_age_years, masterRawPayload.building_age_years, propertyRawPayload.building_age_years);
  const builtYear = pickFirstNumber(
    property?.built_year,
    canonicalPayload.built_year,
    canonicalPayload.building_built_year,
    masterRawPayload.built_year,
    masterRawPayload.building_built_year,
    propertyRawPayload.built_year,
    propertyRawPayload.building_built_year
  );
  const description = pickFirstText(
    property?.description_zh,
    property?.master_description_zh,
    property?.description,
    property?.description_ja,
    property?.master_description_ja
  );
  const address = pickFirstText(property?.address_zh, property?.master_address_zh, property?.city, property?.district);
  const lifestyleHighlights = extractLocationHighlights(locationEnrichment);
  const sanitizedAnalysis = sanitizeAnalysis(analysis);

  return {
    strategy: isJapan ? 'japan_asset_allocation' : 'taiwan_homebuyer',
    title,
    title_ja: titleJa,
    country,
    property_source_type: property?.property_source_type || (isJapan ? 'partner' : 'tenant'),
    property_master_id: property?.property_master_id ?? null,
    tenant_property_binding_id: property?.tenant_property_binding_id ?? null,
    source_partner_id: property?.source_partner_id ?? null,
    marketing_status: property?.marketing_status ?? null,
    address,
    nearest_station: nearestStation,
    walk_minutes: walkMinutes,
    price_amount: priceAmount,
    price_display: formatCurrency(priceAmount, currency),
    currency,
    monthly_rent_display: monthlyRent ? formatCurrency(monthlyRent, 'JPY') : null,
    yield_display: yieldPercent ? `表面投報率約 ${formatPercent(yieldPercent)}` : null,
    roi_display: roiPercent ? `初步收益參考約 ${formatPercent(roiPercent)}` : null,
    layout,
    area_sqm: areaSqm,
    building_age_years: buildingAge,
    built_year: builtYear,
    description,
    lifestyle_highlights: lifestyleHighlights,
    analysis_hints: sanitizedAnalysis,
    prompt_context: isPlainObject(promptContext) ? promptContext : {}
  };
}

function sanitizeCopyText(text) {
  if (typeof text !== 'string') return '';

  const bannedPatterns = [
    /\bpoi_[a-z0-9_]*\b/gi,
    /\btransit\.[a-z0-9_.]*\b/gi,
    /\blocation_enrichment\b/gi,
    /\buncertain\b/gi,
    /\brent_jpy\b/gi,
    /\bprice_jpy\b/gi,
    /\bfallback\b/gi,
    /\banalysis\b/gi,
    /\bdata_sources\b/gi,
    /資料待補/g,
    /無法驗證/g,
    /保守評估/g,
    /避免宣稱/g,
    /先用/g,
    /切入/g,
    /目前資料顯示/g,
    /建議補齊/g,
    /此欄位不足/g
  ];

  let next = text;
  for (const pattern of bannedPatterns) {
    next = next.replace(pattern, '');
  }

  return next
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ ]{2,}/g, ' ')
    .trim();
}

function buildJapanFbCopy(facts) {
  const opening = joinClauses([
    '如果你最近在找一間不只看得懂、也拿得住的日本資產',
    facts.nearest_station && facts.walk_minutes != null ? `這間距離${facts.nearest_station}約步行${facts.walk_minutes}分鐘的標的` : '這間日本精選標的',
    '會是很適合放進比較名單的一案'
  ]);

  const middle = joinClauses([
    facts.price_display ? `總價約${facts.price_display}` : null,
    facts.layout ? `${facts.layout}格局` : null,
    facts.area_sqm ? `室內約${facts.area_sqm}平方公尺` : null,
    facts.building_age_years != null ? `屋齡約${facts.building_age_years}年` : null
  ]);

  const incomeStory = facts.monthly_rent_display && facts.yield_display
    ? `若你在意持有後的出租穩定度，這類近站產品通常更容易和租客需求對上，現有租賃條件可先參考月租約${facts.monthly_rent_display}，${facts.yield_display}。`
    : facts.monthly_rent_display
      ? `若你在意持有後的現金流節奏，這類產品可以先從月租約${facts.monthly_rent_display}的租賃條件與持有成本一起評估。`
      : facts.yield_display || facts.roi_display
        ? `若你在看日本配置，${joinClauses([facts.yield_display, facts.roi_display], '，')}，會是前期判斷的一個好起點。`
        : '如果你重視的是資產配置的穩定感，近站、總價帶清楚、好理解的產品，往往比花俏題材更容易長期持有。';

  const suitableBuyers = '這類物件特別適合想做海外資產配置、偏好東京或大阪等成熟生活圈，或正在找出租與轉手都相對好理解標的的買方。也因為條件清楚，和家人或資金夥伴討論時更容易快速形成共識。';
  const closing = '如果你想要，我可以直接幫你整理同區比較、租賃條件和持有成本，讓你更快判斷這間值不值得進下一輪。';

  return sanitizeCopyText(`${opening}。\n\n${middle ? `${middle}。` : ''}${withSentenceEnding(facts.description)}\n\n${incomeStory}\n\n${suitableBuyers}\n${closing}`);
}

function buildTaiwanFbCopy(facts) {
  const opening = '有些房子不是第一眼最熱鬧，卻會讓真正要住的人很快有感。當你開始在意每天出門的節奏、回家後的舒適感，以及家人一起生活是否順手，這種物件通常會比規格表更有說服力。';
  const middle = joinClauses([
    facts.address ? `${facts.address}生活圈` : null,
    facts.nearest_station && facts.walk_minutes != null ? `鄰近${facts.nearest_station}約步行${facts.walk_minutes}分鐘` : null,
    facts.layout ? `${facts.layout}格局` : null,
    facts.area_sqm ? `空間約${facts.area_sqm}平方公尺` : null
  ]);
  const lifestyle = facts.lifestyle_highlights.length > 0
    ? `周邊條件像是${facts.lifestyle_highlights.join('、')}，都很適合拿來想像日常生活。`
    : '看這類物件時，最有感的通常不是單一數字，而是通勤、採買、收納與家人互動都能不能順。';
  const suitableBuyers = '如果你是首購、正在換屋，或希望找一間兼顧自住感與未來保值性的產品，這種生活圈成熟、格局清楚的案子很值得安排一趟現場。真正到現場時，通常會比照片更容易感受到它的動線和生活感。';
  const closing = facts.price_display
    ? `總價約${facts.price_display}。想要的話，我可以再幫你把同生活圈的捷運、學區和價格帶整理成一張比較表。`
    : '想要的話，我可以再幫你把同生活圈的捷運、學區和價格帶整理成一張比較表。';

  return sanitizeCopyText(`${opening}\n\n${middle ? `${middle}。` : ''}${withSentenceEnding(facts.description)}\n${lifestyle}\n\n${suitableBuyers}\n${closing}`);
}

function buildIgCopy(facts) {
  const title = facts.country === 'jp'
    ? `${facts.title}｜日本配置值得看`
    : `${facts.title}｜生活圈有感`;

  const bullets = [];
  if (facts.country === 'jp') {
    bullets.push(facts.nearest_station && facts.walk_minutes != null ? `${facts.nearest_station}步行約${facts.walk_minutes}分` : '成熟生活圈配置案');
    if (facts.layout || facts.area_sqm) bullets.push(joinClauses([facts.layout, facts.area_sqm ? `${facts.area_sqm}㎡` : null], ' / '));
    if (facts.monthly_rent_display && facts.yield_display) bullets.push(`${facts.monthly_rent_display}｜${facts.yield_display}`);
    else if (facts.monthly_rent_display) bullets.push(`先看租賃條件與持有成本`);
    else if (facts.yield_display) bullets.push(facts.yield_display);
    if (facts.price_display) bullets.push(`總價約${facts.price_display}`);
    bullets.push('適合做海外資產配置');
  } else {
    bullets.push(facts.address ? `${facts.address}生活圈` : '生活機能成熟');
    if (facts.nearest_station && facts.walk_minutes != null) bullets.push(`${facts.nearest_station}步行約${facts.walk_minutes}分`);
    if (facts.layout || facts.area_sqm) bullets.push(joinClauses([facts.layout, facts.area_sqm ? `${facts.area_sqm}㎡` : null], ' / '));
    bullets.push('首購換屋都好比較');
    if (facts.price_display) bullets.push(`總價約${facts.price_display}`);
  }

  const normalizedBullets = bullets
    .map((item) => cleanText(item, 25))
    .filter(Boolean)
    .slice(0, 5)
    .map((item) => `• ${item}`);

  const hashtags = facts.country === 'jp'
    ? '#日本不動產 #海外資產配置 #東京大阪物件 #星澄地所'
    : '#台灣房地產 #生活圈選屋 #自住換屋 #星澄地所';

  return sanitizeCopyText([title, ...normalizedBullets, '想看完整比較表，私訊我。', hashtags].join('\n'));
}

function buildLineCopy(facts) {
  if (facts.country === 'jp') {
    const lines = [
      `這間我會想先推薦你看，重點是它不是只有題材，而是條件很好懂。`,
      facts.nearest_station && facts.walk_minutes != null ? `${facts.nearest_station}步行約${facts.walk_minutes}分鐘，出租穩定度通常比較有想像空間。` : '它所在的生活圈成熟，作為日本資產配置很順手。',
      joinClauses([
        facts.layout,
        facts.area_sqm ? `${facts.area_sqm}平方公尺` : null,
        facts.price_display ? `總價約${facts.price_display}` : null
      ], '，') || null,
      facts.monthly_rent_display && facts.yield_display
        ? `月租條件約${facts.monthly_rent_display}，${facts.yield_display}，很適合拿來做第一輪篩選。`
        : facts.monthly_rent_display
          ? `目前可以先從月租條件約${facts.monthly_rent_display}和持有成本一起看。`
          : facts.yield_display
            ? `${facts.yield_display}，我也可以再幫你一起對照周邊租賃狀況。`
            : null,
      '你如果要，我可以直接幫你整理這間和同區物件的比較表。'
    ];
    return sanitizeCopyText(lines.filter(Boolean).join('\n'));
  }

  const lines = [
    '這間我覺得值得排進看屋名單，原因很直接，就是住起來的條件很完整。',
    facts.address ? `${facts.address}生活圈成熟，日常採買和通勤都比較容易安排。` : '它的生活圈和通勤條件都滿實用。',
    joinClauses([
      facts.nearest_station && facts.walk_minutes != null ? `${facts.nearest_station}步行約${facts.walk_minutes}分鐘` : null,
      facts.layout,
      facts.area_sqm ? `${facts.area_sqm}平方公尺` : null
    ], '，') || null,
    facts.price_display ? `總價約${facts.price_display}，很適合拿來和同區案做一輪比較。` : null,
    '你如果有興趣，我可以幫你整理比較表，連生活圈一起看會更準。'
  ];

  return sanitizeCopyText(lines.filter(Boolean).join('\n'));
}

function fallbackTranslate(input) {
  const rawTitle = input.jp_title || input.title || '日本不動產物件';
  const rawDescription = input.jp_description || input.description || '尚未提供完整日文描述。';

  return {
    result: {
      title: `【JP物件】${rawTitle}`,
      overview: `物件摘要：${rawDescription}`,
      description: `完整介紹：${rawDescription}`,
      highlights: [
        '地段與交通條件是主要價值來源。',
        '若租賃需求穩定，可提升現金流可預測性。',
        '日圓資產可作為資產配置分散。'
      ],
      risk_notes: [
        '需留意匯率波動對總報酬的影響。',
        '跨境持有與稅務規範需由專業人士評估。',
        '屋況與管理修繕成本可能影響淨收益。'
      ],
      cta: '想看完整投報與區域比較，回覆「我要完整分析」。'
    },
    tokensUsed: 0
  };
}

function fallbackGeneratePost(property) {
  return {
    result: {
      facebook_post: `【精選物件】${property.title}\n價格：${property.price}\n${property.description || ''}\n想看完整資料歡迎私訊。`,
      instagram_post: `#星澄地所 #精選物件\n${property.title}\n${property.description || ''}\n價格 ${property.price}`,
      line_message: `推薦你一間不錯的物件：${property.title}，價格 ${property.price}。想看完整資料我可以立刻傳你。`
    },
    tokensUsed: 0
  };
}

function fallbackAssistantAnalysis(property) {
  const location = [property.city, property.district].filter(Boolean).join('') || '台灣';
  const price = property.price ? `${property.price} ${property.currency || 'TWD'}` : '價格待確認';

  return {
    result: {
      highlights: [
        `${location}區位可作為主要溝通切入點。`,
        `總價或租金條件為 ${price}，適合搭配周邊行情比較。`,
        property.nearest_station ? `可強調鄰近 ${property.nearest_station} 的生活便利性。` : '可補充交通與生活機能資料提高說服力。'
      ],
      target_buyers: [
        '重視區位與生活機能的自住客',
        '尋找穩定標的的資產配置型買方',
        '需要明確總價帶與付款規劃的首購或換屋客'
      ],
      locality_angles: [
        '交通節點、商圈、學區與日常採買便利性',
        '同區供給量與替代物件比較',
        '未來生活圈發展與持有便利性'
      ],
      risk_notes: [
        '實際屋況、權狀、貸款條件與交易成本仍需逐項確認。',
        '市場行情會變動，不能以單一物件資訊承諾投資報酬。',
        '若資料欄位不足，對外文案應避免使用絕對化或保證式描述。'
      ],
      communication_tips: [
        '先用生活情境建立想像，再補價格與坪數等硬資訊。',
        '主動揭露待確認事項，降低後續期待落差。',
        '引導客戶預約看屋或索取完整比較表。'
      ],
      compliance_notes: [
        '避免宣稱保證增值、保證出租或穩賺不賠。',
        '價格、坪數、屋齡與交通時間需以最新資料核對。',
        '若使用投資語氣，需加上風險與自行評估提醒。'
      ],
      suggested_marketing_angles: [
        '區位生活感',
        '總價帶清楚',
        '看屋決策效率',
        '同區比較'
      ]
    },
    complianceFlags: [],
    riskScore: 35,
    tokensUsed: 0,
    usage: fallbackUsage()
  };
}

function fallbackAssistantCopy(property, channel) {
  const facts = buildSalesDirectorFacts(property, null, {});
  const base = {
    fb: facts.country === 'jp' ? buildJapanFbCopy(facts) : buildTaiwanFbCopy(facts),
    ig: buildIgCopy(facts),
    line: buildLineCopy(facts)
  };

  return {
    result: {
      text: sanitizeCopyText(base[channel] || base.fb),
      compliance_flags: [],
      risk_score: facts.country === 'jp' ? 24 : 18
    },
    tokensUsed: 0,
    usage: fallbackUsage()
  };
}

export async function translateProperty(input) {
  if (!OPENAI_API_KEY) {
    return fallbackTranslate(input);
  }

  const systemPrompt = [
    '你是星澄地所的房地產內容助理。',
    '請把輸入物件資訊轉為繁體中文內容，並輸出 JSON。',
    'JSON keys 必須是：title, overview, description, highlights, risk_notes, cta。',
    'highlights 與 risk_notes 都要是字串陣列。'
  ].join('\n');

  const userPrompt = `輸入資料：\n${JSON.stringify(input, null, 2)}`;

  const { parsed, tokensUsed } = await callOpenAI(systemPrompt, userPrompt);

  return {
    result: normalizeTranslateShape(parsed),
    tokensUsed
  };
}

export async function generatePost(property) {
  if (!OPENAI_API_KEY) {
    return fallbackGeneratePost(property);
  }

  const systemPrompt = [
    '你是星澄地所社群文案助理。',
    '請依據物件資料輸出社群貼文 JSON。',
    'JSON keys 必須是：facebook_post, instagram_post, line_message。'
  ].join('\n');

  const userPrompt = `物件資料：\n${JSON.stringify(property, null, 2)}`;

  const { parsed, tokensUsed } = await callOpenAI(systemPrompt, userPrompt);

  return {
    result: normalizeGeneratePostShape(parsed),
    tokensUsed
  };
}

export async function analyzePropertyForAssistant(property) {
  if (!OPENAI_API_KEY) {
    return fallbackAssistantAnalysis(property);
  }

  const systemPrompt = [
    '你是星澄地所台灣房地產 AI 分析助理。',
    '請依據台灣端租戶物件資料，輸出保守、可供業務使用的 JSON。',
    '不得承諾保證增值、保證出租、穩賺不賠或任何未經查證的絕對描述。',
    'JSON keys 必須是：highlights, target_buyers, locality_angles, risk_notes, communication_tips, compliance_notes, suggested_marketing_angles, compliance_flags, risk_score。',
    '前七個欄位必須是字串陣列；compliance_flags 是陣列；risk_score 是 0 到 100。'
  ].join('\n');

  const userPrompt = `台灣物件資料：\n${JSON.stringify(property, null, 2)}`;
  const { parsed, tokensUsed, usage } = await callOpenAI(systemPrompt, userPrompt);

  return {
    result: normalizeAnalysisShape(parsed),
    complianceFlags: normalizeComplianceFlags(parsed.compliance_flags || parsed.compliance_flags_json),
    riskScore: normalizeRiskScore(parsed.risk_score),
    tokensUsed,
    usage
  };
}

export async function generateAssistantCopy({ property, analysis = null, channel, promptContext = {} }) {
  const facts = buildSalesDirectorFacts(property, analysis, promptContext);

  if (!OPENAI_API_KEY) {
    return fallbackAssistantCopy(property, channel);
  }

  const channelLabel = {
    fb: 'Facebook',
    ig: 'Instagram',
    line: 'LINE'
  }[channel] || channel;

  const channelRules = {
    fb: [
      '長度控制在 300 到 600 字。',
      '開頭先用買方情境或痛點帶入，不要像報告。',
      '中段自然帶出物件亮點與條件，避免條列過多。',
      '後段說明適合哪一類買方，最後用自然 CTA 收尾。'
    ],
    ig: [
      '先給一個短標題。',
      '接著輸出 3 到 5 個短 bullet。',
      '每個 bullet 不超過 25 字。',
      '最後加不超過 5 個 hashtag。'
    ],
    line: [
      '像真人業務私訊，句子短。',
      '先說這間為什麼值得看。',
      '再說 2 到 3 個重點。',
      '最後用自然 CTA，例如可以幫你整理比較表。'
    ]
  }[channel] || [];

  const systemPrompt = [
    '你是 HOSHISUMI staging 的 AI 行銷文 v2：Sales Director Copy Engine。',
    '你的文案角色是資深房仲業務總監，寫給第一線業務直接使用。',
    `請為 ${channelLabel} 產生繁體中文物件文案，輸出 JSON。`,
    '語氣要有溫度、信任感與成交推進感，但不能誇大，也不能保證收益。',
    '文案不能像分析報告、不能像工程摘要、不能出現內部指令語。',
    '若是日本物件，請突出資產配置、車站距離、出租穩定性與租賃故事；若有投報率或 ROI，需寫成表面投報率或初步收益參考。',
    '若只有月租沒有總價，不要談投報率，只能自然提到可先看租賃條件與持有成本。',
    '若是台灣物件，重點放在生活圈、學區、捷運、商圈、屋況格局、自住感與首購換屋置產情境。',
    ...channelRules,
    '絕對不要輸出 raw key、工程語、AI 自我分析語、或以下詞句：資料待補、無法驗證、保守評估、避免宣稱、先用、切入、目前資料顯示、建議補齊、此欄位不足、fallback、analysis、data_sources。',
    'JSON keys 必須是：text, compliance_flags, risk_score。',
    'compliance_flags 是陣列；risk_score 是 0 到 100。'
  ].join('\n');

  const userPrompt = `請根據以下業務素材寫文案，不能照抄欄位名稱，也不要提到資料來源或內部判斷。\n${JSON.stringify({
    channel,
    channel_label: channelLabel,
    sales_brief: facts
  }, null, 2)}`;
  const { parsed, tokensUsed, usage } = await callOpenAI(systemPrompt, userPrompt);
  const normalized = normalizeCopyShape(parsed);

  return {
    result: {
      ...normalized,
      text: sanitizeCopyText(normalized.text)
    },
    tokensUsed,
    usage
  };
}
