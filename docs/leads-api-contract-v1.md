# Leads API Contract v1.1 (Phase 4.3B)

本文件定義 Phase 4.3A/4.3B 的 lead capture 與 Lead Inbox（基礎 CRM v1）契約。

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

## Enums

- `source_type`: `qr | agent_page | store_contact | property_inquiry | direct`
- `status`: `new | contacted | qualified | closed | lost`
- `preferred_contact_method`: `phone | email | line`

## Lead Event Types

- `lead_created`
- `lead_status_changed`
- `lead_note_updated`

## Attribution Rules

`POST /api/storefront/:storeSlug/leads` 流程：

1. 以 `storeSlug` 解析 active store（不存在回 `STOREFRONT_NOT_FOUND`）。
2. 若有 `agent_slug`，必須屬於該 store 且 `is_active=true`、`is_public=true`，才會綁定 `agent_id`。
3. 若有 `property_id`，必須存在該 store 的 `store_property_publications` 且 `is_public=true`。
4. lead 會寫入 attribution 欄位：`store_id/organization_id/agent_id/property_id/source_*`。
5. 建立後寫入 `lead_events` 一筆 `lead_created`。

---

## 1) POST /api/storefront/:storeSlug/leads

用途：
- storefront contact / agent landing 提交詢問。

payload:
- `agent_slug` optional
- `property_id` optional
- `source_type` required
- `source_code` optional
- `customer_name` required
- `phone` optional
- `email` optional
- `line_id` optional
- `preferred_contact_method` optional
- `inquiry_message` optional

validation:
- `source_type` 必須在 enum。
- `customer_name` 必填。
- `phone/email/line_id` 至少一個。
- `preferred_contact_method` 若提供必須在 enum。

sample success:

```json
{
  "data": {
    "id": "lead-uuid",
    "store_id": "71000000-0000-4000-8000-000000000001",
    "agent_id": "44444444-4444-4444-8444-444444444444",
    "property_id": "a1111111-1111-4111-8111-111111111111",
    "source_type": "agent_page",
    "status": "new",
    "created_at": "2026-03-27T13:30:00.000Z"
  },
  "error": null,
  "meta": null
}
```

sample empty:
- N/A（create endpoint）

sample error:

```json
{
  "data": null,
  "error": {
    "code": "INVALID_AGENT_SLUG",
    "message": "agent_slug must belong to a public active agent in current store.",
    "details": null
  },
  "meta": null
}
```

---

## 2) GET /api/admin/leads

用途：
- Lead Inbox 列表（最小篩選）。

query:
- `status` optional
- `agent_id` optional
- `source_type` optional
- `page` optional
- `limit` optional

store scope:
- `owner/super_admin`: 跨店（同 organization）。
- `store_manager/store_editor/manager`: 限自己 `store_id`。
- `agent`: 不開放（回 `ROLE_NOT_ALLOWED`）。

response fields（每筆）:
- `id`
- `customer_name`
- `phone`
- `email`
- `inquiry_message`
- `preferred_contact_method`
- `property_id`
- `property_title`
- `source_agent_slug`
- `source_store_slug`
- `source_type`
- `status`
- `created_at`
- `store_id`
- `agent_id`
- `agent_name`
- `store_name`

sample success:

```json
{
  "data": [
    {
      "id": "lead-uuid",
      "customer_name": "王小明",
      "phone": "0912-000-123",
      "email": "demo@example.com",
      "inquiry_message": "想了解日本出租投報與代管細節。",
      "preferred_contact_method": "phone",
      "property_id": "a1111111-1111-4111-8111-111111111111",
      "property_title": "東京港區赤坂投資套房",
      "source_agent_slug": "senior-jp-advisor",
      "source_store_slug": "xinyi-store",
      "source_type": "agent_page",
      "status": "new",
      "created_at": "2026-03-27T13:30:00.000Z",
      "store_id": "71000000-0000-4000-8000-000000000001",
      "agent_id": "44444444-4444-4444-8444-444444444444",
      "agent_name": "王店長",
      "store_name": "星澄地所台北信義店"
    }
  ],
  "error": null,
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 1,
    "total_pages": 1,
    "scope_mode": "store_scoped",
    "scope_store_id": "71000000-0000-4000-8000-000000000001"
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
    "total_pages": 0,
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
    "code": "ROLE_NOT_ALLOWED",
    "message": "Current role cannot access admin leads.",
    "details": null
  },
  "meta": null
}
```

