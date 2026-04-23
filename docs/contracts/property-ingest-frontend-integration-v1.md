# Property Ingest Frontend Integration v1

本文件給 Readdy 前端接線使用。內容以 staging backend 實際 response shape 為準。

## Page Routing

- 新 OCR 管線測試頁：`/admin/property-ingest`
- Legacy intake 頁：`/admin/intake-queue`

## Legacy Policy

- `/api/admin/intake-cases` 是 legacy intake-cases API。
- 新開發與新測試只走 `/api/admin/property-ingest/jobs*`。
- 舊 failed intake-cases 資料可清理，不作為新 OCR 管線驗收依據。
- 請勿把 `/admin/intake-queue` 的舊 OCR/parse 狀態拿來驗收 property-ingest。

## Canonical Envelope

所有 endpoint 都使用同一層 HTTP envelope：

```json
{
  "data": {},
  "error": null,
  "meta": null
}
```

錯誤：

```json
{
  "data": null,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable message.",
    "details": null
  },
  "meta": null
}
```

## Canonical Job ID

正式標準只保留一個：

```ts
const jobId = response.data.job.id
```

不要讀：

```ts
response.job.id
response.data.id
response.id
```

若前端 API client 會自動 unwrap envelope，請在 adapter 層保留一致命名，例如：

```ts
const envelope = await api.post(...)
const jobId = envelope.data.job.id
```

## Auth Headers

所有 admin endpoint 都需要：

```http
Authorization: Bearer <staging-token>
x-organization-id: 33333333-3333-4333-8333-333333333333
```

## Canonical Endpoints

```text
POST /api/admin/property-ingest/jobs
GET  /api/admin/property-ingest/jobs
GET  /api/admin/property-ingest/jobs/:id
POST /api/admin/property-ingest/jobs/:id/run-ocr
POST /api/admin/property-ingest/jobs/:id/run-translate
POST /api/admin/property-ingest/jobs/:id/review
POST /api/admin/property-ingest/jobs/:id/approve
```

## Status Mapping

Backend canonical fields:

```text
job.status
job.ocr_status
job.translation_status
```

Frontend display mapping:

```ts
const parseStatus = job.translation_status
const reviewStatus = job.status
```

Recommended labels:

| Backend field | Values | Frontend meaning |
| --- | --- | --- |
| `job.status` | `uploaded` | file uploaded, waiting OCR |
| `job.status` | `ocr_processing` | OCR running |
| `job.status` | `ocr_done` | OCR succeeded, ready to translate |
| `job.status` | `ocr_low_confidence` | OCR succeeded but needs fallback/manual review |
| `job.status` | `translating` | translation/parse running |
| `job.status` | `vision_fallback_processing` | vision fallback running |
| `job.status` | `translated` | parse done, ready for review/approve |
| `job.status` | `pending_review` | manually reviewed, waiting approval |
| `job.status` | `approved` | canonical property created |
| `job.status` | `rejected` | rejected |
| `job.status` | `failed` | terminal failure |
| `job.ocr_status` | `pending`, `processing`, `done`, `failed`, `unconfigured` | OCR column |
| `job.translation_status` | `pending`, `processing`, `done`, `failed`, `unconfigured` | parse column |

Do not invent a backend `parse_status` field. Use:

```ts
parse_status = translation_status
```

## 1. Create Job And Upload File

```http
POST /api/admin/property-ingest/jobs
Content-Type: multipart/form-data
```

Request fields:

```text
file: <jpg/png/webp/pdf>
source_type: manual_admin
source_channel: smoke
store_id: 71000000-0000-4000-8000-000000000001
metadata: {"smoke":true}
```

Actual staging response example:

