# Property Ingest API v1

日本物件資料辨識匯入 V1 的 canonical contract。  
本流程在 Railway orchestrate，Supabase 承接 DB/Storage，僅允許 staging/development write。

## Canonical Flow

`upload file -> run OCR -> translate to zh-TW fields -> human review -> approve -> create canonical property`

## Governance

- canonical API: Railway
- DB + Storage: Supabase
- production 預設不可寫，route 會在進 DB 前直接 403
- demo org 不可用此 flow
- 所有 AI raw output 必須保留 `raw_json`
- approve 前後變更由 `property_review_decisions` append-only 保留

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
- `translating`
- `translated`
- `pending_review`
- `approved`
- `rejected`
- `failed`

## OCR Provider Interface

```js
ocrProvider.extractText({ buffer, mimeType, fileName }) => {
  status,
  provider,
  model,
  rawText,
  blocks,
  confidence,
  rawJson,
  errorCode,
  errorMessage
}
```

## Translator Provider Interface

```js
translatorProvider.translatePropertyFields({ rawTextJa, blocks }) => {
  status,
  provider,
  model,
  translatedFields,
  confidence,
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
- `store_id?`
- `search?`

response:

```json
{
  "data": [
    {
      "id": "uuid",
      "status": "translated",
      "ocr_status": "done",
      "translation_status": "done",
      "raw_file_name": "sheet.jpg",
      "created_at": "ISO",
      "updated_at": "ISO",
      "preview": {
        "title_zh": "東京XX公寓",
        "address_zh": "東京都...",
        "rent": 120000,
        "area": 41.8,
        "layout": "1LDK"
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
    "job": {},
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
    "status": "ocr_done",
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
  "store_id": null
}
```

response:

```json
{
  "data": {
    "job_id": "uuid",
    "status": "translated",
    "translation_result": {
      "id": "uuid",
      "status": "done",
      "provider": "openai_property_translator",
      "translated_fields_json": {
        "title_zh": "東京XX公寓"
      }
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

response:

```json
{
  "data": {
    "job_id": "uuid",
    "status": "pending_review",
    "review_decision": {
      "id": "uuid",
      "decision": "reviewed",
      "status_before": "translated",
      "status_after": "pending_review"
    }
  },
  "error": null,
  "meta": null
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

response:

```json
{
  "data": {
    "job_id": "uuid",
    "status": "approved",
    "approved_property": {
      "id": "uuid",
      "title": "東京XX公寓",
      "title_zh": "東京XX公寓",
      "address_zh": "東京都...",
      "price": 120000
    }
  },
  "error": null,
  "meta": null
}
```

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
