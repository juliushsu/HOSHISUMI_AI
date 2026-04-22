# 星澄地所 HOSHISUMI API Contract (Phase 2.2)

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

## Auth Boundary
Public routes:
- `GET /api/health`
- `POST /api/leads`

Protected routes（需 `Authorization` + `x-organization-id`）:
- `GET /api/clients`
- `POST /api/clients`
- `PATCH /api/clients/:id`
- `GET /api/properties`
- `POST /api/properties`
- `PATCH /api/properties/:id/assign`
- `GET /api/partners`
- `GET /api/partners/:id`
- `GET /api/intake-queue`
- `GET /api/agents`
- `POST /api/ai/translate-property`
- `POST /api/ai/generate-post`
- `GET /api/dashboard/summary`
- `GET /api/dashboard/demo-feed`

## Public: GET /api/health
### Response
```json
{
  "data": {
    "status": "ok"
  },
  "error": null,
  "meta": null
}
```

## Public: POST /api/leads
### Request
```json
{
  "name": "王小明",
  "company": "星澄科技",
  "phone": "+886-912-345-678",
  "email": "ming@example.com",
  "message": "想了解日本投資物件",
  "source_page": "/lp/jp-invest",
  "language": "zh-TW"
}
```

### Response
```json
{
  "data": {
    "accepted": true
  },
  "error": null,
  "meta": null
}
```

## GET /api/dashboard/summary
### Response
```json
{
  "data": {
    "plan_type": "pro",
    "client_count": 12,
    "property_count": 8,
    "published_property_count": 5,
    "ai_usage_this_month": 3560,
    "ai_usage_limit": 30000,
    "ai_usage_remaining": 26440,
    "recent_activities": [
      {
        "id": "client:uuid",
        "type": "client_created",
        "occurred_at": "2026-03-26T12:00:00.000Z",
        "title": "新客戶：王小明",
        "subtitle": null
      }
    ]
  },
  "error": null,
  "meta": null
}
```

## GET /api/dashboard/demo-feed
Canonical DTO（首頁敘事層）：
- `dashboard_marquee_events_v1`
- `dashboard_recent_activities_v1`
- `dashboard_sales_pipeline_v1`
- `dashboard_management_summary_v1`
- `dashboard_personnel_reminders_v1`

### Response
```json
{
  "data": {
    "dashboard_marquee_events_v1": [
      {
        "id": "mq-001",
        "event_type": "deal_closed",
        "title": "西屯文華路兩房完成簽約",
        "detail_text": "陳怡安協助首購客完成交屋流程。",
        "branch": "台中七期店",
        "occurred_at": "2026-03-30T02:00:00.000Z",
        "relative_time": "今天"
      }
    ],
    "dashboard_recent_activities_v1": [
      {
        "id": "ra-001",
        "actor_name": "陳怡安",
        "actor_role": "資深業務",
        "target_name": "西屯文華路兩房",
        "target_type": "property",
        "action_type": "deal_closed",
        "detail_text": "完成簽約，已建立交屋提醒。",
        "occurred_at": "2026-03-30T03:00:00.000Z",
        "relative_time": "今天",
        "branch": "台中七期店"
      }
    ],
    "dashboard_sales_pipeline_v1": [
      {
        "id": "sp-001",
        "client_name": "佐藤健一",
        "client_segment": "japan_investor",
        "pipeline_stage": "negotiation",
        "assigned_agent": "資深業務（日本投資客）",
        "next_step": "提供兩筆大阪物件試算表",
        "updated_at": "2026-03-30T04:00:00.000Z"
      }
    ],
    "dashboard_management_summary_v1": [
      {
        "id": "mg-001",
        "property_name": "公益路店面",
        "month": "2026-03",
        "income_total": 132000,
        "expense_total": 23800,
        "net_income": 108200,
        "major_expense_category": "設備維修",
        "report_status": "ready"
      }
    ],
    "dashboard_personnel_reminders_v1": [
      {
        "id": "pr-001",
        "employee_name": "林經理",
        "reminder_type": "birthday",
        "effective_date": "2026-04-01T00:00:00.000Z",
        "display_text": "林經理生日將於後天，請安排店內慶生。"
      }
    ]
  },
  "error": null,
  "meta": null
}
```

