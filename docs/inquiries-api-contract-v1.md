# Inquiries API Contract v1

## Purpose
- Provide a canonical backend for partnership/contact inquiries from:
  - `/partners/japan`
  - `/for-agencies`
  - `/contact`
- Keep one stable table (`partner_inquiries`) with extensible `metadata`.

## Canonical Allowlists
- `source`:
  - `partners_japan`
  - `for_agencies`
  - `contact`
  - `manual_admin` (reserved for admin/manual creation flow)
- `inquiry_type`:
  - `japan_partnership`
  - `agency_onboarding`
  - `demo_request`
  - `general_contact`
  - `other`
- `status`:
  - `new`
  - `contacted`
  - `qualified`
  - `closed`
  - `archived`
- `language`:
  - `ja`
  - `zh`
  - `en`

## 1) POST /api/public/inquiries

### Usage
- Public submit endpoint for storefront/public pages.

### Request (canonical)
```json
{
  "source": "partners_japan",
  "inquiry_type": "japan_partnership",
  "company_name": "株式会社〇〇",
  "contact_name": "山田 太郎",
  "email": "taro@example.co.jp",
  "phone": "+81-90-1234-5678",
  "line_id": "taro-line",
  "country": "JP",
  "language": "ja",
  "subject": "提携について相談したい",
  "message": "台湾市場との連携について相談したいです。",
  "metadata": {
    "company_type": "real_estate_agency",
    "preferred_contact_method": "email",
    "campaign_tag": "spring-jp-2026"
  }
}
```

### Validation
- `source` required, must be `partners_japan|for_agencies|contact`.
- `inquiry_type` required, must match allowlist.
- `contact_name` required.
- `email` required + valid format.
- `message` required.
- `company_name` required when `inquiry_type` is `japan_partnership` or `agency_onboarding`.
- `metadata` must be JSON object when provided.
- Basic anti-spam:
  - honeypot field `website` must be empty.
  - in-memory IP rate-limit.

### Response (success)
```json
{
  "data": {
    "id": "0f65549a-14f6-4c4a-bf96-9f21f9e85f44",
    "status": "new",
    "created_at": "2026-03-27T12:15:50.195Z"
  },
  "error": null,
  "meta": {
    "message": "Inquiry submitted successfully."
  }
}
```

### Response (error)
```json
{
  "data": null,
  "error": {
    "code": "INQUIRY_SUBMIT_FAILED",
    "message": "Unable to submit inquiry.",
    "details": null
  },
  "meta": null
}
```

## 2) GET /api/admin/inquiries

### Usage
- Admin inquiry list with filters and paging.

### Query
- `status`
- `source`
- `inquiry_type`
- `q` (search in `company_name/contact_name/email`)
- `page` (default 1)
- `page_size` (default 20, max 100)

### Auth / RBAC
- Read allowed:
  - `owner`
  - `super_admin`
  - `manager`
  - `store_manager`
  - `store_editor`

### Response (success)
```json
{
  "data": {
    "items": [
      {
        "id": "0f65549a-14f6-4c4a-bf96-9f21f9e85f44",
        "org_id": null,
        "source": "partners_japan",
        "inquiry_type": "japan_partnership",
        "company_name": "株式会社〇〇",
        "contact_name": "山田 太郎",
        "email": "taro@example.co.jp",
        "phone": "+81-90-1234-5678",
        "language": "ja",
        "country": "JP",
        "subject": "提携について相談したい",
        "status": "new",
        "assigned_agent_id": null,
        "assigned_agent_name": null,
        "assigned_admin_id": null,
        "assigned_admin_name": null,
        "created_at": "2026-03-27T12:15:50.195Z",
        "updated_at": "2026-03-27T12:15:50.195Z"
      }
    ],
    "page": 1,
    "page_size": 20,
    "total": 1,
    "total_pages": 1
  },
  "error": null,
  "meta": null
}
```

## 3) PATCH /api/admin/inquiries/:id

### Editable fields
- `status`
- `assigned_agent_id`
- `assigned_admin_id`
- `notes`
- `last_contacted_at`

### Auth / RBAC
- Update allowed:
  - `owner`
  - `super_admin`
  - `manager`
- `store_manager/store_editor` are read-only in v1.

### Request sample
```json
{
  "status": "contacted",
  "assigned_agent_id": "44444444-4444-4444-8444-444444444444",
  "assigned_admin_id": "55555555-5555-4555-8555-555555555555",
  "notes": "Initial outreach completed.",
  "last_contacted_at": "2026-03-27T12:30:00Z"
}
```

### Response (success)
```json
{
  "data": {
    "id": "0f65549a-14f6-4c4a-bf96-9f21f9e85f44",
    "status": "contacted",
    "assigned_agent_id": "44444444-4444-4444-8444-444444444444",
    "assigned_admin_id": "55555555-5555-4555-8555-555555555555",
    "notes": "Initial outreach completed.",
    "last_contacted_at": "2026-03-27T12:30:00+00:00"
  },
  "error": null,
  "meta": null
}
```

## Metadata extension notes
- Use `metadata` for per-page optional fields to avoid frequent schema migrations.
- Common keys:
  - `team_size`
  - `company_type`
  - `collaboration_mode`
  - `preferred_contact_method`
  - `page_variant`
  - `campaign_tag`