```json
{
  "data": {
    "job": {
      "id": "f9c7ef98-cdc7-4417-b121-c0bc9e025921",
      "organization_id": "33333333-3333-4333-8333-333333333333",
      "company_id": null,
      "store_id": "71000000-0000-4000-8000-000000000001",
      "store": {
        "id": "71000000-0000-4000-8000-000000000001",
        "name": "星澄地所台北信義店",
        "slug": "xinyi-store"
      },
      "environment_type": "staging",
      "source_type": "manual_admin",
      "source_channel": "smoke",
      "source_partner_id": null,
      "source_partner": null,
      "metadata": {
        "smoke": true,
        "created_by": "property_ingest_smoke.js"
      },
      "status": "uploaded",
      "ocr_status": "pending",
      "translation_status": "pending",
      "processing_strategy": null,
      "recommended_next_step": null,
      "key_field_coverage": null,
      "current_ocr_confidence": null,
      "token_usage": {
        "input_tokens": null,
        "output_tokens": null,
        "total_tokens": null
      },
      "estimated_cost_usd": null,
      "failure_code": null,
      "failure_message": null,
      "current_ocr_text_ja": null,
      "current_ocr_blocks_json": null,
      "current_translated_fields_json": null,
      "current_reviewed_fields_json": null,
      "approved_property_id": null,
      "created_by": "3f6cb635-31a8-4cc6-8d1c-1d074d8ec37f",
      "reviewed_by": null,
      "created_at": "2026-04-23T12:52:13.922182+00:00",
      "updated_at": "2026-04-23T12:52:13.922182+00:00",
      "reviewed_at": null,
      "approved_at": null
    },
    "file": {
      "id": "680002f5-6489-42c7-a3e8-61e58ae20841",
      "storage_bucket": "property-ingest-raw",
      "storage_path": "orgs/33333333-3333-4333-8333-333333333333/stores/71000000-0000-4000-8000-000000000001/property-ingest/jobs/f9c7ef98-cdc7-4417-b121-c0bc9e025921/raw/1776948733611-property-ingest-smoke.jpg",
      "original_file_name": "property-ingest-smoke.jpg",
      "mime_type": "image/jpeg",
      "size_bytes": 13957,
      "file_kind": "raw_source",
      "created_at": "2026-04-23T12:52:14.071477+00:00"
    }
  },
  "error": null,
  "meta": null
}
```

Frontend must read:

```ts
const jobId = response.data.job.id
const fileId = response.data.file.id
```

## 2. List Jobs

```http
GET /api/admin/property-ingest/jobs?page=1&limit=20
```

Query params:

```text
page?: number
limit?: number
status?: uploaded|ocr_processing|ocr_done|ocr_low_confidence|translating|vision_fallback_processing|translated|pending_review|approved|rejected|failed
processing_strategy?: ocr_then_ai|hybrid_assist|vision_only_fallback
store_id?: uuid
search?: string
```

Response shape:

