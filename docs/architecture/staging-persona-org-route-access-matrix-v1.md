# HOSHISUMI Staging Persona × Organization × Route Access Matrix v1

Status: staging-only audit/documentation  
Last updated: 2026-04-27  
Scope: document and audit only; no runtime change, no schema change, no production impact

## 1. Purpose

This document defines the canonical staging interpretation for:

- persona
- active organization
- partner scope
- route access
- visible data scope

The goal is to stop Readdy, Codex, or individual pages from inferring persona from partial signals such as:

- current email only
- presence of Japan properties in `public.properties`
- existence of `partner_id` on a tenant property
- ad hoc UI assumptions about “admin” vs “partner”

For staging v1, persona must be interpreted from:

1. active `x-organization-id`
2. resolved `agent` in that org
3. optional `partner_users` membership in that same org

Relevant runtime references:

- auth resolution: [src/middleware/auth.js](/Users/chishenhsu/Desktop/Codex/星澄地所HOSHISUMI/src/middleware/auth.js)
- server route mounts: [src/server.js](/Users/chishenhsu/Desktop/Codex/星澄地所HOSHISUMI/src/server.js)
- admin property list: [src/routes/adminProperties.js](/Users/chishenhsu/Desktop/Codex/星澄地所HOSHISUMI/src/routes/adminProperties.js)
- partner property scope: [src/routes/partnerProperties.js](/Users/chishenhsu/Desktop/Codex/星澄地所HOSHISUMI/src/routes/partnerProperties.js)
- partner/authorization summary: [src/routes/partners.js](/Users/chishenhsu/Desktop/Codex/星澄地所HOSHISUMI/src/routes/partners.js)

## 2. Canonical Staging Identities

### 2.1 Organizations

| label | org_id | meaning |
| --- | --- | --- |
| Taiwan tenant / platform management org | `33333333-3333-4333-8333-333333333333` | Current staging admin org. Also used as the temporary platform-management org. |
| World Eye partner org | `77777777-7777-4777-8777-777777777777` | Staging org used by the World Eye partner admin persona. |

### 2.2 Partners

| label | partner_id | note |
| --- | --- | --- |
| World Eye | `90000000-0000-4000-8000-000000000001` | Active Japan partner used by current staging partner-management flow. |
| Nippon Prime Realty | `90000000-0000-4000-8000-000000000002` | Partner record and authorization exist, but partner org/admin persona is not fully staged yet. |

## 3. Persona Definitions

## 3.1 Platform Admin

Example user:

- `juliushsu@gmail.com`

Canonical org:

- `33333333-3333-4333-8333-333333333333`

What this persona is:

- platform-side operator
- tenant/platform management user
- can manage partner authorization and tenant-visible staging flows

What this persona is not:

- not the Japan partner itself
- should not automatically receive formal partner console behavior just because a partner membership row exists

Expected capabilities:

- can enter `/admin/partners`
- can enter `/admin/properties`
- can enter `/admin/property-ingest`
- can enter `/admin/properties/import-japan`
- can enter `/admin/ai-assistant`
- can manage `partner_authorizations`

Non-goal:

- this persona must not be treated as “World Eye partner admin” in normal production-style partner scope

## 3.2 Taiwan Tenant Agent

Canonical org:

- `33333333-3333-4333-8333-333333333333`

What this persona can see:

- Taiwan-owned tenant properties in `public.properties`
- Japan properties that are tenant-visible through `tenant_property_bindings`

What this persona can do:

- AI analysis
- AI copy generation
- bind client / lead
- initiate tenant-side handoff flow

What this persona cannot do:

- cannot directly modify `properties_master`
- cannot act as source-of-truth owner for Japan partner inventory

## 3.3 Japan Partner User

Canonical org example:

- `77777777-7777-4777-8777-777777777777`

Canonical partner example:

- `90000000-0000-4000-8000-000000000001`

What this persona can see:

- only its own `properties_master` rows where `source_partner_id = current partner_id`

What this persona can do:

- access `/partner/properties`
- later access `/partner/handoffs`
- manage supply-side property content for its own partner scope
- update source status such as sold / off-market for its own partner inventory

What this persona cannot do:

- cannot read all Japan inventory
- cannot bypass platform authorization and publish directly to every tenant
- cannot view unrestricted customer context in future handoff flows; disclosure must follow `disclosure_scope`

Related future canonical handoff spec:

- [docs/architecture/tenant-property-binding-handoff-schema-v2.md](/Users/chishenhsu/Desktop/Codex/星澄地所HOSHISUMI/docs/architecture/tenant-property-binding-handoff-schema-v2.md)

## 4. Staging Test Accounts

This table mixes current observed staging identities with seed status.

