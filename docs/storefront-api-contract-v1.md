# Storefront API Contract v1.1 (Phase 4.1)

本文件定義 Storefront 公開 API 的「正式公開欄位」與「不公開邊界」，供前端安全接線。

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

## Public DTO (Canonical)

### store public DTO
- `id`
- `name`
- `slug`
- `theme_key`
- `theme_overrides`
- `city`
- `district`
- `tagline`
- `introduction`
- `phone`
- `address`
- `line_url`
- `business_hours`
- `cover_image_url`
- `logo_url`

### property public DTO
- `id`
- `title`
- `purpose`
- `district`
- `price`
- `cover_image_url`
- `current_stage`
- `status`
- `display_stage`
- `is_featured`

### agent public DTO
- `id`
- `name`
- `slug`
- `bio`
- `service_area`
- `avatar_url`
- `phone_public`
- `line_url`

## Enums

- `purpose`: `sale | rental | management`
- `service_type`: `buy | sell | rental | management | consultation`
- `theme_key` (canonical): `franchise_green_red | franchise_yellow_red | franchise_yellow_black | franchise_blue_white | franchise_green_gold | neutral_modern_ivory | neutral_warm_teak | neutral_urban_sage | neutral_luxury_black_gold | neutral_trust_indigo`
- `theme_key` (legacy accepted): `tw_classic_green | tw_bright_green | global_orange_white | jp_fresh_green | jp_deep_blue_gray | luxury_black_gold | warm_wood | modern_cream | urban_gray_green | trust_blue`
- `theme_overrides`: object（預設 `{}`）
- frontend fallback theme: `franchise_green_red`
- `display_stage` canonical rule: `current_stage ?? status`

---

## 1) GET /api/storefront/:storeSlug

用途：
- 取得門店首頁聚合資料（store + services + featured_properties + public_agents）

canonical field：
- `store.slug`

### 正式公開欄位
- `data.store`: store public DTO
- `data.services[]`:  
  - `id, service_type, buy, sell, rental, management, consultation, title, description, sort_order`
- `data.featured_properties[]`: property public DTO
- `data.public_agents[]`: agent public DTO

### 明確不公開欄位
- `organization_id`
- `owner_agent_id`
- `partner_id`
- `source`
- `raw_source_files_count`
- 任何 consent / internal assignment / token 欄位

### sample success
```json
{
  "data": {
    "store": {
      "id": "store-uuid",
      "name": "星澄地所台北信義店",
      "slug": "xinyi-store",
      "theme_key": "franchise_green_red",
      "theme_overrides": {},
      "city": "台北市",
      "district": "信義區",
      "tagline": "安心買賣・託租代管",
      "introduction": "門店介紹",
      "phone": "02-1234-5678",
      "address": "台北市信義區...",
      "line_url": "https://line.me/ti/p/...",
      "business_hours": "Mon-Sun 10:00-19:00",
      "cover_image_url": "https://cdn.example.com/store-cover.jpg",
      "logo_url": "https://cdn.example.com/store-logo.png"
    },
    "services": [],
    "featured_properties": [],
    "public_agents": []
  },
  "error": null,
  "meta": null
}
```

### sample empty
```json
{
  "data": {
    "store": {
      "id": "store-uuid",
      "name": "星澄地所台北信義店",
      "slug": "xinyi-store",
      "theme_key": "franchise_green_red",
      "theme_overrides": {},
      "city": "台北市",
      "district": "信義區",
      "tagline": "安心買賣・託租代管",
      "introduction": "門店介紹",
      "phone": "02-1234-5678",
      "address": "台北市信義區...",
      "line_url": "https://line.me/ti/p/...",
      "business_hours": "Mon-Sun 10:00-19:00",
      "cover_image_url": "https://cdn.example.com/store-cover.jpg",
      "logo_url": "https://cdn.example.com/store-logo.png"
    },
    "services": [],
    "featured_properties": [],
    "public_agents": []
  },
  "error": null,
  "meta": null
}
```

### sample error
```json
{
  "data": null,
  "error": {
    "code": "STOREFRONT_NOT_FOUND",
    "message": "Storefront not found.",
    "details": null
  },
  "meta": null
}
```

---

## 2) GET /api/storefront/:storeSlug/properties

用途：
- 取得指定門店公開物件列表（非全站搜尋）

query：
- `purpose=sale|rental|management`
- `district=<text>`
- `limit=<int>`
- `page=<int>`

canonical field：
- `display_stage`

### 正式公開欄位
- `data[]`: property public DTO
- `meta`: `page, limit, total, total_pages`

### 明確不公開欄位
- `organization_id`
- `source`
- `source_type`
- `owner_agent_id`
- `partner_id`
- `images` 原始全集（僅回 `cover_image_url`）