## GET /api/agents
### Response Item Shape
```json
{
  "id": "agent-uuid",
  "name": "資深業務（日本投資客）",
  "role": "owner",
  "is_active": true,
  "assigned_clients_count": 3,
  "generated_posts_count_this_week": 2,
  "recent_activity": {
    "action_type": "generate_post",
    "tokens_used": 720,
    "occurred_at": "2026-03-26T12:00:00.000Z"
  }
}
```

## GET /api/clients（人員歸屬）
### Response Item Shape
```json
{
  "id": "client-uuid",
  "organization_id": "org-uuid",
  "assigned_agent_id": "agent-uuid",
  "assigned_agent": {
    "id": "agent-uuid",
    "name": "陳業務",
    "role": "agent",
    "is_active": true
  },
  "name": "王小明",
  "phone": "0912345678",
  "line_id": "line_abc",
  "client_type": "investment",
  "consent_property_tw": true,
  "consent_property_jp": false,
  "consent_contact_line": true,
  "consent_contact_phone": true,
  "consent_post_sale_follow": false,
  "unsubscribe_all": false,
  "consent_timestamp": "2026-03-26T12:00:00.000Z",
  "consent_source": "line_form",
  "created_at": "2026-03-26T12:00:00.000Z"
}
```

## POST /api/properties（新增欄位）
### Request 可帶
```json
{
  "title": "東京港區精選物件",
  "description": "交通便利",
  "price": 3880,
  "country": "jp",
  "status": "available",
  "source": "manual",
  "source_type": "japan_line",
  "source_partner": "world_eye",
  "partner_id": "partner-uuid",
  "cross_border_fee_percent": 1.0,
  "intake_status": "ready_to_publish",
  "raw_source_files_count": 5,
  "owner_agent_id": "agent-uuid",
  "images": ["https://cdn.example.com/p1.jpg", "https://cdn.example.com/p2.jpg"],
  "layout_image": "https://cdn.example.com/layout.jpg"
}
```

### 主推業務欄位（GET /api/properties）
```json
{
  "id": "property-uuid",
  "organization_id": "org-uuid",
  "owner_agent_id": "agent-uuid",
  "partner_id": "partner-uuid",
  "partner": {
    "id": "partner-uuid",
    "display_name": "world_eye",
    "status": "active"
  },
  "owner_agent": {
    "id": "agent-uuid",
    "name": "陳業務",
    "role": "agent",
    "is_active": true
  },
  "title": "東京港區精選物件",
  "description": "交通便利",
  "price": "3880.00",
  "country": "jp",
  "status": "available",
  "source": "manual",
  "source_type": "japan_line",
  "source_partner": "world_eye",
  "cross_border_fee_percent": "1.00",
  "intake_status": "ready_to_publish",
  "raw_source_files_count": 5,
  "updated_at": "2026-03-26T12:00:00.000Z",
  "images": ["https://cdn.example.com/p1.jpg"],
  "layout_image": "https://cdn.example.com/layout.jpg",
  "created_at": "2026-03-26T12:00:00.000Z"
}
```

## PATCH /api/properties/:id/assign
### Request
```json
{
  "organization_id": "org-uuid",
  "owner_agent_id": "agent-uuid"
}
```

### Response
```json
{
  "data": {
    "id": "property-uuid",
    "organization_id": "org-uuid",
    "owner_agent_id": "agent-uuid",
    "intake_status": "assigned",
    "partner_id": "partner-uuid",
    "partner": {
      "id": "partner-uuid",
      "display_name": "world_eye",
      "status": "active"
    },
    "updated_at": "2026-03-26T12:00:00.000Z"
  },
  "error": null,
  "meta": null
}
```