---

## 3) GET /api/admin/leads/:id

用途：
- 讀取單筆 lead detail（canonical detail DTO）。

canonical detail DTO:
- `id`
- `customer_name`
- `phone`
- `email`
- `line_id`
- `preferred_contact_method`
- `inquiry_message`
- `source_type`
- `source_code`
- `source_store_slug`
- `source_agent_slug`
- `status`
- `notes`
- `created_at`
- `updated_at`
- `store_id`
- `store_name`
- `store_slug`
- `agent_id`
- `agent_name`
- `agent_slug`
- `property_id`
- `property_title`
- `property_country`
- `property_status`
- `property_current_stage`

sample success:

```json
{
  "data": {
    "id": "lead-uuid",
    "customer_name": "王小明",
    "phone": "0912-000-123",
    "email": "lead1@example.com",
    "line_id": null,
    "preferred_contact_method": "phone",
    "inquiry_message": "想了解日本出租投報與代管細節。",
    "source_type": "agent_page",
    "source_code": "qr-xinyi-agent-001",
    "source_store_slug": "xinyi-store",
    "source_agent_slug": "senior-jp-advisor",
    "status": "new",
    "notes": null,
    "created_at": "2026-03-24T12:00:00.000Z",
    "updated_at": "2026-03-24T12:00:00.000Z",
    "store_id": "71000000-0000-4000-8000-000000000001",
    "store_name": "星澄地所台北信義店",
    "store_slug": "xinyi-store",
    "agent_id": "44444444-4444-4444-8444-444444444444",
    "agent_name": "王店長",
    "agent_slug": "senior-jp-advisor",
    "property_id": "a1111111-1111-4111-8111-111111111111",
    "property_title": "東京港區赤坂投資套房",
    "property_country": "jp",
    "property_status": "available",
    "property_current_stage": "rental_listing"
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
    "code": "ADMIN_LEAD_NOT_FOUND",
    "message": "Lead not found in current scope.",
    "details": null
  },
  "meta": null
}
```

---

## 4) PATCH /api/admin/leads/:id

用途：
- 更新單筆 lead 基礎 CRM 欄位（v1）。

editable fields:
- `status`
- `notes`

event write rules:
- `status` 變更：寫入 `lead_events(event_type='lead_status_changed')`
- `notes` 變更：寫入 `lead_events(event_type='lead_note_updated')`
- 若兩者都改，寫兩筆 events。

sample success:

```json
{
  "data": {
    "id": "lead-uuid",
    "customer_name": "王小明",
    "phone": "0912-000-123",
    "email": "lead1@example.com",
    "line_id": null,
    "preferred_contact_method": "phone",
    "inquiry_message": "想了解日本出租投報與代管細節。",
    "source_type": "agent_page",
    "source_code": "qr-xinyi-agent-001",
    "source_store_slug": "xinyi-store",
    "source_agent_slug": "senior-jp-advisor",
    "status": "contacted",
    "notes": "已電話聯繫，週末安排看屋。",
    "created_at": "2026-03-24T12:00:00.000Z",
    "updated_at": "2026-03-27T14:00:00.000Z",
    "store_id": "71000000-0000-4000-8000-000000000001",
    "store_name": "星澄地所台北信義店",
    "store_slug": "xinyi-store",
    "agent_id": "44444444-4444-4444-8444-444444444444",
    "agent_name": "王店長",
    "agent_slug": "senior-jp-advisor",
    "property_id": "a1111111-1111-4111-8111-111111111111",
    "property_title": "東京港區赤坂投資套房",
    "property_country": "jp",
    "property_status": "available",
    "property_current_stage": "rental_listing"
  },
  "error": null,
  "meta": null
}
```

sample empty:
- N/A（mutation endpoint）

sample error:

```json
{
  "data": null,
  "error": {
    "code": "UNSUPPORTED_FIELDS",
    "message": "Request includes unsupported lead fields.",
    "details": {
      "unsupported_fields": ["customer_name"],
      "editable_fields": ["status", "notes"]
    }
  },
  "meta": null
}
```
