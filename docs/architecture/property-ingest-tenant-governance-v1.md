# Property Ingest Tenant Governance v1

staging only

本文件定義 property-ingest 後續商業模型、AI quota 歸屬、以及日本來源 global property 與 tenant 可見資料的分層治理方案。

## 1. Goals

- 讓台灣物件與日本匯入物件都能使用 AI assistant。
- AI assistant 的分析 / 文案 / 後續圖片能力都計入 tenant quota。
- 日本來源物件不再因 `country = jp` 被 AI assistant 擋下。
- AI 輸出必須永遠留在 tenant scope，不回寫 global property master。
- 日本來源資料由 platform 維護 source of truth，tenant 只維護可見性與在地化營運狀態。
- sold / off-market 等來源狀態要能同步到 tenant 端，且保留歷史。

## 2. Current Gaps

目前 staging code 有兩個明確限制點：

1. [src/routes/adminAiAssistant.js](/Users/chishenhsu/Desktop/Codex/星澄地所HOSHISUMI/src/routes/adminAiAssistant.js)
   - `fetchProperty()` 仍限制 `data.country === 'tw'`
   - 非台灣物件會回 `PROPERTY_COUNTRY_NOT_SUPPORTED`

2. [src/services/propertyIngestJobs.js](/Users/chishenhsu/Desktop/Codex/星澄地所HOSHISUMI/src/services/propertyIngestJobs.js)
   - approve 仍直接寫入 `public.properties`
   - 這代表日本來源物件目前被寫成 tenant-scoped property，而不是 global master + tenant binding

## 3. Business Decision

### 3.1 AI quota policy

正式規則改為：

- 台灣物件使用 AI assistant：扣 tenant quota
- 日本匯入物件使用 AI assistant：也扣 tenant quota
- 日本匯入流程本身的 OCR / translate ingest 成本，仍屬 platform-side pipeline cost
- 但 ingest 完成後，tenant 在 `/admin/ai-assistant` 對該物件做 analysis / copy / image，屬 tenant-side AI usage

### 3.2 Country policy

移除：

- `PROPERTY_COUNTRY_NOT_SUPPORTED`

改為：

- 只要該物件是 tenant 在自己 org scope 內可見的 property subject，就允許進 AI assistant
- quota event 透過 metadata 區分來源，而不是用 `country` 阻擋

建議 `ai_usage_events.metadata_json` 增加：

```json
{
  "subject_origin": "tw_tenant_property",
  "billing_scope": "tenant_quota",
  "source_flow": "ai_assistant"
}
```

或日本匯入：

```json
{
  "subject_origin": "jp_master_binding",
  "billing_scope": "tenant_quota",
  "source_flow": "ai_assistant"
}
```

若後續補 image generation，建議 `ai_usage_events.event_type` 從目前的 `analysis | copy_generation` 擴成：

- `analysis`
- `copy_generation`
- `image_generation`

這樣 quota 模型不需要再拆第二套帳。

## 4. Data Boundary

### 4.1 Global layer

`properties_master`

- 平台級、跨 tenant 的日本來源物件主檔
- 只存 source-of-truth 等級資料
- 不存 tenant AI output
- 不存 tenant 編修後文案
- 不存 tenant visibility / marketing status

### 4.2 Tenant layer

`tenant_property_bindings`

- 表示某個 organization 對某個 global property 的可見關係
- tenant 可調整：
  - `visibility`
  - `tenant_status`
  - tenant 端標籤、備註、營運節點
- tenant 不可覆蓋 global sold/off_market 來源狀態

### 4.3 AI layer

AI output 一律 tenant scoped：

- `property_ai_analyses`
- `property_ai_copy_generations`
- `property_ai_copy_versions`
- `ai_usage_events`

這些資料只能跟以下其中一種 subject 綁定：

1. tenant 自有 `properties`
2. `tenant_property_bindings`

不可直接只掛在 `properties_master`

## 5. Schema Proposal

### 5.1 `properties_master`

用途：

- 日本來源主檔
- 由 partner / import / sync pipeline 更新
- 作為 tenant binding 的上游資料

建議欄位：

```sql
create table public.properties_master (
  id uuid primary key default gen_random_uuid(),
  country text not null default 'jp' check (country in ('jp')),
  status text not null check (status in ('available', 'sold', 'off_market')),
  source_of_truth text not null default 'japan_partner' check (source_of_truth in ('japan_partner')),
  source_property_ref text not null,
  source_partner_id uuid null references public.partners(id) on delete set null,
  canonical_payload_json jsonb not null default '{}'::jsonb,
  title_ja text null,
  title_zh text null,
  address_ja text null,
  address_zh text null,
  price numeric(14,2) null,
  currency text not null default 'JPY' check (currency in ('JPY')),
  layout text null,
  area_sqm numeric(12,2) null,
  description_ja text null,
  description_zh text null,
  image_urls jsonb not null default '[]'::jsonb,
  raw_source_payload jsonb null,
  source_updated_at timestamptz null,
  last_synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_of_truth, source_property_ref)
);
```