## GET /api/partners
### Response Item Shape
```json
{
  "id": "partner-uuid",
  "company_name": "World Eye Realty Inc.",
  "display_name": "world_eye",
  "country": "jp",
  "status": "active",
  "default_fee_percent": "1.00",
  "line_intake_enabled": true,
  "upload_intake_enabled": true,
  "api_intake_enabled": true,
  "partner_slug": "world_eye",
  "contact_email": "bd@world-eye.jp",
  "authorized_organizations_count": 1,
  "recent_intake_count": 3
}
```

## GET /api/partners/:id
### Response
```json
{
  "data": {
    "id": "partner-uuid",
    "company_name": "World Eye Realty Inc.",
    "display_name": "world_eye",
    "country": "jp",
    "status": "active",
    "default_fee_percent": "1.00",
    "line_intake_enabled": true,
    "upload_intake_enabled": true,
    "api_intake_enabled": true,
    "partner_slug": "world_eye",
    "contact_email": "bd@world-eye.jp",
    "authorizations": [
      {
        "id": "auth-uuid",
        "partner_id": "partner-uuid",
        "organization_id": "org-uuid",
        "is_exclusive": false,
        "is_active": true,
        "default_owner_agent_id": "agent-uuid",
        "created_at": "2026-03-26T12:00:00.000Z",
        "organization": {
          "id": "org-uuid",
          "name": "星澄地所 台北信義店",
          "plan_type": "ai"
        }
      }
    ],
    "recent_properties": [
      {
        "id": "property-uuid",
        "organization_id": "org-uuid",
        "owner_agent_id": "agent-uuid",
        "partner_id": "partner-uuid",
        "title": "東京目黑區精選物件",
        "country": "jp",
        "status": "available",
        "source_type": "japan_line",
        "source_partner": "world_eye",
        "intake_status": "ready_to_publish",
        "raw_source_files_count": 5,
        "created_at": "2026-03-26T12:00:00.000Z",
        "updated_at": "2026-03-26T12:00:00.000Z",
        "owner_agent": {
          "id": "agent-uuid",
          "name": "陳業務",
          "role": "agent",
          "is_active": true
        }
      }
    ]
  },
  "error": null,
  "meta": null
}
```

## GET /api/intake-queue
### Response Item Shape
```json
{
  "id": "property-uuid",
  "organization_id": "org-uuid",
  "owner_agent_id": null,
  "partner_id": "partner-uuid",
  "title": "大阪中央區收益型套房",
  "description": "合作夥伴初步匯入，待進一步審閱。",
  "price": "3980.00",
  "country": "jp",
  "status": "negotiating",
  "source": "import",
  "source_type": "import",
  "source_partner": "nippon_prime_realty",
  "cross_border_fee_percent": "1.20",
  "intake_status": "imported",
  "raw_source_files_count": 2,
  "updated_at": "2026-03-26T12:00:00.000Z",
  "created_at": "2026-03-26T12:00:00.000Z",
  "partner": {
    "id": "partner-uuid",
    "display_name": "nippon_prime_realty",
    "status": "active"
  },
  "owner_agent": null,
  "organization": {
    "id": "org-uuid",
    "name": "星澄地所 台北信義店",
    "plan_type": "ai"
  }
}
```

## POST /api/ai/translate-property
### Response Shape
```json
{
  "data": {
    "title": "...",
    "overview": "...",
    "description": "...",
    "highlights": ["..."],
    "risk_notes": ["..."],
    "cta": "..."
  },
  "error": null,
  "meta": {
    "tokens_used": 842
  }
}
```

## POST /api/ai/generate-post
### Response Shape
```json
{
  "data": {
    "facebook_post": "...",
    "instagram_post": "...",
    "line_message": "..."
  },
  "error": null,
  "meta": {
    "tokens_used": 615
  }
}
```
