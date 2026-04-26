# Tenant Property Binding + Handoff v2 Implementation Plan

Status: implementation plan only

Related baseline:

- [tenant-property-binding-handoff-schema-v2.md](/Users/chishenhsu/Desktop/Codex/星澄地所HOSHISUMI/docs/architecture/tenant-property-binding-handoff-schema-v2.md)

## 1. Objective

This plan defines the rollout order for Tenant Property Binding + Japan Partner Handoff Schema v2 in staging.

This document covers:

1. migration order
2. seed and backfill order
3. runtime API refactor order
4. Readdy frontend integration order
5. rollback plan

This document does not implement runtime, migration, or production change.

## 2. Rollout Principles

- Treat [tenant-property-binding-handoff-schema-v2.md](/Users/chishenhsu/Desktop/Codex/星澄地所HOSHISUMI/docs/architecture/tenant-property-binding-handoff-schema-v2.md) as the only v2 schema baseline.
- Keep `public.properties` as transitional read model until migration and read-path cutover are complete.
- Avoid UI-first drift. Backend schema and API compatibility must be stabilized before Readdy wiring.
- Roll out in staging first.
- Use additive change first, destructive cleanup last.
- Every phase must preserve a testable chain:
  - `properties_master`
  - `tenant_property_bindings`
  - tenant visible property subject
  - AI analysis
  - AI copy
  - client
  - lead
  - handoff

## 3. Overall Phase Order

Recommended sequence:

1. schema expansion
2. seed and backfill
3. read model stabilization
4. tenant runtime cutover
5. partner handoff runtime
6. Readdy frontend wiring
7. staging validation and freeze
8. deferred cleanup after full read-model migration

## 4. Migration Order

### Phase M1: additive schema for `tenant_property_bindings` v2

Goal:

- Expand current binding table to match v2 fields without removing current compatibility fields.

Scope:

- add `source_partner_id`
- add `marketing_status`
- add `is_visible_to_agents`
- add `is_marketing_enabled`
- add `last_marketing_generated_at`
- add `last_master_synced_at`
- add `archived_at`
- widen enum/check rules:
  - `visibility`: `active | hidden | archived`
  - `tenant_status`: `draft | marketing | paused | closed`

Rules:

- keep `linked_property_id`
- do not drop existing fields in the same migration
- default new booleans to `true`
- default `marketing_status` to `not_generated`

Exit criteria:

- existing staging rows remain readable
- existing APIs do not break
- binding rows can represent v2 state without data loss

### Phase M2: additive schema for `lead_handoffs`

Goal:

- Introduce canonical cross-border handoff table instead of reusing ad hoc inquiry records.

Scope:

- create `lead_handoffs`
- create status check constraint
- create disclosure scope check constraint
- add indexes:
  - `tenant_organization_id`
  - `source_partner_id`
  - `tenant_property_binding_id`
  - `lead_id`
  - `client_id`
  - `handoff_status`
  - `submitted_at`

Rules:

- do not remove `partner_inquiries` in this phase
- `lead_handoffs` is additive and parallel-safe

Exit criteria:

- handoff rows can be inserted without touching partner console yet
- tenant and partner query paths can be developed against a stable canonical table

### Phase M3: AI subject compatibility migration

Goal:

- Allow AI records to attach to either Taiwan native properties or Japan tenant bindings.

Scope:

- add `tenant_property_binding_id` to:
  - `property_ai_analyses`
  - `property_ai_copy_generations`
  - `ai_usage_events`
- add XOR constraint:
  - exactly one of `property_id` or `tenant_property_binding_id`
- add indexes on `tenant_property_binding_id`

Rules:

- do not remove `property_id`
- keep current `public.properties` path working during transition

Exit criteria:

- AI runtime can begin dual-write or dual-read migration
- existing AI rows remain valid

### Phase M4: event and audit support

Goal:

- Preserve state changes and partner workflow transitions for debugging and compliance.

Recommended scope:

- create `tenant_property_binding_events`
- create `lead_handoff_events` if partner workflow auditing is needed immediately
- add updated-at triggers if not already centralized

Exit criteria:

- state transitions are append-traceable in staging

### Phase M5: deferred cleanup migration