```json
{
  "data": [
    {
      "id": "f9c7ef98-cdc7-4417-b121-c0bc9e025921",
      "status": "translated",
      "ocr_status": "done",
      "translation_status": "done",
      "processing_strategy": "ocr_then_ai",
      "recommended_next_step": "ocr_then_ai",
      "key_field_coverage": {
        "coverage_ratio": 0.8571
      },
      "current_ocr_confidence": 0.98,
      "token_usage": {
        "input_tokens": 1479,
        "output_tokens": 473,
        "total_tokens": 1952
      },
      "estimated_cost_usd": null,
      "organization_id": "33333333-3333-4333-8333-333333333333",
      "company_id": null,
      "store_id": "71000000-0000-4000-8000-000000000001",
      "raw_file_name": "property-ingest-smoke.jpg",
      "raw_file_mime_type": "image/jpeg",
      "raw_file_size_bytes": 13957,
      "created_at": "2026-04-23T12:52:13.922182+00:00",
      "updated_at": "2026-04-23T12:52:31.153016+00:00",
      "preview": {
        "title_zh": "霞關公寓101",
        "address_zh": "東京都千代田區霞關1-2-3",
        "rent": 120000,
        "area": 45.5,
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

Frontend must read:

```ts
const jobs = response.data
const parseStatus = job.translation_status
```

## 3. Get Job Detail

```http
GET /api/admin/property-ingest/jobs/:id
```

Actual staging response shape:

```json
{
  "data": {
    "job": {
      "id": "f9c7ef98-cdc7-4417-b121-c0bc9e025921",
      "status": "translated",
      "ocr_status": "done",
      "translation_status": "done",
      "processing_strategy": "ocr_then_ai",
      "recommended_next_step": "ocr_then_ai",
      "current_ocr_confidence": 0.98,
      "failure_code": null,
      "failure_message": null,
      "current_ocr_text_ja": "物件名 霞ヶ関マンション101\n所在地 東京都千代田区霞ヶ関1-2-3\n賃料 120000円\n専有面積 45.5㎡\n間取り 1LDK\n築年数 10年\n管理費等 2500円",
      "current_translated_fields_json": {
        "title_ja": "霞ヶ関マンション101",
        "title_zh": "霞關公寓101",
        "address_ja": "東京都千代田区霞ヶ関1-2-3",
        "address_zh": "東京都千代田區霞關1-2-3",
        "rent_jpy": 120000,
        "area_sqm": 45.5,
        "layout": "1LDK",
        "building_age": 10,
        "station_name": null,
        "station_walk_minutes": null,
        "source_agency": null,
        "remarks": null
      },
      "current_reviewed_fields_json": null
    },
    "files": [
      {
        "id": "680002f5-6489-42c7-a3e8-61e58ae20841",
        "storage_bucket": "property-ingest-raw",
        "storage_path": "orgs/.../property-ingest/jobs/f9c7ef98-cdc7-4417-b121-c0bc9e025921/raw/1776948733611-property-ingest-smoke.jpg",
        "original_file_name": "property-ingest-smoke.jpg",
        "mime_type": "image/jpeg",
        "size_bytes": 13957,
        "file_kind": "raw_source",
        "created_at": "2026-04-23T12:52:14.071477+00:00"
      }
    ],
    "ocr_result": {
      "id": "cd647d04-0b16-41c7-ac4d-9299d64c2c48",
      "provider": "openai_vision",
      "provider_model": "gpt-4.1-mini",
      "status": "done",
      "processing_strategy": "ocr_scan",
      "confidence": 0.98,
      "recommended_next_step": "ocr_then_ai",
      "token_usage": {
        "input_tokens": 1045,
        "output_tokens": 336,
        "total_tokens": 1381
      },
      "raw_json": {
        "id": "chatcmpl-DXnpTZkLUL0zTGuuOXaBGfB7yqGM3",
        "model": "gpt-4.1-mini-2025-04-14",
        "usage": {
          "total_tokens": 1381,
          "prompt_tokens": 1045,
          "completion_tokens": 336
        },
        "object": "chat.completion",
        "choices": []
      },
      "error_code": null,
      "error_message": null
    },
    "translation_result": {
      "id": "51d51def-05ac-4d30-a161-1adc4e179665",
      "provider": "openai_property_translator",
      "provider_model": "gpt-4.1-mini",
      "status": "done",
      "processing_strategy": "ocr_then_ai",
      "translated_fields_json": {
        "title_zh": "霞關公寓101",
        "address_zh": "東京都千代田區霞關1-2-3",
        "rent_jpy": 120000,
        "area_sqm": 45.5,
        "layout": "1LDK"
      },
      "error_code": null,
      "error_message": null
    },
    "review_history": [],
    "file_access": {
      "strategy": "signed_url",
      "signed_url": "<signed-url>",
      "expires_in_seconds": 900
    },
    "preview": {
      "title_zh": "霞關公寓101",
      "address_zh": "東京都千代田區霞關1-2-3",
      "rent": 120000,
      "area": 45.5,
      "layout": "1LDK"
    }
  },
  "error": null,
  "meta": null
}
```

Frontend must read:

```ts
const job = response.data.job
const files = response.data.files
const ocrResult = response.data.ocr_result
const translationResult = response.data.translation_result
const preview = response.data.preview
```

## 4. Run OCR

```http
POST /api/admin/property-ingest/jobs/:id/run-ocr
Content-Type: application/json
```

Request:

```json
{
  "store_id": "71000000-0000-4000-8000-000000000001",
  "force_rerun": true
}
```

Actual staging response example:

```json
{
  "data": {
    "job_id": "f9c7ef98-cdc7-4417-b121-c0bc9e025921",
    "status": "ocr_done",
    "ocr_confidence": 0.98,
    "key_field_coverage": {
      "title_or_building_name": true,
      "address": true,
      "rent_or_price": true,
      "area_sqm": true,
      "layout": true,
      "station_access": false,
      "building_age": true,
      "matched_count": 6,
      "total_fields": 7,
      "coverage_ratio": 0.8571
    },
    "recommended_next_step": "ocr_then_ai",
    "ocr_result": {
      "id": "cd647d04-0b16-41c7-ac4d-9299d64c2c48",
      "provider": "openai_vision",
      "provider_model": "gpt-4.1-mini",
      "status": "done",
      "processing_strategy": "ocr_scan",
      "raw_text_ja": "物件名 霞ヶ関マンション101\n所在地 東京都千代田区霞ヶ関1-2-3\n賃料 120000円\n専有面積 45.5㎡\n間取り 1LDK\n築年数 10年\n管理費等 2500円",
      "confidence": 0.98,
      "recommended_next_step": "ocr_then_ai",
      "token_usage": {
        "input_tokens": 1045,
        "output_tokens": 336,
        "total_tokens": 1381
      },
      "estimated_cost_usd": null,
      "error_code": null,
      "error_message": null
    }
  },
  "error": null,
  "meta": null
}
```

Frontend rule:

```ts
const nextStep = response.data.recommended_next_step
const ocrStatus = response.data.ocr_result.status
```

If `recommended_next_step` is:

```text
ocr_then_ai            -> call run-translate with strategy ocr_then_ai or omit strategy
hybrid_assist          -> call run-translate with strategy hybrid_assist
vision_only_fallback   -> call run-translate with strategy vision_only_fallback
manual_review          -> show manual review path
```

## 5. Run Translate / Parse

```http
POST /api/admin/property-ingest/jobs/:id/run-translate
Content-Type: application/json
```

Request:

```json
{
  "store_id": "71000000-0000-4000-8000-000000000001",
  "force_rerun": true,
  "strategy": "ocr_then_ai"
}
```

`strategy` may be omitted; backend falls back to `job.recommended_next_step` or `ocr_then_ai`.

Actual staging response example:

```json
{
  "data": {
    "job_id": "f9c7ef98-cdc7-4417-b121-c0bc9e025921",
    "status": "translated",
    "processing_strategy": "ocr_then_ai",
    "translation_result": {
      "id": "51d51def-05ac-4d30-a161-1adc4e179665",
      "provider": "openai_property_translator",
      "provider_model": "gpt-4.1-mini",
      "status": "done",
      "processing_strategy": "ocr_then_ai",
      "source_language": "ja",
      "target_language": "zh-TW",
      "translated_fields_json": {
        "title_ja": "霞ヶ関マンション101",
        "title_zh": "霞關公寓101",
        "address_ja": "東京都千代田区霞ヶ関1-2-3",
        "address_zh": "東京都千代田區霞關1-2-3",
        "rent_jpy": 120000,
        "area_sqm": 45.5,
        "layout": "1LDK",
        "building_age": 10,
        "station_name": null,
        "station_walk_minutes": null,
        "source_agency": null,
        "remarks": null
      },
      "key_field_coverage": {
        "title_zh": true,
        "address_zh": true,
        "rent_jpy": true,
        "area_sqm": true,
        "layout": true,
        "building_age": true,
        "station_name": false,
        "matched_count": 6,
        "total_fields": 7,
        "coverage_ratio": 0.8571
      },
      "confidence": null,
      "token_usage": {
        "input_tokens": 434,
        "output_tokens": 137,
        "total_tokens": 571
      },
      "estimated_cost_usd": null,
      "error_code": null,
      "error_message": null
    }
  },
  "error": null,
  "meta": null
}
```

Frontend must read:

```ts
const fields = response.data.translation_result.translated_fields_json
const parseStatus = response.data.translation_result.status
```

Then refresh detail:

```http
GET /api/admin/property-ingest/jobs/:id
```

## 6. Review

```http
POST /api/admin/property-ingest/jobs/:id/review
Content-Type: application/json
```

Request:

```json
{
  "decision": "reviewed",
  "reviewed_fields": {
    "title_zh": "霞關公寓101",
    "address_zh": "東京都千代田區霞關1-2-3",
    "rent_jpy": 120000,
    "area_sqm": 45.5,
    "layout": "1LDK"
  },
  "notes": "frontend review save",
  "store_id": "71000000-0000-4000-8000-000000000001"
}
```

Allowed `decision`:

```text
reviewed
needs_fix
rejected
```

Actual staging response example:

```json
{
  "data": {
    "job_id": "f9c7ef98-cdc7-4417-b121-c0bc9e025921",
    "status": "pending_review",
    "review_decision": {
      "id": "f33012fe-c935-495f-9bfc-c1b333552572",
      "decision": "reviewed",
      "status_before": "translated",
      "status_after": "pending_review",
      "translated_fields_before_json": {
        "layout": "1LDK",
        "remarks": null,
        "area_sqm": 45.5,
        "rent_jpy": 120000,
        "title_ja": "霞ヶ関マンション101",
        "title_zh": "霞關公寓101",
        "address_ja": "東京都千代田区霞ヶ関1-2-3",
        "address_zh": "東京都千代田區霞關1-2-3",
        "building_age": 10,
        "station_name": null,
        "source_agency": null,
        "station_walk_minutes": null
      },
      "reviewed_fields_json": {
        "layout": "1LDK",
        "remarks": null,
        "area_sqm": 45.5,
        "rent_jpy": 120000,
        "title_ja": "霞ヶ関マンション101",
        "title_zh": "霞關公寓101",
        "address_ja": "東京都千代田区霞ヶ関1-2-3",
        "address_zh": "東京都千代田區霞關1-2-3",
        "building_age": 10,
        "station_name": null,
        "source_agency": null,
        "station_walk_minutes": null
      },
      "field_changes_json": {},
      "notes": "frontend integration doc probe",
      "created_by": "2b5b6c8b-418c-4382-95d7-df65c6c2f67a",
      "created_at": "2026-04-23T13:22:40.027208+00:00"
    }
  },
  "error": null,
  "meta": null
}
```

Rules:

- Review requires successful translation or existing reviewed fields.
- `decision=reviewed` -> job `status=pending_review`.
- `decision=needs_fix` -> job `status=pending_review`.
- `decision=rejected` -> job `status=rejected`.
- Review writes append-only `property_review_decisions`.
- Review does not create a canonical property.

Frontend must read:

```ts
const status = response.data.status
const reviewDecision = response.data.review_decision
```

## 7. Approve

```http
POST /api/admin/property-ingest/jobs/:id/approve
Content-Type: application/json
```

Request:

```json
{
  "notes": "approve import",
  "store_id": "71000000-0000-4000-8000-000000000001"
}
```

Actual staging response example:

```json
{
  "data": {
    "job_id": "f9c7ef98-cdc7-4417-b121-c0bc9e025921",
    "status": "approved",
    "approved_property": {
      "id": "7bad4e17-5c2f-44a1-b4f6-38b1af92a36b",
      "title": "霞關公寓101",
      "title_zh": "霞關公寓101",
      "address_zh": "東京都千代田區霞關1-2-3",
      "price": 120000
    }
  },
  "error": null,
  "meta": null
}
```

Rules:

- Approve allowed only when job `status` is `translated` or `pending_review`.
- Approve creates canonical `properties` row.
- If `current_reviewed_fields_json` exists, approve uses reviewed fields.
- Otherwise approve uses `current_translated_fields_json`.
- Approved jobs cannot be approved again.
- Rejected jobs cannot be approved.

Frontend must read:

```ts
const propertyId = response.data.approved_property.id
```

## Error Examples

Missing file:

```json
{
  "data": null,
  "error": {
    "code": "FILE_REQUIRED",
    "message": "file is required.",
    "details": null
  },
  "meta": null
}
```

Invalid file type:

```json
{
  "data": null,
  "error": {
    "code": "INVALID_FILE_TYPE",
    "message": "Only PDF/JPEG/PNG/WEBP uploads are supported.",
    "details": null
  },
  "meta": null
}
```

OCR provider not configured:

```json
{
  "data": {
    "job_id": "88bb18e2-df9b-4b2a-8e92-7ea77a8fbb33",
    "status": "failed",
    "ocr_confidence": null,
    "recommended_next_step": null,
    "ocr_result": {
      "provider": null,
      "provider_model": null,
      "status": "unconfigured",
      "error_code": "OCR_PROVIDER_NOT_CONFIGURED",
      "error_message": "No OCR provider is configured for property ingest."
    }
  },
  "error": null,
  "meta": null
}
```

Translation before OCR:

```json
{
  "data": null,
  "error": {
    "code": "PROPERTY_INGEST_TRANSLATION_INPUT_MISSING",
    "message": "Run OCR successfully before translation.",
    "details": null
  },
  "meta": null
}
```

Approve before ready:

```json
{
  "data": null,
  "error": {
    "code": "PROPERTY_INGEST_NOT_READY_FOR_APPROVAL",
    "message": "Property ingest job must be translated or pending_review before approval.",
    "details": null
  },
  "meta": null
}
```

## Minimal Frontend Flow

```ts
const createRes = await createJob(formData)
const jobId = createRes.data.job.id

