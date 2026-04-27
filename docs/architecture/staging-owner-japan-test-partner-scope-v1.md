# Staging Owner Japan Test Partner Scope v1

Status: proposal + staging seed/backfill plan only  
Date: 2026-04-27  
Environment: staging only  
Non-goals: no frontend change, no production change, no production data touch

## 1. Goal

建立一組專供 staging owner 測試用的日本測試合作方 scope，讓以下三件事能同時成立：

1. `juliushsu@gmail.com` 可在 staging 測完整的 Japan partner flow
2. 不再污染真實或準真實 `world_eye` / `nippon_prime_realty`
3. tenant-facing / partner-facing / platform-facing persona 可明確分離

這份文件只定義：

- A. staging persona/org model 修正提案
- B. staging seed SQL 或 script plan
- C. 需要 backfill 的資料清單
- D. 不碰 production 的保證
- E. Readdy 後續要接的欄位與頁面清單

## 2. Current Audit Summary

### 2.1 Current real/seed partner identities

目前 staging 已存在：

- Taiwan tenant / platform admin org
  - `33333333-3333-4333-8333-333333333333`
- World Eye partner org
  - `77777777-7777-4777-8777-777777777777`
- World Eye partner
  - `90000000-0000-4000-8000-000000000001`
- Nippon Prime Realty partner
  - `90000000-0000-4000-8000-000000000002`

目前世界線問題不是 partner model 不存在，而是 owner staging 測試流和真實 partner seed 混在一起。

### 2.2 Current route/data behavior

目前 runtime 現況：

- `/api/admin/properties`
  - 讀的是 `public.properties`
  - 再用 additive enrichment 補：
    - `property_master_id`
    - `tenant_property_binding_id`
    - `source_partner_id`
    - `marketing_status`
    - `property_source_type`
- `/api/partner/properties`
  - 讀的是 `properties_master`
  - 只看目前 partner membership 對應的 `source_partner_id`
- `property_ingest_jobs.approve`
  - 目前仍只直接建立 `public.properties`
  - 尚未自動形成：
    - `properties_master`
    - `tenant_property_bindings`
    - `public.properties` transitional projection

Relevant code:

- auth: [src/middleware/auth.js](/Users/chishenhsu/Desktop/Codex/星澄地所HOSHISUMI/src/middleware/auth.js)
- admin properties: [src/routes/adminProperties.js](/Users/chishenhsu/Desktop/Codex/星澄地所HOSHISUMI/src/routes/adminProperties.js)
- partner properties: [src/routes/partnerProperties.js](/Users/chishenhsu/Desktop/Codex/星澄地所HOSHISUMI/src/routes/partnerProperties.js)
- ingest create/approve: [src/services/propertyIngestJobs.js](/Users/chishenhsu/Desktop/Codex/星澄地所HOSHISUMI/src/services/propertyIngestJobs.js)

### 2.3 Current contamination risk

目前最明確的污染風險：

1. owner / tenant-side staging 測試資料可能被掛到 `world_eye`
2. 先前 orphan Japan rows 已被 backfill 到 `world_eye`
3. `juliushsu@gmail.com` 在 org `3333...` 目前可命中 partner membership，導致 `/partner/*` 會看起來像正式 partner scope，而不是 debug/delegated scope

## 3. A. Staging Persona / Org Model 修正提案

### 3.1 Canonical persona split

同一個人可以在 staging 有多個 persona，但 persona 必須由 active org 決定，不可由 email 自動推論：

| persona | active org | intended route family | note |
| --- | --- | --- | --- |
| Platform management | `33333333-3333-4333-8333-333333333333` | `/platform/*` 或 `/admin/partners` | 用於 partner authorization / staging management |
| Taiwan tenant owner/agent | `33333333-3333-4333-8333-333333333333` | `/admin/*` | 用於 tenant-visible property / AI / lead / client / ingest |
| Japan test partner user | new staging-only org | `/partner/*` | 用於 source-of-truth partner console |

核心規則：

- `/admin/*` = Taiwan tenant scope
- `/partner/*` = Japan partner scope
- `/platform/*` 或 `/admin/partners` = platform management scope

### 3.2 New staging-only Japan test partner identity

Proposed organization:

- display name:
  - `星澄測試日本不動產株式会社`
  - English label: `Hoshisumi Japan Test Realty`
- organization_code:
  - `HOSHISUMI_JP_TEST_PARTNER_STAGING`
