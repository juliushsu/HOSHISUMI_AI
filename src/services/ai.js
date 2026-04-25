import crypto from 'node:crypto';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4.1-mini';
const OPENAI_INPUT_COST_PER_1M = Number(process.env.OPENAI_INPUT_COST_PER_1M || '');
const OPENAI_OUTPUT_COST_PER_1M = Number(process.env.OPENAI_OUTPUT_COST_PER_1M || '');
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY ||
  process.env.GOOGLE_MAPS_API_KEY_STAGING ||
  process.env.GOOGLE_PLACES_API_KEY ||
  process.env.GOOGLE_PLACES_API_KEY_STAGING;
const GOOGLE_PLACES_ENDPOINT = 'https://places.googleapis.com/v1/places:searchNearby';
const GOOGLE_GEOCODING_ENDPOINT = 'https://maps.googleapis.com/maps/api/geocode/json';
const GOOGLE_PLACES_FIELD_MASK = [
  'places.displayName',
  'places.primaryType',
  'places.types',
  'places.location',
  'places.rating'
].join(',');
const LOCATION_ENRICHMENT_CACHE = new Map();
const GEOCODE_CACHE = new Map();
const LOCATION_ENRICHMENT_REQUESTS = [
  {
    key: 'poi_200m',
    radius: 200,
    categories: ['convenience_store', 'supermarket', 'cafe'],
    includedTypes: ['convenience_store', 'supermarket', 'cafe'],
    maxResultCount: 8
  },
  {
    key: 'poi_500m',
    radius: 500,
    categories: ['transit_station', 'shopping_street', 'mall'],
    includedTypes: ['train_station', 'subway_station', 'transit_station', 'bus_station', 'shopping_mall', 'department_store'],
    maxResultCount: 10
  }
];

function normalizeEnvironmentType() {
  const appEnv = String(process.env.APP_ENV || process.env.NODE_ENV || '').toLowerCase();
  const railwayProjectName = String(process.env.RAILWAY_PROJECT_NAME || '').toLowerCase();

  if (appEnv === 'production' && !railwayProjectName.includes('staging')) return 'production';
  if (appEnv === 'staging' || railwayProjectName.includes('staging')) return 'staging';
  return 'development';
}

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

function normalizeNullableNumber(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeAddressForHash(property = {}) {
  return [
    property.address_full_ja,
    property.address_ja,
    property.address_zh,
    property.address,
    property.nearest_station,
    property.address_en,
    property.prefecture,
    property.city,
    property.district
  ].map((item) => normalizeText(item)).filter(Boolean).join('|');
}

function buildLocationEnrichmentCacheKey(property = {}) {
  const propertyId = normalizeText(property.id, 'unknown-property');
  const addressHash = crypto
    .createHash('sha256')
    .update(normalizeAddressForHash(property) || 'unknown-address')
    .digest('hex')
    .slice(0, 16);

  return `${propertyId}:${addressHash}`;
}

function buildProviderAddressCacheKey(addressInput, provider) {
  const addressHash = crypto
    .createHash('sha256')
    .update(normalizeText(addressInput) || 'unknown-address')
    .digest('hex')
    .slice(0, 16);

  return `${addressHash}:${normalizeText(provider, 'unknown-provider')}`;
}

function toRadians(value) {
  return (value * Math.PI) / 180;
}

function calculateDistanceMeters(origin, target) {
  const lat1 = normalizeNullableNumber(origin?.lat);
  const lng1 = normalizeNullableNumber(origin?.lng);
  const lat2 = normalizeNullableNumber(target?.lat);
  const lng2 = normalizeNullableNumber(target?.lng);
  if ([lat1, lng1, lat2, lng2].some((item) => item == null)) return null;

  const earthRadiusM = 6371000;
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(earthRadiusM * c);
}

function estimateWalkingMinutes(distanceM) {
  if (!Number.isFinite(distanceM)) return null;
  return Math.max(1, Math.round(distanceM / 80));
}

function buildGeocodeCandidates(property = {}) {
  const stationArea = [normalizeText(property.nearest_station), normalizeText(property.city), normalizeText(property.prefecture)]
    .filter(Boolean)
    .join(' ');

  return [
    normalizeText(property.address_full_ja),
    normalizeText(property.address_ja),
    normalizeText(property.address_zh),
    normalizeText(property.address),
    stationArea
  ].filter(Boolean);
}

function shouldAttemptGeocode(property = {}) {
  return normalizeNullableNumber(property.latitude) == null &&
    normalizeNullableNumber(property.longitude) == null &&
    buildGeocodeCandidates(property).length > 0;
}

function normalizeConfidence(value, fallback = 'medium') {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'high' || normalized === 'medium' || normalized === 'low') return normalized;
  return fallback;
}

function normalizeObject(value, fallback = {}) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : fallback;
}

function normalizeTransitLines(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === 'string') {
        return item.trim() || null;
      }
      if (!item || typeof item !== 'object') return null;
      return normalizeText(item.name || item.line || item.label) || null;
    })
    .filter(Boolean);
}

function normalizePoiItems(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const name = normalizeText(item.name);
      if (!name) return null;
      return {
        name,
        category: normalizeText(item.category),
        distance_m: normalizeNullableNumber(item.distance_m),
        walking_minutes_estimate: normalizeNullableNumber(item.walking_minutes_estimate),
        source: normalizeText(item.source),
        rating: normalizeNullableNumber(item.rating),
        uncertain: Boolean(item.uncertain)
      };
    })
    .filter(Boolean);
}

function summarizePoi(poi) {
  return poi
    .map((item) => {
      const parts = [item.name];
      if (item.category) parts.push(item.category);
      if (Number.isFinite(item.distance_m)) parts.push(`約${Math.round(item.distance_m)}公尺`);
      if (Number.isFinite(item.walking_minutes_estimate)) parts.push(`步行約${Math.round(item.walking_minutes_estimate)}分鐘`);
      if (item.uncertain) parts.push('資訊待確認');
      return parts.join('｜');
    })
    .slice(0, 6);
}

const FIT_TYPE_VALUES = ['investment', 'rental', 'owner_occupier', 'asset_allocation'];
const DEFAULT_MUST_INCLUDE = [
  '不得保證收益或增值',
  '價格、租金、空室與交易條件以最新資料為準',
  '周邊設施與距離以最新地圖資料為準'
];
const DEFAULT_FORBIDDEN_CLAIMS = ['穩賺不賠', '保證出租', '保證增值'];
const SELLABLE_POI_PRIORITY = {
  station: 100,
  train_station: 98,
  metro_station: 96,
  transit_station: 94,
  convenience_store: 92,
  supermarket: 90,
  shopping_street: 86,
  mall: 84,
  park: 78,
  pharmacy: 76,
  cafe: 72,
  restaurant: 68,
  hospital: 64,
  school: 58,
  university: 56,
  notable_poi: 52,
  major_landmark: 50,
  tourist_spot: 46,
  bank: 40,
  atm: 36,
  parking: 30
};

function normalizeMarketContext(marketContext = {}, property = {}) {
  const explicitCountry = normalizeText(marketContext.country).toLowerCase();
  const propertyCountry = normalizeText(property.country).toLowerCase();
  const hasJapanSignal = [
    property.title_ja,
    property.address_full_ja,
    property.address_ja
  ].some((value) => normalizeText(value));
  const country = ['jp', 'tw'].includes(explicitCountry)
    ? explicitCountry
    : hasJapanSignal || propertyCountry === 'jp'
      ? 'jp'
      : propertyCountry === 'tw'
        ? 'tw'
        : 'jp';
  const marketProfile = ['investment', 'owner_occupier', 'mixed'].includes(normalizeText(marketContext.market_profile).toLowerCase())
    ? normalizeText(marketContext.market_profile).toLowerCase()
    : (country === 'jp' ? 'investment' : 'mixed');

  return {
    country,
    market_profile: marketProfile
  };
}

function inferOccupancyStatus(property) {
  const source = [
    property?.status,
    property?.current_stage,
    property?.purpose
  ].map((item) => String(item || '').toLowerCase());
  if (source.some((item) => item.includes('rent') || item.includes('lease'))) return 'rental';
  if (source.some((item) => item.includes('sale'))) return 'for_sale';
  return 'unknown';
}

export function buildAssistantLocationEnrichment(property = {}) {
  const nearestStation = normalizeText(property.nearest_station);
  const walkMinutes = normalizeNullableNumber(property.walking_minutes);
  const warnings = ['周邊設施與距離以最新地圖資料為準'];

  return {
    geocode: {
      lat: normalizeNullableNumber(property.latitude),
      lng: normalizeNullableNumber(property.longitude),
      formatted_address: normalizeText(
        property.address_full_ja ||
        property.address_zh ||
        property.address_ja ||
        property.address ||
        property.address_en ||
        [property.city, property.district].filter(Boolean).join('')
      ),
      confidence: normalizeConfidence(
        property.latitude != null && property.longitude != null ? 'medium' : 'low',
        'low'
      ),
      address_used: null,
      source: property.latitude != null && property.longitude != null ? 'property_coordinates' : null
    },
    poi_200m: [],
    poi_500m: [],
    transit_summary: {
      nearest_station: nearestStation,
      walk_minutes: walkMinutes,
      lines: [],
      uncertain: !nearestStation || walkMinutes == null
    },
    marketing_location_summary: '',
    warnings
  };
}

