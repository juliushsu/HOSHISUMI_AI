# AI Assistant Enriched Analysis Contract V1

Status: staging contract proposal only  
Scope: analysis + copy contract only, no runtime change in this round

## Canonical Principle

Location enrichment is **backend structured enrichment**, not GPT browsing.

- Backend resolves geocode + nearby POI via provider APIs
- Backend writes canonical `location_enrichment_json`
- `analyzePropertyForAssistant()` consumes that structured object
- GPT may only use facts already contained in `location_enrichment_json`
- Missing facts must be marked `uncertain`

## Canonical Enrichment Input

```json
{
  "property": {
    "id": "0bebfa68-37d4-4ff3-9e3b-d50a8bfc3cb8",
    "address_ja": "京都府京都市下京区寺町通仏光寺下る恵美須之町553",
    "address_zh": "京都府京都市下京區寺町通佛光寺下恵美須之町553",
    "nearest_station": "京都河原町",
    "latitude": null,
    "longitude": null,
    "country": "jp"
  },
  "location_enrichment": {
    "geocode": {
      "lat": 35.0041,
      "lng": 135.7681,
      "formatted_address": "京都府京都市下京区寺町通仏光寺下る恵美須之町553",
      "confidence": "high"
    },
    "poi_200m": [],
    "poi_500m": [],
    "transit_summary": {
      "nearest_station": "京都河原町",
      "walk_minutes": 5,
      "lines": []
    },
    "marketing_location_summary": "",
    "warnings": [
      "周邊設施與距離以最新地圖資料為準"
    ]
  },
  "analysis_mode": "vision_enhanced_analysis"
}
```

## location_enrichment_json Canonical Schema

```json
{
  "geocode": {
    "lat": 0,
    "lng": 0,
    "formatted_address": "",
    "confidence": "high|medium|low"
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

## Provider Design

V1 provider design:

- geocode: Google Maps Geocoding API
- nearby POI: Google Places

Provider contract requirements:

- provider facts are normalized by backend before analysis
- GPT must not call provider APIs
- GPT must not browse maps or search for POI

## Query Classification Packs

### 200m pack

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

### 500m pack

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

## Cache Contract

Cache key components:

- `property_id`
- `address_hash`
- `radius_signature`
- `provider`

Definitions:

- `address_hash`: normalized chosen address hash
- `radius_signature`: deterministic query pack signature

Reuse rules:

- same cache key may reuse existing enrichment
- reuse does not charge quota
- reused rows must expose:
  - `is_cached`
  - `cached_from_id`

## property_ai_analyses.result_json Contract

Required minimum keys:

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

## Analysis Output Rules

`location_analysis` must cite only enrichment facts.

Allowed:

- summarize `poi_200m`
- summarize `poi_500m`
- summarize `transit_summary`

Forbidden:

- inventing line names
- inventing POI not present in enrichment
- claiming nearby mall / university / hospital without provider result

If data is missing:

- populate `uncertain_fields`
- set uncertain line items
- tone down the narrative

## Copy Generation Contract

Copy generation must use:

- `result_json.property_positioning`
- `result_json.location_analysis`
- `result_json.investment_analysis`
- `result_json.property_strengths`
- `result_json.marketing_angles`
- `result_json.compliance_notes`

### Required location citation

FB / IG / LINE must reference:

- 200m lifestyle convenience
- 500m important POI or landmark
- nearest station / transit

### Required compliance line

All channels must include:

- `周邊設施與距離以最新地圖資料為準`

And must avoid:

- guaranteed yield
- guaranteed occupancy
- guaranteed appreciation

## Channel Output Guidance

### FB

- 500–800 Chinese characters
- can use paragraphs and bullets
- must cite transit + nearby lifestyle + compliance

### IG

- short title
- 5–7 bullets
- hashtags
- must cite transit + convenience + landmark angle

### LINE

- short message
- 3–5 selling points
- CTA
- must cite transit + convenience

## Quota Policy

Canonical policy:

- `standard_analysis = 1`
- `vision_enhanced_analysis = 2`
- `copy_generation = 1`
- `marketing_visual_generation = 3`
- `reuse = 0`
- `save_edit = 0`

Recommendation:

- location enrichment is included inside `vision_enhanced_analysis = 2`
- no separate end-user charge for location enrichment in v1

## Audit Trail Contract

Each enrichment execution should preserve:

- `provider`
- `query_timestamp`
- `address_used`
- `lat`
- `lng`
- `confidence`
- `cached_from_id`
- `raw_result_summary_json`

## property_location_enrichments Schema Draft

Suggested row shape:

```json
{
  "id": "uuid",
  "organization_id": "uuid",
  "property_id": "uuid",
  "status": "active",
  "provider": "google_maps",
  "geocode_provider": "google_geocoding",
  "place_provider": "google_places",
  "address_used": "京都府京都市下京区寺町通仏光寺下る恵美須之町553",
  "address_hash": "sha256:...",
  "radius_signature": "200:...;500:...",
  "latitude": 35.0041,
  "longitude": 135.7681,
  "confidence": "high",
  "location_enrichment_json": {},
  "raw_result_summary_json": {},
  "query_timestamp": "2026-04-24T12:00:00.000Z",
  "is_cached": false,
  "cached_from_id": null
}
```

## Compliance Wording

Required wording:

- `周邊設施與距離以最新地圖資料為準`
- `不得保證收益、出租率、增值`

## V1 Non-Goals

V1 does not do:

- GPT free external lookup
- map screenshots
- multiple provider fallback
- automatic visual layout

This is a strict contract.

Location enrichment is backend structured enrichment, not GPT browsing.
GPT may only reference `location_enrichment_json`; missing facts must be marked `uncertain`.