- semantic category:
  - `japan_partner`
- explicit staging/test marker:
  - include `STAGING`, `TEST`, or equivalent marker in name/code/metadata

Proposed partner:

- partner slug:
  - `hoshisumi_japan_test_partner`
- display_name:
  - `Hoshisumi Japan Test Realty`
- status:
  - `active`
- service fee wording:
  - use `platform_service_fee`
  - do not describe this partner as commission-based in docs/UI copy

Important note:

現有 `partners` table 實際欄位仍是：

- `default_fee_percent`
- no explicit `service_fee_model` column yet

所以這輪 proposal 採：

- 文義上把 fee model 定義為 `platform_service_fee`
- seed 階段先沿用現有欄位 `default_fee_percent`
- 若之後要把 `service_fee_model` 變成真實 schema，再另開 additive migration

### 3.3 Owner account mapping model

`juliushsu@gmail.com` 在 staging 應具備兩筆 agent identity：

1. tenant/platform agent row in org `3333...`
2. Japan test partner agent row in new staging-only Japan test partner org

同時要有：

- partner membership only for the new test partner
- not for `world_eye`
- not for `nippon_prime_realty`

This means:

- 不可再把 owner 測試需求綁到真實 `world_eye partner_users`
- 也不可讓 owner 因 staging debug 需求成為正式 `world_eye` partner persona

### 3.4 Debug / delegated mode rule

如果 platform owner 要代看 partner console：

- UI/API 必須標示為 `debug` / `delegated` / `impersonation`
- 不可假裝是正式 partner user

這輪不改前端，但文件先定義 canonical contract：

- 正式 partner user:
  - active org = partner org
  - own `partner_users` membership
- delegated/debug viewer:
  - active org 仍為平台/tenant org
  - 只能視為 debug mode，不是正式 partner persona

## 4. Proposed Reserved Staging IDs

如果要落 staging seed，建議直接保留固定 ID，避免之後每次 seed 漂移。

| record | proposed id |
| --- | --- |
| Japan test partner org | `88888888-1111-4888-8111-888888888888` |
| Japan test partner | `90000000-0000-4000-8000-000000000099` |
| partner authorization for tenant org `3333...` | `92000000-0000-4000-8000-000000000099` |
| owner agent in Japan test partner org | `78888888-1111-4888-8111-888888888888` |
| owner partner_user mapping | `91111111-9999-4999-8999-999999999999` |

These are proposal-only reserved IDs in this document.  
This turn does not apply them.

## 5. B. Staging Seed SQL / Script Plan

## 5.1 Seed scope

Seed 只應作用於 staging，且必須 idempotent。

建議新增：

- `supabase/staging_owner_japan_test_partner_seed.sql`

或等價的 staging-only script。

### 5.2 Seed steps

1. Insert / upsert new staging-only Japan test partner org

- `organizations.id = 88888888-1111-4888-8111-888888888888`
- `name = 星澄測試日本不動產株式会社`
- `organization_code = HOSHISUMI_JP_TEST_PARTNER_STAGING`
- `plan_type = pro`
- `is_demo = false`

Because current schema has no `org_type`/`category` column, staging/test semantics should be carried by:

- `organization_code`
- name
- optional metadata in future additive schema

2. Insert / upsert test partner

- `partners.id = 90000000-0000-4000-8000-000000000099`
- `display_name = Hoshisumi Japan Test Realty`
- `partner_slug = hoshisumi_japan_test_partner`
- `status = active`
- `country = jp`
- `default_fee_percent = 1.00`
- `contact_email = staging-hoshisumi-jp-test@hoshisumi.test`

3. Insert / upsert `partner_authorizations`

- authorize new test partner into tenant org `33333333-3333-4333-8333-333333333333`
- `is_active = true`
- default owner can point to tenant owner agent `44444444-4444-4444-8444-444444444444`

4. Insert / upsert owner agent in partner org

- new agent row for `juliushsu@gmail.com`
- active org = new Japan test partner org
- role = `super_admin` or `owner`

5. Insert / upsert `partner_users`

- link only the new partner org/agent/email to `hoshisumi_japan_test_partner`
- do not reuse `world_eye`
- do not reuse `nippon_prime_realty`

6. Seed one minimal sample chain

- one `property_ingest_job`
- one `properties_master`
- one `tenant_property_binding`
- one `public.properties` transitional projection

This sample chain should exist solely under the test partner.

