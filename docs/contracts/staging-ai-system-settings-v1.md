# Staging AI/System Settings API Contract v1

Status: staging only.

This contract defines the backend settings surface for system-level AI provider credentials, Google Maps credentials, feature-level routing, connection validation, and usage telemetry policy.

Related contract:

- [Staging AI Assistant API Contract v1](../staging-ai-assistant-api-contract-v1.md)

## Scope Rules

- Route base is `/api/admin/system/ai-settings`.
- The server returns `404 STAGING_FEATURE_NOT_FOUND` outside staging.
- Every route requires `Authorization: Bearer ...`.
- Only `super_admin` and `system_admin` may read or edit these settings.
- This contract is for staging only and must not change production behavior.
- API keys are write-only at the API layer and must never be returned in plaintext.
- Feature routing must resolve runtime provider/model selection; runtime code must not hard-code OpenAI.

## GET /api/admin/system/ai-settings

Returns the current staging AI provider status, masked credential metadata, feature routing, and telemetry contract hints for the admin settings page.

Response `data`:

```json
{
  "environment": "staging",
  "editable": true,
  "providers": {
    "openai": {
      "enabled": true,
      "api_key": {
        "has_value": true,
        "masked_value": "sk-proj-****9d2Q",
        "last_updated_at": "2026-04-24T10:00:00.000Z",
        "last_updated_by": "agent_123",
        "last_tested_at": "2026-04-24T10:05:00.000Z",
        "last_test_status": "ok",
        "last_test_message": null
      }
    },
    "gemini": {
      "enabled": true,
      "api_key": {
        "has_value": true,
        "masked_value": "AIzaSy****K9p",
        "last_updated_at": "2026-04-24T09:58:00.000Z",
        "last_updated_by": "agent_123",
        "last_tested_at": "2026-04-24T10:06:00.000Z",
        "last_test_status": "ok",
        "last_test_message": null
      }
    },
    "google_maps": {
      "enabled": true,
      "api_key": {
        "has_value": true,
        "masked_value": "AIzaSy****M2x",
        "last_updated_at": "2026-04-24T09:59:00.000Z",
        "last_updated_by": "agent_123",
        "last_tested_at": "2026-04-24T10:07:00.000Z",
        "last_test_status": "ok",
        "last_test_message": null
      }
    }
  },
  "routing": {
    "ocr_provider": "openai",
    "standard_analysis_model": "openai",
    "vision_enhanced_analysis_model": "openai_vision",
    "copy_generation_model": "openai",
    "marketing_visual_generation_model": "openai_image",
    "location_enrichment_provider": "google_maps"
  },
  "usage_telemetry_contract": {
    "token_count_fields": ["input_tokens", "output_tokens", "total_tokens"],
    "map_request_count_enabled": true,
    "estimated_cost_usd_enabled": true,
    "charged_units_enabled": true
  }
}
```

Notes:

- `masked_value` is display-only and must not be reusable as a credential.
- `last_test_message` should be short and safe for admin UI display.

## PUT /api/admin/system/ai-settings

Persists staging AI provider credentials and feature routing. This route also supports validation-only and connection-test flows without adding a separate endpoint.

Request body:

```json
{
  "providers": {
    "openai": {
      "api_key": "sk-proj-..."
    },
    "gemini": {
      "api_key": "AIzaSy..."
    },
    "google_maps": {
      "api_key": "AIzaSy..."
    }
  },
  "routing": {
    "ocr_provider": "openai",
    "standard_analysis_model": "gemini",
    "vision_enhanced_analysis_model": "gemini_vision",
    "copy_generation_model": "openai",
    "marketing_visual_generation_model": "gemini_image",
    "location_enrichment_provider": "google_maps"
  },
  "validate_only": false,
  "test_connections": true
}
```

Response `data`:

```json
{
  "saved": true,
  "environment": "staging",
  "providers": {
    "openai": {
      "api_key": {
        "has_value": true,
        "masked_value": "sk-proj-****9d2Q",
        "last_test_status": "ok",
        "last_test_message": null
      }
    },
    "gemini": {
      "api_key": {
        "has_value": true,
        "masked_value": "AIzaSy****K9p",
        "last_test_status": "ok",
        "last_test_message": null
      }
    },
    "google_maps": {
      "api_key": {
        "has_value": true,
        "masked_value": "AIzaSy****M2x",
        "last_test_status": "ok",
        "last_test_message": null
      }
    }
  },
  "routing": {
    "ocr_provider": "openai",
    "standard_analysis_model": "gemini",
    "vision_enhanced_analysis_model": "gemini_vision",
    "copy_generation_model": "openai",
    "marketing_visual_generation_model": "gemini_image",
    "location_enrichment_provider": "google_maps"
  }
}
```

## Key Policy

- Keys are write-only at the API surface.
- GET and PUT responses must never include plaintext keys.
- Masked values are returned for UI confirmation only.
- Sending `null` for a provider key means clear the stored key.
- Connection test results must not leak raw provider error payloads containing secrets.

Recommended masking rules:

- Very short keys return only `****`.
- OpenAI-style keys may keep the prefix and last four characters, such as `sk-proj-****9d2Q`.
- Google-style keys may keep the first six and last three characters, such as `AIzaSy****K9p`.

## Validation Flags

`PUT` supports:

- `validate_only = true`
  - validate payload, routing compatibility, and provider key presence
  - do not persist changes
  - may still run connection tests when `test_connections = true`
- `test_connections = true`
  - run lightweight provider probes and return status in response metadata
  - when `validate_only = false`, save first and then test the saved settings

Suggested provider probes:

- `openai`: lightweight model-list or minimal chat probe
- `gemini`: lightweight generate probe
- `google_maps`: minimal geocode or nearby search probe

`last_test_status` enum:

- `ok`
- `failed`
- `skipped`

## Feature-Level Routing Enum

Routing keys and supported values:

- `ocr_provider`: `openai | gemini`
- `standard_analysis_model`: `openai | gemini`
- `vision_enhanced_analysis_model`: `openai_vision | gemini_vision`
- `copy_generation_model`: `openai | gemini`
- `marketing_visual_generation_model`: `openai_image | gemini_image`
- `location_enrichment_provider`: `google_maps`

Validation rules:

- `location_enrichment_provider` only supports `google_maps` in v1.
- Any routing value that targets a provider without a configured key must be rejected.
- `ocr_provider = openai` requires an OpenAI key.
- Any `gemini*` selection requires a Gemini key.
- `location_enrichment_provider = google_maps` requires a Google Maps key.

Recommended defaults:

- `ocr_provider = openai`
- `standard_analysis_model = openai`
- `vision_enhanced_analysis_model = openai_vision`
- `copy_generation_model = openai`
- `marketing_visual_generation_model = openai_image`
- `location_enrichment_provider = google_maps`

## Usage Telemetry Contract

All AI and map-backed runtime events should be compatible with this telemetry contract:

- `provider`
- `model`
- `input_tokens`
- `output_tokens`
- `total_tokens`
- `map_request_count`
- `estimated_cost_usd`
- `charged_units`

Recommended supplemental fields:

- `execution_id`
- `feature_key`

Expected behavior:

- One user action may emit multiple usage rows grouped by `execution_id`.
- `feature_key` should identify which routing key drove the runtime selection.
- `google_maps` events should use `provider = google_maps`, `model = null`, and `map_request_count > 0`.
- Token fields for pure map calls may be `0`.

## Role Permissions

- `super_admin`: can read and edit staging AI/system settings
- `system_admin`: can read and edit staging AI/system settings
- All other roles must receive `403 ROLE_NOT_ALLOWED`

## Error Codes

- `403 ROLE_NOT_ALLOWED`
- `404 STAGING_FEATURE_NOT_FOUND`
- `422 INVALID_AI_SETTINGS`
- `422 PROVIDER_KEY_REQUIRED`
- `422 UNSUPPORTED_ROUTING_VALUE`
- `502 PROVIDER_CONNECTION_TEST_FAILED`

## Production Behavior

- Production must not expose this route.
- Outside staging, the server must return `404 STAGING_FEATURE_NOT_FOUND`.