| persona | email / identity | org_id | partner_id | current status | note |
| --- | --- | --- | --- | --- | --- |
| Platform Admin | `juliushsu@gmail.com` | `33333333-3333-4333-8333-333333333333` | currently also has World Eye partner membership in org `3333...` | exists | Usable for platform/admin testing, but currently ambiguous because partner membership exists in the same org. |
| Taiwan Tenant Agent | `kkjj5438@gmail.com` | `33333333-3333-4333-8333-333333333333` | World Eye partner membership currently also exists in org `3333...` | exists | Usable as tenant-side staging agent. Also currently blurred by partner membership in tenant org. |
| World Eye Partner Admin | `aki@world-eye.jp` | `77777777-7777-4777-8777-777777777777` | `90000000-0000-4000-8000-000000000001` | exists | Canonical partner-side persona from [supabase/staging_partner_management_seed.sql](/Users/chishenhsu/Desktop/Codex/星澄地所HOSHISUMI/supabase/staging_partner_management_seed.sql). |
| Nippon Prime Partner Admin | not staged yet | pending | `90000000-0000-4000-8000-000000000002` | pending | Partner record and authorization exist, but no dedicated staging partner org/admin membership was confirmed in current seeds. |

Important audit note:

- Several additional smoke/probe users also exist in org `3333...`.
- Current staging data is not yet cleanly separating “platform admin” and “tenant agent” from “debug partner access”.

## 5. Current Route Access Matrix

Interpretation rules:

- `route` below refers to product/page route
- `backend surface` names the current backing API route(s)
- `allowed` means “intended canonical staging behavior”
- `note` calls out current runtime/audit caveats

| role/persona | org_id | partner_id | route | allowed | data scope | note |
| --- | --- | --- | --- | --- | --- | --- |
| Platform Admin | `3333...` | none canonically | `/admin/partners` | yes | `partner_authorizations` in current org, plus partner summary from `public.properties` | Backed by `GET /api/partners`; current backend allows `owner` and `manager`, not partner persona. |
| Platform Admin | `3333...` | none canonically | `/admin/properties` | yes | tenant org `public.properties`, plus additive binding context from `tenant_property_bindings` and `properties_master` | Backed by `GET /api/admin/properties`; runtime list source is `public.properties`, not `properties_master`. |
| Platform Admin | `3333...` | none canonically | `/admin/property-ingest` | yes | tenant org property intake / ingest jobs | Backed by `GET/POST /api/admin/intake-cases` and `/api/admin/property-ingest/jobs`; staging only. |
| Platform Admin | `3333...` | none canonically | `/admin/properties/import-japan` | yes | tenant org import workflow, partner-authorized Japan intake | UI route should be treated as tenant/platform import surface, not partner console. |
| Platform Admin | `3333...` | none canonically | `/admin/ai-assistant` | yes | tenant-visible `public.properties` in current org only | Backed by `/api/admin/ai-assistant`; cannot directly target `properties_master`. |
| Platform Admin | `3333...` | none canonically | `/partner/properties` | debug-only | should not become formal partner scope by default | Current runtime has no explicit impersonation/debug mode. If a `partner_users` row exists in org `3333...`, this persona can currently resolve real partner scope, which is not the desired long-term contract. |
| Taiwan Tenant Agent | `3333...` | none canonically | `/admin/properties` | yes | Taiwan tenant properties + Japan properties projected through `tenant_property_bindings` | This is the main tenant-visible property inventory surface. |
| Taiwan Tenant Agent | `3333...` | none canonically | `/admin/ai-assistant` | yes | tenant-visible `public.properties` rows in org `3333...` | AI analysis/copy works on tenant-visible property subjects only. |
| Taiwan Tenant Agent | `3333...` | none canonically | `/admin/property-ingest` | yes | tenant org intake and ingest workflow | Current role gates allow `owner`, `super_admin`, `manager`, `store_manager`, `store_editor`. |
| Taiwan Tenant Agent | `3333...` | none canonically | future `/admin/handoffs` | planned yes | handoffs created from tenant-side client/lead/property context | Canonical design exists in docs only; runtime not yet formalized. |
| Taiwan Tenant Agent | `3333...` | none canonically | `/partner/properties` | no in canonical model | none | A tenant agent should not enter partner console unless explicitly using debug/impersonation. Current staging may still allow it if a `partner_users` row exists in the same org. |
| Japan Partner User | `7777...` | `9000...0001` | `/partner/properties` | yes | only `properties_master` where `source_partner_id = current partner_id` | Backed by `GET /api/partner/properties`; current runtime resolves scope from `partner_users.organization_id + agent_id`. |
| Japan Partner User | `7777...` | `9000...0001` | future `/partner/handoffs` | planned yes | partner-visible handoffs only, redacted by `disclosure_scope` | Canonical in architecture docs, not yet a mounted runtime route. |
| Japan Partner User | `7777...` | `9000...0001` | `/admin/partners` | no | none | Partner user is not a platform partner-authorization admin. |
| Japan Partner User | `7777...` | `9000...0001` | `/admin/properties` | no as canonical persona | none | Current API is org-scoped admin property list, not partner source-of-truth console. |

## 6. Canonical Data Scope Rules

### 6.1 `/admin/properties`

Current runtime behavior:

- route reads from `public.properties`
- it then enriches rows with additive partner/binding context:
  - `property_master_id`
  - `tenant_property_binding_id`
  - `source_partner_id`
  - `marketing_status`
  - `property_source_type`

Therefore:

- `/admin/properties` is a tenant/platform inventory page
- it is not a direct `properties_master` browser
- Japan rows appear here only after tenant projection or legacy direct tenant property ingestion

### 6.2 `/partner/properties`

Current runtime behavior:

- route reads from `properties_master`
- scope is restricted to the current `partner_users.partner_id`
- tenant binding summary is additive debug context only

Therefore:

- `/partner/properties` is the partner source-of-truth inventory page
- it must not show every Japan property in staging
- it must not be used as the platform-wide Japan inventory browser

### 6.3 AI Assistant

Current runtime behavior:

- AI routes operate on tenant-visible `public.properties`
- they do not operate directly on `properties_master`

Therefore:

- AI generation belongs to Platform Admin and Taiwan Tenant Agent flows
- Japan Partner User is not the canonical operator for tenant AI marketing generation

## 7. Staging Audit Snapshot

Source:

- P0 staging canonical alignment audit script
- [tmp/p0_staging_canonical_alignment.js](/Users/chishenhsu/Desktop/Codex/星澄地所HOSHISUMI/tmp/p0_staging_canonical_alignment.js)

Observed snapshot after P0 alignment:

- org `33333333-3333-4333-8333-333333333333`
  - `public.properties` total: `18`
- org `00000000-0000-4000-8000-00000000de00`
  - `public.properties` total: `3`
- `tenant_property_bindings` total: `15`
- Japan properties visible in tenant org `3333...`: `15`

Key effect:

- staging now has at least 5 Japan properties visible to the Taiwan tenant/platform org
- canonical Japan test chain exists for:
  - `properties_master`
  - `tenant_property_bindings`
  - tenant-visible `public.properties`

## 8. Current Inconsistencies

## 8.1 `/admin/properties` empty list diagnosis

Audit conclusion:

- current staging backend is not empty
- org `3333...` has `18` `public.properties`
- tenant-visible Japan rows are present

Therefore, if Readdy still renders an empty `/admin/properties` page, the likely causes are:

1. frontend org/header scoping issue  
   Examples: wrong `x-organization-id`, wrong active org, stale auth context.

2. frontend response-shape assumption issue  
   Current backend returns `data: [...]` with `meta: { page, limit, total, total_pages }`, not an `items` wrapper.

3. frontend client-side filtering issue  
   Example: page filters rows based on a field that is absent, renamed, or still interpreted through a legacy ownership model.

What is less likely:

- “backend has no data” is no longer a good explanation for staging

Important nuance:

- additive fields such as `tenant_property_binding_id`, `source_partner_id`, and `property_source_type` enrich row semantics
- failure to read additive fields can explain wrong labels or missing partner metadata
- failure to read additive fields alone should not explain a zero-row table if the raw list is already present

## 8.2 `/partner/properties` for Platform Admin vs Partner User

Desired contract:

- Platform Admin entering `/partner/properties` should get a debug/impersonation-style experience
- Japan Partner User entering `/partner/properties` should get formal partner scope

Current runtime:

- there is no explicit debug/impersonation mode in backend
- scope is resolved purely from:
  - active org
  - active agent
  - matching `partner_users` row in that same org

Implication:

- if a platform-side account also has `partner_users` membership in org `3333...`, `/partner/properties` can behave like a real partner scope
- this is why persona and org must be documented explicitly instead of inferred

Conclusion:

- current staging behavior does not yet cleanly separate “platform debug access” from “formal partner persona access”

## 8.3 Lions Mansion / 黛亞宮殿 root cause

Relevant rows:

- `Lions Mansion 京都河原町`
- `戴亞宮殿堀江公園`

Audit conclusion:

- these were legacy Japan `public.properties` rows from older ingest / image-draft style flows
- before P0 alignment they were orphaned from the canonical Japan chain
- P0 backfilled them into the Japan canonical path by creating:
  - `properties_master`
  - `tenant_property_bindings`
  - tenant-visible linkage

Therefore, if UI still shows null store / null partner / ambiguous ownership for these rows, the remaining cause is most likely one of:

1. legacy UI ownership renderer  
   The page is still reading old store/owner assumptions instead of additive partner fields.

2. additive field not consumed  
   The page is not using `tenant_property_binding_id`, `source_partner_id`, or `property_source_type`.

3. stale frontend normalization  
   The UI may still treat legacy `image_draft` Japan rows as generic tenant properties even after canonical backfill.

What is no longer the primary explanation:

- “no canonical binding exists” is no longer true for these two rows after P0 alignment

## 9. Recommended Staging Interpretation v1

Until runtime is formally split, all staging pages should use this interpretation:

1. `org 3333...` is the active platform/tenant management org
2. `/admin/*` pages are platform/tenant pages
3. `/partner/*` pages are formal partner-console pages unless the UI explicitly labels debug/impersonation mode
4. Japan inventory becomes tenant-visible only through:
   - canonical tenant projection via `tenant_property_bindings`, or
   - explicitly documented legacy transitional rows in `public.properties`
5. No page should infer persona from property row content alone

## 10. Explicit Non-Goals

This document does not:

- change runtime guards
- add impersonation mode
- change schema
- create or migrate production data
- formalize `lead_handoffs` runtime beyond documenting intended future scope