function buildMinimalLocationEnrichment() {
  return {
    geocode: {
      lat: null,
      lng: null,
      formatted_address: '',
      confidence: 'low',
      address_used: null,
      source: null
    },
    poi_200m: [],
    poi_500m: [],
    transit_summary: {
      nearest_station: null,
      walk_minutes: null,
      lines: [],
      uncertain: true
    },
    marketing_location_summary: '',
    warnings: ['周邊設施與距離以最新地圖資料為準'],
    _meta: {
      has_location_enrichment: false,
      geocode_failed: false
    }
  };
}

function mapGooglePlaceCategory(place = {}, requestConfig = {}) {
  const primaryType = normalizeText(place.primaryType).toLowerCase();
  const typeSet = new Set(
    Array.isArray(place.types)
      ? place.types.map((item) => normalizeText(item).toLowerCase()).filter(Boolean)
      : []
  );

  if (primaryType === 'convenience_store' || typeSet.has('convenience_store')) return 'convenience_store';
  if (primaryType === 'supermarket' || typeSet.has('supermarket')) return 'supermarket';
  if (primaryType === 'cafe' || typeSet.has('cafe')) return 'cafe';
  if (typeSet.has('train_station') || typeSet.has('subway_station') || typeSet.has('transit_station') || typeSet.has('bus_station')) {
    return 'transit_station';
  }
  if (typeSet.has('shopping_mall')) return 'mall';
  if (typeSet.has('department_store')) return requestConfig.categories?.includes('shopping_street') ? 'shopping_street' : 'mall';

  return requestConfig.radius <= 200 ? 'notable_poi' : 'shopping_street';
}

function normalizeGooglePlace(place = {}, requestConfig = {}, origin = {}) {
  const name = normalizeText(place.displayName?.text || place.displayName);
  if (!name) return null;

  const distanceM = calculateDistanceMeters(origin, {
    lat: place.location?.latitude,
    lng: place.location?.longitude
  });

  return {
    name,
    category: mapGooglePlaceCategory(place, requestConfig),
    distance_m: distanceM,
    walking_minutes_estimate: estimateWalkingMinutes(distanceM),
    source: 'google_places_nearby_search',
    rating: normalizeNullableNumber(place.rating),
    uncertain: false
  };
}

async function fetchGoogleGeocode(addressInput) {
  const params = new URLSearchParams({
    address: addressInput,
    key: GOOGLE_MAPS_API_KEY
  });
  const response = await fetch(`${GOOGLE_GEOCODING_ENDPOINT}?${params.toString()}`);
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Google Geocoding API error (${response.status}): ${errorText}`);
  }

  const json = await response.json();
  const result = Array.isArray(json.results) ? json.results[0] : null;
  if (!result?.geometry?.location) return null;

  return {
    lat: normalizeNullableNumber(result.geometry.location.lat),
    lng: normalizeNullableNumber(result.geometry.location.lng),
    formatted_address: normalizeText(result.formatted_address),
    confidence: result.geometry.location_type === 'ROOFTOP' ? 'high' : 'medium',
    address_used: addressInput,
    source: 'google_geocoding'
  };
}

async function resolveGeocode(property = {}) {
  if (normalizeEnvironmentType() === 'production') return { geocode: null, geocodeFailed: false };
  if (!GOOGLE_MAPS_API_KEY) return { geocode: null, geocodeFailed: false };

  const candidates = buildGeocodeCandidates(property);
  if (!candidates.length) return { geocode: null, geocodeFailed: false };

  for (const candidate of candidates) {
    const cacheKey = buildProviderAddressCacheKey(candidate, 'google_geocoding');
    if (GEOCODE_CACHE.has(cacheKey)) {
      return { geocode: GEOCODE_CACHE.get(cacheKey), geocodeFailed: false };
    }

    try {
      const geocode = await fetchGoogleGeocode(candidate);
      if (!geocode) continue;
      GEOCODE_CACHE.set(cacheKey, geocode);
      return { geocode, geocodeFailed: false };
    } catch {
      return { geocode: null, geocodeFailed: true };
    }
  }

  return { geocode: null, geocodeFailed: true };
}

async function fetchGooglePlacesNearby({ lat, lng, requestConfig }) {
  const response = await fetch(GOOGLE_PLACES_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': GOOGLE_MAPS_API_KEY,
      'X-Goog-FieldMask': GOOGLE_PLACES_FIELD_MASK
    },
    body: JSON.stringify({
      includedTypes: requestConfig.includedTypes,
      maxResultCount: requestConfig.maxResultCount,
      locationRestriction: {
        circle: {
          center: {
            latitude: lat,
            longitude: lng
          },
          radius: requestConfig.radius
        }
      }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Google Places API error (${response.status}): ${errorText}`);
  }

  const json = await response.json();
  return Array.isArray(json.places) ? json.places : [];
}

function buildLocationSummary(enrichment = {}) {
  const transit = normalizeObject(enrichment.transit_summary, {});
  const poi200 = summarizePoi(normalizePoiItems(enrichment.poi_200m));
  const poi500 = summarizePoi(normalizePoiItems(enrichment.poi_500m));
  const parts = [];

  if (normalizeText(transit.nearest_station)) {
    parts.push(
      `${transit.nearest_station}${normalizeNullableNumber(transit.walk_minutes) != null ? `步行約${normalizeNullableNumber(transit.walk_minutes)}分鐘` : ''}`
    );
  }
  if (poi200.length) parts.push(`200m 內高頻機能：${poi200.slice(0, 3).join('、')}`);
  if (poi500.length) parts.push(`500m 內延伸生活圈：${poi500.slice(0, 3).join('、')}`);

  return parts.join('；');
}

async function buildGooglePlacesLocationEnrichment(property = {}) {
  if (normalizeEnvironmentType() === 'production') return null;
  if (!GOOGLE_MAPS_API_KEY) return null;

  let lat = normalizeNullableNumber(property.latitude);
  let lng = normalizeNullableNumber(property.longitude);
  let geocode = lat != null && lng != null
    ? {
      lat,
      lng,
      formatted_address: normalizeText(
        property.address_full_ja ||
        property.address_zh ||
        property.address_ja ||
        property.address ||
        property.address_en ||
        [property.city, property.district].filter(Boolean).join('')
      ),
      confidence: 'medium',
      address_used: null,
      source: 'property_coordinates'
    }
    : null;

  let geocodeFailed = false;
  if (lat == null || lng == null) {
    const geocodeResult = await resolveGeocode(property);
    geocode = geocodeResult.geocode;
    geocodeFailed = geocodeResult.geocodeFailed;
    lat = normalizeNullableNumber(geocode?.lat);
    lng = normalizeNullableNumber(geocode?.lng);
  }
  if (lat == null || lng == null) {
    if (geocodeFailed) {
      return {
        ...buildMinimalLocationEnrichment(),
        _meta: {
          has_location_enrichment: false,
          geocode_failed: true
        }
      };
    }
    return null;
  }

  const cacheKey = buildLocationEnrichmentCacheKey(property);
  if (LOCATION_ENRICHMENT_CACHE.has(cacheKey)) {
    return LOCATION_ENRICHMENT_CACHE.get(cacheKey);
  }

  const origin = { lat, lng };
  const warnings = ['周邊設施與距離以最新地圖資料為準'];

  try {
    const [places200, places500] = await Promise.all(
      LOCATION_ENRICHMENT_REQUESTS.map((requestConfig) => fetchGooglePlacesNearby({ lat, lng, requestConfig }))
    );

    const normalized200 = places200
      .map((place) => normalizeGooglePlace(place, LOCATION_ENRICHMENT_REQUESTS[0], origin))
      .filter(Boolean)
      .sort((left, right) => (left.distance_m ?? Number.MAX_SAFE_INTEGER) - (right.distance_m ?? Number.MAX_SAFE_INTEGER));
    const normalized500 = places500
      .map((place) => normalizeGooglePlace(place, LOCATION_ENRICHMENT_REQUESTS[1], origin))
      .filter(Boolean)
      .sort((left, right) => (left.distance_m ?? Number.MAX_SAFE_INTEGER) - (right.distance_m ?? Number.MAX_SAFE_INTEGER));
    const transitCandidates = normalized500.filter((item) => item.category === 'transit_station');
    const nearestTransit = transitCandidates[0] || null;

    const enrichment = {
      geocode: geocode || {
        lat,
        lng,
        formatted_address: '',
        confidence: 'medium',
        address_used: null,
        source: 'property_coordinates'
      },
      poi_200m: normalized200,
      poi_500m: normalized500,
      transit_summary: {
        nearest_station: nearestTransit?.name || null,
        walk_minutes: nearestTransit?.walking_minutes_estimate ?? null,
        lines: [],
        uncertain: !nearestTransit
      },
      marketing_location_summary: '',
      warnings,
      _meta: {
        has_location_enrichment: true,
        geocode_failed: false
      }
    };

    enrichment.marketing_location_summary = buildLocationSummary(enrichment);
    LOCATION_ENRICHMENT_CACHE.set(cacheKey, enrichment);
    return enrichment;
  } catch {
    return geocodeFailed
      ? {
        ...buildMinimalLocationEnrichment(),
        _meta: {
          has_location_enrichment: false,
          geocode_failed: true
        }
      }
      : null;
  }
}

