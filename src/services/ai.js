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

function normalizeText(value, fallback = '') {
  if (value == null) return fallback;
  return String(value).trim();
}

function pickFirstText(...values) {
  for (const value of values) {
    const normalized = normalizeText(value);
    if (normalized) return normalized;
  }
  return '';
}

function normalizeNullableNumber(value) {
  if (value == null || value === '') return null;
  const number = Number(String(value).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(number) ? number : null;
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

function normalizeLegacyAnalysis(analysis = {}) {
  return {
    highlights: normalizeArray(analysis.highlights),
    target_buyers: normalizeArray(analysis.target_buyers),
    locality_angles: normalizeArray(analysis.locality_angles),
    risk_notes: normalizeArray(analysis.risk_notes),
    communication_tips: normalizeArray(analysis.communication_tips),
    compliance_notes: normalizeArray(analysis.compliance_notes),
    suggested_marketing_angles: normalizeArray(analysis.suggested_marketing_angles)
  };
}

function normalizeEnrichedAnalysis(analysis = {}) {
  const propertyPositioning = analysis?.property_positioning && typeof analysis.property_positioning === 'object'
    ? analysis.property_positioning
    : {};
  const locationAnalysis = analysis?.location_analysis && typeof analysis.location_analysis === 'object'
    ? analysis.location_analysis
    : {};
  const investmentAnalysis = analysis?.investment_analysis && typeof analysis.investment_analysis === 'object'
    ? analysis.investment_analysis
    : {};
  const propertyStrengths = analysis?.property_strengths && typeof analysis.property_strengths === 'object'
    ? analysis.property_strengths
    : {};
  const marketingAngles = analysis?.marketing_angles && typeof analysis.marketing_angles === 'object'
    ? analysis.marketing_angles
    : {};
  const buyerPersonas = analysis?.buyer_personas && typeof analysis.buyer_personas === 'object'
    ? analysis.buyer_personas
    : {};
  const complianceNotes = analysis?.compliance_notes && typeof analysis.compliance_notes === 'object'
    ? analysis.compliance_notes
    : {};
  const transit = locationAnalysis?.transit && typeof locationAnalysis.transit === 'object'
    ? locationAnalysis.transit
    : {};

  return {
    positioning_one_liner: normalizeText(propertyPositioning.one_liner),
    fit_types: normalizeArray(propertyPositioning.fit_types),
    transit_station: normalizeText(transit.nearest_station),
    transit_walk_minutes: normalizeNullableNumber(transit.walk_minutes),
    transit_lines: normalizeArray(transit.lines?.map?.((line) => {
      if (typeof line === 'string') return line;
      if (line && typeof line === 'object') return line.name;
      return null;
    })),
    lifestyle_summary: normalizeText(locationAnalysis.lifestyle_summary),
    poi_200m_highlights: normalizeArray(locationAnalysis.poi_200m_highlights),
    poi_500m_highlights: normalizeArray(locationAnalysis.poi_500m_highlights),
    uncertain_fields: normalizeArray(locationAnalysis.uncertain_fields),
    price_jpy: normalizeNullableNumber(investmentAnalysis.price_jpy),
    monthly_rent_jpy: normalizeNullableNumber(investmentAnalysis.monthly_rent_jpy),
    gross_yield_pct: normalizeNullableNumber(investmentAnalysis.gross_yield_pct),
    investment_pros: normalizeArray(investmentAnalysis.investment_pros),
    investment_risks: normalizeArray(investmentAnalysis.investment_risks),
    calculation_notes: normalizeArray(investmentAnalysis.calculation_notes),
    owner_occupier_fit: normalizeText(investmentAnalysis.owner_occupier_fit),
    property_strengths: Object.values(propertyStrengths).flatMap((value) => {
      if (Array.isArray(value)) return normalizeArray(value);
      const normalized = normalizeText(value);
      return normalized ? [normalized] : [];
    }),
    must_include: normalizeArray(complianceNotes.must_include),
    ocr_uncertain_fields: normalizeArray(complianceNotes.ocr_uncertain_fields),
    forbidden_claims: normalizeArray(complianceNotes.forbidden_claims),
    buyer_personas: Object.values(buyerPersonas).flatMap((value) => normalizeArray(value)),
    marketing_fb: normalizeArray(marketingAngles.fb_long_form),
    marketing_ig: normalizeArray(marketingAngles.ig_short_highlights),
    marketing_line: normalizeArray(marketingAngles.line_dm)
  };
}

function detectCountry(property = {}) {
  const explicitCountry = normalizeText(property.country).toLowerCase();
  if (explicitCountry === 'jp' || normalizeText(property.title_ja) || normalizeText(property.address_ja)) return 'jp';
  if (explicitCountry === 'tw') return 'tw';
  return 'jp';
}

function detectListingMode(property = {}) {
  const source = [
    property.current_stage,
    property.purpose,
    property.status,
    property.source_type,
    property.description,
    property.description_ja,
    property.description_zh
  ].map((item) => normalizeText(item).toLowerCase());

  if (source.some((item) => item.includes('rent') || item.includes('lease') || item.includes('賃貸') || item.includes('出租'))) {
    return 'rental';
  }
  return 'sale';
}

function extractRentJpy(property = {}) {
  const directRent = [
    property.rent_jpy,
    property.monthly_rent_jpy,
    property.monthly_rent,
    property.rent
  ].map((value) => normalizeNullableNumber(value)).find((value) => value != null);
  if (directRent != null) return directRent;

  if (detectListingMode(property) === 'rental') {
    const rentalPrice = normalizeNullableNumber(property.price);
    if (rentalPrice != null) return rentalPrice;
  }

  const textBlob = [
    property.description,
    property.description_ja,
    property.description_zh
  ].map((value) => normalizeText(value)).filter(Boolean).join('\n');

  const match = textBlob.match(/(?:家賃|月租)[^\d]{0,6}([\d,]+)/);
  if (!match) return null;
  return normalizeNullableNumber(match[1]);
}

function extractPriceJpy(property = {}) {
  const directPrice = [
    property.price_jpy,
    property.total_price_jpy,
    property.sale_price_jpy
  ].map((value) => normalizeNullableNumber(value)).find((value) => value != null);
  if (directPrice != null) return directPrice;

  if (detectCountry(property) !== 'jp') return null;
  if (detectListingMode(property) === 'rental') return null;

  return normalizeNullableNumber(property.price);
}

function buildLocationNarrative(property = {}, analysis = {}) {
  const legacy = normalizeLegacyAnalysis(analysis);
  const enriched = normalizeEnrichedAnalysis(analysis);
  const localityAngles = [
    enriched.lifestyle_summary,
    ...enriched.poi_200m_highlights,
    ...enriched.poi_500m_highlights,
    ...legacy.locality_angles
  ].filter(Boolean);
  const transitLabel = pickFirstText(
    enriched.transit_station,
    property.nearest_station
  );
  const walkMinutes = normalizeNullableNumber(
    enriched.transit_walk_minutes ?? property.walking_minutes
  );

  return {
    short_label: detectCountry(property) === 'jp' ? '日本物件' : '台灣物件',
    transit_line: transitLabel
      ? `${transitLabel}${walkMinutes != null ? `，步行約 ${walkMinutes} 分鐘` : ''}`
      : (detectCountry(property) === 'jp' ? '交通資訊仍在補充中' : '交通資訊仍在補充中'),
    lifestyle_line: localityAngles[0] || '周邊生活機能資料尚待補強',
    is_transit_missing: !transitLabel,
    is_lifestyle_missing: localityAngles.length === 0
  };
}

function buildYieldNarrative(priceJpy, rentJpy, explicitGrossYield = null) {
  if (priceJpy != null && rentJpy != null && priceJpy > 0) {
    const grossYield = explicitGrossYield != null
      ? Number(explicitGrossYield.toFixed(2))
      : Number((((rentJpy * 12) / priceJpy) * 100).toFixed(2));
    return {
      gross_yield_pct: grossYield,
      line: `若以月租約 ¥${rentJpy.toLocaleString()} 與總價搭配評估，表面投報率約 ${grossYield}% 左右。`
    };
  }

  return {
    gross_yield_pct: null,
    line: '目前資料尚無法估算投報率，建議保守評估。'
  };
}

function extractBuiltYear(property = {}) {
  return [
    property.built_year,
    property.construction_year,
    property.year_built,
    property.completion_year
  ].map((value) => normalizeNullableNumber(value)).find((value) => value != null) ?? null;
}

function formatCompletionLine(property = {}) {
  const builtYear = extractBuiltYear(property);
  return builtYear != null ? `${builtYear} 年完工` : '';
}

function formatAreaLine(property = {}) {
  const areaSqm = normalizeNullableNumber(property.area_sqm ?? property.exclusive_area_sqm ?? property.building_area_sqm);
  return areaSqm != null ? `專有面積約 ${areaSqm} 平方公尺` : '';
}

function buildAudienceLine(country = 'jp') {
  if (country === 'jp') {
    return '適合第一次買日本物件、想穩定收租，或想找低總價入門的買方。';
  }
  return '適合重視生活機能、自住感與空間使用順手度的買方。';
}

function buildCustomerYieldLine(narrative) {
  if (narrative.gross_yield_pct != null) {
    return `若以月租金與總價一起看，表面投報率約 ${narrative.gross_yield_pct}% 左右，對重視收益節奏的買方會更有感。`;
  }
  if (narrative.rent_jpy != null) {
    return '若您想進一步評估收益，我們可以協助整理月租、持有成本與同區物件比較。';
  }
  return '若您想進一步比較，我們可以協助整理同區物件、持有成本與交易條件。';
}

function buildCustomerRiskLine() {
  return '實際屋況、權狀、貸款條件與交易成本，我們會協助逐項確認，讓評估更安心。';
}

function buildCustomerCta(promptContext = {}) {
  return normalizeText(promptContext.cta) || '想看完整資料，我幫你抓 2–3 間一起比，也可以直接整理比較表給你。';
}

function cleanSentence(sentence) {
  return normalizeText(sentence)
    .replace(/\s+/g, ' ')
    .replace(/\s([，。！？])/g, '$1')
    .trim();
}

function dedupeSentences(items) {
  const seen = new Set();
  return items.filter((item) => {
    const normalized = cleanSentence(item);
    if (!normalized) return false;
    if (seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

function clampIgBullet(text, maxLength = 18) {
  const normalized = cleanSentence(text).replace(/[。！!？?]$/g, '');
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1)}…`;
}

function sanitizeCustomerFacingCopy(text, fallbackText = '') {
  const replacementRisk = buildCustomerRiskLine();
  const replacementYield = '若您想進一步評估收益，我們可以協助整理月租、持有成本與同區物件比較。';

  let output = normalizeText(text);
  if (!output) output = normalizeText(fallbackText);

  output = output
    .replace(/避免宣稱保證增值、保證出租或穩賺不賠。?/g, replacementRisk)
    .replace(/不應/g, '')
    .replace(/先用[^。！？\n]*切入。?/g, '')
    .replace(/等[^。！？\n]*補齊後[^。！？\n]*。?/g, replacementYield)
    .replace(/投報試算補上會更準。?/g, replacementYield)
    .replace(/仍需逐項確認。?/g, '我們會協助逐項確認，讓評估更安心。')
    .replace(/資料待補。?/g, '歡迎私訊，我們可以協助補充查詢。')
    .replace(/無法驗證/g, '可再協助查核')
    .replace(/保守評估/g, '先從已知條件開始比較')
    .replace(/現在先看/g, '目前可以先從')
    .replace(/\n{3,}/g, '\n\n');

  const forbiddenFragments = [
    '避免宣稱',
    '不應',
    '先用',
    '補齊後',
    '投報試算補上會更準',
    '仍需逐項確認',
    '資料待補',
    '無法驗證',
    '保守評估'
  ];

  if (forbiddenFragments.some((fragment) => output.includes(fragment)) && fallbackText) {
    output = normalizeText(fallbackText);
  }

  return output.trim();
}

function buildNarrativeTransform(property = {}, analysis = {}) {
  const legacyAnalysis = normalizeLegacyAnalysis(analysis);
  const enrichedAnalysis = normalizeEnrichedAnalysis(analysis);
  const country = detectCountry(property);
  const listingMode = detectListingMode(property);
  const priceJpy = enrichedAnalysis.price_jpy ?? extractPriceJpy(property);
  const rentJpy = enrichedAnalysis.monthly_rent_jpy ?? extractRentJpy(property);
  const yieldNarrative = buildYieldNarrative(priceJpy, rentJpy, enrichedAnalysis.gross_yield_pct);
  const locationNarrative = buildLocationNarrative(property, analysis);
  const title = property.title_zh || property.title || property.title_ja || '精選物件';
  const completionLine = formatCompletionLine(property);
  const areaLine = formatAreaLine(property);
  const layoutLine = normalizeText(property.layout) ? `格局 ${property.layout}` : '';
  const targetBuyer = pickFirstText(
    enrichedAnalysis.fit_types[0],
    enrichedAnalysis.buyer_personas[0],
    legacyAnalysis.target_buyers[0]
  ) || (country === 'jp'
    ? '重視長期持有與收租規劃的買方'
    : '重視生活機能與自住感的買方');
  const valuePoint = pickFirstText(
    enrichedAnalysis.positioning_one_liner,
    enrichedAnalysis.property_strengths[0],
    enrichedAnalysis.investment_pros[0],
    legacyAnalysis.highlights[0]
  ) || (country === 'jp'
    ? '屬於都心小宅型產品，重點在出租定位與持有節奏。'
    : '重點在生活圈、空間感與自住使用情境。');
  const riskLine = pickFirstText(
    enrichedAnalysis.investment_risks[0],
    legacyAnalysis.risk_notes[0]
  ) || '實際價格、屋況與交易條件仍需以最新資料確認。';
  const cta = pickFirstText(
    enrichedAnalysis.marketing_line[0],
    legacyAnalysis.communication_tips[0]
  ) || '想看完整資料、比較表或安排進一步討論，歡迎直接私訊。';
  const complianceLine = pickFirstText(
    enrichedAnalysis.must_include[0],
    legacyAnalysis.compliance_notes[0]
  ) || '價格與交易條件仍以最新資料為準。';

  const openingLine = country === 'jp'
    ? `${title} 這類型物件，核心是日本住宅投資判斷與長期持有規劃。`
    : `${title} 這類型物件，核心會放在生活機能、自住情境與空間使用感。`;

  const positioningLine = country === 'jp'
    ? `屬於${listingMode === 'rental' ? '都心收租' : '日本住宅'}導向產品，主要適合 ${targetBuyer}。`
    : `整體定位偏向生活導向產品，主要適合 ${targetBuyer}。`;

  return {
    country,
    title,
    price_jpy: priceJpy,
    rent_jpy: rentJpy,
    gross_yield_pct: yieldNarrative.gross_yield_pct,
    data_sources: {
      property: true,
      legacy_analysis: Object.values(legacyAnalysis).some((value) => Array.isArray(value) && value.length > 0),
      enriched_analysis: Object.values(enrichedAnalysis).some((value) => {
        if (Array.isArray(value)) return value.length > 0;
        return value != null && value !== '';
      })
    },
    lines: {
      opening: openingLine,
      positioning: positioningLine,
      value: valuePoint,
      transit: locationNarrative.transit_line,
      lifestyle: locationNarrative.lifestyle_line,
      yield: yieldNarrative.line,
      risk: riskLine,
      compliance: complianceLine,
      cta
    },
    facts: {
      audience: buildAudienceLine(country),
      layout: layoutLine,
      area: areaLine,
      completion: completionLine,
      rent: rentJpy != null ? `月租金約 ¥${rentJpy.toLocaleString()}` : '',
      property_condition: dedupeSentences([
        rentJpy != null ? `目前帶租約，${`月租金約 ¥${rentJpy.toLocaleString()}`}` : '',
        layoutLine,
        areaLine,
        completionLine
      ])
    }
  };
}

function buildCopyDataSources(analysis = {}, promptContext = {}) {
  const normalizedAnalysis = normalizeLegacyAnalysis(analysis);
  const enrichedAnalysis = normalizeEnrichedAnalysis(analysis);
  const hasLegacyAnalysis = Object.values(normalizedAnalysis).some((value) => Array.isArray(value) && value.length > 0);
  const hasEnrichedAnalysis = Object.values(enrichedAnalysis).some((value) => Array.isArray(value) ? value.length > 0 : Boolean(value));
  return {
    property: true,
    analysis: hasLegacyAnalysis || hasEnrichedAnalysis,
    enriched_analysis: hasEnrichedAnalysis,
    prompt_context: Boolean(promptContext && Object.keys(promptContext).length > 0)
  };
}

function buildCopyMeta({ analysis = {}, promptContext = {}, usage = {} } = {}) {
  return {
    provider: usage.provider ?? null,
    model: usage.model ?? null,
    is_fallback: usage.provider === 'fallback' || usage.model === 'local-fallback',
    analysis_version: normalizeNullableNumber(analysis.analysis_version) ?? null,
    data_sources: buildCopyDataSources(analysis.result_json ?? analysis, promptContext)
  };
}

function buildFbNarrativeCopy(narrative, promptContext = {}) {
  const cta = buildCustomerCta(promptContext);
  const opening = cleanSentence(
    `${narrative.title} ${narrative.lines.transit}、${narrative.facts.rent || '物件條件清楚'}，很容易吸引正在找${narrative.country === 'jp' ? '日本收租型小宅' : '生活感自住物件'}的買方。`
  );
  const middle = cleanSentence(
    [
      narrative.facts.audience,
      '這種可以先放進比較。',
      narrative.lines.value
    ].join(' ')
  );
  const facts = cleanSentence(
    dedupeSentences([
      narrative.facts.property_condition.join('，')
    ]).join(' ')
  );
  const value = cleanSentence(buildCustomerYieldLine(narrative));
  const close = cleanSentence(`${buildCustomerRiskLine()} ${cta}`);

  return [opening, middle, facts, value, close].filter(Boolean).join('\n\n');
}

function buildIgNarrativeCopy(narrative, promptContext = {}) {
  const cta = normalizeText(promptContext.cta) || '私訊我，我幫你整理比較表。';
  const bullets = dedupeSentences([
    narrative.lines.transit.replace(/，步行約 /g, '步行約'),
    narrative.facts.rent,
    narrative.country === 'jp' ? '適合第一次入門' : '適合自住首購',
    narrative.country === 'jp' ? '想穩定收租可看' : '重視生活機能可看',
    narrative.facts.layout ? narrative.facts.layout.replace('格局 ', '') : '',
    narrative.facts.completion
  ])
    .slice(0, 5)
    .map((item) => `• ${clampIgBullet(item)}`);

  return [
    narrative.title,
    ...bullets,
    cta,
    narrative.country === 'jp'
      ? '#星澄地所 #日本不動產 #收租規劃 #資產配置'
      : '#星澄地所 #台灣房地產 #生活機能 #自住規劃'
  ].join('\n');
}

function buildLineNarrativeCopy(narrative, promptContext = {}) {
  const cta = normalizeText(promptContext.cta) || '我幫你抓 2–3 間一起比，也可以直接整理比較表給你。';
  return [
    `${narrative.title} 這間我會建議放進比較清單。`,
    `如果你是${narrative.country === 'jp' ? '第一次買日本物件、想穩定收租，或想找低總價入門' : '想找生活機能好、好入住的物件'}，這種可以先看。`,
    cleanSentence(`${narrative.lines.transit}。`),
    cleanSentence(dedupeSentences([narrative.facts.rent, narrative.facts.layout, narrative.facts.completion]).join('，')),
    buildCustomerYieldLine(narrative),
    `${buildCustomerRiskLine()} ${cta}`
  ]
    .map((line) => cleanSentence(line))
    .filter(Boolean)
    .slice(0, 6)
    .join('\n');
}

function buildCustomerFacingCopy(narrative, channel, promptContext = {}) {
  const base = {
    fb: buildFbNarrativeCopy(narrative, promptContext),
    ig: buildIgNarrativeCopy(narrative, promptContext),
    line: buildLineNarrativeCopy(narrative, promptContext)
  };
  return sanitizeCustomerFacingCopy(base[channel] || base.fb, base[channel] || base.fb);
}

function fallbackGeneratePost(property) {
  const narrative = buildNarrativeTransform(property, {});
  return {
    result: {
      facebook_post: buildCustomerFacingCopy(narrative, 'fb'),
      instagram_post: buildCustomerFacingCopy(narrative, 'ig'),
      line_message: buildCustomerFacingCopy(narrative, 'line')
    },
    tokensUsed: 0
  };
}

function fallbackAssistantAnalysis(property) {
  const country = detectCountry(property);
  const location = [property.city, property.district].filter(Boolean).join('') || (country === 'jp' ? '日本物件' : '所在地待確認');
  const listingMode = detectListingMode(property);
  const priceJpy = extractPriceJpy(property);
  const rentJpy = extractRentJpy(property);
  const yieldNarrative = buildYieldNarrative(priceJpy, rentJpy);
  const locationNarrative = buildLocationNarrative(property, {});
  const priceLine = priceJpy != null
    ? `總價約 ¥${priceJpy.toLocaleString()}`
    : property.price
      ? `${property.price} ${property.currency || (country === 'jp' ? 'JPY' : 'TWD')}`
      : '價格待確認';

  return {
    result: {
      highlights: [
        `${location}可作為主要溝通切入點。`,
        listingMode === 'rental'
          ? `目前可先用月租條件切入，租賃定位會比單看總價更有說服力。`
          : `${priceLine}，適合搭配同區行情與長期持有角度溝通。`,
        locationNarrative.is_transit_missing ? '交通資訊仍在補充中。' : `可強調 ${locationNarrative.transit_line} 的移動便利性。`
      ],
      target_buyers: [
        country === 'jp' ? '重視長期持有與收租規劃的買方' : '重視區位與生活機能的自住客',
        country === 'jp' ? '想布局海外不動產的資產配置型買方' : '需要明確總價帶與付款規劃的首購或換屋客',
        country === 'jp' ? '重視穩定租客輪替與都心配置的投資客' : '兼顧通勤與生活圈的換屋客'
      ],
      locality_angles: [
        locationNarrative.transit_line,
        locationNarrative.lifestyle_line,
        country === 'jp' ? '可再搭配同區租賃需求與持有節奏比較。' : '可再搭配同區生活圈與替代物件比較。'
      ],
      risk_notes: [
        yieldNarrative.line,
        '實際屋況、權狀、貸款條件與交易成本仍需逐項確認。',
        '市場行情會變動，不能以單一物件資訊承諾投資報酬。'
      ],
      communication_tips: [
        country === 'jp' ? '先用投資定位與收租邏輯切入，再補價格與持有條件。' : '先用生活情境建立想像，再補價格與坪數等硬資訊。',
        '主動揭露待確認事項，降低後續期待落差。',
        '引導客戶索取完整比較表、租賃試算或安排進一步討論。'
      ],
      compliance_notes: [
        '避免宣稱保證增值、保證出租或穩賺不賠。',
        '價格、坪數、屋齡與交通時間需以最新資料核對。',
        country === 'jp' ? '周邊設施與距離以最新地圖資料為準。' : '若使用投資語氣，需加上風險與自行評估提醒。'
      ],
      suggested_marketing_angles: [
        country === 'jp' ? '投資定位清楚' : '區位生活感',
        country === 'jp' ? '長期持有規劃' : '總價帶清楚',
        country === 'jp' ? '收租評估角度' : '看屋決策效率',
        '同區比較'
      ]
    },
    complianceFlags: [],
    riskScore: 35,
    tokensUsed: 0,
    usage: fallbackUsage()
  };
}

function fallbackAssistantCopy(property, analysis, channel, promptContext = {}) {
  const narrative = buildNarrativeTransform(property, analysis);
  const usage = fallbackUsage();
  const text = buildCustomerFacingCopy(narrative, channel, promptContext);

  return {
    result: {
      text,
      compliance_flags: normalizeComplianceFlags([
        {
          code: 'safe_ai_lite_mode',
          severity: 'info',
          message: 'Copy generated in Safe AI Lite Mode from property and analysis summary.'
        }
      ]),
      risk_score: narrative.gross_yield_pct == null ? 35 : 20
    },
    tokensUsed: 0,
    usage,
    meta: buildCopyMeta({ analysis, promptContext, usage })
  };
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
  const narrative = buildNarrativeTransform(property, analysis || {});
  if (!OPENAI_API_KEY) {
    return fallbackAssistantCopy(property, analysis || {}, channel, promptContext);
  }

  const channelLabel = {
    fb: 'Facebook',
    ig: 'Instagram',
    line: 'LINE'
  }[channel] || channel;

  const systemPrompt = [
    '你是星澄地所的業務總監級文案助理，不是分析師，不是研究員。',
    `請為 ${channelLabel} 產生繁體中文物件文案，輸出 JSON。`,
    '文案只可輸出對客結果，不可輸出分析過程、欄位名稱、技術語言、snake_case key。',
    'AI 是業務，不是研究員。語氣要能賣、能解釋、能收斂風險、能引導成交。',
    '每一段至少要包含價值、判斷、或下一步。',
    '日本物件重點是投報率、租客類型、都心/郊區、長期持有；台灣物件重點是生活機能、學區、自住感、空間感。',
    '若沒有 price_jpy，不得談投報率；若沒有完整地點資料，改寫成自然語句，例如交通資訊仍在補充中、周邊生活機能資料尚待補強。',
    '禁止輸出 raw key：poi_*、transit.*、uncertain、analysis、snake_case 欄位名。',
    'FB 結構：開頭定位、核心價值、風險說明、行動引導。',
    'IG 結構：短標題、3到5個重點 bullet、CTA、Hashtag。',
    'LINE 結構：快速介紹、核心判斷、簡短風險提醒、互動引導。',
    'JSON keys 必須是：text, compliance_flags, risk_score。',
    'compliance_flags 是陣列；risk_score 是 0 到 100。'
  ].join('\n');

  const userPrompt = `輸入資料：\n${JSON.stringify({
    channel,
    narrative,
    prompt_context: promptContext,
    rules: {
      safe_ai_lite_mode: false,
      no_raw_keys: true
    }
  }, null, 2)}`;
  const { parsed, tokensUsed, usage } = await callOpenAI(systemPrompt, userPrompt);
  const normalized = normalizeCopyShape(parsed);
  const fallbackText = buildCustomerFacingCopy(narrative, channel, promptContext);
  normalized.text = sanitizeCustomerFacingCopy(normalized.text, fallbackText);

  return {
    result: normalized,
    tokensUsed,
    usage,
    meta: buildCopyMeta({ analysis, promptContext, usage })
  };
}
