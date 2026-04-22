# Property Intake API Contract v1

本文件定義「日本物件 ingestion intake v1」的 canonical backend contract。  
此流程的目標是把 raw file 送進 review queue，不直接污染 live property。

## Runtime Responsibility

- Canonical API orchestration：Railway
- DB + Storage：Supabase
- Edge Functions：不是主流程；僅保留給未來 signed URL / webhook 類輔助用途

## Canonical Envelope

Success:

```json
{
  "data": {},
  "error": null,
  "meta": null
}
```

Error:

```json
{
  "data": null,
  "error": {
    "code": "ERROR_CODE",
    "message": "error message",
    "details": null
  },
  "meta": null
}
```

## Governance

- 本輪 canonical write 僅允許 `development/staging`；production write 被 route guard 阻擋。
- Demo fallback 不在這條 backend flow 內。
- `parsed_payload` 是 AI draft，不是正式資料。
- `reviewed_payload` 是人工確認版本。
- 未 review / 未 approve 的 intake case，不得視為 live property。

## Data Model

## `property_intake_cases`

- `id`
- `organization_id`
- `store_id`
- `environment_type`
- `created_by`
- `reviewed_by`
- `source_type`
- `source_partner_id`
- `source_channel`
- `source_metadata_json`
- `raw_file_path`
- `raw_file_name`
- `raw_file_mime_type`
- `raw_file_size_bytes`
- `ocr_status`
- `ocr_provider`
- `ocr_text`
- `ocr_blocks_json`
- `ocr_confidence`
- `ocr_error_code`
- `ocr_error_message`
- `parse_status`
- `parse_provider`
- `parsed_payload`
- `parse_audit_trail`
- `parsed_confidence`
- `parse_error_code`
- `parse_error_message`
- `review_status`
- `reviewed_payload`
- `review_audit_trail`
- `review_notes`
- `approval_target_type`
- `approved_property_id`
- `created_at`
- `updated_at`
- `reviewed_at`
- `approved_at`

## Enums

- `source_type`: `manual_admin | partner_upload | api_import`
- `ocr_status`: `pending | processing | done | failed`
- `parse_status`: `pending | processing | done | failed`
- `review_status`: `pending_review | needs_fix | approved | rejected`
- `approval_target_type`: `property_draft | property_live`

## File Storage

- Bucket: `property-intake-raw`
- Bucket is private
- Canonical path rule:
  - `orgs/{organization_id}/stores/{store_id|unscoped}/intake-cases/{case_id}/raw/{timestamp}-{filename}`
- Frontend read strategy:
  - detail API 先回 signed URL
  - 不假設 public bucket

## 1) POST /api/admin/intake-cases

用途：
- admin 上傳日本物件 raw file
- 建立 intake case
- 儲存 raw file
- 在 Railway 同步 orchestrate OCR + parsing

request:
- `multipart/form-data`
- fields:
  - `file`
  - `source_type` optional, default `manual_admin`
  - `source_partner_id` optional
  - `source_channel` optional, default `upload`
  - `metadata` optional JSON object string
  - `store_id` optional, owner/super_admin only

allowed file types:
- `application/pdf`
- `image/jpeg`
- `image/png`
- `image/webp`

sample success:

```json
{
  "data": {
    "intake_case_id": "case-uuid",
    "ocr_status": "done",
    "parse_status": "done",
    "review_status": "pending_review",
    "created_at": "2026-04-22T12:00:00.000Z",
    "raw_file": {
      "path": "orgs/org-uuid/stores/store-uuid/intake-cases/case-uuid/raw/1713787200000-sheet.png",
      "name": "sheet.png",
      "mime_type": "image/png",
      "size_bytes": 412345
    },
    "parsed_summary": {
      "price_jpy": 46800000,
      "layout": "1LDK",
      "address_text": "東京都港区...",
      "building_name": "赤坂...",
      "area_sqm": 41.8
    }
  },
  "error": null,
  "meta": null
}
```

error codes:
- `INVALID_FILE_TYPE`
- `FILE_TOO_LARGE`
- `UNAUTHORIZED`
- `INVALID_ORGANIZATION_HEADER`
- `ROLE_NOT_ALLOWED`
- `STORE_SCOPE_MISMATCH`
- `INTAKE_UPLOAD_FAILED`
- `INTAKE_CASE_CREATE_FAILED`
- `PROPERTY_INTAKE_DISABLED_IN_PRODUCTION`
- `DEMO_MODE_NOT_SUPPORTED`

重要行為：
- OCR / parse 即使失敗，case 仍可建立成功，狀態會寫回 DB。
- route response 可區分：
  - OCR 真成功：`ocr_status=done`
  - OCR 未配置：`ocr_status=failed` + `ocr_error_code=OCR_PROVIDER_NOT_CONFIGURED`
  - OCR provider error：`ocr_status=failed` + `ocr_error_code=OCR_PROVIDER_ERROR`

## 2) GET /api/admin/intake-cases

用途：
- intake queue 列表

query:
- `page`
- `limit`
- `review_status` optional
- `source_type` optional
- `search` optional
- `store_id` optional（owner/super_admin only）

search 規則：
- 第一版採 `raw_file_name` / `ocr_text` 的 `ilike`
- 不做全文 search index

## 3) GET /api/admin/intake-cases/:id

用途：
- 單筆詳情

response 至少包含：
- base fields
- raw file metadata
- signed URL access strategy
- OCR section
- parsing section
- review section
- preview summary
- audit timestamps

## 4) POST /api/admin/intake-cases/:id/review

用途：
- 人工確認 / 修正

request body:

```json
{
  "reviewed_payload": {
    "building_name": "赤坂...",
    "price_jpy": 46800000
  },
  "review_status": "needs_fix",
  "review_notes": "price 已人工確認"
}
```

rules:
- `reviewed_payload` 不覆蓋 `parsed_payload`
- `review_audit_trail` 會 append
- `reviewed_by` / `reviewed_at` 會更新

## 5) POST /api/admin/intake-cases/:id/approve

用途：
- 本輪先保留 property draft 對接 stub

當前行為：
- 要求 `reviewed_payload` 已存在
- 更新：
  - `review_status = approved`
  - `approval_target_type = property_draft`
  - `approved_property_id = null`
  - `approved_at = now()`
- 不寫入 `properties`
- 不建立 storefront publication

## Parser Payload Schema

`parsed_payload` / `reviewed_payload` 推薦 shape：

```json
{
  "property_type": null,
  "building_name": null,
  "price_jpy": null,
  "layout": null,
  "area_sqm": null,
  "balcony_sqm": null,
  "address_text": null,
  "prefecture": null,
  "city": null,
  "ward": null,
  "nearest_stations": [],
  "building_year": null,
  "floor_plan_notes": [],
  "orientation": null,
  "current_status": null,
  "management_fee_jpy": null,
  "repair_reserve_fee_jpy": null,
  "land_rights": null,
  "structure": null,
  "floor_info": null,
  "total_floors": null,
  "remarks": [],
  "source_language": "ja"
}
```
