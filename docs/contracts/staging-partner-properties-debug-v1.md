# Staging Partner Properties Debug Contract v1

Status: staging only.

This contract adds a read-only debug query mode for Taiwan admin debugging without changing the normal Japan partner permission model.

## Endpoint

`GET /api/partner/properties?debug_partner_id=<partner_uuid>`

## Scope Rules

- Staging only.
- Requires `Authorization: Bearer ...`.
- Requires `x-organization-id`.
- `debug_partner_id` is optional.
- Without `debug_partner_id`, the route keeps the existing behavior:
  - the caller must have an active `partner_users` membership
  - the response is scoped to that membership's `partner_id`
- With `debug_partner_id`, only `owner` and `super_admin` may use debug mode.
- `manager` cannot use debug mode.
- Normal `partner_user` / `partner_admin` visibility does not expand; they still only see their own partner's properties through normal membership scope.
- Debug mode is read-only and affects only the list route.
- `PATCH /api/partner/properties/:id`
- `POST /api/partner/properties/:id/mark-sold`
- `POST /api/partner/properties/:id/mark-off-market`
  still require the caller's real partner membership scope and do not honor `debug_partner_id`.

## Query Parameters

- `debug_partner_id`: UUID of the target partner to inspect
- `page`: optional, default `1`
- `page_size` or `pageSize`: optional, default `20`, max `100`
- `status`: optional, one of `available | sold | off_market`
- `search`: optional free-text search

## Success Response

Response envelope:

```json
{
  "data": [
    {
      "id": "91000000-0000-4000-8000-000000000001",
      "source_partner_id": "90000000-0000-4000-8000-000000000001",
      "source_of_truth": "japan_partner",
      "source_property_ref": "WE-2026-0001",
      "country": "jp",
      "status": "available",
      "title_ja": "渋谷区投資物件",
      "title_zh": "澀谷區投資物件",
      "address_ja": "東京都渋谷区...",
      "address_zh": "東京都澀谷區...",
      "price": 35800000,
      "currency": "JPY",
      "layout": "1LDK",
      "area_sqm": 42.15,
      "description_ja": null,
      "description_zh": null,
      "image_urls": [],
      "canonical_payload_json": {},
      "raw_source_payload": null,
      "source_updated_at": "2026-04-24T10:00:00.000Z",
      "created_at": "2026-04-24T10:00:00.000Z",
      "updated_at": "2026-04-24T10:00:00.000Z",
      "tenant_binding_summary": null
    }
  ],
  "error": null,
  "meta": {
    "page": 1,
    "pageSize": 20,
    "page_size": 20,
    "total": 1,
    "total_pages": 1,
    "partner": {
      "id": "90000000-0000-4000-8000-000000000001",
      "display_name": "World Eye",
      "partner_slug": "world-eye"
    },
    "debug_mode": true,
    "debug_partner_id": "90000000-0000-4000-8000-000000000001"
  }
}
```

## Error Cases

- `400 INVALID_DEBUG_PARTNER_ID`
  - `debug_partner_id` is not a UUID
- `403 DEBUG_SCOPE_NOT_ALLOWED`
  - caller is not `owner` or `super_admin`
- `404 DEBUG_PARTNER_NOT_FOUND`
  - target partner does not exist or is not active
- `403 PARTNER_SCOPE_NOT_FOUND`
  - normal non-debug path without an active membership

## Readdy Integration Notes

- Taiwan admin debug page should call:
  - `GET /api/partner/properties?debug_partner_id=<partner_uuid>`
- Readdy should treat `meta.debug_mode = true` as an explicit debug state badge.
- Readdy should continue to use the normal route without `debug_partner_id` for Japan partner users.
