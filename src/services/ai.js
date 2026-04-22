const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4.1-mini';

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

  if (!parsed) {
    throw new Error('OpenAI returned non-JSON output.');
  }

  return {
    parsed,
    tokensUsed: json?.usage?.total_tokens ?? 0
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