補充：

- `canonical_payload_json` 保留完整標準化後欄位
- 單欄位拆出來是為了查詢、排序與 completeness 計算
- `status` 只反映來源真相，不接受 tenant 修改

### 5.2 `tenant_property_bindings`

用途：

- tenant 對日本來源物件的可見關係與營運態

建議欄位：

```sql
create table public.tenant_property_bindings (
  id uuid primary key default gen_random_uuid(),
  property_master_id uuid not null references public.properties_master(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  company_id uuid null,
  store_id uuid null references public.stores(id) on delete set null,
  visibility text not null default 'active' check (visibility in ('active', 'hidden')),
  tenant_status text not null default 'draft' check (tenant_status in ('draft', 'marketing', 'archived')),
  source_status text not null check (source_status in ('available', 'sold', 'off_market')),
  effective_status text not null check (effective_status in ('available', 'sold', 'off_market', 'archived', 'hidden')),
  source_lock_reason text null,
  source_locked_at timestamptz null,
  tenant_notes text null,
  metadata_json jsonb not null default '{}'::jsonb,
  first_bound_at timestamptz not null default now(),
  last_synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (property_master_id, organization_id)
);
```

規則：

- `source_status` 來自 `properties_master.status`
- `effective_status` 是 UI / API 要看的狀態
- 若 `source_status = sold`，則：
  - tenant 不可修改 marketing 內容以外的狀態欄位
  - `effective_status` 強制為 `sold`
  - API 顯示「已售（來源：日本）」

### 5.3 `tenant_property_binding_events`

用途：

- 保留 tenant visibility / tenant_status / source sync 的 append-only 歷史

建議欄位：

```sql
create table public.tenant_property_binding_events (
  id uuid primary key default gen_random_uuid(),
  tenant_property_binding_id uuid not null references public.tenant_property_bindings(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_type text not null check (
    event_type in (
      'bound',
      'visibility_changed',
      'tenant_status_changed',
      'source_status_synced',
      'source_locked',
      'archived'
    )
  ),
  before_json jsonb null,
  after_json jsonb null,
  actor_type text not null check (actor_type in ('system', 'agent')),
  actor_id uuid null references public.agents(id) on delete set null,
  created_at timestamptz not null default now()
);
```

這張表是「歷史資料保留」的主體，避免只靠最後狀態回推。

## 6. AI Table Adjustment Proposal

現有 AI tables 都只接受 `property_id references public.properties(id)`。  
在 global/tenant 分層後，這個設計不夠用。

### 6.1 Canonical subject rule

AI output 的 canonical subject 應該是：

- 台灣自有物件：`property_id`
- 日本匯入物件：`tenant_property_binding_id`

建議對以下 tables 增加 `tenant_property_binding_id`：

- `property_ai_analyses`
- `property_ai_copy_generations`
- `ai_usage_events`

並加上 constraint：

```sql
check (
  ((property_id is not null)::int + (tenant_property_binding_id is not null)::int) = 1
)
```

這樣可以保證：

- 一筆 AI analysis 只能屬於一個 tenant-visible subject
- 不會誤綁到 global `properties_master`
- 也不需要讓不同 org 共用同一筆 analysis

### 6.2 Snapshot rule

analysis / copy generation 仍需保留 snapshot：

- 對台灣物件：snapshot 來自 `properties`
- 對日本物件：snapshot 應包含
  - `properties_master` 的來源資料
  - `tenant_property_bindings` 的 tenant context

建議 `property_snapshot_json` 結構：

```json
{
  "snapshot_at": "2026-04-24T10:00:00.000Z",
  "subject_type": "tenant_property_binding",
  "master_property": {},
  "tenant_binding": {}
}
```

## 7. Japan Status Sync

### 7.1 Sync rule

當日本來源更新：

- `available -> sold`
- `available -> off_market`
- `sold -> off_market`

應先更新 `properties_master.status`，再 fan-out 到所有 `tenant_property_bindings`

### 7.2 Fan-out result

每筆 binding 同步後：

- `source_status = properties_master.status`
- `last_synced_at = now()`
- 若新狀態是 `sold`
  - `effective_status = sold`
  - `source_lock_reason = 'source_marked_sold'`
  - `source_locked_at = now()`
- append 一筆 `tenant_property_binding_events`

### 7.3 UI/API copy

前台 / 後台顯示建議不要自己拼文案，直接由 API 提供：

```json
{
  "status_badge": {
    "code": "sold",
    "label": "已售",
    "source_label": "來源：日本",
    "is_source_locked": true
  }
}
```

