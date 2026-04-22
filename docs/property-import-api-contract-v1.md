# Property Import API Contract v1.0 (Phase 4.5B)

本文件定義日本物件匯入（CSV/XLSX）後端骨架契約。  
本輪目標是「驗證 + batch 記錄 + 建立草稿」，不直接上架 storefront。

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

## Runtime (Important)

- Import parser / batch 建立屬於 heavy path。
- **建議固定部署在 Railway**（不要搬到 Edge）。

## Data Model

## `import_batches`
- `id`
- `organization_id`
- `store_id`
- `source_type`
- `import_type`
- `original_filename`
- `file_url`
- `status`
- `total_rows`
- `valid_rows`
- `invalid_rows`
- `created_drafts_count`
- `error_summary`
- `started_at`
- `finished_at`
- `created_by`
- `created_at`
- `updated_at`

## `property_import_rows`
- `id`
- `import_batch_id`
- `row_number`
- `property_code`
- `raw_row_payload`
- `normalized_payload`
- `validation_errors`
- `status`
- `created_property_id`
- `created_at`

## Enums

- `source_type`: `manual | csv_import | image_draft | api_sync`
- `import_type`: `japan_csv | japan_xlsx`
- `import_batches.status`: `uploaded | validating | validated | imported | failed`
- `property_import_rows.status`: `valid | invalid | imported`

## Draft Creation Principle

- 匯入成功列會建立到 `properties`，但以「草稿待審核」語意落地：
  - `intake_status = pending_review`
  - 不建立 `store_property_publications`（所以不會直接公開到 storefront）
- 匯入成功 ≠ 上架成功。

---

## 1) POST /api/admin/import-batches

用途：
- 建立 import batch。
- 驗證逐列欄位。
- 寫入逐列結果。
- 建立 property drafts（`pending_review`）。

目前 request 格式（Phase 4.5B skeleton）：
- `application/json`（pre-parsed rows）
- 未來可擴充 `multipart/form-data`

request body:

```json
{
  "source_type": "csv_import",
  "import_type": "japan_csv",
  "original_filename": "japan-import-2026-03.csv",
  "file_url": "https://storage.example.com/import/japan-import-2026-03.csv",
  "store_id": "71000000-0000-4000-8000-000000000001",
  "rows": [
    {
      "property_code": "JP-TK-MINATO-0001",
      "title_zh": "東京港區赤坂投資套房",
      "country": "jp",
      "purpose": "rental",
      "price": "46800000",
      "currency": "JPY",
      "city": "港区",
      "district": "赤坂",
      "address_ja": "東京都港区赤坂...",
      "area_sqm": "41.8"
    }
  ]
}
```

sample success:

```json
{
  "data": {
    "batch": {
      "id": "batch-uuid",
      "status": "imported",
      "total_rows": 2,
      "valid_rows": 2,
      "invalid_rows": 0,
      "created_drafts_count": 2,
      "error_summary": {
        "validation_error_rows": 0,
        "draft_create_error_rows": 0,
        "top_errors": []
      }
    },
    "rows": [
      {
        "row_number": 1,
        "property_code": "JP-TK-MINATO-0001",
        "status": "imported",
        "created_property_id": "property-uuid-1",
        "validation_errors": []
      }
    ]
  },
  "error": null,
  "meta": {
    "scope_mode": "store_scoped",
    "scope_store_id": "71000000-0000-4000-8000-000000000001"
  }
}
```

sample error:

```json
{
  "data": null,
  "error": {
    "code": "INVALID_IMPORT_TYPE",
    "message": "import_type must be japan_csv/japan_xlsx.",
    "details": null
  },
  "meta": null
}
```

---

## 2) GET /api/admin/import-batches

用途：
- 查詢匯入批次歷史。

query:
- `status` optional
- `import_type` optional
- `source_type` optional
- `store_id` optional（owner/super_admin 可跨店）
- `page`
- `limit`

sample success:

```json
{
  "data": [
    {
      "id": "batch-uuid",
      "source_type": "csv_import",
      "import_type": "japan_csv",
      "original_filename": "japan-import.csv",
      "status": "imported",
      "total_rows": 20,
      "valid_rows": 16,
      "invalid_rows": 4,
      "created_drafts_count": 16,
      "started_at": "2026-03-27T09:00:00.000Z",
      "finished_at": "2026-03-27T09:00:03.000Z"
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

---

## 3) GET /api/admin/import-batches/:id

用途：
- 查看單一批次詳情與逐列結果。

query:
- `store_id` optional（owner/super_admin）
- `row_page` optional（default 1）
- `row_limit` optional（default 100）

sample success:

```json
{
  "data": {
    "batch": {
      "id": "batch-uuid",
      "status": "failed",
      "total_rows": 3,
      "valid_rows": 1,
      "invalid_rows": 2,
      "created_drafts_count": 1,
      "error_summary": {
        "validation_error_rows": 2,
        "draft_create_error_rows": 0,
        "top_errors": [
          { "code": "INVALID_CURRENCY", "count": 1 },
          { "code": "DUPLICATE_PROPERTY_CODE_EXISTING", "count": 1 }
        ]
      }
    },
    "rows": [
      {
        "row_number": 2,
        "property_code": "JP-OSAKA-0001",
        "status": "invalid",
        "validation_errors": [
          { "code": "INVALID_CURRENCY", "message": "currency must be JPY/TWD/USD.", "field": "currency" }
        ]
      }
    ]
  },
  "error": null,
  "meta": {
    "row_page": 1,
    "row_limit": 100,
    "row_total": 3,
    "row_total_pages": 1
  }
}
```

---

## Validation Rules (Minimum)

每列至少驗證：
- 必填欄位：`property_code`, (`title` 或多語標題其一), `country`, `purpose`, `price`, `currency`
- `purpose` enum 檢查
- `currency` enum 檢查
- `price` 非負數
- `area_sqm` 非負數（若提供）
- `property_code` 檔內重複 / 與 DB 既有重複
- 地址完整度：`address_ja/address_zh/address_en` 任一，或 `city + district`

## Image Strategy (Reserved)

本版先預留，不做 ZIP 解壓：
- 支援 row 欄位：
  - `cover_image_url`
  - `floorplan_image_url`
  - `gallery_urls`（array 或 comma/newline string）
- 後續可擴充：
  - ZIP 命名規則（例：`{property_code}_cover.jpg`, `{property_code}_plan.png`）
  - 圖片上傳後回填到上述欄位
