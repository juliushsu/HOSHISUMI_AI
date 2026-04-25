# Japan Property Source Partner + Address Governance v1

staging only

本文件定義日本物件匯入後，在 staging 的 `source partner`、真實地址分層、tenant visibility、以及 marketing status 治理方案。

本文件是 architecture / contract proposal，不在本輪直接實作 runtime。  
production 不在本文件 scope 內。

## 1. Goals

- `property_ingest_jobs` 建立時必須帶 `source_partner_id`，不可再出現無來源合作方的日本匯入任務。
- 台灣 admin 代替日本方匯入時，仍必須明確選擇來源日本 partner。
- 日本來源物件採 `properties_master` 作為 source-of-truth，tenant 端則以 `tenant_property_bindings` 管理可見與營運狀態。
- 地址資料明確分成可公開地址與完整真實地址，避免完整地址洩漏到公開文案或 storefront。
- `approve` 後必須形成 tenant-visible property subject，讓 `/api/admin/properties` 可正確顯示匯入物件與 `marketing_status`。
- 日本 partner 與台灣 tenant 權限邊界清楚分離，避免 tenant 回寫 source master。

## 2. Non-Goals

本輪不做：

- production rollout
- partner upload UI redesign
- 舊有 `public.properties` 完整移除
- AI copy / image generation runtime 改寫
- geocoding provider implementation 調整

## 3. Current Staging Gaps

目前 staging 已有雛型，但仍存在以下落差：

1. [src/services/propertyIngestJobs.js](/Users/chishenhsu/Desktop/Codex/星澄地所HOSHISUMI/src/services/propertyIngestJobs.js)
   - `source_partner_id` 目前仍可為 `null`
   - `validatePartnerInOrg()` 目前要求 partner 必須屬於同 `organization_id`
   - 這與「台灣 admin 代日本 partner 匯入」的 cross-border 模型不相容

2. [src/services/propertyIngestJobs.js](/Users/chishenhsu/Desktop/Codex/星澄地所HOSHISUMI/src/services/propertyIngestJobs.js)
   - `approvePropertyIngestJob()` 目前仍直接建立 `public.properties`
   - 尚未改成 `properties_master -> tenant_property_bindings -> transitional public.properties`

3. [supabase/migrations/20260424170000_phase_j3_partner_management_v1.sql](/Users/chishenhsu/Desktop/Codex/星澄地所HOSHISUMI/supabase/migrations/20260424170000_phase_j3_partner_management_v1.sql)
   - `properties_master` 已有 source master 雛型
   - `tenant_property_bindings` 已有 visibility / tenant_status / source_status 雛型
   - 但尚未有 `public_display_address`、`full_private_address`、`hide_exact_address`、`address_completeness`、`marketing_status`

## 4. Canonical Model

### 4.1 Layers

資料採三層治理：

- `property_ingest_jobs`
  - ingest pipeline 的工作單與審核中介層
  - 保存匯入來源 partner、OCR / review 產物、地址補正狀態

- `properties_master`
  - 日本來源 canonical source master
  - 由日本 partner / import pipeline 維護 source-of-truth

- `tenant_property_bindings`
  - 台灣 tenant 對日本 source property 的可見綁定與營運狀態
  - 擁有 visibility / archive / AI 文案與 marketing 狀態

### 4.2 Ownership

日本 partner 管：

- 原始資料
- `source_status`
- 完整地址
- 是否遮蔽詳細地址

台灣 tenant 管：

- tenant binding
- 是否顯示
- 是否封存
- AI 文案
- 行銷圖
- `marketing_status`

tenant 不可：

- 回寫 `properties_master`
- 把 `sold` / `off_market` 改回 `available`
- 覆蓋來源 partner 的地址遮蔽規則

## 5. Field Design

### 5.1 `property_ingest_jobs`

用途：

