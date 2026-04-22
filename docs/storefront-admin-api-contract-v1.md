# Storefront Admin API Contract v1.0 (Phase 4.2)

本文件定義 Storefront 後台管理 API 的最小可用契約，目的為固定欄位語意、store scope 與錯誤格式，避免前端猜欄位。

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

## Scope / Permission Rules

- `owner` / `super_admin`: 可跨店管理 storefront；可透過 query `store_id` 指定門店。
- `store_manager` / `store_editor`: 僅能管理自己綁定的 `store_id`。
- `manager`（現行角色）目前視同 store-scoped manager，只能管理自己綁定的 `store_id`。
- `agent`: 不可使用 storefront admin APIs（回 `403 ROLE_NOT_ALLOWED`）。
- 所有 admin endpoints 皆需：
  - Bearer token
  - `x-organization-id`
  - `requireAuth` 驗證

## Enums

- `service_type`: `buy | sell | rental | management | consultation`
- `purpose`: `sale | rental | management`
- `publication_type`: `featured | normal`
- `theme_key` (canonical): `franchise_green_red | franchise_yellow_red | franchise_yellow_black | franchise_blue_white | franchise_green_gold | neutral_modern_ivory | neutral_warm_teak | neutral_urban_sage | neutral_luxury_black_gold | neutral_trust_indigo`
- `theme_key` (legacy accepted): `tw_classic_green | tw_bright_green | global_orange_white | jp_fresh_green | jp_deep_blue_gray | luxury_black_gold | warm_wood | modern_cream | urban_gray_green | trust_blue`
- `lead_source_type`: `qr | agent_page | store_contact | property_inquiry | direct`
- `lead_status`: `new | contacted | qualified | closed | lost`

## StorefrontTheme DTO

- `theme_key: string`
- `theme_overrides: object`（永遠回 object，不回 null）
- default rule: `theme_key` default = `franchise_green_red`
- fallback rule: 前端若收到未知 `theme_key`，應 fallback 到 `franchise_green_red`

---

## 1) GET /api/admin/storefront/profile

用途：
- 讀取目前 scope 的 store profile（後台可編輯欄位）。
- preview link canonical rule: `/store/{slug}`（不要硬編固定 slug）。

canonical editable fields:
- `name`
- `city`
- `district`
- `service_area_text`
- `tagline`
- `introduction`
- `phone`
- `email`
- `address`
- `line_url`
- `business_hours`
- `logo_url`
- `cover_image_url`
- `is_active`
- `theme_key`
- `theme_overrides`

theme_overrides 編輯範圍（Phase G3）:
- 目前開放 `object`（若傳 `null`，後端會正規化為 `{}`）。
- 後端暫不做 key-level schema 驗證（由前端 preset UI 控制可寫 key）。

sample success:

```json
{
  "data": {
    "id": "71000000-0000-4000-8000-000000000001",
    "slug": "xinyi-store",
    "name": "星澄地所台北信義店",
    "city": "台北市",
    "district": "信義區",
    "service_area_text": "信義區 / 大安區 / 松山區",
    "tagline": "安心買賣・託租代管",
    "introduction": "在地門店團隊介紹",
    "phone": "02-2722-0001",
    "email": "xinyi-store@hoshisumi.test",
    "address": "台北市信義區松壽路 18 號",
    "line_url": "https://line.me/ti/p/xinyi-store",
    "business_hours": "Mon-Sun 10:00-19:00",
    "logo_url": "https://img.hoshisumi.test/storefront/xinyi-logo.png",
    "cover_image_url": "https://img.hoshisumi.test/storefront/xinyi-cover.jpg",
    "theme_key": "franchise_green_red",
    "theme_overrides": {},
    "is_active": true,
    "updated_at": "2026-03-27T12:00:00.000Z"
  },
  "error": null,
  "meta": {
    "store_scope": {
      "store_id": "71000000-0000-4000-8000-000000000001",
      "mode": "store_scoped"
    }
  }
}
```

sample empty:
- N/A（單一 profile endpoint）

sample error:

