# Property Ingest API v1

日本物件資料辨識匯入 V1 的 canonical contract。  
本流程在 Railway orchestrate，Supabase 承接 DB/Storage，僅允許 staging/development write。

## Canonical Flow

`upload file -> run OCR -> choose strategy -> translate/extract -> human review -> approve -> create canonical property`

## Governance

- canonical API: Railway
- DB + Storage: Supabase
- production 預設不可寫，route 會在進 DB 前直接 403
- demo org 不可用此 flow
- 所有 AI raw output 必須保留 `raw_json`
- approve 前後變更由 `property_review_decisions` append-only 保留
- staging V1 先做策略式 routing，不做 queue system

## Tables

- `property_ingest_jobs`
- `property_ingest_files`
- `property_ocr_results`
- `property_translation_results`
- `property_review_decisions`

## Job Status State Machine

- `uploaded`
- `ocr_processing`
- `ocr_done`
- `ocr_low_confidence`
- `translating`
- `vision_fallback_processing`
- `translated`
- `pending_review`
- `approved`
- `rejected`
- `failed`

## Processing Strategies

- `ocr_then_ai`
  - OCR 品質足夠，直接用 OCR text 做欄位翻譯/抽取
- `hybrid_assist`
  - OCR 有部分文字，但 coverage/confidence 不夠，改成 OCR text + image vision assist
- `vision_only_fallback`
  - OCR 幾乎無法用時，直接走 image vision fallback

## OCR Provider Interface

```js
ocrProvider.extractText({ buffer, mimeType, fileName }) => {
  status,
  provider,
  model,
  processingStrategy,
  rawText,
  blocks,
  confidence,
  keyFieldCoverage,
  recommendedNextStep,
  tokenUsage,
  estimatedCostUsd,
  rawJson,
  errorCode,
  errorMessage
}
```

## Translator Provider Interface

```js
translatorProvider.translatePropertyFields({ rawTextJa, blocks, processingStrategy }) => {
  status,
  provider,
  model,
  processingStrategy,
  translatedFields,
  keyFieldCoverage,
  confidence,
  tokenUsage,
  estimatedCostUsd,
  rawJson,
  errorCode,
  errorMessage
}
```

## Vision Property Provider Interface

```js
visionPropertyProvider.extractAndTranslate({
  buffer,
  mimeType,
  fileName,
  rawTextJa,
  blocks,
  processingStrategy
}) => {
  status,
  provider,
  model,
  processingStrategy,
  translatedFields,
  keyFieldCoverage,
  confidence,
  tokenUsage,
  estimatedCostUsd,
  rawJson,
  errorCode,
  errorMessage
}
```

## Translation Field Shape

```json
{
  "title_ja": null,
  "title_zh": null,
  "address_ja": null,
  "address_zh": null,
  "rent_jpy": null,
  "area_sqm": null,
  "layout": null,
  "building_age": null,
  "station_name": null,
  "station_walk_minutes": null,
  "source_agency": null,
  "remarks": null
}
```

## 1) POST /api/admin/property-ingest/jobs

用途：建立 ingest job 並上傳 raw file。

request:
- `multipart/form-data`
- `file`
- `store_id?`
- `source_type?`
- `source_channel?`
- `source_partner_id?`
- `metadata?` JSON string

response:

```json
{
  "data": {
    "job": {
      "id": "uuid",
      "status": "uploaded",
      "organization_id": "uuid",
      "store_id": "uuid",
      "environment_type": "staging"
    },
    "file": {
      "id": "uuid",
      "storage_bucket": "property-ingest-raw",
      "storage_path": "orgs/.../property-ingest/jobs/.../raw/file.jpg",
      "original_file_name": "file.jpg",
      "mime_type": "image/jpeg",
      "size_bytes": 12345
    }
  },
  "error": null,
  "meta": null
}
```

## 2) GET /api/admin/property-ingest/jobs

query:
- `page`
- `limit`
- `status?`
- `processing_strategy?`
- `store_id?`
- `search?`

response:

```json
{
  "data": [
    {
      "id": "uuid",
      "status": "ocr_low_confidence",
      "ocr_status": "done",
      "translation_status": "pending",
      "processing_strategy": null,
      "recommended_next_step": "hybrid_assist",
      "key_field_coverage": {
        "coverage_ratio": 0.4286
      },
      "current_ocr_confidence": 0.41,
      "estimated_cost_usd": null,
      "preview": {
        "title_zh": null,
        "address_zh": null,
        "rent": null,
        "area": null,
        "layout": null
      }
    }
  ],
  "error": null,
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 1,
    "total_pages": 1
  }
}
```

## 3) GET /api/admin/property-ingest/jobs/:id

response:

```json
{
  "data": {
    "job": {
      "processing_strategy": null,
      "recommended_next_step": "ocr_then_ai",
      "key_field_coverage": {},
      "current_ocr_confidence": 0.88,
      "token_usage": {
        "input_tokens": 1200,
        "output_tokens": 280,
        "total_tokens": 1480
      },
      "estimated_cost_usd": null
    },
    "files": [],
    "ocr_result": {},
    "translation_result": {},
    "review_history": [],
    "file_access": {
      "strategy": "signed_url",
      "signed_url": "https://...",
      "expires_in_seconds": 900
    },
    "preview": {}
  },
  "error": null,
  "meta": null
}
```

## 4) POST /api/admin/property-ingest/jobs/:id/run-ocr

request:

```json
{
  "force_rerun": false,
  "store_id": null
}
```

response:

```json
{
  "data": {
    "job_id": "uuid",
    "status": "ocr_low_confidence",
    "ocr_confidence": 0.41,
    "key_field_coverage": {
      "title_or_building_name": false,
      "address": true,
      "rent_or_price": true,
      "area_sqm": false,
      "layout": false,
      "station_access": true,
      "building_age": false,
      "matched_count": 3,
      "total_fields": 7,
      "coverage_ratio": 0.4286
    },
    "recommended_next_step": "hybrid_assist",
    "ocr_result": {
      "id": "uuid",
      "status": "done",
      "provider": "openai_vision",
      "raw_text_ja": "..."
    }
  },
  "error": null,
  "meta": null
}
```

## 5) POST /api/admin/property-ingest/jobs/:id/run-translate

request:

```json
{
  "force_rerun": false,
  "strategy": "hybrid_assist",
  "store_id": null
}
```

response:

```json
{
  "data": {
    "job_id": "uuid",
    "status": "translated",
    "processing_strategy": "hybrid_assist",
    "translation_result": {
      "id": "uuid",
      "status": "done",
      "provider": "openai_property_vision",
      "processing_strategy": "hybrid_assist",
      "translated_fields_json": {
        "title_zh": "東京XX公寓"
      },
      "token_usage": {
        "input_tokens": 1400,
        "output_tokens": 320,
        "total_tokens": 1720
      },
      "estimated_cost_usd": null
    }
  },
  "error": null,
  "meta": null
}
```

## 6) POST /api/admin/property-ingest/jobs/:id/review

request:

```json
{
  "decision": "reviewed",
  "reviewed_fields": {
    "title_zh": "東京XX公寓",
    "address_zh": "東京都..."
  },
  "notes": "地址已人工修正",
  "store_id": null
}
```

## 7) POST /api/admin/property-ingest/jobs/:id/approve

request:

```json
{
  "notes": "核准匯入正式物件",
  "store_id": null
}
```

## Cost / Token Logging Proposal

最小可用方案：
- 每次 OCR / translation / vision provider call 都記錄：
  - `token_input_count`
  - `token_output_count`
  - `token_total_count`
  - `estimated_cost_usd`
- job table 聚合總 token / cost，方便比較：
  - `ocr_then_ai`
  - `hybrid_assist`
  - `vision_only_fallback`
- `estimated_cost_usd` 採 env-based pricing：
  - `PROPERTY_INGEST_OCR_INPUT_COST_PER_1M`
  - `PROPERTY_INGEST_OCR_OUTPUT_COST_PER_1M`
  - `PROPERTY_INGEST_TRANSLATOR_INPUT_COST_PER_1M`
  - `PROPERTY_INGEST_TRANSLATOR_OUTPUT_COST_PER_1M`
  - `PROPERTY_INGEST_VISION_INPUT_COST_PER_1M`
  - `PROPERTY_INGEST_VISION_OUTPUT_COST_PER_1M`
- 若未配置 pricing env，token 仍照常記錄，`estimated_cost_usd` 可為 `null`

## Canonical Property Mapping Proposal

- raw Japanese source:
  - `property_ocr_results.raw_text_ja`
  - `property_ocr_results.blocks_json`
- translated zh-TW fields:
  - `property_translation_results.translated_fields_json`
- reviewed fields:
  - latest `property_review_decisions.reviewed_fields_json`

V1 approve mapping:
- `title` <- `title_zh ?? title_ja ?? address_zh ?? address_ja`
- `title_ja` <- `title_ja`
- `title_zh` <- `title_zh`
- `address_ja` <- `address_ja`
- `address_zh` <- `address_zh`
- `price` <- `rent_jpy`
- `area_sqm` <- `area_sqm`
- `layout` <- `layout`
- `building_age` <- `building_age`
- `nearest_station` <- `station_name`
- `walking_minutes` <- `station_walk_minutes`
- `source_ref` <- `source_agency`
- `description_zh` <- `remarks`
- `raw_source_payload` <- full ingest provenance + translated/reviewed payloads