- 建立 ingest 任務時就鎖定來源日本 partner
- 保存 OCR / translate / review 階段對地址與 partner 的審核資訊
- approve 後記錄 canonical ids

建議欄位：

```sql
alter table public.property_ingest_jobs
  alter column source_partner_id set not null,
  add column if not exists source_partner_name_snapshot text not null default '',
  add column if not exists address_completeness text null
    check (address_completeness in ('complete', 'partial', 'missing')),
  add column if not exists address_review_required boolean not null default false,
  add column if not exists public_display_address_ja text null,
  add column if not exists public_display_address_zh text null,
  add column if not exists full_private_address_ja text null,
  add column if not exists full_private_address_zh text null,
  add column if not exists hide_exact_address boolean not null default true,
  add column if not exists approved_property_master_id uuid null references public.properties_master(id) on delete set null,
  add column if not exists approved_tenant_binding_id uuid null references public.tenant_property_bindings(id) on delete set null;
```

欄位規則：

- `source_partner_id`
  - required
  - job 建立時即決定，不允許空值
- `source_partner_name_snapshot`
  - 保存建立當下 partner 名稱快照
  - detail / audit / export 不必只依賴 join
- `public_display_address_*`
  - review 後可公開地址
- `full_private_address_*`
  - geocoding / maps /內部 enrichment 專用完整地址
- `hide_exact_address`
  - 預設 `true`
  - 表示公開端不得輸出完整番地
- `address_completeness`
  - `complete | partial | missing`
- `address_review_required`
  - OCR 或人工 review 判斷地址仍不完整時為 `true`
- `approved_property_master_id`
  - approve 後 canonical master id
- `approved_tenant_binding_id`
  - approve 後 tenant binding id

備註：

- 現有 `approved_property_id` 可保留做 transitional compatibility。
- canonical approve 成果應改看 `approved_property_master_id` / `approved_tenant_binding_id`。

### 5.2 `properties_master`

用途：

- 日本來源 source-of-truth
- 作為 tenant-visible 綁定的上游主檔
- 保管完整地址與來源狀態

建議欄位：

```sql
alter table public.properties_master
  add column if not exists source_partner_name_snapshot text not null default '',
  add column if not exists public_display_address_ja text null,
  add column if not exists public_display_address_zh text null,
  add column if not exists full_private_address_ja text null,
  add column if not exists full_private_address_zh text null,
  add column if not exists hide_exact_address boolean not null default true,
  add column if not exists address_completeness text not null default 'missing'
    check (address_completeness in ('complete', 'partial', 'missing')),
  add column if not exists address_review_required boolean not null default false,
  add column if not exists geo_address_used text null,
  add column if not exists geocode_provider text null,
  add column if not exists lat numeric null,
  add column if not exists lng numeric null,
  add column if not exists geocoded_at timestamptz null;
```

欄位規則：

- `source_partner_name_snapshot`
  - 保存 source partner 名稱快照
- `public_display_address_*`
  - 可用於 admin list、detail、storefront、marketing copy
  - 可是遮蔽後地址
- `full_private_address_*`
  - 完整真實地址
  - 僅 partner/admin/enrichment 使用
- `hide_exact_address`
  - `true` 時，不得把完整地址輸出到公開文案
- `address_completeness`
  - 代表 source master 目前地址完整度
- `address_review_required`
  - 表示 detail/review UI 需提示人工補正
- `geo_address_used`
  - 記錄 geocode 時實際採用的地址字串，方便 audit

### 5.3 `tenant_property_bindings`

用途：

- 管理 tenant-visible property 狀態
- 管理 tenant 的 visibility / archive / marketing 生命週期

建議欄位：

```sql
alter table public.tenant_property_bindings
  add column if not exists marketing_status text not null default 'not_generated'
    check (marketing_status in ('not_generated', 'generated', 'updated', 'stale')),
  add column if not exists archived_at timestamptz null,
  add column if not exists last_master_synced_at timestamptz null,
  add column if not exists last_marketing_generated_at timestamptz null,
  add column if not exists last_marketing_source_hash text null;
```