async function resolveLocationEnrichment(property = {}, locationEnrichment = null) {
  if (normalizeObject(locationEnrichment, null) != null) return locationEnrichment;
  return buildGooglePlacesLocationEnrichment(property);
}

function normalizeLocationEnrichment(locationEnrichment = null, property = {}) {
  const hasLocationEnrichment = normalizeObject(locationEnrichment, null) != null;
  const fallback = hasLocationEnrichment ? buildAssistantLocationEnrichment(property) : buildMinimalLocationEnrichment();
  const source = normalizeObject(locationEnrichment, {});
  const geocode = normalizeObject(source.geocode, {});
  const transit = normalizeObject(source.transit_summary, {});
  const meta = normalizeObject(source._meta, {});

  return {
    geocode: {
      lat: normalizeNullableNumber(geocode.lat ?? fallback.geocode.lat),
      lng: normalizeNullableNumber(geocode.lng ?? fallback.geocode.lng),
      formatted_address: normalizeText(geocode.formatted_address, fallback.geocode.formatted_address),
      confidence: normalizeConfidence(geocode.confidence, fallback.geocode.confidence),
      address_used: normalizeText(geocode.address_used, fallback.geocode.address_used),
      source: normalizeText(geocode.source, fallback.geocode.source)
    },
    poi_200m: normalizePoiItems(source.poi_200m),
    poi_500m: normalizePoiItems(source.poi_500m),
    transit_summary: {
      nearest_station: normalizeText(transit.nearest_station, fallback.transit_summary.nearest_station),
      walk_minutes: normalizeNullableNumber(transit.walk_minutes ?? fallback.transit_summary.walk_minutes),
      lines: normalizeTransitLines(transit.lines),
      uncertain: Boolean(
        transit.uncertain ??
        fallback.transit_summary.uncertain ??
        !normalizeText(transit.nearest_station || fallback.transit_summary.nearest_station)
      )
    },
    marketing_location_summary: normalizeText(source.marketing_location_summary),
    warnings: normalizeArray(source.warnings?.length ? source.warnings : fallback.warnings),
    _meta: {
      has_location_enrichment: Boolean(meta.has_location_enrichment ?? hasLocationEnrichment),
      geocode_failed: Boolean(meta.geocode_failed)
    }
  };
}

function buildAreaLabel(property = {}) {
  return [property.prefecture, property.city, property.district]
    .filter((item) => normalizeText(item))
    .slice(0, 2)
    .join(' ')
    .trim();
}

function buildPropertyTextBlob(property = {}) {
  return [
    property.title,
    property.title_ja,
    property.title_zh,
    property.description,
    property.description_ja,
    property.description_zh,
    property.description_en
  ].filter(Boolean).join('\n');
}

function hasKeyword(text, keywords) {
  return keywords.some((keyword) => text.includes(keyword));
}

function extractNumericValue(property = {}, keys = []) {
  for (const key of keys) {
    const value = normalizeNullableNumber(property?.[key]);
    if (value != null) return value;
  }
  return null;
}

function isLikelyJpyContext(property = {}) {
  const currency = normalizeText(property.currency).toUpperCase();
  if (currency === 'JPY' || currency === '円') return true;
  if (currency && currency !== 'JPY' && currency !== '円') return false;
  return normalizeText(property.country).toLowerCase() === 'jp';
}

function normalizeFitTypes(value) {
  if (!Array.isArray(value)) return [];

  const mapped = value
    .map((item) => normalizeText(item).toLowerCase())
    .map((item) => {
      if (FIT_TYPE_VALUES.includes(item)) return item;
      if (item.includes('invest')) return 'investment';
      if (item.includes('rental') || item.includes('lease') || item.includes('出租')) return 'rental';
      if (item.includes('owner') || item.includes('occupier') || item.includes('自住')) return 'owner_occupier';
      if (item.includes('asset') || item.includes('allocation') || item.includes('配置')) return 'asset_allocation';
      return null;
    })
    .filter(Boolean);

  return Array.from(new Set(mapped));
}

function mergeUniqueStrings(...arrays) {
  return Array.from(new Set(arrays.flatMap((value) => normalizeArray(value))));
}

function scorePoiForSales(item) {
  const priority = SELLABLE_POI_PRIORITY[item.category] ?? 10;
  const certaintyScore = item.uncertain ? -20 : 0;
  const distanceScore = Number.isFinite(item.distance_m) ? Math.max(0, 500 - item.distance_m) / 10 : 0;
  return priority + certaintyScore + distanceScore;
}

function selectPoiHighlights(items, max = 4) {
  const unique = new Map();

  for (const item of items) {
    const key = `${normalizeText(item.name)}::${normalizeText(item.category)}`;
    if (!key || unique.has(key)) continue;
    unique.set(key, item);
  }

  return Array.from(unique.values())
    .sort((left, right) => {
      const scoreDiff = scorePoiForSales(right) - scorePoiForSales(left);
      if (scoreDiff !== 0) return scoreDiff;
      return (left.distance_m ?? Number.MAX_SAFE_INTEGER) - (right.distance_m ?? Number.MAX_SAFE_INTEGER);
    })
    .slice(0, max)
    .map((item) => ({
      name: item.name,
      category: item.category || 'notable_poi',
      distance_m: Number.isFinite(item.distance_m) ? Math.round(item.distance_m) : null
    }))
    .filter((item) => item.distance_m != null);
}

function formatPoiSummaryList(items) {
  return items.map((item) => `${item.name}（${item.category}・約${item.distance_m}m）`);
}

function buildLocationAnalysisFromEnrichment(locationEnrichment = {}) {
  if (!locationEnrichment?._meta?.has_location_enrichment) {
    const uncertainFields = locationEnrichment?._meta?.geocode_failed
      ? ['geocode', 'poi_200m', 'poi_500m', 'transit']
      : ['poi_200m', 'poi_500m', 'transit'];
    return {
      transit: {
        nearest_station: null,
        walk_minutes: null,
        lines: [],
        uncertain: true
      },
      poi_200m_highlights: [],
      poi_500m_highlights: [],
      lifestyle_summary: 'location_enrichment 不存在，位置相關判斷僅能維持最小保守分析。',
      uncertain_fields: uncertainFields,
      data_source: 'fallback_minimal'
    };
  }

  const transit = {
    nearest_station: normalizeText(locationEnrichment.transit_summary?.nearest_station) || null,
    walk_minutes: normalizeNullableNumber(locationEnrichment.transit_summary?.walk_minutes),
    lines: normalizeTransitLines(locationEnrichment.transit_summary?.lines),
    uncertain: Boolean(locationEnrichment.transit_summary?.uncertain)
  };
  const poi200 = selectPoiHighlights(locationEnrichment.poi_200m || [], 4);
  const poi500 = selectPoiHighlights(locationEnrichment.poi_500m || [], 4);
  const uncertainFields = [];

  if (!transit.nearest_station) uncertainFields.push('transit.nearest_station');
  if (transit.walk_minutes == null) uncertainFields.push('transit.walk_minutes');
  if (!poi200.length) uncertainFields.push('poi_200m_highlights');
  if (!poi500.length) uncertainFields.push('poi_500m_highlights');

  transit.uncertain = transit.uncertain || uncertainFields.includes('transit.nearest_station') || uncertainFields.includes('transit.walk_minutes');

  const summaryParts = [];
  if (transit.nearest_station) {
    summaryParts.push(
      `交通判斷可先以 ${transit.nearest_station}${transit.walk_minutes != null ? `步行約 ${transit.walk_minutes} 分鐘` : ''} 為主軸`
    );
  }
  if (poi200.length) {
    summaryParts.push(`200m 內可直接支撐銷售敘事的機能包括 ${formatPoiSummaryList(poi200).join('、')}`);
  }
  if (poi500.length) {
    summaryParts.push(`500m 範圍可補強生活圈說明的重點為 ${formatPoiSummaryList(poi500).join('、')}`);
  }

  return {
    transit,
    poi_200m_highlights: poi200,
    poi_500m_highlights: poi500,
    lifestyle_summary: summaryParts.join('；') || 'location_enrichment_json 可用資訊有限，生活圈敘事需保守處理。',
    uncertain_fields: uncertainFields,
    data_source: 'location_enrichment_json'
  };
}

