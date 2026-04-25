# AI Location Enrichment V1

Status: staging proposal only  
Scope: design only, no runtime change, no migration apply in this round

## Goal

Add a backend-owned location enrichment layer for AI assistant analysis and copy generation.

This layer is **backend structured enrichment**, not GPT browsing.

- The backend resolves address, geocode, and nearby POI data through a map provider.
- GPT is only allowed to reference data already present in `location_enrichment_json`.
- If enrichment does not contain a fact, GPT must mark it as `uncertain` and must not invent it.

## Architecture

Proposed flow:

1. Load property snapshot from `public.properties`
2. Build enrichment input from address / station / lat-lng
3. Reuse cached enrichment if `address_hash + radius_signature + provider` matches
4. If no valid cache, backend calls geocode + nearby places provider
5. Backend normalizes provider output into canonical `location_enrichment_json`
6. `analyzePropertyForAssistant()` receives:
   - property snapshot
   - location enrichment
7. `property_ai_analyses.result_json.location_analysis` must be derived from enrichment
8. Copy generation must cite `location_analysis`, not free-write nearby facilities

## property_location_enrichments Schema Draft

Proposed table: `public.property_location_enrichments`

Suggested columns:

- `id uuid primary key default gen_random_uuid()`
- `organization_id uuid not null references public.organizations(id) on delete cascade`
- `demo_data_type text null check (demo_data_type in ('seed', 'sandbox'))`
- `property_id uuid not null references public.properties(id) on delete cascade`
- `status text not null default 'active' check (status in ('active', 'superseded', 'failed'))`
- `provider text not null`
- `geocode_provider text null`
- `place_provider text null`
- `address_used text null`
- `address_hash text not null`
- `radius_signature text not null`
- `query_radius_json jsonb not null default '[]'::jsonb`
- `latitude numeric(10,7) null`
- `longitude numeric(10,7) null`
- `confidence text null check (confidence in ('high', 'medium', 'low'))`
- `location_enrichment_json jsonb not null`
- `raw_result_summary_json jsonb not null default '{}'::jsonb`
- `query_timestamp timestamptz not null default now()`
- `is_cached boolean not null default false`
- `cached_from_id uuid null references public.property_location_enrichments(id) on delete set null`
- `generated_by uuid null references public.agents(id) on delete set null`
- `superseded_by uuid null references public.property_location_enrichments(id) on delete set null`
- `superseded_at timestamptz null`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Suggested indexes:

- `(organization_id, property_id, status)`
- `(organization_id, address_hash, provider, radius_signature)`
- `(property_id, created_at desc)`

Suggested unique active cache rule:

- one active row per `organization_id + property_id + address_hash + provider + radius_signature`

## location_enrichment_json Canonical Schema

```json
{
  "geocode": {
    "lat": 0,
    "lng": 0,
    "formatted_address": "",
    "confidence": "high"
  },
  "poi_200m": [
    {
      "name": "",
      "category": "",
      "distance_m": 120,
      "walking_minutes_estimate": 2,
      "source": "google_places",
      "rating": null,
      "uncertain": false
    }
  ],
  "poi_500m": [],
  "transit_summary": {
    "nearest_station": "",
    "walk_minutes": 0,
    "lines": [
      {
        "name": "",
        "uncertain": false
      }
    ]
  },
  "marketing_location_summary": "",
  "warnings": []
}
```

Normalization rules:

- `distance_m` is backend-computed, not free-form model text
- `walking_minutes_estimate` is backend-estimated from distance
- categories are normalized enum-like labels, not raw provider tags
- provider misses or ambiguous values must set `uncertain: true`

## Provider Design

Primary provider design for v1:

- Geocode: Google Maps Geocoding API
- Places: Google Places / Places Nearby Search

Design principles:

- The backend performs all provider calls
- GPT never calls provider APIs
- GPT never browses maps or searches the web for nearby facilities
- Provider results are normalized before entering analysis

Suggested provider output normalization:

- `provider = google_maps`
- `geocode_provider = google_geocoding`
- `place_provider = google_places`

## Enrichment Input

Backend enrichment input:

```json
{
  "property_id": "uuid",
  "address_ja": "京都府京都市下京区...",
  "address_zh": "京都府京都市下京區...",
  "nearest_station": "京都河原町",
  "latitude": null,
  "longitude": null,
  "country": "jp"
}
```

Priority:

1. use `latitude / longitude` if already stored
2. else geocode `address_ja`
3. else geocode `address_zh`
4. else fallback query using station + city-like address fragments

## 200m / 500m Query Categories

### 200m

- `convenience_store`
- `supermarket`
- `cafe`
- `restaurant`
- `pharmacy`
- `bank`
- `atm`
- `parking`
- `station`
- `transit_station`

### 500m

- `train_station`
- `metro_station`
- `major_landmark`
- `shopping_street`
- `mall`
- `park`
- `university`
- `school`
- `hospital`
- `tourist_spot`
- `notable_poi`

## Cache Rules