欄位規則：

- `marketing_status`
  - `not_generated`
  - `generated`
  - `updated`
  - `stale`
- `marketing_status` 屬於 tenant binding，不屬於 `properties_master`
- `source_status` 仍然只來自 `properties_master.status`
- `tenant_status` 可保留 `draft / imported / reviewed / marketing / archived`
  - 若 staging 先不改 enum，可由 API contract 先行擴充，migration 再補齊

## 6. Source Partner Required + Authorization Rule

### 6.1 Job Creation Rule

`POST /api/admin/property-ingest/jobs` 必須帶：

- `source_partner_id`

不再接受：

- `source_partner_id = null`

detail / list response 必須回：

- `source_partner_id`
- `source_partner_name`

detail 頁應顯示欄位名稱：

- `來源合作方`

### 6.2 Taiwan Admin Proxy Import Rule

若台灣 admin 代替日本 partner 匯入：

- actor 仍是台灣 org admin
- 但 `source_partner_id` 必須指向該日本 partner
- 不可因為匯入者不是 partner org 就省略來源 partner

### 6.3 Partner Authorization Rule

驗證規則應從「partner 必須屬於同 org」改為：

1. `partners.id = source_partner_id`
2. `partners.status = active`
3. 對當前 tenant org 存在有效 `partner_authorizations`
4. `partner_authorizations.is_active = true`

也就是：

- 驗證對象應是 `partner_authorizations`
- 而不是 `partners.organization_id = auth.organizationId`

### 6.4 Staging Default Partner

staging seed 應確保以下 partner 可選：

- `world_eye`

相關 seed 可沿用：

- [supabase/staging_partner_management_seed.sql](/Users/chishenhsu/Desktop/Codex/星澄地所HOSHISUMI/supabase/staging_partner_management_seed.sql)
- [supabase/staging_safe_seed.sql](/Users/chishenhsu/Desktop/Codex/星澄地所HOSHISUMI/supabase/staging_safe_seed.sql)

## 7. Address Governance

### 7.1 Canonical Address Fields

日本物件地址明確分為兩層：

- `public_display_address`
  - 可公開
  - 可遮蔽番地
  - 用於 detail、list、marketing copy、storefront

- `full_private_address`
  - 完整真實地址
  - 僅 partner/admin/enrichment 可用
  - 不可直接輸出到公開端

### 7.2 Address Visibility Rule

當 `hide_exact_address = true`：

- `public_display_address` 必須為遮蔽後地址
- 公開文案不可輸出 `full_private_address`
- storefront / copy / list / detail 不可拼接出完整番地

當 `hide_exact_address = false`：

- 可允許公開端使用完整地址
- 但仍建議透過 `public_display_address` 作為唯一公開輸出來源

### 7.3 Address Completeness Rule

`address_completeness`：

- `complete`
- `partial`
- `missing`

定義：

- `complete`
  - 足以供 geocoding 與內部真實定位使用
- `partial`
  - 只到區域、町名、建物名或不完整番地
- `missing`
  - 無法判定真實地址

### 7.4 OCR / Review Rule

若 OCR 判定地址不完整：

- `address_completeness = partial | missing`
- `address_review_required = true`

detail / review UI 必須：

- 顯示人工補正提示
- 不得把不完整地址默認當成已完成校正

### 7.5 Geocoding Rule

Google Maps / Geocoding 只能使用：

- `full_private_address`

不可使用：

- `public_display_address`

除非：

- `hide_exact_address = false`

即使 geocode 成功，也不可把完整地址自動回灌到公開文案。  
公開輸出仍應使用 `public_display_address`。

## 8. Approve Flow

### 8.1 Canonical Flow

approve flow 定義為：

1. `property_ingest_jobs`
2. `properties_master`
3. `tenant_property_bindings`
4. `transitional public.properties`