```json
{
  "data": null,
  "error": {
    "code": "ROLE_NOT_ALLOWED",
    "message": "Current role cannot manage storefront admin APIs.",
    "details": null
  },
  "meta": null
}
```

---

## 2) PATCH /api/admin/storefront/profile

用途：
- 更新目前 scope store 的 profile。

canonical editable fields:
- 同 `GET /profile` 上述欄位。

theme 欄位權限:
- `theme_key/theme_overrides` 僅 `owner/super_admin` 可更新。
- `manager/store_manager/store_editor` 可更新其他 profile 欄位，但不能更新 theme。

sample success:

```json
{
  "data": {
    "id": "71000000-0000-4000-8000-000000000001",
    "slug": "xinyi-store",
    "name": "星澄地所台北信義旗艦店",
    "city": "台北市",
    "district": "信義區",
    "service_area_text": "信義區 / 大安區",
    "tagline": "台北買賣託租代管",
    "introduction": "updated",
    "phone": "02-2722-0009",
    "email": "xinyi-store@hoshisumi.test",
    "address": "台北市信義區松壽路 18 號",
    "line_url": "https://line.me/ti/p/xinyi-store",
    "business_hours": "Mon-Sun 10:00-19:00",
    "logo_url": "https://img.hoshisumi.test/storefront/xinyi-logo.png",
    "cover_image_url": "https://img.hoshisumi.test/storefront/xinyi-cover.jpg",
    "theme_key": "neutral_trust_indigo",
    "theme_overrides": {
      "hero_overlay_opacity": 0.34
    },
    "is_active": true,
    "updated_at": "2026-03-27T12:30:00.000Z"
  },
  "error": null,
  "meta": {
    "store_scope": {
      "store_id": "71000000-0000-4000-8000-000000000001",
      "mode": "store_scoped"
    }
  }
}
```

sample empty:
- N/A（mutation endpoint）

---

## 11) GET /api/admin/storefront/overview

用途：
- 取得 storefront overview metrics（Lead Counter + 最近詢問預覽）。

canonical metrics fields:
- `today_leads_count`
- `week_leads_count`
- `new_leads_count`
- `contacted_leads_count`
- `qualified_leads_count`

additional fields:
- `source_type_breakdown[]`: `{ source_type, count }`
- `recent_leads_preview[]`:
  - `id`
  - `customer_name`
  - `source_type`
  - `status`
  - `created_at`
  - `agent_id`
  - `agent_name`
  - `property_id`
  - `property_title`

store scope:
- `owner/super_admin`: 可跨店（可用 query `store_id` 指定目標店）。
- `manager/store_manager/store_editor`: 僅可取自己 `store_id`。
- `agent`: 不可使用（`ROLE_NOT_ALLOWED`）。

sample success:

```json
{
  "data": {
    "today_leads_count": 3,
    "week_leads_count": 11,
    "new_leads_count": 5,
    "contacted_leads_count": 4,
    "qualified_leads_count": 1,
    "source_type_breakdown": [
      { "source_type": "qr", "count": 1 },
      { "source_type": "agent_page", "count": 4 },
      { "source_type": "store_contact", "count": 3 },
      { "source_type": "property_inquiry", "count": 2 },
      { "source_type": "direct", "count": 1 }
    ],
    "recent_leads_preview": [
      {
        "id": "lead-uuid-1",
        "customer_name": "王小明",
        "source_type": "agent_page",
        "status": "new",
        "created_at": "2026-03-27T10:30:00.000Z",
        "agent_id": "44444444-4444-4444-8444-444444444444",
        "agent_name": "王店長",
        "property_id": "a1111111-1111-4111-8111-111111111111",
        "property_title": "東京港區赤坂投資套房"
      }
    ]
  },
  "error": null,
  "meta": {
    "store_scope": {
      "store_id": "71000000-0000-4000-8000-000000000001",
      "mode": "store_scoped"
    },
    "period_anchor": {
      "day_start_utc": "2026-03-27T00:00:00.000Z",
      "week_start_utc": "2026-03-23T00:00:00.000Z"
    }
  }
}
```