function emptyAnalysisResult() {
  return {
    property_positioning: {
      one_liner: '',
      fit_types: [],
      positioning_confidence: 'medium'
    },
    location_analysis: {
      transit: {
        nearest_station: null,
        walk_minutes: null,
        lines: [],
        uncertain: true
      },
      poi_200m_highlights: [],
      poi_500m_highlights: [],
      lifestyle_summary: '',
      uncertain_fields: [],
      data_source: 'location_enrichment_json'
    },
    investment_analysis: {
      price_jpy: null,
      monthly_rent_jpy: null,
      gross_yield_pct: null,
      management_fee_jpy: null,
      repair_reserve_jpy: null,
      owner_occupier_fit: 'medium',
      investment_pros: [],
      investment_risks: [],
      calculation_notes: []
    },
    property_strengths: {
      layout: { value: null, summary: '' },
      area_sqm: { value: null, summary: '' },
      light_and_ventilation: { summary: '' },
      condition: { summary: '' },
      renovation_history: [],
      building_management: { summary: '' }
    },
    buyer_personas: {
      investment_buyer: [],
      owner_occupier: [],
      first_time_overseas_buyer: [],
      long_term_allocator: []
    },
    marketing_angles: {
      fb_long_form: [],
      ig_short_highlights: [],
      line_dm: [],
      visual_one_pager: []
    },
    compliance_notes: {
      must_include: [],
      ocr_uncertain_fields: [],
      forbidden_claims: []
    },
    meta: {
      analysis_version: 'v2_enriched',
      has_location_enrichment: false,
      market_context_applied: true
    }
  };
}

function inferFitTypes(property = {}, investmentAnalysis = {}, locationAnalysis = {}, parsedFitTypes = [], marketContext = {}) {
  const fitTypes = new Set(normalizeFitTypes(parsedFitTypes));
  const layout = normalizeText(property.layout).toLowerCase();
  const area = normalizeNullableNumber(property.area_sqm);
  const marketProfile = normalizeText(marketContext.market_profile).toLowerCase();

  if (investmentAnalysis.price_jpy != null || investmentAnalysis.monthly_rent_jpy != null) fitTypes.add('investment');
  if (locationAnalysis.transit.nearest_station || layout.includes('1r') || layout.includes('1k') || layout.includes('1dk') || layout.includes('1ldk')) fitTypes.add('rental');
  if ((area != null && area >= 40) || /2|3|4/.test(layout)) fitTypes.add('owner_occupier');
  if (normalizeText(property.country).toLowerCase() === 'jp') fitTypes.add('asset_allocation');
  if (marketProfile === 'investment') fitTypes.add('investment');
  if (marketProfile === 'owner_occupier') fitTypes.add('owner_occupier');

  if (!fitTypes.size) fitTypes.add('investment');
  return FIT_TYPE_VALUES.filter((item) => fitTypes.has(item));
}

function inferPositioningConfidence(property = {}, locationAnalysis = {}, investmentAnalysis = {}) {
  let score = 0;
  if (locationAnalysis.transit.nearest_station) score += 1;
  if (locationAnalysis.poi_200m_highlights.length >= 2) score += 1;
  if (investmentAnalysis.price_jpy != null) score += 1;
  if (normalizeText(property.layout)) score += 1;
  if (normalizeNullableNumber(property.area_sqm) != null) score += 1;
  if (score >= 4) return 'high';
  if (score >= 2) return 'medium';
  return 'low';
}

function buildOneLiner(property = {}, fitTypes = [], locationAnalysis = {}, marketContext = {}) {
  const areaLabel = buildAreaLabel(property);
  const stationLabel = locationAnalysis.transit.nearest_station ? `${locationAnalysis.transit.nearest_station}步行圈` : '生活圈資料待補';
  const country = normalizeText(marketContext.country).toLowerCase();
  if (fitTypes.includes('investment') && fitTypes.includes('rental')) {
    return `${areaLabel || '日本住宅'}${stationLabel}的投資與出租雙用途判斷標的`;
  }
  if (country === 'tw' && fitTypes.includes('owner_occupier')) {
    return `${areaLabel || '台灣住宅'}以通勤與自住判斷為主的住宅標的`;
  }
  if (fitTypes.includes('owner_occupier')) {
    return `${areaLabel || '日本住宅'}可同時評估自住與資產配置的住宅標的`;
  }
  if (fitTypes.includes('asset_allocation')) {
    return `${areaLabel || '日本住宅'}日圓資產配置導向的住宅標的`;
  }
  return `${areaLabel || '日本住宅'}保守型投資判斷標的`;
}

function deriveOwnerOccupierFit(property = {}, locationAnalysis = {}, marketContext = {}) {
  const layout = normalizeText(property.layout).toLowerCase();
  const area = normalizeNullableNumber(property.area_sqm);
  const marketProfile = normalizeText(marketContext.market_profile).toLowerCase();

  if (marketProfile === 'owner_occupier') return 'high';
  if ((area != null && area >= 45) || /2|3|4/.test(layout)) return 'high';
  if ((area != null && area >= 28) || Boolean(locationAnalysis.transit.nearest_station)) return 'medium';
  return 'low';
}

function buildInvestmentAnalysis(parsedInvestment = {}, property = {}, locationAnalysis = {}, marketContext = {}) {
  const priceJpy = isLikelyJpyContext(property)
    ? extractNumericValue(property, ['price_jpy', 'price'])
    : normalizeNullableNumber(parsedInvestment.price_jpy);
  const monthlyRentJpy = extractNumericValue(property, ['monthly_rent_jpy', 'monthly_rent', 'rent_jpy', 'rent']);
  const managementFeeJpy = extractNumericValue(property, ['management_fee_jpy', 'management_fee']);
  const repairReserveJpy = extractNumericValue(property, ['repair_reserve_jpy', 'repair_reserve', 'repair_reserve_fee']);
  const grossYieldPct = priceJpy != null && monthlyRentJpy != null && priceJpy > 0
    ? Number((((monthlyRentJpy * 12) / priceJpy) * 100).toFixed(2))
    : null;
  const investmentPros = normalizeArray(parsedInvestment.investment_pros);
  const investmentRisks = normalizeArray(parsedInvestment.investment_risks);
  const calculationNotes = normalizeArray(parsedInvestment.calculation_notes);

  if (!investmentPros.length) {
    if (locationAnalysis.transit.nearest_station) {
      investmentPros.push(`已知最近站為 ${locationAnalysis.transit.nearest_station}，可作為出租敘事的基本支點。`);
    }
    if (priceJpy != null) {
      investmentPros.push('已有總價資訊，可先做同區價格帶比較與持有假設。');
    }
  }

  if (!investmentRisks.length) {
    if (monthlyRentJpy == null) investmentRisks.push('無法驗證投報率');
    if (monthlyRentJpy == null) investmentRisks.push('未提供租金資料，不能推估投報率或現金流穩定性。');
    if (locationAnalysis.uncertain_fields.length) investmentRisks.push('部分生活圈資料標示 uncertain，對外溝通需避免寫成既定事實。');
    investmentRisks.push('實際交易成本、修繕支出與空室期間仍需逐項確認。');
  }
  if (monthlyRentJpy == null && !investmentRisks.includes('無法驗證投報率')) {
    investmentRisks.unshift('無法驗證投報率');
  }

  if (!calculationNotes.length) {
    if (grossYieldPct == null) {
      calculationNotes.push(monthlyRentJpy == null
        ? '因缺少月租資料，本輪不計算 gross_yield_pct。'
        : '因價格資料不足，本輪不計算 gross_yield_pct。');
    } else {
      calculationNotes.push('gross_yield_pct 以月租 x 12 / price_jpy 粗估，未扣除稅費、管理與空室成本。');
    }
    if (!isLikelyJpyContext(property)) {
      calculationNotes.push('價格欄位未能確認為 JPY，price_jpy 需再核對。');
    }
  }

  return {
    price_jpy: priceJpy,
    monthly_rent_jpy: monthlyRentJpy,
    gross_yield_pct: grossYieldPct,
    management_fee_jpy: managementFeeJpy,
    repair_reserve_jpy: repairReserveJpy,
    investment_pros: investmentPros,
    investment_risks: investmentRisks,
    owner_occupier_fit: normalizeConfidence(parsedInvestment.owner_occupier_fit, deriveOwnerOccupierFit(property, locationAnalysis, marketContext)),
    calculation_notes: calculationNotes
  };
}

function buildLayoutSummary(layout) {
  const normalized = normalizeText(layout).toLowerCase();
  if (!normalized) return '格局資料未提供，無法建立明確使用情境敘事。';
  if (normalized.includes('1r') || normalized.includes('1k') || normalized.includes('1dk')) {
    return '格局偏向單身租客與都心投資小宅的典型使用情境，出租敘事較直接。';
  }
  if (normalized.includes('1ldk')) {
    return '具備單人自住與高機能出租兩種敘事空間，容易切入首購或都心小宅需求。';
  }
  if (normalized.includes('2') || normalized.includes('3')) {
    return '格局已具備分區居住敘事，可同時面向自住與長期持有買方。';
  }
  return '格局可作為使用效率與居住彈性的基礎敘事，但仍需平面圖補強。';
}

function buildAreaSummary(area) {
  if (area == null) return '面積資料未提供，無法判斷坪效定位。';
  if (area < 25) return '面積落在日本都心小宅帶，銷售重點應放在總價控制與出租坪效。';
  if (area < 40) return '面積位於投資型住宅常見區間，可兼顧出租敘事與基礎自住彈性。';
  if (area < 60) return '在都心住宅中屬於較有實用性的面積帶，可同時支撐自住與長持有敘事。';
  return '面積規模相對完整，可作為自住與資產保全並行的訴求基礎。';
}

