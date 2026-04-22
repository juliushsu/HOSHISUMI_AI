# Property Master API Contract v1.0 (Phase 4.5A)

本文件定義 Property Master（物件主資料）後台 API 契約，作為 storefront publication 的上游資料來源。

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

## Data Boundary

- Property Master（`properties`）是「物件本體資料」：
  - 標題、多語說明、地址、價格、面積、來源、媒體欄位、生命週期等。
- Storefront Publication（`store_property_publications`）是「某店是否公開展示」：
  - `is_public`、`publication_type`、`display_order`、`published_at`、`unpublished_at`。
- 前端若要顯示門店公開列表，必須以 publication 設定為準；不可把 Property Master 直接視為公開狀態。

## Permission / Scope

- 允許角色：`owner | super_admin | manager | store_manager | store_editor`
- 不允許：`agent`
- 所有 endpoints 需 `requireAuth` + `x-organization-id`
- 本版以 `organization_id` 為 scope（同組織可讀寫 Property Master）

## Enums

- `country`: `tw | jp`
- `status`: `available | negotiating | sold`
- `purpose`: `sale | rental | management`
- `currency`: `JPY | TWD | USD`
- `source_type`: `manual | import | japan_line | japan_api | csv_import | image_draft | api_sync`
- `current_stage`:
  - `sale_active`
  - `sold`
  - `rental_listing`
  - `rental_showing`
  - `rental_negotiating`
  - `rented`
  - `under_management`
  - `vacancy`
  - `resale_ready`

## Canonical Editable Fields

- `property_code`
- `title`
- `title_ja`
- `title_zh`
- `title_en`
- `description`
- `description_ja`
- `description_zh`
- `description_en`
- `country`
- `prefecture`
- `city`
- `district`
- `address_ja`
- `address_zh`
- `address_en`
- `purpose`
- `property_type`
- `price`
- `currency`
- `area_sqm`
- `layout`
- `building_age`
- `floor`
- `total_floors`
- `nearest_station`
- `walking_minutes`
- `management_fee`
- `status`
- `current_stage`
- `contact_store_id`
- `source_type`
- `source_ref`
- `import_batch_id`
- `cover_image_url`
- `floorplan_image_url`
- `gallery_urls`
- `raw_source_payload`

---

## 1) GET /api/admin/properties

用途：
- 取得 Property Master 列表（後台管理）。

query:
- `purpose` optional
- `status` optional
- `country` optional
- `page` optional，預設 `1`
- `limit` optional，預設 `20`，上限 `100`

sample success:

```json
{
  "data": [
    {
      "id": "a1111111-1111-4111-8111-111111111111",
      "property_code": "JP-TK-MINATO-0001",
      "title": "東京港區赤坂投資套房",
      "title_ja": "東京都港区赤坂投資マンション",
      "title_zh": "東京港區赤坂投資套房",
      "title_en": "Akasaka Investment Unit, Minato",
      "description": "高租賃需求區段",
      "description_ja": null,
      "description_zh": "高租賃需求區段",
      "description_en": null,
      "country": "jp",
      "prefecture": "東京都",
      "city": "港区",
      "district": "赤坂",
      "address_ja": "東京都港区赤坂...",
      "address_zh": "東京都港區赤坂...",
      "address_en": null,
      "purpose": "rental",
      "property_type": "apartment",
      "price": "46800000.00",
      "currency": "JPY",
      "area_sqm": "41.80",
      "layout": "1LDK",
      "building_age": 12,
      "floor": 8,
      "total_floors": 15,
      "nearest_station": "赤坂駅",
      "walking_minutes": 6,
      "management_fee": "12000.00",
      "status": "available",
      "current_stage": "rental_listing",
      "contact_store_id": "71000000-0000-4000-8000-000000000001",
      "contact_store_name": "星澄地所台北信義店",
      "source_type": "manual",
      "source_ref": null,
      "import_batch_id": null,
      "cover_image_url": "https://img.hoshisumi.test/property/cover1.jpg",
      "floorplan_image_url": "https://img.hoshisumi.test/property/floor1.jpg",
      "gallery_urls": [
        "https://img.hoshisumi.test/property/g1.jpg"
      ],
      "raw_source_payload": null,
      "created_at": "2026-03-27T08:00:00.000Z",
      "updated_at": "2026-03-27T08:00:00.000Z"
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

sample empty:

```json
{
  "data": [],
  "error": null,
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 0,
    "total_pages": 0
  }
}
```

sample error:

```json
{
  "data": null,
  "error": {
    "code": "INVALID_PURPOSE",
    "message": "purpose must be sale/rental/management.",
    "details": null
  },
  "meta": null
}
```

---

## 2) GET /api/admin/properties/:id

用途：
- 取得單筆 Property Master 詳情。

sample success:

```json
{
  "data": {
    "id": "a1111111-1111-4111-8111-111111111111",
    "property_code": "JP-TK-MINATO-0001",
    "title": "東京港區赤坂投資套房",
    "country": "jp",
    "purpose": "rental",
    "status": "available",
    "currency": "JPY",
    "price": "46800000.00",
    "gallery_urls": [],
    "created_at": "2026-03-27T08:00:00.000Z",
    "updated_at": "2026-03-27T08:00:00.000Z"
  },
  "error": null,
  "meta": null
}
```

sample error:

```json
{
  "data": null,
  "error": {
    "code": "ADMIN_PROPERTY_NOT_FOUND",
    "message": "Property not found.",
    "details": null
  },
  "meta": null
}
```

---

## 3) POST /api/admin/properties

用途：
- 建立單筆 Property Master（手動建立入口）。

required:
- `country`
- `price`
- `purpose`（預設 `sale`）
- `status`（預設 `available`）
- `title` 或任一多語標題欄位（`title_ja/title_zh/title_en`）

sample success:

```json
{
  "data": {
    "id": "a2222222-2222-4222-8222-222222222222",
    "property_code": "TW-TPE-XINYI-0007",
    "title": "台北信義捷運兩房",
    "country": "tw",
    "purpose": "sale",
    "status": "available",
    "currency": "TWD",
    "source_type": "manual",
    "cover_image_url": null,
    "gallery_urls": [],
    "created_at": "2026-03-27T09:00:00.000Z",
    "updated_at": "2026-03-27T09:00:00.000Z"
  },
  "error": null,
  "meta": null
}
```

sample error:

```json
{
  "data": null,
  "error": {
    "code": "UNSUPPORTED_FIELDS",
    "message": "Request includes unsupported property fields.",
    "details": {
      "unsupported_fields": ["is_public"]
    }
  },
  "meta": null
}
```

---

## 4) PATCH /api/admin/properties/:id

用途：
- 更新單筆 Property Master（不含 delete）。

editable fields:
- 請見本文件 `Canonical Editable Fields`。

sample success:

```json
{
  "data": {
    "id": "a2222222-2222-4222-8222-222222222222",
    "title": "台北信義捷運景觀兩房",
    "purpose": "sale",
    "status": "negotiating",
    "current_stage": "sale_active",
    "updated_at": "2026-03-27T10:00:00.000Z"
  },
  "error": null,
  "meta": null
}
```

sample error:

```json
{
  "data": null,
  "error": {
    "code": "EMPTY_PATCH_BODY",
    "message": "At least one editable field is required.",
    "details": null
  },
  "meta": null
}
```