sample empty:
- `source_type_breakdown` 固定回 5 個 source_type 並 `count=0`。
- `recent_leads_preview` 回 `[]`。

sample error:

```json
{
  "data": null,
  "error": {
    "code": "STOREFRONT_OVERVIEW_FETCH_FAILED",
    "message": "Failed to fetch storefront overview metrics.",
    "details": null
  },
  "meta": null
}
```

sample error:

```json
{
  "data": null,
  "error": {
    "code": "UNSUPPORTED_FIELDS",
    "message": "Request includes unsupported profile fields.",
    "details": {
      "unsupported_fields": ["organization_id"]
    }
  },
  "meta": null
}
```

---

## 3) GET /api/admin/storefront/services

用途：
- 列出目前 scope store 的服務設定。

canonical editable fields:
- `service_type`
- `title`
- `description`
- `is_enabled`
- `sort_order`

sample success:

```json
{
  "data": [
    {
      "id": "71200000-0000-4000-8000-000000000001",
      "store_id": "71000000-0000-4000-8000-000000000001",
      "service_type": "buy",
      "title": "買賣與代管整合服務",
      "description": "單店一站完成買賣、託租、代管流程。",
      "is_enabled": true,
      "sort_order": 0,
      "created_at": "2026-03-27T12:00:00.000Z",
      "updated_at": "2026-03-27T12:00:00.000Z"
    }
  ],
  "error": null,
  "meta": {
    "store_scope": {
      "store_id": "71000000-0000-4000-8000-000000000001",
      "mode": "store_scoped"
    }
  }
}
```

sample empty:

```json
{
  "data": [],
  "error": null,
  "meta": {
    "store_scope": {
      "store_id": "71000000-0000-4000-8000-000000000001",
      "mode": "store_scoped"
    }
  }
}
```

sample error:

```json
{
  "data": null,
  "error": {
    "code": "STOREFRONT_SERVICES_FETCH_FAILED",
    "message": "Failed to fetch storefront services.",
    "details": null
  },
  "meta": null
}
```

---

## 4) POST /api/admin/storefront/services

用途：
- 新增一筆 store service。

canonical editable fields:
- `service_type`
- `title`
- `description`
- `is_enabled`
- `sort_order`

sample success:

```json
{
  "data": {
    "id": "new-service-uuid",
    "store_id": "71000000-0000-4000-8000-000000000001",
    "service_type": "consultation",
    "title": "置產顧問諮詢",
    "description": "跨境置產與租賃策略",
    "is_enabled": true,
    "sort_order": 3,
    "created_at": "2026-03-27T12:35:00.000Z",
    "updated_at": "2026-03-27T12:35:00.000Z"
  },
  "error": null,
  "meta": {
    "store_scope": {
      "store_id": "71000000-0000-4000-8000-000000000001",
      "mode": "store_scoped"
    }
  }
}
```

sample empty:
- N/A（mutation endpoint）

sample error:

```json
{
  "data": null,
  "error": {
    "code": "STOREFRONT_SERVICE_CREATE_FAILED",
    "message": "Failed to create storefront service.",
    "details": null
  },
  "meta": null
}
```

---

## 5) PATCH /api/admin/storefront/services/:id

用途：
- 更新單筆 store service。

canonical editable fields:
- 同 `POST /services`。

sample success:

```json
{
  "data": {
    "id": "71200000-0000-4000-8000-000000000001",
    "store_id": "71000000-0000-4000-8000-000000000001",
    "service_type": "buy",
    "title": "買賣與代管整合服務",
    "description": "單店一站完成買賣、託租、代管流程。",
    "is_enabled": true,
    "sort_order": 0,
    "created_at": "2026-03-27T12:00:00.000Z",
    "updated_at": "2026-03-27T12:10:00.000Z"
  },
  "error": null,
  "meta": {
    "store_scope": {
      "store_id": "71000000-0000-4000-8000-000000000001",
      "mode": "store_scoped"
    }
  }
}
```

sample empty:
- N/A（mutation endpoint）

sample error:

```json
{
  "data": null,
  "error": {
    "code": "INVALID_SERVICE_TYPE",
    "message": "service_type must be buy/sell/rental/management/consultation.",
    "details": null
  },
  "meta": null
}
```