function extractRenovationHistory(property = {}) {
  const text = buildPropertyTextBlob(property);
  if (!text) return [];

  const history = [];
  if (hasKeyword(text, ['リフォーム', '翻新', '翻修', '整修', 'renov', '改装'])) {
    history.push('資料提及曾有整修或翻新相關描述，細項與時間點需再核對。');
  }
  if (hasKeyword(text, ['浴室', '廚房', 'kitchen', 'bathroom', 'キッチン', 'バス'])) {
    history.push('若整修重點涉及水回り，建議補充設備更新年份與範圍。');
  }
  return history;
}

function buildPropertyStrengths(parsedStrengths = {}, property = {}, investmentAnalysis = {}) {
  const text = buildPropertyTextBlob(property);
  const area = normalizeNullableNumber(property.area_sqm);
  const buildingAge = normalizeNullableNumber(property.building_age);
  const renovationHistory = normalizeArray(parsedStrengths.renovation_history);

  return {
    layout: {
      value: normalizeText(property.layout) || null,
      summary: normalizeText(normalizeObject(parsedStrengths.layout).summary, buildLayoutSummary(property.layout))
    },
    area_sqm: {
      value: area,
      summary: normalizeText(normalizeObject(parsedStrengths.area_sqm).summary, buildAreaSummary(area))
    },
    light_and_ventilation: {
      summary: normalizeText(
        normalizeObject(parsedStrengths.light_and_ventilation).summary,
        hasKeyword(text, ['採光', '通風', '南向', '日当たり', '角部屋', '2面採光'])
          ? '資料有提及採光或通風相關訊號，可作為帶看時優先驗證的銷售點。'
          : '採光與通風資料未提供，現階段不宜先行承諾。'
      )
    },
    condition: {
      summary: normalizeText(
        normalizeObject(parsedStrengths.condition).summary,
        buildingAge == null
          ? '屋況資訊不足，需以現況、室內照片與重要事項說明書補強。'
          : buildingAge <= 10
            ? '屋齡相對新，銷售時可從維護成本與出租接受度切入，但仍須以現況確認。'
            : buildingAge <= 25
              ? '屋齡落在可接受區間，重點在室內維持與共用部狀態是否足以支撐成交。'
              : '屋齡偏高，屋況與未來修繕負擔必須放在前段說明。'
      )
    },
    renovation_history: renovationHistory.length ? renovationHistory : extractRenovationHistory(property),
    building_management: {
      summary: normalizeText(
        normalizeObject(parsedStrengths.building_management).summary,
        investmentAnalysis.management_fee_jpy != null
          ? `已有管理費資料，可把管理體制與持有成本透明度放進說明，但管理品質仍須另行核對。`
          : '管理體制與管理成本資訊不足，需補管理費與修繕資料後再做完整判斷。'
      )
    }
  };
}

function buildBuyerPersonas(property = {}, fitTypes = [], locationAnalysis = {}, marketContext = {}) {
  const areaLabel = buildAreaLabel(property) || (marketContext.country === 'tw' ? '台灣核心生活圈' : '日本核心生活圈');
  const stationLabel = locationAnalysis.transit.nearest_station
    ? `${locationAnalysis.transit.nearest_station}步行圈`
    : '生活圈資訊待補';
  const twPersona = `重視通勤、學區或產業園區可達性的自住型買方`;
  const jpPersona = `尋找 ${areaLabel}、以 ${stationLabel} 支撐出租敘事的投資型買方`;

  return {
    investment_buyer: fitTypes.includes('investment')
      ? [marketContext.country === 'tw' ? `尋找 ${areaLabel}、重視通勤與就業節點敘事的投資型買方` : jpPersona]
      : [],
    owner_occupier: fitTypes.includes('owner_occupier')
      ? [marketContext.country === 'tw' ? twPersona : `重視 ${stationLabel} 通勤可理解性、接受日本住宅坪效邏輯的自住型買方`]
      : [],
    first_time_overseas_buyer: [
      `第一次配置日本住宅資產，想從總價與生活圈資訊相對可解釋標的切入的買方`
    ],
    long_term_allocator: fitTypes.includes('asset_allocation')
      ? [`希望把 ${areaLabel} 住宅納入日圓資產分散配置、偏向長期持有的買方`]
      : [`重視長期持有穩健敘事、但不接受過度包裝收益承諾的買方`]
  };
}

function buildMarketingAngles(locationAnalysis = {}, investmentAnalysis = {}, propertyStrengths = {}, marketContext = {}) {
  const angles = {
    fb_long_form: [
      '交通節點如何支撐出租與持有敘事',
      '總價與持有成本透明度',
      '生活圈機能是否足以降低空室風險溝通阻力'
    ],
    ig_short_highlights: [
      '最近站步行圈',
      '200m 高頻生活機能',
      '總價與面積帶定位'
    ],
    line_dm: [
      '先講站點與步行分鐘',
      '再講總價與持有成本',
      '最後補風險與下一步資料索取'
    ],
    visual_one_pager: [
      '站點 / 200m / 500m 三層生活圈',
      '總價 / 管理費 / 租金 / 投報率欄位分離呈現',
      '屋況與管理資訊需核對項目'
    ]
  };

  if (!locationAnalysis.poi_200m_highlights.length) {
    angles.visual_one_pager.push('生活圈資料不足時以 uncertain 標記替代強敘事');
  }
  if (investmentAnalysis.gross_yield_pct == null) {
    angles.fb_long_form.push('未提供租金時明確說明不計算投報率');
  }
  if (normalizeText(propertyStrengths.layout.summary)) {
    angles.ig_short_highlights.push('格局與坪效定位');
  }
  if (marketContext.country === 'tw') {
    angles.fb_long_form.unshift('通勤、學區與產業節點如何影響自住與出租判斷');
    angles.ig_short_highlights.unshift('通勤與生活圈理解成本');
  }
  if (marketContext.country === 'jp') {
    angles.fb_long_form.unshift('最近站、管理費與持有敘事');
    angles.line_dm.unshift('先講站點與管理費透明度');
  }

  return angles;
}

function normalizeAnalysisShape(parsed, { property = {}, locationEnrichment = null, marketContext = {} } = {}) {
  const input = normalizeObject(parsed, {});
  const location = normalizeLocationEnrichment(locationEnrichment, property);
  const normalizedMarketContext = normalizeMarketContext(marketContext, property);
  const parsedPositioning = normalizeObject(input.property_positioning, {});
  const parsedInvestment = normalizeObject(input.investment_analysis, {});
  const parsedStrengths = normalizeObject(input.property_strengths, {});
  const locationAnalysis = buildLocationAnalysisFromEnrichment(location);
  const investmentAnalysis = buildInvestmentAnalysis(parsedInvestment, property, locationAnalysis, normalizedMarketContext);
  const fitTypes = inferFitTypes(property, investmentAnalysis, locationAnalysis, parsedPositioning.fit_types, normalizedMarketContext);
  const propertyStrengths = buildPropertyStrengths(parsedStrengths, property, investmentAnalysis);
  const buyerPersonas = {
    investment_buyer: normalizeArray(normalizeObject(input.buyer_personas, {}).investment_buyer),
    owner_occupier: normalizeArray(normalizeObject(input.buyer_personas, {}).owner_occupier),
    first_time_overseas_buyer: normalizeArray(normalizeObject(input.buyer_personas, {}).first_time_overseas_buyer),
    long_term_allocator: normalizeArray(normalizeObject(input.buyer_personas, {}).long_term_allocator)
  };
  const fallbackBuyerPersonas = buildBuyerPersonas(property, fitTypes, locationAnalysis, normalizedMarketContext);
  const fallbackMarketingAngles = buildMarketingAngles(locationAnalysis, investmentAnalysis, propertyStrengths, normalizedMarketContext);

  return {
    property_positioning: {
      one_liner: normalizeText(
        parsedPositioning.one_liner,
        buildOneLiner(property, fitTypes, locationAnalysis, normalizedMarketContext)
      ),
      fit_types: fitTypes,
      positioning_confidence: normalizeConfidence(
        parsedPositioning.positioning_confidence,
        inferPositioningConfidence(property, locationAnalysis, investmentAnalysis)
      )
    },
    location_analysis: locationAnalysis,
    investment_analysis: investmentAnalysis,
    property_strengths: propertyStrengths,
    buyer_personas: {
      investment_buyer: buyerPersonas.investment_buyer.length ? buyerPersonas.investment_buyer : fallbackBuyerPersonas.investment_buyer,
      owner_occupier: buyerPersonas.owner_occupier.length ? buyerPersonas.owner_occupier : fallbackBuyerPersonas.owner_occupier,
      first_time_overseas_buyer: buyerPersonas.first_time_overseas_buyer.length ? buyerPersonas.first_time_overseas_buyer : fallbackBuyerPersonas.first_time_overseas_buyer,
      long_term_allocator: buyerPersonas.long_term_allocator.length ? buyerPersonas.long_term_allocator : fallbackBuyerPersonas.long_term_allocator
    },
    marketing_angles: {
      fb_long_form: normalizeArray(normalizeObject(input.marketing_angles, {}).fb_long_form).length
        ? normalizeArray(normalizeObject(input.marketing_angles, {}).fb_long_form)
        : fallbackMarketingAngles.fb_long_form,
      ig_short_highlights: normalizeArray(normalizeObject(input.marketing_angles, {}).ig_short_highlights).length
        ? normalizeArray(normalizeObject(input.marketing_angles, {}).ig_short_highlights)
        : fallbackMarketingAngles.ig_short_highlights,
      line_dm: normalizeArray(normalizeObject(input.marketing_angles, {}).line_dm).length
        ? normalizeArray(normalizeObject(input.marketing_angles, {}).line_dm)
        : fallbackMarketingAngles.line_dm,
      visual_one_pager: normalizeArray(normalizeObject(input.marketing_angles, {}).visual_one_pager).length
        ? normalizeArray(normalizeObject(input.marketing_angles, {}).visual_one_pager)
        : fallbackMarketingAngles.visual_one_pager
    },
    compliance_notes: {
      must_include: mergeUniqueStrings(
        DEFAULT_MUST_INCLUDE,
        normalizeObject(input.compliance_notes, {}).must_include
      ),
      ocr_uncertain_fields: normalizeArray(normalizeObject(input.compliance_notes, {}).ocr_uncertain_fields),
      forbidden_claims: mergeUniqueStrings(
        DEFAULT_FORBIDDEN_CLAIMS,
        normalizeObject(input.compliance_notes, {}).forbidden_claims
      )
    },
    meta: {
      analysis_version: 'v2_enriched',
      has_location_enrichment: Boolean(location._meta?.has_location_enrichment),
      market_context_applied: true
    }
  };
}