### 8.2 Detailed Steps

1. ingest job 建立
   - required: `source_partner_id`
   - 建立 `source_partner_name_snapshot`

2. OCR / translate / review
   - 產生或補正：
     - `public_display_address_*`
     - `full_private_address_*`
     - `hide_exact_address`
     - `address_completeness`
     - `address_review_required`

3. approve
   - 以 reviewed fields 為優先
   - 若無 reviewed fields，才回退 translated fields

4. upsert `properties_master`
   - key 建議：
     - `source_partner_id + source_property_ref`
   - 寫入：
     - source partner
     - source status
     - source title / price / layout / area
     - private/public address fields

5. upsert `tenant_property_bindings`
   - key：
     - `property_master_id + organization_id`
   - 初始狀態建議：
     - `visibility = active`
     - `tenant_status = draft` 或 `imported`
     - `source_status = properties_master.status`
     - `marketing_status = not_generated`

6. transitional `public.properties`
   - staging 期間仍可建立或綁定一筆 tenant-visible `public.properties`
   - 作為舊列表、舊 detail、舊 AI pipeline 的相容層
   - 但 canonical source-of-truth 不再是 `public.properties`

### 8.3 Approval Outcome

approve 後不代表立即公開上架。

approve 後至少應保證：

- 有一筆 `properties_master`
- 有一筆對應的 `tenant_property_bindings`
- `/api/admin/properties` 看得到該物件
- `marketing_status = not_generated`

## 9. Admin API Proposal

### 9.1 `GET /api/admin/properties`

此 API 應回傳 tenant-visible properties，而不是只把 `public.properties` 視為唯一主檔。

可見條件：

- 該 tenant org 已存在 binding
- 或 staging policy 下該 tenant org 已啟用對應日本 partner，並已由 approve 建立 tenant-visible property subject

建議回傳欄位：

```json
{
  "id": "tenant_visible_subject_id",
  "property_master_id": "uuid",
  "tenant_binding_id": "uuid",
  "linked_property_id": "uuid",
  "country": "jp",
  "title": "string",
  "title_ja": "string",
  "title_zh": "string",
  "public_display_address": "string",
  "address_completeness": "partial",
  "address_review_required": true,
  "hide_exact_address": true,
  "price": 32800000,
  "currency": "JPY",
  "layout": "1K",
  "area_sqm": 25.4,
  "source_partner_id": "uuid",
  "source_partner_name": "World Eye",
  "source_status": "available",
  "visibility": "active",
  "tenant_status": "draft",
  "effective_status": "available",
  "marketing_status": "not_generated",
  "cover_image_url": "https://...",
  "created_at": "2026-04-25T00:00:00.000Z",
  "updated_at": "2026-04-25T00:00:00.000Z"
}
```

### 9.2 Marketing Status Rule

列表至少需支援以下狀態：

- `not_generated`
- `generated`
- `updated`
- `stale`

規則：

- approve 完成但 AI 文案尚未生成時：
  - `marketing_status = not_generated`
- 已產生文案後：
  - `generated` 或 `updated`
- source master 重要欄位變動後：
  - `stale`

## 10. Partner API Proposal

### 10.1 `GET /api/partner/properties`

此 API 應回傳 source master，而不是 tenant binding。

建議回傳欄位：

```json
{
  "id": "property_master_id",
  "source_partner_id": "uuid",
  "source_partner_name": "World Eye",
  "source_of_truth": "japan_partner",
  "source_property_ref": "WE-2026-0001",
  "country": "jp",
  "status": "available",
  "title_ja": "東京都港区南青山投資マンション",
  "title_zh": "東京都港區南青山投資套房",
  "public_display_address_ja": "東京都港区南青山...",
  "public_display_address_zh": "東京都港區南青山...",
  "full_private_address_ja": "東京都港区南青山1-2-3",
  "full_private_address_zh": "東京都港區南青山1-2-3",
  "hide_exact_address": true,
  "address_completeness": "complete",
  "address_review_required": false,
  "price": 32800000,
  "currency": "JPY",
  "layout": "1K",
  "area_sqm": 25.4,
  "description_ja": "駅近で投資需要が安定したワンルーム。",
  "description_zh": "近站、投資需求穩定的一房物件。",
  "image_urls": [],
  "source_updated_at": "2026-04-25T00:00:00.000Z",
  "created_at": "2026-04-25T00:00:00.000Z",
  "updated_at": "2026-04-25T00:00:00.000Z"
}
```