Goal:

- Cleanup only after all runtime and frontend paths stop depending on legacy assumptions.

Deferred scope:

- remove legacy binding status columns only if fully superseded
- deprecate partner handoff use of `partner_inquiries`
- eventually remove Japan inventory dependency on `public.properties` as canonical store

Hard rule:

- do not schedule this phase until read-model migration is complete and accepted

## 5. Seed and Backfill Order

### Phase S1: canonical identity seed alignment

Goal:

- Lock staging identities used by every layer.

Required rows:

- Taiwan tenant org:
  - `33333333-3333-4333-8333-333333333333`
- World Eye partner org:
  - `77777777-7777-4777-8777-777777777777`
- World Eye partner:
  - `90000000-0000-4000-8000-000000000001`

Exit criteria:

- org and partner ids are stable and documented

### Phase S2: `properties_master` normalization backfill

Goal:

- Ensure all staging Japan source properties have the minimum canonical payload required by v2.

Backfill fields:

- `source_property_ref`
- `title_ja`
- `nearest_station`
- `walk_minutes`
- `rent_jpy`
- `status`
- `source_partner_id`

Rule:

- if a field does not yet exist as a physical column, preserve it in canonical JSON or raw payload until schema catch-up is complete

Exit criteria:

- every staged Japan property can be bound without lookup ambiguity

### Phase S3: `tenant_property_bindings` v2 backfill

Goal:

- Convert existing bindings to v2-compatible state.

Backfill actions:

- set `source_partner_id`
- set `marketing_status`
- set `is_visible_to_agents`
- set `is_marketing_enabled`
- set `last_master_synced_at`
- map old status semantics into v2 fields

Recommended mapping:

- old tenant `draft` -> v2 `tenant_status = draft`
- old tenant `marketing` -> v2 `tenant_status = marketing`
- no AI output yet -> `marketing_status = not_generated`
- has latest AI output -> `marketing_status = generated` or `updated`

Exit criteria:

- no binding row remains with ambiguous ownership or marketing state

### Phase S4: `linked_property_id` projection backfill

Goal:

- Ensure every tenant-visible Japan binding has a transitional `public.properties` projection while read model cutover is incomplete.

Backfill actions:

- create or upsert projected `public.properties` rows
- set `tenant_property_bindings.linked_property_id`
- stamp projection payload with:
  - `property_master_id`
  - `tenant_property_binding_id`
  - `source_partner_id`
  - `subject_origin = jp_master_binding`

Exit criteria:

- `/api/admin/properties` can show bound Japan inventory without losing legacy screens

### Phase S5: `lead_handoffs` backfill

Goal:

- Convert existing mock or inquiry-based handoffs into canonical `lead_handoffs`.

Source candidates:

- `partner_inquiries`
- manual staging mock rows
- lead notes containing handoff metadata

Rule:

- keep legacy source rows for audit during transition
- backfill only rows with trusted tenant, partner, lead, and property linkage

Exit criteria:

- at least one full staging chain exists in canonical `lead_handoffs`

## 6. Runtime API Refactor Order

### Phase R1: admin properties read model

Target:

- `GET /api/admin/properties`

Change:

- move tenant Japan property listing logic to binding-aware read path
- response must distinguish:
  - Taiwan native property
  - Japan partner-bound property

Recommended response fields:

- `subject_type`
- `subject_origin`
- `property_master_id`
- `tenant_property_binding_id`
- `linked_property_id`
- `source_partner_id`
- `visibility`
- `tenant_status`
- `marketing_status`

Reason:

- this is the first read surface used by both admin property UI and AI selection flow

### Phase R2: AI assistant dual-subject support

Targets:

- `POST /api/admin/ai-assistant/analyses`
- `POST /api/admin/ai-assistant/copy-generations`

Change:

- accept canonical subject from either:
  - Taiwan native `property_id`
  - Japan `tenant_property_binding_id`

Transition strategy:

- short-term: resolve from `linked_property_id` while binding-aware API is being introduced
- medium-term: bind AI rows directly to `tenant_property_binding_id`

Required behavior:

- AI output always belongs to tenant org
- quota and usage events always belong to tenant org
- partner/global source rows never receive tenant AI output writes