Reuse key proposal:

- `property_id`
- `address_hash`
- `provider`
- `radius_signature`

Definitions:

- `address_hash`: normalized selected address string hashed after trimming / lowercasing / punctuation normalization
- `radius_signature`: deterministic representation of current query ranges and category packs, for example:
  - `200:convenience_store|supermarket|cafe|restaurant|pharmacy|bank|atm|parking|station|transit_station;500:train_station|metro_station|major_landmark|shopping_street|mall|park|university|school|hospital|tourist_spot|notable_poi`

Reuse behavior:

- If same org scope and same cache key exists and active, reuse
- Reuse does not trigger provider call
- Reuse must be marked with:
  - `is_cached = true`
  - `cached_from_id`

## analyzePropertyForAssistant() New Input Contract

`analyzePropertyForAssistant()` should receive:

```json
{
  "property": {
    "...": "property snapshot"
  },
  "location_enrichment": {
    "...": "location_enrichment_json"
  },
  "analysis_mode": "standard_analysis | vision_enhanced_analysis"
}
```

Rules:

- GPT may summarize nearby facilities only from `location_enrichment`
- GPT may summarize transit only from `transit_summary`
- GPT must mark unknown transit lines / POI facts as `uncertain`
- GPT must not invent shopping districts, universities, landmarks, or hospitals

## property_ai_analyses.result_json New Schema

Proposed minimum structure:

```json
{
  "property_positioning": {
    "one_liner": "",
    "fit_types": [],
    "positioning_confidence": "medium"
  },
  "location_analysis": {
    "transit": {
      "nearest_station": "",
      "walk_minutes": 0,
      "lines": [],
      "uncertain": false
    },
    "poi_200m_highlights": [],
    "poi_500m_highlights": [],
    "lifestyle_summary": "",
    "uncertain_fields": [],
    "data_source": "property_location_enrichments"
  },
  "investment_analysis": {
    "price_jpy": null,
    "monthly_rent_jpy": null,
    "gross_yield_pct": null,
    "management_fee_jpy": null,
    "repair_reserve_jpy": null,
    "other_monthly_costs_jpy": null,
    "occupancy_status": null,
    "owner_occupier_fit": "medium",
    "investment_pros": [],
    "investment_risks": [],
    "calculation_notes": []
  },
  "property_strengths": {},
  "buyer_personas": {
    "investment_buyer": [],
    "owner_occupier": [],
    "first_time_overseas_buyer": [],
    "long_term_allocator": []
  },
  "marketing_angles": {
    "fb_long_form": [],
    "ig_short_highlights": [],
    "line_dm": [],
    "visual_one_pager": []
  },
  "compliance_notes": {
    "must_include": [],
    "ocr_uncertain_fields": [],
    "forbidden_claims": []
  }
}
```

## Copy Generation Reference Rules

Copy generation for FB / IG / LINE must explicitly use:

- `result_json.location_analysis.poi_200m_highlights`
- `result_json.location_analysis.poi_500m_highlights`
- `result_json.location_analysis.transit`

Required compliance line:

- `周邊設施與距離以最新地圖資料為準`

Additional rules:

- If `uncertain_fields` is non-empty, copy must avoid hard-claim language
- If transit line data is missing, copy can mention station proximity but must avoid inventing lines
- If no POI found, copy must not fabricate lifestyle convenience claims

## Quota Policy

Canonical policy:

- `standard_analysis = 1`
- `vision_enhanced_analysis = 2`
- `copy_generation = 1`
- `marketing_visual_generation = 3`
- `reuse = 0`
- `save_edit = 0`

Recommendation:

- `vision_enhanced_analysis = 2` includes location enrichment cost
- no separate user-facing charge for `location_enrichment`

Suggested `ai_usage_events.metadata_json`:

```json
{
  "charge_code": "vision_enhanced_analysis",
  "includes_location_enrichment": true,
  "location_enrichment_cached": false
}
```

## Audit Trail

Each enrichment row should preserve:

- `provider`
- `query_timestamp`
- `address_used`
- `latitude`
- `longitude`
- `confidence`
- `cached_from_id`
- `raw_result_summary_json`

Example `raw_result_summary_json`:

```json
{
  "geocode_hit": true,
  "poi_200m_count": 6,
  "poi_500m_count": 11,
  "top_categories": [
    "convenience_store",
    "restaurant",
    "shopping_street"
  ]
}
```

## Compliance Wording

Required wording:

- `周邊設施與距離以最新地圖資料為準`
- `不得保證收益、出租率、增值`

Model behavior rules:

- no guaranteed yield
- no guaranteed occupancy
- no guaranteed appreciation
- no fabricated nearby POI

## V1 Explicit Non-Goals

V1 does not include:

- GPT free browsing
- map screenshot generation
- multiple provider fallback
- automatic visual layout

This is intentional.

Location enrichment is a backend structured enrichment layer, not GPT browsing.

GPT may only cite data present in `location_enrichment_json`.
Any missing fact must be marked `uncertain`.