## 8. Tenant Edit Rules

### 8.1 Allowed when source available

當 `source_status = available`：

- tenant 可改 `visibility`
- tenant 可改 `tenant_status`
- tenant 可建立 AI analysis / copy / image
- tenant 可維護 tenant notes / storefront settings

### 8.2 Disallowed when source sold

當 `source_status = sold`：

- tenant 不可把物件改回 marketing / available
- tenant 不可覆蓋 sold 來源狀態
- tenant 仍可：
  - hidden
  - archived
  - 查看歷史 AI output

建議規則：

- `visibility` 仍可 `active -> hidden`
- `tenant_status` 仍可 `marketing -> archived`
- 但 API 回傳 `effective_status = sold`

## 9. Property Completeness

### 9.1 Canonical score

`completeness_score` 建議採 100 分制：

- `title`: 15
- `address`: 20
- `price`: 20
- `layout`: 10
- `area`: 10
- `images`: 15
- `description`: 10

總分 100

### 9.2 SQL function proposal

```sql
create or replace function public.compute_property_completeness_score(
  title text,
  address text,
  price numeric,
  layout text,
  area_sqm numeric,
  image_count int,
  description text
)
returns int
language sql
immutable
as $$
  select
    (case when nullif(trim(title), '') is not null then 15 else 0 end) +
    (case when nullif(trim(address), '') is not null then 20 else 0 end) +
    (case when price is not null and price > 0 then 20 else 0 end) +
    (case when nullif(trim(layout), '') is not null then 10 else 0 end) +
    (case when area_sqm is not null and area_sqm > 0 then 10 else 0 end) +
    (case when coalesce(image_count, 0) > 0 then 15 else 0 end) +
    (case when nullif(trim(description), '') is not null then 10 else 0 end);
$$;
```

### 9.3 Exposure

staging 建議至少做其中一種：

1. computed column style API field
2. SQL view
3. dedicated endpoint

建議優先：

- 在 job detail / review preview 回傳 `completeness_score`
- 在 tenant binding detail 回傳 `completeness_score`

若要走 view，建議：

- `tenant_property_binding_read_model_v1`

輸出：

- master property fields
- tenant binding fields
- `completeness_score`
- `status_badge`

## 10. Rollout Plan

### Phase S1: policy fix

先修最小商業規則：

- 移除 AI assistant 的 `PROPERTY_COUNTRY_NOT_SUPPORTED`
- 日本匯入後的 tenant-visible property 也能做 analysis / copy / image
- quota 照常寫入 `ai_usage_events`

這一階段只改 policy，不先做 global master 拆表。

### Phase S2: global/tenant split

新增：

- `properties_master`
- `tenant_property_bindings`
- `tenant_property_binding_events`

並把日本 ingest approve 改成：

1. upsert `properties_master`
2. create / upsert `tenant_property_bindings`
3. 不再直接把日本來源 approve 寫成 tenant-owned `properties`

### Phase S3: AI subject refactor

調整 AI tables：

- 新增 `tenant_property_binding_id`
- AI snapshot 同時保留 master + binding context
- quota / usage events metadata 帶 `subject_origin`

### Phase S4: completeness and sync read model

新增：

- `compute_property_completeness_score(...)`
- tenant binding read model / API
- source sold sync fan-out job

## 11. Canonical Decisions

這輪先定義以下 canonical：

1. 日本物件可用 AI assistant，且要扣 tenant quota
2. AI output 一律 org-scoped，不回寫 global master
3. global 日本來源資料與 tenant 可見資料必須拆層
4. 日本 sold 由 source-of-truth 同步下來，tenant 只能 hidden / archived，不可反向覆蓋
5. completeness_score 採固定 100 分制

## 12. Impacted Modules

- [src/routes/adminAiAssistant.js](/Users/chishenhsu/Desktop/Codex/星澄地所HOSHISUMI/src/routes/adminAiAssistant.js)
  - 移除 country gate
  - 改以 subject scope 決定是否可做 AI

- [src/services/propertyIngestJobs.js](/Users/chishenhsu/Desktop/Codex/星澄地所HOSHISUMI/src/services/propertyIngestJobs.js)
  - approve 不再直接插入 `properties`
  - 改為 master + tenant binding

- [supabase/staging_ai_assistant_backend_v1.sql](/Users/chishenhsu/Desktop/Codex/星澄地所HOSHISUMI/supabase/staging_ai_assistant_backend_v1.sql)
  - AI tables 需要 tenant binding subject 支援

- [supabase/migrations/20260423120000_phase_j2_property_ingest_v1.sql](/Users/chishenhsu/Desktop/Codex/星澄地所HOSHISUMI/supabase/migrations/20260423120000_phase_j2_property_ingest_v1.sql)
  - approve / review 後續欄位與 read model 會受影響