### 10.2 Partner Permission Boundary

partner 可管理：

- 原始資料
- `status`
- `full_private_address`
- `public_display_address`
- `hide_exact_address`

partner 不可管理：

- `tenant_status`
- `visibility`
- `archived`
- `marketing_status`
- tenant AI 文案 / 行銷圖

## 11. Staging Migration Proposal

### 11.1 Migration Required

需要 staging migration。

原因：

- `property_ingest_jobs.source_partner_id` 目前非必填
- partner 驗證邏輯目前錯把 cross-border partner 當成 same-org relation
- `properties_master` 缺少地址治理欄位
- `tenant_property_bindings` 缺少 `marketing_status`
- approve 成果缺少 canonical id 追蹤欄位

### 11.2 Suggested Migration Scope

建議新增一支 staging-only migration，內容包含：

1. `property_ingest_jobs`
   - `source_partner_id` 改 `not null`
   - 新增 partner snapshot / address governance / approved canonical id 欄位

2. `properties_master`
   - 新增 public/private address 分層欄位
   - 新增 `hide_exact_address`
   - 新增 `address_completeness`
   - 新增 `address_review_required`
   - 新增 geocode audit 欄位

3. `tenant_property_bindings`
   - 新增 `marketing_status`
   - 新增 tenant marketing metadata 欄位

4. index / constraints
   - `properties_master(source_partner_id, source_property_ref)` unique
   - `tenant_property_bindings(property_master_id, organization_id)` unique
   - `marketing_status` enum constraint

5. backfill proposal
   - 既有 staging jobs 若 `source_partner_id` 為空，需先補資料再升 `not null`
   - 既有 master address 欄位需拆分回填為 `public_display_address_*` / `full_private_address_*`

### 11.3 Transitional Compatibility

staging migration 期間可保留：

- `public.properties`
- `approved_property_id`
- 舊版 list/detail 對 `public.properties` 的依賴

但應在文件與後續 runtime 中明確標記：

- `public.properties` 是 transitional compatibility layer
- `properties_master + tenant_property_bindings` 才是日本來源 canonical model

## 12. Environment Scope

本提案明確限定：

- staging only

不處理：

- production schema rollout
- production migration
- production partner onboarding
- production storefront behavior switch

production 是否採納，需待 staging 驗證完成後，再另開文件評估。

## 13. Implementation Notes For Future Runtime Work

未來 runtime 實作時，建議優先順序：

1. 補 schema migration
2. 修改 `property_ingest_jobs` create / detail / review / approve contract
3. 改 `approve` 流向到 `properties_master + tenant_property_bindings`
4. 補 `/api/admin/properties` tenant-visible read model
5. 補 `/api/partner/properties` source master address fields
6. 最後再處理 `public.properties` 相容層瘦身

## 14. Summary

本文件的核心決策是：

- `source_partner_id` 在 ingest job 建立時即為必填
- 日本來源物件採 `properties_master` 作為 source-of-truth
- `tenant_property_bindings` 管 tenant visibility 與 `marketing_status`
- 地址明確拆分為 `public_display_address` 與 `full_private_address`
- geocoding 只能使用 `full_private_address`
- `approve` 流向改為 `ingest -> properties_master -> tenant_property_bindings -> transitional public.properties`
- 本輪只做 staging proposal，不碰 production
