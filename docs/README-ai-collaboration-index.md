# AI Collaboration Index

docs only

本索引文件提供 Readdy、Codex、以及後續任何 AI 協作者在單一 branch 上理解 HOSHISUMI staging architecture、AI assistant、tenant / partner / property governance 的最短入口。

本索引範圍：

- 只整理 docs / `supabase/drafts`
- 不代表 runtime 已全部完成
- 不代表 migration 已 apply
- 不碰 production

## A. 文件分類總覽

### Architecture

- [tenant-partner-ai-property-flow-v1.md](/Users/chishenhsu/Desktop/Codex/星澄地所HOSHISUMI/docs/architecture/tenant-partner-ai-property-flow-v1.md)
- [org-consistency-audit-v1.md](/Users/chishenhsu/Desktop/Codex/星澄地所HOSHISUMI/docs/architecture/org-consistency-audit-v1.md)
- [staging-org-consistency-remediation-p1.md](/Users/chishenhsu/Desktop/Codex/星澄地所HOSHISUMI/docs/architecture/staging-org-consistency-remediation-p1.md)
- [staging-org-consistency-remediation-p1-preflight.md](/Users/chishenhsu/Desktop/Codex/星澄地所HOSHISUMI/docs/architecture/staging-org-consistency-remediation-p1-preflight.md)
- [property-image-mapping-contract-v1.md](/Users/chishenhsu/Desktop/Codex/星澄地所HOSHISUMI/docs/architecture/property-image-mapping-contract-v1.md)
- [staging-ai-assistant-copy-analysis-gap-audit-v1.md](/Users/chishenhsu/Desktop/Codex/星澄地所HOSHISUMI/docs/architecture/staging-ai-assistant-copy-analysis-gap-audit-v1.md)
- [japan-property-source-partner-address-governance-v1.md](/Users/chishenhsu/Desktop/Codex/星澄地所HOSHISUMI/docs/architecture/japan-property-source-partner-address-governance-v1.md)
- [ai-location-enrichment-v1.md](/Users/chishenhsu/Desktop/Codex/星澄地所HOSHISUMI/docs/architecture/ai-location-enrichment-v1.md)

### Contracts

- [ai-assistant-enriched-analysis-v1.md](/Users/chishenhsu/Desktop/Codex/星澄地所HOSHISUMI/docs/contracts/ai-assistant-enriched-analysis-v1.md)
- [staging-ai-system-settings-v1.md](/Users/chishenhsu/Desktop/Codex/星澄地所HOSHISUMI/docs/contracts/staging-ai-system-settings-v1.md)
- [staging-partner-properties-debug-v1.md](/Users/chishenhsu/Desktop/Codex/星澄地所HOSHISUMI/docs/contracts/staging-partner-properties-debug-v1.md)

### Staging SQL Drafts

- [staging_japan_property_governance_migration_draft_v1.sql](/Users/chishenhsu/Desktop/Codex/星澄地所HOSHISUMI/supabase/drafts/staging_japan_property_governance_migration_draft_v1.sql)
- [staging_tenant_property_bindings_rls_proposal_p1.sql](/Users/chishenhsu/Desktop/Codex/星澄地所HOSHISUMI/supabase/drafts/staging_tenant_property_bindings_rls_proposal_p1.sql)

## B. 每份文件用途

- `tenant-partner-ai-property-flow-v1.md`
  定義 multi-tenant、Japan partner、AI assistant、property ingest / approve / marketing 的總體架構與 org context 原則。

- `org-consistency-audit-v1.md`
  盤點目前 staging 中 organization context 的主要不一致點，尤其是 `partner_authorizations`、`public.properties`、`tenant_property_bindings` 的落差。

- `staging-org-consistency-remediation-p1.md`
  定義 org consistency remediation 的 P1 方案，涵蓋 `property-ingest` 授權驗證、`/api/admin/properties` 過渡方案、binding RLS、AI subject 過渡。

- `staging-org-consistency-remediation-p1-preflight.md`
  記錄 P1 前置盤點結果，包括 active `partner_authorizations`、null `source_partner_id` jobs、binding 分布、以及 RLS 風險。