### sample success
```json
{
  "data": [
    {
      "id": "property-uuid",
      "title": "東京港區赤坂投資套房",
      "purpose": "rental",
      "district": "信義區",
      "price": "46800000.00",
      "cover_image_url": "https://img.example.com/cover.jpg",
      "current_stage": "rental_listing",
      "status": "available",
      "display_stage": "rental_listing",
      "is_featured": true
    }
  ],
  "error": null,
  "meta": {
    "page": 1,
    "limit": 12,
    "total": 1,
    "total_pages": 1
  }
}
```

### sample empty
```json
{
  "data": [],
  "error": null,
  "meta": {
    "page": 1,
    "limit": 12,
    "total": 0,
    "total_pages": 0
  }
}
```

### sample error
```json
{
  "data": null,
  "error": {
    "code": "INVALID_PURPOSE",
    "message": "purpose must be sale/rental/management when provided.",
    "details": null
  },
  "meta": null
}
```

---

## 3) GET /api/storefront/:storeSlug/services

用途：
- 取得門店啟用服務

canonical field：
- `sort_order`

### 正式公開欄位
- `data[]`: `id, service_type, buy, sell, rental, management, consultation, title, description, sort_order`

### 明確不公開欄位
- `store_id`
- `is_enabled`
- `created_at`, `updated_at`

### sample success
```json
{
  "data": [
    {
      "id": "service-uuid",
      "service_type": "consultation",
      "buy": true,
      "sell": true,
      "rental": true,
      "management": true,
      "consultation": true,
      "title": "買賣與代管整合服務",
      "description": "一站式門店服務",
      "sort_order": 0
    }
  ],
  "error": null,
  "meta": null
}
```

### sample empty
```json
{
  "data": [],
  "error": null,
  "meta": null
}
```

### sample error
```json
{
  "data": null,
  "error": {
    "code": "STOREFRONT_NOT_FOUND",
    "message": "Storefront not found.",
    "details": null
  },
  "meta": null
}
```

---

## 4) GET /api/storefront/:storeSlug/agents

用途：
- 取得門店公開營業員列表

canonical field：
- `slug`

### 正式公開欄位
- `data[]`: agent public DTO

### 明確不公開欄位
- `organization_id`
- `role`
- `is_public`
- `is_active`
- 任一後台權限判斷欄位

### sample success
```json
{
  "data": [
    {
      "id": "agent-uuid",
      "name": "王店長",
      "slug": "wang-manager",
      "bio": "專營台北市住宅物件",
      "service_area": "信義區/大安區",
      "avatar_url": "https://cdn.example.com/a1.jpg",
      "phone_public": "0912-345-678",
      "line_url": "https://line.me/ti/p/..."
    }
  ],
  "error": null,
  "meta": null
}
```

### sample empty
```json
{
  "data": [],
  "error": null,
  "meta": null
}
```

### sample error
```json
{
  "data": null,
  "error": {
    "code": "STOREFRONT_NOT_FOUND",
    "message": "Storefront not found.",
    "details": null
  },
  "meta": null
}
```

---

## 5) GET /api/storefront/:storeSlug/agents/:agentSlug

用途：
- 取得單一營業員公開頁資料（含公開推薦物件）

canonical field：
- `agent.slug`

### 正式公開欄位
- `data.agent`: agent public DTO
- `data.published_properties[]`: property public DTO

### 明確不公開欄位
- `organization_id`
- `role`
- `is_public`
- `is_active`
- 任一後台管理欄位

### sample success
```json
{
  "data": {
    "agent": {
      "id": "agent-uuid",
      "name": "王店長",
      "slug": "wang-manager",
      "bio": "專營台北市住宅物件",
      "service_area": "信義區/大安區",
      "avatar_url": "https://cdn.example.com/a1.jpg",
      "phone_public": "0912-345-678",
      "line_url": "https://line.me/ti/p/..."
    },
    "published_properties": []
  },
  "error": null,
  "meta": null
}
```

### sample empty
```json
{
  "data": {
    "agent": {
      "id": "agent-uuid",
      "name": "王店長",
      "slug": "wang-manager",
      "bio": "專營台北市住宅物件",
      "service_area": "信義區/大安區",
      "avatar_url": "https://cdn.example.com/a1.jpg",
      "phone_public": "0912-345-678",
      "line_url": "https://line.me/ti/p/..."
    },
    "published_properties": []
  },
  "error": null,
  "meta": null
}
```

### sample error
```json
{
  "data": null,
  "error": {
    "code": "STOREFRONT_AGENT_NOT_FOUND",
    "message": "Storefront agent not found.",
    "details": null
  },
  "meta": null
}
```
