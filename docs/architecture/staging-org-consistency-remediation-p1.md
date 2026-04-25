# Staging Org Consistency Remediation P1

staging only

本文件定義 staging org consistency remediation P1 的正式方案。  
本輪只產出 architecture plan 與 SQL draft，不修改 runtime，不 apply migration，不碰 production。

## 1. Goals

P1 目標：

1. `property-ingest` 建立 job 時，`source_partner_id` 驗證改用 `partner_authorizations`。
2. `/api/admin/properties` 提出 tenant-visible read model 過渡方案，避免永遠綁死 `public.properties`。
3. `tenant_property_bindings` 補齊 org-scoped RLS / policy proposal。
4. `AI assistant` 規劃從 `public.properties` 過渡到 tenant-visible property subject。
5. 對 Readdy 保持 backward-compatible。
6. 全程 staging only，不碰 production。

## 2. Scope

P1 包含：

- `property-ingest` source partner validation 規則調整
- `/api/admin/properties` response / read model 過渡方案
- `tenant_property_bindings` RLS proposal
- AI assistant property subject 過渡方案
- Readdy 相容策略
- rollback plan

P1 不包含：

- approve runtime flow 改寫
- production schema / runtime rollout
- production RLS rollout
- AI tables 正式 schema migration
- `public.properties` 移除

## 3. Current State Confirmation

### 3.1 Property Ingest

目前 staging 的 `property_ingest_jobs` 本身已有 `organization_id`，org scope 也有在 create / list / detail / approve 中使用。  
但 `source_partner_id` 驗證仍然是 same-org 模型：

- `partners.organization_id = auth.organizationId`

這與 tenant / partner 應透過 `partner_authorizations` 連接的 architecture 不一致。

### 3.2 Admin Properties

`/api/admin/properties` 目前有使用 `organization_id`，但讀的 subject 是：

- `public.properties`

這代表 admin list 雖然有 org scope，卻仍停留在舊 tenant property 模型，尚未對齊：

- `properties_master`
- `tenant_property_bindings`

### 3.3 Tenant Property Bindings

`tenant_property_bindings` 目前已有：

- `organization_id`
- `property_master_id`
- `linked_property_id`
- visibility / tenant_status / source_status / effective_status

但目前沒有完整的 org-scoped RLS / policy，且 tenant-facing runtime 還沒有把它當作主 read model。

### 3.4 AI Assistant

`/api/admin/ai-assistant` 目前整體上是 tenant-scoped，但 property subject 仍是：

- `public.properties`

因此 AI ownership 沒有偏掉，但 canonical property subject 仍未過渡到 tenant-visible layer。

## 4. P1 Remediation Plan

### 4.1 A. Property Ingest Source Partner Validation

P1 規則：

`POST /api/admin/property-ingest/jobs` 建立 job 時，`source_partner_id` 驗證應改為：

1. `partners.id = source_partner_id`
2. `partners.status = active`
3. 存在 `partner_authorizations.partner_id = source_partner_id`
4. `partner_authorizations.organization_id = auth.organizationId`
5. `partner_authorizations.is_active = true`

不再使用：

- `partners.organization_id = auth.organizationId`

### 4.1.1 Runtime Files

P1 預計修改：

- `src/services/propertyIngestJobs.js`
- `src/services/propertyIntakeCases.js`

修改方向：

- `validatePartnerInOrg()` 改為 `validatePartnerAuthorizationForOrg()`
- 回傳 partner 與 authorization 基本資料
- 錯誤訊息也要改成 authorization-based wording

### 4.1.2 Behavior

修改後的語義：

- tenant org 匯入日本 partner 資料時，只要有 active authorization 就合法
- source partner 不再需要與 tenant 同 org
- staging seed 中的 `world_eye` / `nippon_prime_realty` 應成為合法可選 partner

## 5. B. Admin Properties Tenant-Visible Read Model Transition

### 5.1 Objective

`/api/admin/properties` 不應永遠綁死在舊的 `public.properties` 模型。  
但 P1 不直接砍掉 `public.properties`，而是先做相容過渡。

### 5.2 Short-Term Transition Strategy

短期策略：

- 主查詢仍可相容 `public.properties`
- 但 response contract 必須預留 tenant-visible fields
- 若某筆資料已有 binding，應優先回 binding context
- 若尚未有 binding，則新欄位可回 `null`

### 5.3 P1 Response Additions

`GET /api/admin/properties` 與 `GET /api/admin/properties/:id` 應準備新增以下欄位：

- `tenant_binding_id`
- `property_master_id`
- `source_partner_id`
- `marketing_status`

短期允許：

- `tenant_binding_id = null`
- `property_master_id = null`
- `source_partner_id = null`
- `marketing_status = null | not_generated`

### 5.4 Read Model Design

P1 read model 建議採 adapter 形式：

1. 先查 `public.properties`
2. 若 property 是 Japan ingest 來源，嘗試找對應：
   - `tenant_property_bindings.linked_property_id = properties.id`
3. 若找到 binding，再補上：
   - `tenant_binding_id`
   - `property_master_id`
   - `source_partner_id`
   - `marketing_status`
4. 若找不到 binding，維持舊 property response，但新欄位回 `null`

### 5.5 Why P1 Uses Adapter

原因：

- 不改 approve flow
- 不破壞現有 admin properties list
- 先讓 Readdy 與 frontend contract 有遷移入口

## 6. C. Tenant Property Bindings RLS Proposal

### 6.1 Goal