- `property-image-mapping-contract-v1.md`
  定義 property image mapping 的唯一 key、CSV / ZIP 規格、backend reject 規則、錯誤格式、staging vs production 行為。

- `staging-ai-assistant-copy-analysis-gap-audit-v1.md`
  說明 staging AI assistant 為何 analysis 與 copy 斷裂，並定義 fallback / provider / Readdy 顯示來源的修補方向。

- `japan-property-source-partner-address-governance-v1.md`
  定義日本物件匯入後的 source partner、真實地址、tenant visibility、marketing status 治理模型。

- `ai-location-enrichment-v1.md`
  定義 AI assistant location enrichment、Google Maps / Places / Geocode 相關的 staging architecture 與分析欄位契約。

- `ai-assistant-enriched-analysis-v1.md`
  定義 AI enriched analysis 的 output shape 與欄位結構，是 AI analysis / copy prompt 契約的重要參考。

- `staging-ai-system-settings-v1.md`
  定義 staging AI system settings 的可編輯 provider / routing contract，是 runtime provider wiring 與 UI 顯示的重要依據。

- `staging-partner-properties-debug-v1.md`
  定義 staging partner properties debug scope 與暫時性觀察欄位，用於 partner-side tracing。

- `staging_japan_property_governance_migration_draft_v1.sql`
  日本 property governance 的 staging migration draft，只是 proposal，不可直接視為已套用 schema。

- `staging_tenant_property_bindings_rls_proposal_p1.sql`
  `tenant_property_bindings` 的 staging RLS / policy proposal，只是 draft，不代表 staging DB 已 apply。

## C. Readdy 必讀文件清單

Readdy 在接 UI / API wiring 前，至少必讀：

1. [tenant-partner-ai-property-flow-v1.md](/Users/chishenhsu/Desktop/Codex/星澄地所HOSHISUMI/docs/architecture/tenant-partner-ai-property-flow-v1.md)
2. [staging-org-consistency-remediation-p1.md](/Users/chishenhsu/Desktop/Codex/星澄地所HOSHISUMI/docs/architecture/staging-org-consistency-remediation-p1.md)
3. [staging-org-consistency-remediation-p1-preflight.md](/Users/chishenhsu/Desktop/Codex/星澄地所HOSHISUMI/docs/architecture/staging-org-consistency-remediation-p1-preflight.md)
4. [property-image-mapping-contract-v1.md](/Users/chishenhsu/Desktop/Codex/星澄地所HOSHISUMI/docs/architecture/property-image-mapping-contract-v1.md)
5. [staging-ai-assistant-copy-analysis-gap-audit-v1.md](/Users/chishenhsu/Desktop/Codex/星澄地所HOSHISUMI/docs/architecture/staging-ai-assistant-copy-analysis-gap-audit-v1.md)
6. [staging-ai-system-settings-v1.md](/Users/chishenhsu/Desktop/Codex/星澄地所HOSHISUMI/docs/contracts/staging-ai-system-settings-v1.md)
7. [ai-assistant-enriched-analysis-v1.md](/Users/chishenhsu/Desktop/Codex/星澄地所HOSHISUMI/docs/contracts/ai-assistant-enriched-analysis-v1.md)

## D. Codex Backend 必讀文件清單

Codex backend 在修改 staging runtime / schema proposal 前，至少必讀：