function ensureLocationUncertainty(result) {
  const next = structuredClone(result);
  if (next.location_analysis.data_source === 'fallback_minimal') {
    next.location_analysis.uncertain_fields = mergeUniqueStrings(
      next.meta?.has_location_enrichment === false && next.location_analysis.uncertain_fields.includes('geocode')
        ? ['geocode', 'poi_200m', 'poi_500m', 'transit']
        : ['poi_200m', 'poi_500m', 'transit'],
      next.location_analysis.uncertain_fields
    );
    next.location_analysis.transit.uncertain = true;
    return next;
  }
  const uncertainFields = new Set(normalizeArray(next.location_analysis.uncertain_fields));

  if (!next.location_analysis.transit.nearest_station) uncertainFields.add('transit.nearest_station');
  if (next.location_analysis.transit.walk_minutes == null) uncertainFields.add('transit.walk_minutes');
  if (!next.location_analysis.poi_200m_highlights.length) uncertainFields.add('poi_200m_highlights');
  if (!next.location_analysis.poi_500m_highlights.length) uncertainFields.add('poi_500m_highlights');
  if (!normalizeText(next.location_analysis.lifestyle_summary)) uncertainFields.add('lifestyle_summary');

  next.location_analysis.uncertain_fields = Array.from(uncertainFields);
  next.location_analysis.transit.uncertain = next.location_analysis.transit.uncertain ||
    uncertainFields.has('transit.nearest_station') ||
    uncertainFields.has('transit.walk_minutes');

  if (!FIT_TYPE_VALUES.includes(next.property_positioning.fit_types?.[0])) {
    next.property_positioning.fit_types = normalizeFitTypes(next.property_positioning.fit_types);
    if (!next.property_positioning.fit_types.length) next.property_positioning.fit_types = ['investment'];
  }

  return next;
}

function fallbackAssistantAnalysis(property, locationEnrichmentInput = null, marketContext = {}) {
  const fallback = ensureLocationUncertainty(normalizeAnalysisShape(
    {},
    { property, locationEnrichment: locationEnrichmentInput, marketContext }
  ));

  return {
    result: fallback,
    complianceFlags: fallback.location_analysis.uncertain_fields.length
      ? normalizeComplianceFlags([
        {
          code: 'location_data_uncertain',
          severity: 'info',
          message: 'Location analysis contains uncertain fields and should be used conservatively.'
        }
      ])
      : [],
    riskScore: fallback.location_analysis.uncertain_fields.length ? 45 : 25,
    tokensUsed: 0,
    usage: fallbackUsage()
  };
}

function normalizeLegacyStrengths(value) {
  const source = normalizeObject(value, {});
  return [
    ...normalizeArray(source.core_selling_points),
    ...normalizeArray(source.location_advantages),
    ...normalizeArray(source.investment_highlights)
  ].filter(Boolean);
}

function normalizeLegacyCautions(value) {
  const source = normalizeObject(value, {});
  return normalizeArray(source.cautions);
}

function normalizeLegacyLocationHighlights(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === 'string') return item.trim() || null;
      if (!item || typeof item !== 'object') return null;
      return normalizeText(item.name || item.category) || null;
    })
    .filter(Boolean);
}

function normalizeStoredPoiHighlights(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const name = normalizeText(item.name);
      const category = normalizeText(item.category);
      const distance = normalizeNullableNumber(item.distance_m);
      if (!name || distance == null) return null;
      return { name, category: category || 'notable_poi', distance_m: Math.round(distance) };
    })
    .filter(Boolean);
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

function normalizeCopyAnalysis(analysis = {}, { property = {} } = {}) {
  const source = normalizeObject(analysis, {});
  const dataSource = normalizeText(source.location_analysis?.data_source);
  const hasExactShape = dataSource === 'location_enrichment_json' || dataSource === 'fallback_minimal';

  const normalized = hasExactShape
    ? ensureLocationUncertainty({
      property_positioning: {
        one_liner: normalizeText(source.property_positioning?.one_liner, '待補充物件定位'),
        fit_types: normalizeFitTypes(source.property_positioning?.fit_types),
        positioning_confidence: normalizeConfidence(source.property_positioning?.positioning_confidence, 'medium')
      },
      location_analysis: {
        transit: {
          nearest_station: normalizeText(source.location_analysis?.transit?.nearest_station) || null,
          walk_minutes: normalizeNullableNumber(source.location_analysis?.transit?.walk_minutes),
          lines: normalizeTransitLines(source.location_analysis?.transit?.lines),
          uncertain: Boolean(source.location_analysis?.transit?.uncertain)
        },
        poi_200m_highlights: normalizeStoredPoiHighlights(source.location_analysis?.poi_200m_highlights),
        poi_500m_highlights: normalizeStoredPoiHighlights(source.location_analysis?.poi_500m_highlights),
        lifestyle_summary: normalizeText(source.location_analysis?.lifestyle_summary),
        uncertain_fields: normalizeArray(source.location_analysis?.uncertain_fields),
        data_source: 'location_enrichment_json'
      },
      investment_analysis: {
        price_jpy: normalizeNullableNumber(source.investment_analysis?.price_jpy),
        monthly_rent_jpy: normalizeNullableNumber(source.investment_analysis?.monthly_rent_jpy),
        gross_yield_pct: normalizeNullableNumber(source.investment_analysis?.gross_yield_pct),
        management_fee_jpy: normalizeNullableNumber(source.investment_analysis?.management_fee_jpy),
        repair_reserve_jpy: normalizeNullableNumber(source.investment_analysis?.repair_reserve_jpy),
        investment_pros: normalizeArray(source.investment_analysis?.investment_pros),
        investment_risks: normalizeArray(source.investment_analysis?.investment_risks),
        owner_occupier_fit: normalizeConfidence(source.investment_analysis?.owner_occupier_fit, 'medium'),
        calculation_notes: normalizeArray(source.investment_analysis?.calculation_notes)
      },
      property_strengths: {
        layout: {
          value: normalizeText(source.property_strengths?.layout?.value) || null,
          summary: normalizeText(source.property_strengths?.layout?.summary)
        },
        area_sqm: {
          value: normalizeNullableNumber(source.property_strengths?.area_sqm?.value),
          summary: normalizeText(source.property_strengths?.area_sqm?.summary)
        },
        light_and_ventilation: {
          summary: normalizeText(source.property_strengths?.light_and_ventilation?.summary)
        },
        condition: {
          summary: normalizeText(source.property_strengths?.condition?.summary)
        },
        renovation_history: normalizeArray(source.property_strengths?.renovation_history),
        building_management: {
          summary: normalizeText(source.property_strengths?.building_management?.summary)
        }
      },
      buyer_personas: {
        investment_buyer: normalizeArray(source.buyer_personas?.investment_buyer),
        owner_occupier: normalizeArray(source.buyer_personas?.owner_occupier),
        first_time_overseas_buyer: normalizeArray(source.buyer_personas?.first_time_overseas_buyer),
        long_term_allocator: normalizeArray(source.buyer_personas?.long_term_allocator)
      },
      marketing_angles: {
        fb_long_form: normalizeArray(source.marketing_angles?.fb_long_form),
        ig_short_highlights: normalizeArray(source.marketing_angles?.ig_short_highlights),
        line_dm: normalizeArray(source.marketing_angles?.line_dm),
        visual_one_pager: normalizeArray(source.marketing_angles?.visual_one_pager)
      },
      compliance_notes: {
        must_include: mergeUniqueStrings(DEFAULT_MUST_INCLUDE, source.compliance_notes?.must_include),
        ocr_uncertain_fields: normalizeArray(source.compliance_notes?.ocr_uncertain_fields),
        forbidden_claims: mergeUniqueStrings(DEFAULT_FORBIDDEN_CLAIMS, source.compliance_notes?.forbidden_claims)
      },
      meta: {
        analysis_version: normalizeText(source.meta?.analysis_version, 'v2_enriched'),
        has_location_enrichment: Boolean(source.meta?.has_location_enrichment),
        market_context_applied: source.meta?.market_context_applied !== false
      }
    })
    : ensureLocationUncertainty(normalizeAnalysisShape(analysis, { property }));
  const legacyStrengths = normalizeLegacyStrengths(analysis.property_strengths);
  const legacyCautions = normalizeLegacyCautions(analysis.property_strengths);
  const locationNames = [
    ...normalizeLegacyLocationHighlights(analysis.location_analysis?.poi_200m_highlights),
    ...normalizeLegacyLocationHighlights(analysis.location_analysis?.poi_500m_highlights)
  ];

  return {
    ...normalized,
    legacy_summary: {
      strengths: legacyStrengths,
      cautions: legacyCautions,
      location_names: locationNames
    }
  };
}

