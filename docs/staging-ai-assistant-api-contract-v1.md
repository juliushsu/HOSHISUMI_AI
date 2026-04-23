# Staging AI Assistant API Contract v1

Status: staging only.

This contract covers Taiwan-side tenant property AI analysis, copy generation, quota usage, and audit trails. Japan import AI is excluded from this quota surface.

## Scope Rules

- Routes are mounted at `/api/admin/ai-assistant`.
- The server returns `404 STAGING_FEATURE_NOT_FOUND` outside staging.
- Every route requires `Authorization: Bearer ...` and `x-organization-id`.
- Supported roles: `owner`, `super_admin`, `manager`, `store_manager`, `store_editor`.
- Only `properties.country = 'tw'` is supported.
- Read operations do not consume units.
- Analysis generation consumes 1 unit.
- Copy generation consumes 1 unit.
- Manual copy edits do not consume units and always create a version record.

## GET /quota

Ensures the current month quota row exists and returns usage.

Response `data`:

```json
{
  "period_month": "2026-04-01",
  "monthly_unit_limit": 100,
  "used_units": 12,
  "remaining_units": 88,
  "reserved_units": 0,
  "reset_at": "2026-05-01T00:00:00.000Z",
  "estimated_cost_usd": 0.0123
}
```

## POST /analyses

Body:

```json
{
  "property_id": "uuid",
  "force_regenerate": false
}
```

Behavior:

- Returns the active analysis with `meta.reused = true` and `charged_units = 0` when one exists and `force_regenerate` is false.
- Otherwise snapshots the property, supersedes previous active analysis rows, creates a new active analysis, consumes 1 unit, and writes `ai_usage_events`.

## GET /analyses?property_id=...

Returns up to 100 org-scoped analysis rows, newest first. `property_id` is optional.

## GET /analyses/:id

Returns one org-scoped analysis row.

## POST /analyses/:id/regenerate

Regenerates analysis for the same property as `:id`, superseding active analysis rows and consuming 1 unit.

## POST /copy-generations

Body:

```json
{
  "property_id": "uuid",
  "analysis_id": "uuid",
  "channel": "fb",
  "prompt_context": {}
}
```

Notes:

- `channel` must be `fb`, `ig`, or `line`.
- `analysis_id` is optional. If omitted, the active analysis is used when available.
- Creates `property_ai_copy_generations`, creates version `1` in `property_ai_copy_versions`, consumes 1 unit, and writes `ai_usage_events`.

## POST /copy-generations/:id/save-edit

Body:

```json
{
  "edited_output_text": "edited copy",
  "edit_reason": "optional reason",
  "compliance_flags_json": [],
  "risk_score": 20
}
```

Behavior:

- Updates `edited_output_text`.
- Creates the next copy version with `source = manual_edit`.
- Does not consume quota.

## GET /copy-generations?property_id=...

Returns up to 100 org-scoped copy generations, newest first, with version history attached. `property_id` is optional.