1. [tenant-partner-ai-property-flow-v1.md](/Users/chishenhsu/Desktop/Codex/星澄地所HOSHISUMI/docs/architecture/tenant-partner-ai-property-flow-v1.md)
2. [org-consistency-audit-v1.md](/Users/chishenhsu/Desktop/Codex/星澄地所HOSHISUMI/docs/architecture/org-consistency-audit-v1.md)
3. [japan-property-source-partner-address-governance-v1.md](/Users/chishenhsu/Desktop/Codex/星澄地所HOSHISUMI/docs/architecture/japan-property-source-partner-address-governance-v1.md)
4. [staging-org-consistency-remediation-p1.md](/Users/chishenhsu/Desktop/Codex/星澄地所HOSHISUMI/docs/architecture/staging-org-consistency-remediation-p1.md)
5. [staging-org-consistency-remediation-p1-preflight.md](/Users/chishenhsu/Desktop/Codex/星澄地所HOSHISUMI/docs/architecture/staging-org-consistency-remediation-p1-preflight.md)
6. [staging-ai-assistant-copy-analysis-gap-audit-v1.md](/Users/chishenhsu/Desktop/Codex/星澄地所HOSHISUMI/docs/architecture/staging-ai-assistant-copy-analysis-gap-audit-v1.md)
7. [ai-location-enrichment-v1.md](/Users/chishenhsu/Desktop/Codex/星澄地所HOSHISUMI/docs/architecture/ai-location-enrichment-v1.md)
8. [ai-assistant-enriched-analysis-v1.md](/Users/chishenhsu/Desktop/Codex/星澄地所HOSHISUMI/docs/contracts/ai-assistant-enriched-analysis-v1.md)
9. [staging_japan_property_governance_migration_draft_v1.sql](/Users/chishenhsu/Desktop/Codex/星澄地所HOSHISUMI/supabase/drafts/staging_japan_property_governance_migration_draft_v1.sql)
10. [staging_tenant_property_bindings_rls_proposal_p1.sql](/Users/chishenhsu/Desktop/Codex/星澄地所HOSHISUMI/supabase/drafts/staging_tenant_property_bindings_rls_proposal_p1.sql)

## E. 目前 staging 真實規則

目前 staging 應以以下規則為準：

- 所有 admin API 都必須有真實 `x-organization-id`
- `organization_id` 是 tenant org，不得拿 placeholder 或 UI 自行猜值
- tenant 與 partner 是不同 organization，不能混成同 org
- partner 資料使用權應由 `partner_authorizations` 決定
- `public.properties` 目前仍存在，但不應再被當成唯一長期 canonical model
- `tenant_property_bindings` 是未來 tenant-visible property subject，但目前仍在過渡中
- 日本地址治理必須區分 public / private address
- `marketing_status` 屬於 tenant binding，不屬於 source master
- property image mapping 唯一 key 是 `source_property_ref`
- AI provider / fallback 狀態必須明示，不可由前端自行猜測

## F. 不可再自行推論的欄位

下列欄位或 subject 後續不得由 Readdy / Codex / 任何 AI 自行推論，必須以文件與 API / schema contract 為準：

- `organization_id`
- `source_partner_id`
- `tenant_binding_id`
- `property_master_id`
- `marketing_status`
- `address_review_required`
- `hide_exact_address`
- `property image mapping`
- `ai provider / fallback status`

補充原則：

- `organization_id` 不得用頁面名稱、tenant 名稱、測試字串自行推導
- `source_partner_id` 不得用 partner 顯示名稱或 same-org 規則猜測
- `tenant_binding_id` / `property_master_id` 不得從 `public.properties.id` 反推
- `marketing_status` 不得由是否已有文案文字直接推論
- `address_review_required` / `hide_exact_address` 不得由地址字串格式自行猜測
- property image mapping 不得模糊匹配，只能精確走 `source_property_ref`
- `ai provider / fallback status` 必須來自 API response 或 runtime metadata，不得由文案內容主觀判斷

## G. 下一階段 P1 執行順序

下一階段 P1 建議依下列順序執行：

1. backfill approved `null source_partner_id` jobs
2. `property-ingest` 改走 `partner_authorizations` 驗證
3. 補 `tenant_property_bindings.marketing_status` migration
4. 規劃 `/api/admin/properties` tenant-visible read model
5. 再處理 AI assistant subject 過渡

## Notes

本 branch 的用途是讓協作者能在單一 branch 讀到完整文件。  
它不代表：

- runtime 已全部完成
- migration 已 apply
- production 可直接 rollout

若後續要實作，請先以這份索引對照上述文件，再進入 staging-only implementation。
