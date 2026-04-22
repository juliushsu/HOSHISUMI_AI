# 星澄地所 HOSHISUMI API Contract (Phase 3B 固化)

本文件只定義前端需要的欄位語意與 enum，避免猜欄位。

## Canonical Envelope
所有 API 一律回傳：

```json
{
  "data": {},
  "error": null,
  "meta": null
}
```

錯誤時：

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

## 1) GET /api/rental

- canonical stage grouping field: `listing_status`
- `listing_status` enum（正式）:
  - `draft`
  - `listed`
  - `showing`
  - `negotiating`
  - `rented`
- 目前資料庫 check constraint 與 route validation 均固定為上述 5 種值。
- 若未來要擴 enum，需由 migration + route validation 一起調整後才會出現。

### Sample Response
```json
{
  "data": [
    {
      "id": "d1111111-1111-4111-8111-111111111111",
      "property_id": "a1111111-1111-4111-8111-111111111111",
      "property_title": "東京港區赤坂投資套房",
      "listing_status": "listed",
      "expected_rent": 118000,
      "actual_rent": null,
      "available_from": "2026-04-10",
      "owner_client_id": "c1111111-1111-4111-8111-111111111111",
      "owner_client_name": "高橋一郎",
      "current_stage": "rental_listing",
      "source_partner": "world_eye",
      "updated_at": "2026-03-27T02:00:00.000Z"
    }
  ],
  "error": null,
  "meta": null
}
```

## 2) GET /api/properties

- `current_stage` 正式用途：
  - 物件 lifecycle stage（買賣 -> 託租 -> 代管）
- `status` 正式用途：
  - sale/listing status（既有買賣流程狀態）
- 顯示優先順序（前端建議）：
  - `current_stage ?? status`
- `country` enum（正式）:
  - `tw`
  - `jp`
- 若未來新增國別，需 DB constraint migration 後才會出現。

### current_stage enum（正式）
- `sale_active`
- `sold`
- `rental_listing`
- `rental_showing`
- `rental_negotiating`
- `rented`
- `under_management`
- `vacancy`
- `resale_ready`

### status enum（正式）
- `available`
- `negotiating`
- `sold`

## 3) GET /api/dashboard/summary

- `recent_activities[]` 升級為 canonical activity DTO（後端直接可讀，不需前端拼句）
- `summary_text` 為後端產生之正式顯示文案
- `recent_activities[]` 欄位：
  - `id`
  - `actor_name`
  - `actor_role`
  - `action_type`
  - `target_type`
  - `target_id`
  - `target_name`
  - `summary_text`
  - `created_at`
  - `priority` (`high` | `medium` | `low`)
  - `requires_attention` (`boolean`)
  - `related_status` (`string | null`)
  - `demo_data_type` (`seed` | `sandbox` | `null`)
- `action_type` enum（目前完整）:
  - `client_created`
  - `property_created`
  - `lead_created`
  - `ai_analysis_completed`
  - `status_updated`
- `meta.feed_source` 固定回 `api`（前端可用於 debug 標記）
- `meta.activity_contract` 固定回 `dashboard_recent_activities_canonical_v2`
- `meta.activity_mix` 提供目前頁面 activity 組成：
  - `seed_count`
  - `sandbox_count`
  - `non_demo_count`

## 4) GET /api/agents

- `recent_activity` 為正式欄位名（每位 agent 的最新活動摘要）

### success with data
```json
{
  "data": [
    {
      "id": "44444444-4444-4444-8444-444444444444",
      "name": "資深業務（日本投資客）",
      "role": "owner",
      "is_active": true,
      "assigned_clients_count": 2,
      "generated_posts_count_this_week": 1,
      "recent_activity": {
        "action_type": "generate_post",
        "tokens_used": 760,
        "occurred_at": "2026-03-26T12:00:00.000Z"
      }
    }
  ],
  "error": null,
  "meta": null
}
```

### success empty
```json
{
  "data": [],
  "error": null,
  "meta": null
}
```

### error
```json
{
  "data": null,
  "error": {
    "code": "AGENTS_FETCH_FAILED",
    "message": "Failed to fetch agents.",
    "details": {
      "supabase_error": "..."
    }
  },
  "meta": null
}
```

## 5) GET /api/management

- `owner_client_name` 為正式欄位
- 型別保證：`string | null`
- 空字串不回傳（會正規化為 `null`）

### Sample Response
```json
{
  "data": [
    {
      "id": "e1111111-1111-4111-8111-111111111111",
      "property_id": "a2222222-2222-4222-8222-222222222222",
      "property_title": "大阪難波商圈收租公寓",
      "status": "active",
      "rent": 132000,
      "rent_due_day": 5,
      "management_fee": 6000,
      "lease_start": "2025-11-27",
      "lease_end": "2026-11-27",
      "tenant_name": "佐藤健一",
      "owner_client_name": "高橋一郎",
      "updated_at": "2026-03-27T02:00:00.000Z"
    }
  ],
  "error": null,
  "meta": null
}
```

## 6) 前端契約摘要

GET /api/rental
- canonical stage field: `listing_status`
- enum: `draft | listed | showing | negotiating | rented`

GET /api/properties
- display stage priority: `current_stage ?? status`
- `current_stage` = lifecycle stage
- `status` = sale/listing status（legacy）
- `country` enum: `tw | jp`

GET /api/dashboard/summary
- `recent_activities[].type` is canonical
- `recent_activities[].action_type` does not exist
- enum: `client_created | property_created | ai_usage`

GET /api/agents
- `recent_activity` is canonical latest activity field
- empty state: `{ data: [], error: null, meta: null }`
- error state: `{ data: null, error: {...}, meta: null }`

GET /api/management
- `owner_client_name: string | null`（empty string normalized to null）
