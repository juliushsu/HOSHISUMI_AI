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
  const title = property.title_zh || property.title || '精選物件';
  const location = [property.city, property.district].filter(Boolean).join('') || '台灣';
  const base = {
    fb: `【${title}】\n${location}精選物件，適合想兼顧生活機能與資產配置的你。\n\n價格、屋況與交易條件仍以最新資料確認為準。想看完整資訊，歡迎私訊星澄地所。`,
    ig: `${title}\n${location}生活圈精選物件\n\n看重區位、機能與總價帶的朋友，可以把這間列入比較清單。\n\n#星澄地所 #台灣房地產 #精選物件`,
    line: `推薦你看看這間：${title}。位置在${location}，可以從生活機能、總價帶和屋況一起評估。想看完整資料我再傳給你。`
  };

  return {
    result: {
      text: base[channel] || base.fb,
      compliance_flags: [],
      risk_score: 25
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
  if (!OPENAI_API_KEY) {
    return fallbackAssistantCopy(property, channel);
  }

  const channelLabel = {
    fb: 'Facebook',
    ig: 'Instagram',
    line: 'LINE'
  }[channel] || channel;

  const systemPrompt = [
    '你是星澄地所台灣房地產文案助理。',
    `請為 ${channelLabel} 產生繁體中文物件文案，輸出 JSON。`,
    '文案需可讓業務後續人工編輯，避免誇大不實、保證收益或未查證的絕對說法。',
    'JSON keys 必須是：text, compliance_flags, risk_score。',
    'compliance_flags 是陣列；risk_score 是 0 到 100。'
  ].join('\n');

  const userPrompt = `輸入資料：\n${JSON.stringify({
    channel,
    property,
    analysis,
    prompt_context: promptContext
  }, null, 2)}`;
  const { parsed, tokensUsed, usage } = await callOpenAI(systemPrompt, userPrompt);

  return {
    result: normalizeCopyShape(parsed),
    tokensUsed,
    usage
  };
}