function buildCopyDataSources(analysis = {}, promptContext = {}) {
  const normalizedPromptContext = normalizeObject(promptContext, {});

  return {
    property: true,
    analysis: Boolean(analysis && typeof analysis === 'object'),
    property_positioning: Boolean(analysis?.property_positioning),
    location_analysis: Boolean(analysis?.location_analysis),
    property_strengths: Boolean(analysis?.property_strengths),
    investment_analysis: Boolean(analysis?.investment_analysis),
    compliance_notes: Boolean(analysis?.compliance_notes),
    prompt_context: Object.keys(normalizedPromptContext).length > 0
  };
}

function buildCopyGenerationMeta(analysis = {}, promptContext = {}, usage = {}) {
  const provider = usage?.provider ?? null;
  const model = usage?.model ?? null;

  return {
    provider,
    model,
    is_fallback: provider === 'fallback' || model === 'local-fallback',
    analysis_version: normalizeText(analysis?.meta?.analysis_version) || null,
    data_sources: buildCopyDataSources(analysis, promptContext)
  };
}

function buildFbCopy(analysis, promptContext = {}) {
  const positioning = analysis.property_positioning;
  const location = analysis.location_analysis;
  const strengths = analysis.property_strengths;
  const investment = analysis.investment_analysis;
  const legacy = analysis.legacy_summary || { strengths: [], cautions: [] };
  const complianceLine = analysis.compliance_notes.must_include.find(
    (item) => item === '周邊設施與距離以最新地圖資料為準'
  ) || '周邊設施與距離以最新地圖資料為準';
  const cta = normalizeText(promptContext.cta, '想看完整資料、比較表或安排帶看，歡迎直接私訊。');
  const openingParagraph = positioning.one_liner || '待補充物件定位';
  const transitText = location.transit.nearest_station
    ? `交通上可先聚焦 ${location.transit.nearest_station}${location.transit.walk_minutes != null ? `，步行約 ${location.transit.walk_minutes} 分鐘` : ''}。`
    : '交通描述目前僅能保守處理，最近站與步行時間仍待補充。';
  const lifestyleText = location.poi_200m_highlights.length
    ? `近距離生活機能可引用 ${location.poi_200m_highlights.slice(0, 3).map((item) => `${item.name}（${item.category}）`).join('、')}。`
    : location.poi_500m_highlights.length
      ? `生活圈可先補充 ${location.poi_500m_highlights.slice(0, 3).map((item) => `${item.name}（${item.category}）`).join('、')}。`
      : '生活機能資料仍待補強，現階段不宜延伸商圈描述。';
  const locationParagraph = [
    transitText,
    lifestyleText,
    normalizeText(location.lifestyle_summary)
  ].filter(Boolean).join('');
  const strengthsText = [
    strengths.layout.summary,
    strengths.area_sqm.summary,
    strengths.light_and_ventilation.summary,
    strengths.condition.summary,
    strengths.building_management.summary
  ].filter(Boolean).length
    ? `物件本身可優先引用的條件包括：${[
      strengths.layout.summary,
      strengths.area_sqm.summary,
      strengths.light_and_ventilation.summary,
      strengths.condition.summary,
      strengths.building_management.summary
    ].filter(Boolean).slice(0, 3).join(' ')}`
    : legacy.strengths.length
      ? `物件本身可主打 ${legacy.strengths.slice(0, 3).join('、')}。`
      : '物件強項仍需回到 analysis.result_json 逐一確認。';
  const strengthsParagraph = strengthsText;
  const investmentParagraph = [
    investment.price_jpy != null ? `投資判斷上可先以總價 ${investment.price_jpy} 做比較。` : '投資判斷上，總價資料仍待補充。',
    investment.management_fee_jpy != null ? `已知管理費約 ${investment.management_fee_jpy}，可納入持有成本評估。` : '管理費與持有成本仍需再確認。',
    investment.gross_yield_pct != null
      ? `依現有資料粗估 gross yield 約 ${investment.gross_yield_pct}%，但仍需扣回稅費、空室與修繕成本再判讀。`
      : '若租金資料不足，現階段不應直接推估投報率。',
    investment.investment_pros[0] || '投資亮點應以現有分析欄位保守引用。',
    `風險提醒：${investment.investment_risks[0] || '未完整掌握租金、費用與屋況前，不宜承諾投報。'}`,
    location.uncertain_fields.length
      ? `目前仍需保守標示 uncertain 的欄位包含：${location.uncertain_fields.join('、')}。`
      : ''
  ].filter(Boolean).join('');
  const ctaParagraph = [complianceLine, cta].filter(Boolean).join('\n');

  return [
    openingParagraph,
    locationParagraph,
    strengthsParagraph,
    investmentParagraph,
    ctaParagraph
  ].filter(Boolean).join('\n\n');
}

function buildIgCopy(analysis) {
  const positioning = analysis.property_positioning;
  const location = analysis.location_analysis;
  const strengths = analysis.property_strengths;
  const investment = analysis.investment_analysis;
  const legacy = analysis.legacy_summary || { strengths: [] };
  const complianceLine = analysis.compliance_notes.must_include.find(
    (item) => item === '周邊設施與距離以最新地圖資料為準'
  ) || '周邊設施與距離以最新地圖資料為準';
  const bullets = [
    location.transit.nearest_station
      ? `交通重點：${location.transit.nearest_station}${location.transit.walk_minutes != null ? `，步行約 ${location.transit.walk_minutes} 分鐘` : ''}`
      : '交通重點：資料待確認，先保守溝通',
    location.poi_200m_highlights[0]
      ? `近距離機能：${location.poi_200m_highlights[0].name}`
      : '近距離機能：資料待補強',
    location.poi_500m_highlights[0]
      ? `中距離亮點：${location.poi_500m_highlights[0].name}`
      : '中距離亮點：資料待補強',
    strengths.layout.summary
      ? `格局定位：${strengths.layout.summary}`
      : legacy.strengths[0]
        ? `物件賣點：${legacy.strengths[0]}`
      : '物件賣點：請回到分析欄位確認',
    investment.price_jpy != null
      ? `總價比較：${investment.price_jpy}`
      : '總價比較：資料待確認',
    investment.investment_risks[0]
      ? `風險提醒：${investment.investment_risks[0]}`
      : '風險提醒：避免保證式說法'
  ];

  return [
    positioning.one_liner || '保守型物件觀察',
    ...bullets.map((item) => `• ${item}`),
    complianceLine,
    '#星澄地所 #房地產分析 #生活機能 #交通便利 #投資評估'
  ].join('\n');
}

function buildLineCopy(analysis, promptContext = {}) {
  const location = analysis.location_analysis;
  const strengths = analysis.property_strengths;
  const investment = analysis.investment_analysis;
  const legacy = analysis.legacy_summary || { strengths: [] };
  const complianceLine = analysis.compliance_notes.must_include.find(
    (item) => item === '周邊設施與距離以最新地圖資料為準'
  ) || '周邊設施與距離以最新地圖資料為準';
  const cta = normalizeText(promptContext.cta, '想看完整分析或比較表，直接回我，我幫你整理。');

  return [
    location.transit.nearest_station
      ? `這間可先看 ${location.transit.nearest_station}${location.transit.walk_minutes != null ? `，步行約 ${location.transit.walk_minutes} 分鐘` : ''} 的交通條件。`
      : '這間的交通資料還在補充中，先用保守角度看待。',
    location.poi_200m_highlights[0]
      ? `近距離機能可先抓 ${location.poi_200m_highlights[0].name}。`
      : '近距離生活機能資料待確認。',
    strengths.area_sqm.summary
      ? `坪效定位可先講：${strengths.area_sqm.summary}`
      : legacy.strengths[0]
        ? `物件主打點是 ${legacy.strengths[0]}。`
      : '物件主打點請以分析欄位為準。',
    investment.price_jpy != null
      ? `目前可先用總價 ${investment.price_jpy} 做比較。`
      : '總價資料待確認，先不延伸價格判斷。',
    investment.investment_risks[0]
      ? `另外要提醒：${investment.investment_risks[0]}`
      : '另外要提醒：不要直接對外承諾收益。',
    `${complianceLine}。`,
    cta
  ].filter((item) => typeof item === 'string' && item.trim()).join('\n');
}