## 5.3 Sample seed chain plan

Suggested sample IDs:

| record | proposed id |
| --- | --- |
| sample property_ingest_job | `70111111-1111-4711-8111-111111111199` |
| sample properties_master | `81111111-9999-4999-8999-999999999999` |
| sample tenant_property_binding | `82222222-9999-4999-8999-999999999999` |
| sample public.properties projection | `83333333-9999-4999-8999-999999999999` |

Suggested sample semantics:

- source partner:
  - `hoshisumi_japan_test_partner`
- tenant org:
  - `33333333-3333-4333-8333-333333333333`
- subject:
  - clear Japan test listing
- metadata marker:
  - `seed = staging_owner_japan_test_partner_scope_v1`
  - `staging_test_partner = true`
  - `contamination_safe = true`

## 5.4 property-ingest fallback plan

Requirement:

- in staging only
- when owner uploads Japan property and `source_partner_id` is omitted
- default to `hoshisumi_japan_test_partner`

Current limitation:

- `createPropertyIngestJob` currently stores `source_partner_id` as nullable
- validation currently treats partner ownership as same-org validation in runtime
- no `source_partner_name_snapshot` field currently exists on `property_ingest_jobs`

Therefore the safe rollout should be:

Phase S1:

- seed new test partner + authorization first

Phase S2:

- staging-only runtime change later, not in this turn:
  - if `APP_ENV=staging`
  - if actor is owner/super_admin in tenant org `3333...`
  - if incoming Japan upload omits `source_partner_id`
  - inject default `source_partner_id = 90000000-0000-4000-8000-000000000099`

Phase S3:

- later additive schema/runtime change:
  - persist `source_partner_name_snapshot`
  - ensure `source_partner_id` is never null for Japan ingest jobs

This turn does not apply S2 or S3.

## 6. C. 需要 Backfill 的資料清單

## 6.1 Backfill categories

Backfill 目標不是先大量刪資料，而是先分類：

1. formal partner seed
2. staging owner test contamination
3. legacy orphan / image-draft Japan rows
4. world_eye legitimate sample inventory

### 6.2 Likely contamination now attached to `world_eye`

根據目前 staging canonical alignment 與先前補鏈結果，以下 Japan rows 高機率屬於 staging 測試或 legacy transitional data，不應長期掛在 `world_eye`：

| property id | title | current issue |
| --- | --- | --- |
| `a3333333-3333-4333-8333-333333333334` | `Staging Intake Property World Eye` | name itself indicates staging intake test |
| `a3333333-3333-4333-8333-333333333335` | `Staging Intake Property World Eye 2` | name itself indicates staging intake test |
| `a1111111-1111-4111-8111-111111111111` | `東京港區赤坂投資套房` | legacy tenant-side Japan row later attached into partner chain |
| `a2222222-2222-4222-8222-222222222222` | `大阪難波商圈收租公寓` | legacy tenant-side Japan row later attached into partner chain |
| `a5555555-5555-4555-8555-555555555555` | `京都中京區旅宿改裝案` | likely staging tenant/test data, not clean formal partner seed |
| `7bad4e17-5c2f-44a1-b4f6-38b1af92a36b` | `霞關公寓101` | legacy image-draft/orphan backfilled later |
| `0bebfa68-37d4-4ff3-9e3b-d50a8bfc3cb8` | `Lions Mansion 京都河原町` | legacy orphan backfilled later |
| `526e5b6d-b675-4824-90d9-1dc4d7e7e380` | `戴亞宮殿堀江公園` | legacy orphan backfilled later |
| `00000000-0000-4000-8000-00000000de33` | `東京港區收租套房` | likely staging test data |
| `00000000-0000-4000-8000-00000000de34` | `大阪難波商圈套房` | likely staging test data |

These should be audited as:

- `staging_test_contamination_candidate`

not as confirmed formal `world_eye` source-of-truth rows.

### 6.3 Formal World Eye seed rows to preserve

目前正式 World Eye seed 鏈應優先保護：

- `properties_master`
  - `81111111-1111-4111-8111-111111111111`
  - `81111111-1111-4111-8111-111111111112`
  - `81111111-1111-4111-8111-111111111113`
  - `81111111-1111-4111-8111-111111111114`
  - `81111111-1111-4111-8111-111111111115`

These are formal seed candidates from:

- [supabase/staging_partner_management_seed.sql](/Users/chishenhsu/Desktop/Codex/星澄地所HOSHISUMI/supabase/staging_partner_management_seed.sql)

### 6.4 Backfill actions proposed

For contamination candidates, future staging-only backfill should do:

1. classify row as `formal_seed` / `test_contamination` / `legacy_orphan`
2. if `test_contamination`
   - remap `properties_master.source_partner_id` to test partner
   - remap related `tenant_property_bindings`
   - update transitional `public.properties.partner_id`
   - preserve original IDs where possible
3. if `legacy_orphan`
   - either re-home to test partner
   - or explicitly archive as non-formal Japan test data

### 6.5 property_ingest_jobs backfill list

Needs audit in future implementation:

- jobs where:
  - `environment_type = 'staging'`
  - Japan source
  - `source_partner_id is null`
  - or `source_partner_id = world_eye` but metadata/title indicates owner test upload

These should be marked:

- `missing_source_partner`
- `staging_test_contamination`
- `formal_partner_seed`

Current gap:

- no `source_partner_name_snapshot`
- no explicit contamination flag field

Recommended interim marking location:

- `property_ingest_jobs.metadata_json`

## 7. D. 不碰 Production 的保證

This proposal explicitly does not:

- modify production database
- modify production schema
- modify production runtime
- change frontend behavior
- change production partner routing

Any future implementation under this proposal must be guarded by:

1. staging-only seed file naming
2. staging-only environment check
3. no fallback behavior enabled outside staging
4. no reassignment of production partner rows

Recommended rollout rule:

- all SQL/script artifacts created from this proposal must be labeled `staging_*`
- no shared migration should silently introduce test partner fallback into production

## 8. E. Readdy 後續要接的欄位與頁面清單

## 8.1 Pages

Readdy should eventually align these pages:

1. `/admin/properties`
2. `/admin/property-ingest`
3. `/admin/properties/import-japan`
4. `/admin/partners`
5. `/partner/properties`
6. future `/partner/handoffs`
7. future persona/org switcher or debug/delegated banner

## 8.2 Fields Readdy must consume

### `/admin/properties`

Required additive fields:

- `property_source_type`
- `property_master_id`
- `tenant_property_binding_id`
- `source_partner_id`
- `marketing_status`

Interpretation:

- if `property_source_type = partner`
  - row is tenant-visible partner inventory
- `marketing_status` may be `null`
  - field must still be read and tolerated

### `/partner/properties`

Required semantics:

- show active partner scope identity
- show current partner name / slug
- show whether page is:
  - formal partner mode
  - debug/delegated mode

Required row fields already available or expected:

- `source_partner_id`
- `source_property_ref`
- `tenant_binding_summary`

### `/admin/property-ingest`

Readdy should plan for:

- visible `source_partner_id`
- visible `source_partner_name_snapshot` once added
- explicit badge when fallback test partner is auto-assigned in staging
- clear distinction between:
  - no partner chosen
  - staging defaulted to test partner
  - explicit real partner selection

### `/admin/partners`

Readdy should show:

- formal partner list
- test partner badge
- authorization status to tenant org `3333...`
- never mix test partner card with real partner card semantics

## 8.3 Persona banner requirement

Readdy should eventually render a visible scope banner:

- current org name
- current persona
- current partner scope if any
- whether route is:
  - formal
  - debug
  - delegated

This is especially important for:

- `juliushsu@gmail.com`
- multi-org staging owners

## 9. Implementation Recommendation

Recommended order:

1. approve this proposal
2. add staging-only seed for:
  - new org
  - new partner
  - authorization
  - owner partner agent
  - owner partner_user mapping
3. run contamination audit
4. backfill contamination candidates from `world_eye` to test partner
5. later add staging-only ingest fallback
6. later update approve path to create:
  - `properties_master`
  - `tenant_property_bindings`
  - `public.properties` transitional projection
7. then let Readdy wire pages to the canonical fields above

## 10. This Turn Output

This turn provides:

- proposal
- seed plan
- backfill plan
- Readdy field/page checklist

This turn does not provide:

- applied seed
- runtime change
- schema change
- production change

Because no seed was applied in this turn, there are currently no newly created real records to report for:

- new org id
- new partner id
- partner_authorization id
- owner agent / partner_user mapping
- sample property_ingest_job
- sample properties_master
- sample tenant_property_binding
- sample public.properties projection

The proposed reserved IDs are listed in section 4 for future staging-only implementation.