### Phase R3: tenant handoff APIs

Targets:

- `POST /api/admin/handoffs`
- `GET /api/admin/handoffs`

Change:

- introduce canonical tenant-side handoff creation and status list
- creation request must validate:
  - tenant owns binding
  - binding points to property master
  - client and lead belong to tenant org
  - disclosure scope is explicit

### Phase R4: partner handoff APIs

Targets:

- `GET /api/partner/handoffs`
- `PATCH /api/partner/handoffs/:id/status`

Change:

- partner console reads canonical `lead_handoffs`
- partner sees only partner-scoped rows
- customer detail is redacted according to `disclosure_scope`

### Phase R5: legacy compatibility adapters

Goal:

- keep current staging screens operational while new frontend work catches up.

Examples:

- maintain `linked_property_id`
- optionally mirror canonical handoff to existing debug surfaces
- preserve legacy inquiry mock flow until partner handoff console is fully moved

## 7. Readdy Frontend Wiring Order

### Phase F1: admin properties source labeling

UI targets:

- `/admin/properties`

Add:

- Japan or Taiwan source tag
- ownership label:
  - `tenant`
  - `partner`

Depend on:

- binding-aware admin properties API fields

### Phase F2: AI assistant property picker

UI targets:

- AI Assistant property selection

Add:

- include Japan bound properties in all-property view
- show source / ownership / marketing state
- do not hide records only because country is missing or transitional

Depend on:

- binding-aware admin properties read model

### Phase F3: handoff create UI

UI targets:

- tenant-side lead or client workflow

Add:

- create handoff action from eligible Japan-bound property
- disclosure scope selector
- handoff note input
- current status card

Depend on:

- canonical tenant handoff APIs

### Phase F4: partner handoff console

UI targets:

- partner admin console

Add:

- list handoffs by status
- update workflow state
- display only redacted buyer context permitted by scope

Depend on:

- canonical partner handoff APIs

### Phase F5: debug and transition cleanup

Goal:

- remove frontend reliance on ad hoc inference once APIs provide canonical fields

Examples:

- stop inferring ownership from only `country`, `source_type`, or `title_ja`
- stop relying on `partner_inquiries` as the handoff source of truth

## 8. Rollback Plan

### Rollback principle

- schema rollout should be additive first so rollback is mostly runtime-level, not destructive DB reversal

### Rollback R1: runtime rollback

If new APIs or read paths fail:

- switch `/api/admin/properties` back to legacy `public.properties` read path
- disable handoff UI entry points
- keep partner console on legacy mock path if required

### Rollback R2: AI rollback

If binding-aware AI subject support fails:

- keep AI assistant on `linked_property_id` transitional path only
- suspend direct `tenant_property_binding_id` write path
- preserve all created AI rows

### Rollback R3: handoff rollback

If canonical `lead_handoffs` runtime is unstable:

- stop new writes to `lead_handoffs`
- continue read-only inspection of rows already created
- temporarily route staging demo flow back through legacy inquiry-based mock flow

### Rollback R4: seed and backfill rollback

If backfill produces incorrect linkage:

- null out or detach incorrect `linked_property_id` rows
- keep `properties_master` unchanged
- re-run projection backfill from authoritative binding list

### Rollback R5: migration rollback

Avoid destructive rollback during the active transition window.

Preferred approach:

- leave additive columns and tables in place
- disable runtime usage
- correct data and retry

Do not:

- drop `lead_handoffs`
- drop `tenant_property_binding` v2 columns
- remove `public.properties`

until staging acceptance is complete

## 9. Validation Gates

Each phase should pass the same minimum staging proof:

1. Taiwan tenant can see Japan-bound property in `/api/admin/properties`
2. AI analysis can be generated for that property in tenant scope
3. AI copy can be generated in tenant scope
4. client and lead can be linked to that property subject
5. handoff can be created
6. partner can read the handoff in partner scope
7. disclosure scope is respected

## 10. Explicit Limits

This document is implementation planning only.

- Do not apply migration from this document.
- Do not implement runtime directly from this document without review.
- Do not modify production.
- Do not remove `public.properties` until read model migration is complete.