function fallbackAssistantCopy(property, analysis, channel, promptContext = {}) {
  const normalized = normalizeCopyAnalysis(analysis, { property });
  const usage = fallbackUsage();
  const base = {
    fb: buildFbCopy(normalized, promptContext),
    ig: buildIgCopy(normalized),
    line: buildLineCopy(normalized, promptContext)
  };

  return {
    result: {
      text: base[channel] || base.fb,
      compliance_flags: normalizeComplianceFlags([
        {
          code: 'analysis_based_copy',
          severity: 'info',
          message: 'Copy is generated only from analysis.result_json.'
        }
      ]),
      risk_score: normalized.location_analysis.uncertain_fields.length ? 35 : 20
    },
    tokensUsed: 0,
    usage,
    meta: buildCopyGenerationMeta(normalized, promptContext, usage)
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

export async function analyzePropertyForAssistant({
  property,
  locationEnrichment,
  marketContext,
  analysisMode = 'standard_analysis'
} = {}) {
  const resolvedLocationEnrichment = await resolveLocationEnrichment(property, locationEnrichment);
  const normalizedLocation = normalizeLocationEnrichment(resolvedLocationEnrichment, property);
  const normalizedMarketContext = normalizeMarketContext(marketContext, property);

  if (!OPENAI_API_KEY) {
    return fallbackAssistantAnalysis(property, resolvedLocationEnrichment, normalizedMarketContext);
  }

  const systemPrompt = [
    '你是一個日本不動產投資分析與銷售策略助理，不是客服，不是翻譯。',
    '你的任務是把 property 與 location_enrichment_json 轉成可重用、可用於銷售、可用於生成行銷圖與文案的 structured JSON。',
    '嚴禁幻想資料：不得創造不存在的車站、商店、地標；所有 location 資訊只能來自 location_enrichment_json；若資料不存在必須標記 uncertain。',
    '分析導向不是描述，而是銷售與投資判斷；避免空泛形容詞；不要輸出對客文案。',
    '必須輸出完整 JSON，不可缺 key；若無資料請使用 null、空陣列或 uncertain。',
    'location_analysis 只能根據 location_enrichment_json；不要輸出完整地址；不要發明 POI。',
    'investment_analysis 若沒有租金不得計算 gross_yield_pct，且必須誠實揭露風險。',
    'property_strengths 必須轉成可供房仲使用的銷售判斷語言，而不是單純重述欄位。',
    'buyer_personas 必須具體；marketing_angles 要是下一階段可直接轉成 FB 長文、IG bullet、LINE DM、一圖流的分析角度。',
    '完全禁止模型自由生成任何店名、車站名稱、商圈名稱；這些只能從 location_enrichment_json 挑選，否則必須 uncertain。',
    normalizedMarketContext.country === 'tw'
      ? '市場補強規則：若 country = tw，請優先從通勤、學區、科技園區可達性思考銷售與投資判斷；若資料不足，不得補寫地名。'
      : '市場補強規則：若 country = jp，請優先從車站步行圈、投資敘事、管理費與持有成本透明度思考判斷。',
    '輸出 keys 必須是：property_positioning, location_analysis, investment_analysis, property_strengths, buyer_personas, marketing_angles, compliance_notes, compliance_flags, risk_score。',
    'property_positioning keys：one_liner, fit_types, positioning_confidence。fit_types 只能用 investment, rental, owner_occupier, asset_allocation。',
    'location_analysis keys：transit, poi_200m_highlights, poi_500m_highlights, lifestyle_summary, uncertain_fields, data_source。',
    'poi_200m_highlights 與 poi_500m_highlights 的每個 item 必須是 {name, category, distance_m}。',
    'investment_analysis keys：price_jpy, monthly_rent_jpy, gross_yield_pct, management_fee_jpy, repair_reserve_jpy, investment_pros, investment_risks, owner_occupier_fit, calculation_notes。',
    'property_strengths keys：layout, area_sqm, light_and_ventilation, condition, renovation_history, building_management。',
    'layout keys：value, summary；area_sqm keys：value, summary；light_and_ventilation keys：summary；condition keys：summary；building_management keys：summary。',
    'buyer_personas keys：investment_buyer, owner_occupier, first_time_overseas_buyer, long_term_allocator。',
    'marketing_angles keys：fb_long_form, ig_short_highlights, line_dm, visual_one_pager。',
    'compliance_notes.must_include 必須包含：不得保證收益或增值、價格、租金、空室與交易條件以最新資料為準、周邊設施與距離以最新地圖資料為準。',
    'compliance_notes.forbidden_claims 必須包含：穩賺不賠、保證出租、保證增值。',
    '只輸出 JSON，不要有任何多餘文字。'
  ].join('\n');

  const userPrompt = `輸入資料：\n${JSON.stringify({
    analysis_mode: analysisMode,
    property,
    location_enrichment_json: normalizedLocation,
    market_context: normalizedMarketContext
  }, null, 2)}`;
  const { parsed, tokensUsed, usage } = await callOpenAI(systemPrompt, userPrompt);
  const normalizedResult = ensureLocationUncertainty(
    normalizeAnalysisShape(parsed, {
      property,
      locationEnrichment: resolvedLocationEnrichment,
      marketContext: normalizedMarketContext
    })
  );
  const complianceFlags = normalizeComplianceFlags(parsed.compliance_flags || parsed.compliance_flags_json);
  if (normalizedResult.location_analysis.uncertain_fields.length > 0) {
    complianceFlags.push({
      code: 'location_data_uncertain',
      severity: 'info',
      message: 'Location analysis includes uncertain fields and should be communicated conservatively.'
    });
  }

  return {
    result: normalizedResult,
    complianceFlags,
    riskScore: normalizeRiskScore(parsed.risk_score),
    tokensUsed,
    usage
  };
}

export async function generateAssistantCopy({ property, analysis = null, channel, promptContext = {} }) {
  const normalizedAnalysis = normalizeCopyAnalysis(analysis, { property });

  if (!OPENAI_API_KEY) {
    return fallbackAssistantCopy(property, analysis, channel, promptContext);
  }

  const channelLabel = {
    fb: 'Facebook',
    ig: 'Instagram',
    line: 'LINE'
  }[channel] || channel;

  const systemPrompt = [
    '你是日本不動產行銷文案助理。',
    `請為 ${channelLabel} 產生繁體中文物件文案，輸出 JSON。`,
    '你只能使用 analysis.result_json，不得使用 property.title、property.description，也不得依賴 property 其他描述欄位產生內容。',
    '文案必須引用 location_analysis、property_strengths、investment_analysis。',
    '若 analysis.location_analysis.uncertain_fields 非空，語氣必須保守，不能把 uncertain 資訊寫成既定事實。',
    'FB：必須固定五段。第一段是 property_positioning.one_liner；第二段是 location_analysis，且必須同時包含交通描述與生活機能；第三段是 property_strengths；第四段是 investment_analysis，且必須包含至少一段風險提醒；第五段是 CTA。',
    'FB 必須包含：至少一段交通描述、至少一段生活機能、至少一段風險提醒。',
    'FB 必須包含「周邊設施與距離以最新地圖資料為準」。',
    'IG：標題 + bullet + hashtag。',
    'LINE：短訊息 + CTA。',
    '每個 channel 都必須包含「周邊設施與距離以最新地圖資料為準」。',
    '文案需可讓業務後續人工編輯，避免誇大不實、保證收益或未查證的絕對說法。',
    'JSON keys 必須是：text, compliance_flags, risk_score。',
    'compliance_flags 是陣列；risk_score 是 0 到 100。'
  ].join('\n');

  const userPrompt = `輸入資料：\n${JSON.stringify({
    channel,
    analysis: normalizedAnalysis,
    prompt_context: promptContext
  }, null, 2)}`;
  const { parsed, tokensUsed, usage } = await callOpenAI(systemPrompt, userPrompt);
  const normalized = normalizeCopyShape(parsed);
  const extraFlags = normalizeComplianceFlags(parsed.compliance_flags || parsed.compliance_flags_json);
  if (normalizedAnalysis.location_analysis.uncertain_fields.length > 0) {
    extraFlags.push({
      code: 'uncertain_location_used',
      severity: 'info',
      message: 'Location claims were generated under uncertain location fields.'
    });
  }

  return {
    result: {
      ...normalized,
      compliance_flags: extraFlags
    },
    tokensUsed,
    usage,
    meta: buildCopyGenerationMeta(normalizedAnalysis, promptContext, usage)
  };
}