`tenant_property_bindings` 必須補成真正 org-scoped tenant table，而不是只有 `organization_id` 欄位卻沒有 access policy。

### 6.2 P1 Policy Direction

P1 只出 SQL proposal，不 apply。

建議 policy：

- `select`
  - `organization_id = public.current_organization_id()`
- `insert`
  - `organization_id = public.current_organization_id()`
- `update`
  - `organization_id = public.current_organization_id()`
- `delete`
  - 先不開，或只給 super roles

### 6.3 Interaction With Partner Route

目前 `/api/partner/properties` 會用 service role 讀 binding summary。  
P1 短期允許這條 route 繼續這樣做，原因是：

- 這是 partner-side operational/debug route
- 尚未建立專用 partner summary read model

但長期不應讓 partner route 永遠直接讀 tenant binding table。

## 7. D. AI Assistant Property Subject Transition

### 7.1 Current Problem

目前 `AI assistant` 的 property source 是：

- `public.properties`

這會讓 AI analysis / copy generation 永遠只綁在舊 tenant property model。

### 7.2 P1 Transition Objective

P1 不立刻切換 AI storage schema，但要先把 lookup 與 API contract 設計成可過渡。

### 7.3 P1 Subject Model

P1 建議引入 tenant-visible property subject 概念：

- `subject_type`
  - `property`
  - `tenant_binding`
- `property_id`
  - 舊模型相容欄位
- `tenant_binding_id`
  - 新模型相容欄位
- `property_master_id`
  - 供 UI / debug / trace 用

### 7.4 P1 Runtime Strategy

P1 runtime 只先做 interface transition design：

1. `fetchProperty()` 不再被視為永遠只讀 `public.properties`
2. 後續應抽成 tenant-visible subject resolver
3. 若 request 只給 `property_id`，先維持舊行為
4. 若後續開始給 `tenant_binding_id`，則可進入 binding subject path

### 7.5 P1 Data Ownership Rule

即使後續 property subject 改成 binding：

- AI usage 仍屬於 tenant organization
- AI 文案與分析結果仍屬於 tenant
- partner 不擁有 tenant AI output

## 8. Readdy Backward-Compatible Contract

### 8.1 Property Ingest

Readdy 在建立 ingest job 時：

- 繼續傳 `source_partner_id`
- 不需要新加 partner payload
- 但要預期 validation 規則從 same-org 改成 authorization-based

### 8.2 Admin Properties

Readdy 對 `/api/admin/properties` 應採向前相容方式處理：

- 舊欄位繼續使用
- 新欄位若存在就讀取
- 新欄位若 `null` 也不可視為錯誤

P1 新欄位：

- `tenant_binding_id`
- `property_master_id`
- `source_partner_id`
- `marketing_status`

### 8.3 AI Assistant

P1 不要求 Readdy 立即改 request contract。  
但未來應預留支援：

- `tenant_binding_id`
- `subject_type`

### 8.4 Why This Is Backward-Compatible

原因：

- 舊 request payload 仍可運作
- 舊 response 欄位不移除
- 新欄位先 optional
- approve flow 暫時不動

## 9. Rollback Plan

### 9.1 Property Ingest Validation

若 authorization-based partner validation 上線後 staging seed 或授權資料不完整，可能導致 ingest create 失敗。

rollback：

- 暫時退回 same-org validation
- 或以 feature flag / staging env toggle 控制

### 9.2 Admin Properties Read Model

若 `/api/admin/properties` adapter 層補 binding context 後導致列表不穩：

rollback：

- 保留舊 `public.properties` 主查詢
- 新欄位統一回 `null`

### 9.3 Tenant Binding RLS

若未來 apply RLS 後導致 tenant 路徑查不到資料：

rollback：

- 先 rollback RLS policy
- table schema 保留

### 9.4 AI Subject Transition

P1 只做 interface design，不切 schema / runtime subject。  
因此 rollback 成本極低，等同不啟用新 subject path。

## 10. Staging Migration Need

P1 仍需要 staging migration 規劃，但不在本輪 apply。

需要的原因：

- `/api/admin/properties` 若要穩定回 `marketing_status`，binding table 需要對應欄位
- property ingest source partner governance 欄位需要 draft migration 支撐
- `tenant_property_bindings` RLS / policy 需要 SQL proposal

本輪產出：

- architecture plan
- SQL draft

本輪不做：

- 正式 migration apply
- runtime migration execution

## 11. Files Planned For P1 Runtime

P1 若後續開始實作，預計涉及：

- `src/services/propertyIngestJobs.js`
- `src/services/propertyIntakeCases.js`
- `src/routes/adminProperties.js`
- `src/routes/adminAiAssistant.js`

P1 若後續開始落 migration，預計涉及：

- `supabase/migrations/...` staging-only migration
- `supabase/drafts/staging_tenant_property_bindings_rls_proposal_p1.sql`

## 12. Production Boundary

本文件明確限定：

- staging only

本輪不做：

- production schema 變更
- production runtime rollout
- production approve flow 改造
- production RLS enable
- production AI subject cutover

## 13. Summary

P1 的核心精神是：

- 先修正 org consistency 最關鍵的錯位點
- 先讓 `source_partner_id` 驗證回到 `partner_authorizations`
- 先為 `/api/admin/properties` 建立 tenant-visible 過渡介面
- 先為 `tenant_property_bindings` 補齊 RLS proposal
- 先讓 AI assistant 準備好從 `public.properties` 過渡到 tenant-visible subject
- 全程 staging-only，不碰 production
