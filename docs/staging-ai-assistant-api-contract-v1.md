# Staging AI Assistant API Contract v1

Status: staging only.

This contract covers Taiwan-side tenant property AI analysis, copy generation, quota usage, and audit trails. Japan import AI is excluded from this quota surface.

Related:

- [Staging AI/System Settings API Contract v1](./contracts/staging-ai-system-settings-v1.md)

## Scope Rules

- Routes are mounted at `/api/admin/ai-assistant`.
- The server returns `404 STAGING_FEATURE_NOT_FOUND` outside staging.
- Every route requires `Authorization: Bearer ...` and `x-organization-id`.
- Supported roles: `owner`, `super_admin`, `manager`, `store_manager`, `store_editor`.
- Only `properties.country = 'tw'` is supported.
- Read operations do not consume units.
- `standard_analysis` consumes 1 unit.
- `vision_enhanced_analysis` consumes 2 units.
- Copy generation consumes 1 unit.
- Marketing visual generation is planned at 3 units.
- Manual copy edits do not consume units and always create a version record.
- Runtime provider selection must come from org AI settings; routes must not hard-code OpenAI.
- Google Maps / Places lookups are backend structured enrichment only; GPT/Gemini must not freely query maps.

## GET /settings

Returns org-level AI provider credentials status plus feature routing selection.

Response `data`:

```json
{
  "providers": {
    "openai": {
      "configured": true,
      "key_last4": "abcd"
    },
    "google_ai": {
      "configured": true,
      "key_last4": "wxyz"
    },
    "google_maps": {
      "configured": true,
      "key_last4": "7890"
    }
  },
  "feature_routing": {
    "location_enrichment_provider": "google_maps",
    "location_summary_model": "gemini_flash",
    "standard_analysis_model": "openai",
    "vision_enhanced_analysis_model": "openai_vision",
    "copy_generation_model": "openai",
    "marketing_visual_generation_model": "gemini_image"
  }
}
```

## PUT /settings

Persists provider keys and feature-level routing selection for the current org.

Body:

```json
{
  "provider_keys": {
    "openai": "sk-...",
    "google_ai": "AIza...",
    "google_maps": "AIza..."
  },
  "feature_routing": {
    "location_enrichment_provider": "google_maps",
    "location_summary_model": "gemini_flash",
    "standard_analysis_model": "openai",
    "vision_enhanced_analysis_model": "openai_vision",
    "copy_generation_model": "openai",
    "marketing_visual_generation_model": "gemini_image"
  }
}
```

Validation rules:

- `location_enrichment_provider` only supports `google_maps` in v1.
- `location_summary_model` supports `gemini_flash` or `openai_mini`.
- `standard_analysis_model` supports `openai` or `gemini`.
- `vision_enhanced_analysis_model` supports `openai_vision` or `gemini_vision`.
- `copy_generation_model` supports `openai` or `gemini`.
- `marketing_visual_generation_model` supports `gemini_image` or `openai_image`.
- Saving an OpenAI selection requires an OpenAI key to be configured.
- Saving a Gemini selection requires a Google AI key to be configured.
- Saving `google_maps` enrichment requires a Google Maps key to be configured.

Recommended defaults:

- `copy_generation_model = openai` because Chinese sales copy quality is more stable.
- `location_summary_model = gemini_flash` because Google ecosystem integration may be cheaper.
- `marketing_visual_generation_model` should stay provider-abstracted for future Gemini image vs OpenAI image comparison.

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
  "analysis_mode": "standard_analysis",
  "force_regenerate": false
}
```

Behavior:

- Returns the active analysis with `meta.reused = true` and `charged_units = 0` when one exists and `force_regenerate` is false.
- Otherwise snapshots the property, resolves provider/model from feature routing, supersedes previous active analysis rows, creates a new active analysis, consumes feature-configured units, and writes `ai_usage_events`.
- `analysis_mode = standard_analysis` must use `standard_analysis_model`.
- `analysis_mode = vision_enhanced_analysis` must use `vision_enhanced_analysis_model`.
- If location enrichment and location summary run during the same execution, they should each write their own usage event row under the same `execution_id`.

Notes:

- `analysis_mode` is optional and defaults to `standard_analysis`.

## GET /analyses?property_id=...

Returns up to 100 org-scoped analysis rows, newest first. `property_id` is optional.

## GET /analyses/:id

Returns one org-scoped analysis row.

## POST /analyses/:id/regenerate

Regenerates analysis for the same property as `:id`, superseding active analysis rows and consuming units based on the resolved analysis mode.

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
- Creates `property_ai_copy_generations`, creates version `1` in `property_ai_copy_versions`, consumes configured units, and writes `ai_usage_events`.
- The generation provider/model must be resolved from `copy_generation_model`.

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

## Usage Event Contract

Every AI or map-backed substep must log `ai_usage_events` with:

- `provider`
- `model`
- `input_tokens`
- `output_tokens`
- `total_tokens`
- `map_request_count`
- `estimated_cost_usd`
- `charged_units`

Suggested behavior:

- one user action may produce multiple usage rows grouped by `execution_id`
- `location_enrichment` rows use `provider = google_maps`, `model = null`, and `map_request_count > 0`
- `location_summary` rows use `feature_key = location_summary_model`
- `analysis` rows use `feature_key = standard_analysis_model` or `vision_enhanced_analysis_model`
- `copy_generation` rows use `feature_key = copy_generation_model`
- `marketing_visual_generation` rows use `feature_key = marketing_visual_generation_model`