---

## 6) GET /api/admin/storefront/properties

用途：
- 列出 store 公開物件設定（publication settings）與物件摘要。
- 注意：此 API 回傳的是 storefront publication 管理資料，不是 property 主資料編輯 API。

canonical editable fields:
- `property_id`
- `purpose`
- `publication_type`
- `is_public`
- `display_order`
- `published_at`
- `unpublished_at`

sample success:

```json
{
  "data": [
    {
      "id": "71300000-0000-4000-8000-000000000001",
      "store_id": "71000000-0000-4000-8000-000000000001",
      "publication": {
        "property_id": "a1111111-1111-4111-8111-111111111111",
        "purpose": "rental",
        "publication_type": "featured",
        "is_public": true,
        "display_order": 2,
        "published_at": "2026-03-20T00:00:00.000Z",
        "unpublished_at": null
      },
      "property_summary": {
        "id": "a1111111-1111-4111-8111-111111111111",
        "title": "東京港區赤坂投資套房",
        "country": "jp",
        "price": "46800000.00",
        "current_stage": "rental_listing",
        "status": "available"
      },
      "created_at": "2026-03-27T12:00:00.000Z",
      "updated_at": "2026-03-27T12:00:00.000Z"
    }
  ],
  "error": null,
  "meta": {
    "store_scope": {
      "store_id": "71000000-0000-4000-8000-000000000001",
      "mode": "store_scoped"
    }
  }
}
```

sample empty:

```json
{
  "data": [],
  "error": null,
  "meta": {
    "store_scope": {
      "store_id": "71000000-0000-4000-8000-000000000001",
      "mode": "store_scoped"
    }
  }
}
```

sample error:

```json
{
  "data": null,
  "error": {
    "code": "STOREFRONT_PUBLICATIONS_FETCH_FAILED",
    "message": "Failed to fetch storefront property publications.",
    "details": null
  },
  "meta": null
}
```

---

## 7) POST /api/admin/storefront/properties

用途：
- 建立或 upsert store 物件公開設定（依 `store_id + property_id + purpose`）。

canonical editable fields:
- 同 `GET /properties` 上述欄位。

sample error:

```json
{
  "data": null,
  "error": {
    "code": "INVALID_PROPERTY_ID",
    "message": "property_id must belong to current organization.",
    "details": null
  },
  "meta": null
}
```

sample success:

```json
{
  "data": {
    "id": "71300000-0000-4000-8000-000000000001",
    "store_id": "71000000-0000-4000-8000-000000000001",
    "publication": {
      "property_id": "a1111111-1111-4111-8111-111111111111",
      "purpose": "rental",
      "publication_type": "featured",
      "is_public": true,
      "display_order": 2,
      "published_at": "2026-03-20T00:00:00.000Z",
      "unpublished_at": null
    },
    "property_summary": {
      "id": "a1111111-1111-4111-8111-111111111111",
      "title": "東京港區赤坂投資套房",
      "country": "jp",
      "price": "46800000.00",
      "current_stage": "rental_listing",
      "status": "available"
    },
    "created_at": "2026-03-27T12:00:00.000Z",
    "updated_at": "2026-03-27T12:15:00.000Z"
  },
  "error": null,
  "meta": {
    "store_scope": {
      "store_id": "71000000-0000-4000-8000-000000000001",
      "mode": "store_scoped"
    }
  }
}
```

sample empty:
- N/A（mutation endpoint）

---

## 8) PATCH /api/admin/storefront/properties/:id

用途：
- 更新單筆 publication 設定。

canonical editable fields:
- 同 `POST /properties`。

sample success:

```json
{
  "data": {
    "id": "71300000-0000-4000-8000-000000000001",
    "store_id": "71000000-0000-4000-8000-000000000001",
    "publication": {
      "property_id": "a1111111-1111-4111-8111-111111111111",
      "purpose": "management",
      "publication_type": "normal",
      "is_public": false,
      "display_order": 4,
      "published_at": "2026-03-20T00:00:00.000Z",
      "unpublished_at": "2026-04-20T00:00:00.000Z"
    },
    "property_summary": {
      "id": "a1111111-1111-4111-8111-111111111111",
      "title": "東京港區赤坂投資套房",
      "country": "jp",
      "price": "46800000.00",
      "current_stage": "rental_listing",
      "status": "available"
    },
    "created_at": "2026-03-27T12:00:00.000Z",
    "updated_at": "2026-03-27T12:20:00.000Z"
  },
  "error": null,
  "meta": {
    "store_scope": {
      "store_id": "71000000-0000-4000-8000-000000000001",
      "mode": "store_scoped"
    }
  }
}
```

sample empty:
- N/A（mutation endpoint）

sample error:

```json
{
  "data": null,
  "error": {
    "code": "STOREFRONT_PUBLICATION_UPDATE_FAILED",
    "message": "Failed to update storefront publication.",
    "details": null
  },
  "meta": null
}
```

---

## 9) GET /api/admin/storefront/agents

用途：
- 列出 store scope 內可管理之 agent 公開 profile。

canonical editable fields:
- `slug`
- `bio`
- `service_area`
- `avatar_url`
- `phone_public`
- `line_url`
- `is_public`
- `is_active`

sample success:

```json
{
  "data": [
    {
      "id": "44444444-4444-4444-8444-444444444444",
      "store_id": "71000000-0000-4000-8000-000000000001",
      "name": "王店長",
      "role": "manager",
      "slug": "senior-jp-advisor",
      "bio": "專注日本投資與收租型物件，熟悉跨境流程。",
      "service_area": "信義區 / 日本東京都心",
      "avatar_url": "https://img.hoshisumi.test/agents/senior-jp-advisor.jpg",
      "phone_public": "0900-200-001",
      "line_url": "https://line.me/ti/p/senior-jp-advisor",
      "is_public": true,
      "is_active": true,
      "created_at": "2026-03-26T00:00:00.000Z",
      "updated_at": "2026-03-27T12:00:00.000Z"
    }
  ],
  "error": null,
  "meta": {
    "store_scope": {
      "store_id": "71000000-0000-4000-8000-000000000001",
      "mode": "store_scoped"
    }
  }
}
```

sample empty:

```json
{
  "data": [],
  "error": null,
  "meta": {
    "store_scope": {
      "store_id": "71000000-0000-4000-8000-000000000001",
      "mode": "store_scoped"
    }
  }
}
```

sample error:

```json
{
  "data": null,
  "error": {
    "code": "STOREFRONT_AGENTS_FETCH_FAILED",
    "message": "Failed to fetch storefront agents.",
    "details": null
  },
  "meta": null
}
```

---

## 10) PATCH /api/admin/storefront/agents/:id

用途：
- 更新單一 agent 的 public profile 欄位。

canonical editable fields:
- 同 `GET /agents` 的 editable fields。

sample error:

```json
{
  "data": null,
  "error": {
    "code": "INVALID_AGENT_SLUG",
    "message": "slug must match ^[a-z0-9]+(?:-[a-z0-9]+)*$ or null.",
    "details": null
  },
  "meta": null
}
```

sample success:

```json
{
  "data": {
    "id": "44444444-4444-4444-8444-444444444444",
    "store_id": "71000000-0000-4000-8000-000000000001",
    "name": "王店長",
    "role": "manager",
    "slug": "senior-jp-advisor",
    "bio": "更新後簡介",
    "service_area": "信義區 / 大安區 / 日本東京都心",
    "avatar_url": "https://img.hoshisumi.test/agents/senior-jp-advisor.jpg",
    "phone_public": "0900-200-001",
    "line_url": "https://line.me/ti/p/senior-jp-advisor",
    "is_public": true,
    "is_active": true,
    "created_at": "2026-03-26T00:00:00.000Z",
    "updated_at": "2026-03-27T12:40:00.000Z"
  },
  "error": null,
  "meta": {
    "store_scope": {
      "store_id": "71000000-0000-4000-8000-000000000001",
      "mode": "store_scoped"
    }
  }
}
```

sample empty:
- N/A（mutation endpoint）