await runOcr(jobId, {
  store_id: selectedStoreId,
  force_rerun: true
})

await runTranslate(jobId, {
  store_id: selectedStoreId,
  force_rerun: true
})

const detail = await getJob(jobId)
const fields = detail.data.job.current_translated_fields_json
```

## Field Mapping

Translation fields:

| Backend path | Meaning |
| --- | --- |
| `job.current_translated_fields_json.title_ja` | Japanese title |
| `job.current_translated_fields_json.title_zh` | Traditional Chinese title |
| `job.current_translated_fields_json.address_ja` | Japanese address |
| `job.current_translated_fields_json.address_zh` | Traditional Chinese address |
| `job.current_translated_fields_json.rent_jpy` | rent / price in JPY |
| `job.current_translated_fields_json.area_sqm` | area in square meters |
| `job.current_translated_fields_json.layout` | layout |
| `job.current_translated_fields_json.building_age` | building age |
| `job.current_translated_fields_json.station_name` | station name |
| `job.current_translated_fields_json.station_walk_minutes` | walking minutes |
| `job.current_translated_fields_json.source_agency` | source agency |
| `job.current_translated_fields_json.remarks` | remarks |

Preview fields:

| Frontend display | Backend path |
| --- | --- |
| title | `data.preview.title_zh` or `data.job.current_translated_fields_json.title_zh` |
| address | `data.preview.address_zh` or `data.job.current_translated_fields_json.address_zh` |
| rent | `data.preview.rent` or `data.job.current_translated_fields_json.rent_jpy` |
| area | `data.preview.area` or `data.job.current_translated_fields_json.area_sqm` |
| layout | `data.preview.layout` or `data.job.current_translated_fields_json.layout` |

## Non-Goals

- Do not route new UI to `/api/admin/intake-cases`.
- Do not use legacy failed intake-cases rows as new OCR acceptance criteria.
- Do not normalize the create response to `response.job.id`; canonical remains `response.data.job.id`.
