# Property Ingest Partner Management v1

staging only

本文件定義日本合作方在 staging 的管理模型 P1.5。  
目標不是一次把 full global/tenant split 全做完，而是先補出：

- Japan partner organization seed
- partner admin 登入與 membership
- partner 自己的物件管理入口
- sold / off_market 對 tenant 顯示的同步基礎

## 1. Scope

這輪只做：

1. Japan partner org seed
2. partner admin membership seed
3. `properties_master`
4. `tenant_property_bindings`
5. partner management routes

這輪不做：

- batch / duplicate
- partner upload UI
- production rollout
- property-ingest approve 全量改寫到 master

## 2. Canonical Model

### 2.1 Partner identity

partner 端的身分採兩層：

- `organizations`
  - 作為 partner admin 登入後的 org scope
- `partner_users`
  - 作為 partner membership 與 partner ownership mapping

也就是說：

- partner admin 會有一個 staging org
- partner admin 也會有一筆 `partner_users`
- `partner_users.partner_id` 指向其所屬日本合作方

### 2.2 Source-of-truth layer

日本來源物件的 canonical table：

- `properties_master`

關鍵 ownership：

- `properties_master.source_partner_id`

### 2.3 Tenant-facing layer

tenant 端看到的是：

- `tenant_property_bindings`

這張表代表：

- 哪個 tenant org 綁定了哪個 `properties_master`
- tenant 自己的 `visibility`
- tenant 自己的 `tenant_status`
- 從日本來源同步來的 `source_status`

## 3. Staging Seed

P1.5 seed 檔案：

- [supabase/staging_partner_management_seed.sql](/Users/chishenhsu/Desktop/Codex/星澄地所HOSHISUMI/supabase/staging_partner_management_seed.sql)

seed 內容：

1. Japan partner organization
   - `77777777-7777-4777-8777-777777777777`
   - `World Eye Japan Partner (Staging)`

2. partner admin agent
   - `78888888-8888-4888-8888-888888888888`
   - `aki@world-eye.jp`
   - `role = super_admin`

3. partner membership
   - `partner_users.organization_id`
   - `partner_users.agent_id`
   - `partner_users.partner_id = world_eye`

4. Japan source properties
   - sample `properties_master`

5. tenant bindings
   - sample `tenant_property_bindings`
   - tenant org 目前指向 staging tenant org

## 4. Backend Routes

canonical routes：

- `GET /api/partner/properties`
- `GET /api/partner/properties/:id`
- `PATCH /api/partner/properties/:id`
- `POST /api/partner/properties/:id/mark-sold`
- `POST /api/partner/properties/:id/mark-off-market`

route file：

- [src/routes/partnerProperties.js](/Users/chishenhsu/Desktop/Codex/星澄地所HOSHISUMI/src/routes/partnerProperties.js)

server mount：

- [src/server.js](/Users/chishenhsu/Desktop/Codex/星澄地所HOSHISUMI/src/server.js)

## 5. Permission Rules

### 5.1 Japan partner

partner 只能管理：

- 自己 `partner_users.partner_id` 對應的 `properties_master`

也就是：

- partner A 看不到 partner B 的 `properties_master`
- partner A 也不能 patch/mark-sold/mark-off-market partner B 的物件

### 5.2 Taiwan tenant

tenant 只能管理：

- 自己 org 的 `tenant_property_bindings`
- 自己 org 的 AI outputs

tenant 不能：

- 改寫 `properties_master`
- 把日本來源物件從 `sold` 改回 `available`
- 覆蓋 source partner 的 source-of-truth

### 5.3 Source status sync

當 partner 執行：

- `mark-sold`
- `mark-off-market`

會更新：

- `properties_master.status`

並透過 DB trigger 同步：

- `tenant_property_bindings.source_status`
- `tenant_property_bindings.effective_status`
- `source_lock_reason`
- `source_locked_at`

## 6. Current Transitional State

目前 staging 的現況仍有一個過渡問題：

- `property-ingest approve` 還是直接寫 `public.properties`

也就是說，日本來源物件目前仍可能以 tenant property 形式直接存在。  
這是短期可測，但不是最終資料治理型態。

## 7. Transition Plan

### 7.1 Short term

staging 先維持：

- `public.properties` 仍可測
- property-ingest approve 仍可直接建立 tenant property

原因：

- 先確保 OCR / translate / review / approve 主流程穩定
- 避免一口氣重構影響已驗收路線

### 7.2 Medium term

新增 canonical tables：

- `properties_master`
- `tenant_property_bindings`

這一階段開始：

- Japan partner 管 `properties_master`
- Taiwan tenant 管 `tenant_property_bindings`

### 7.3 Long term

property-ingest approve 改成：

1. 寫入或 upsert `properties_master`
2. 建立 / 更新 `tenant_property_bindings`
3. tenant storefront / AI 使用 binding layer

而不是直接把日本來源物件落在 `public.properties`

## 8. Canonical Rights Matrix

### Japan partner can

- list own `properties_master`
- patch own `properties_master`
- mark own source properties sold/off_market

### Japan partner cannot

- 管理其他 partner 的 `properties_master`
- 直接改 tenant org 的 AI output
- 直接操作 tenant binding 的 visibility / tenant_status

### Taiwan tenant can

- 建立 / 維護自己的 `tenant_property_bindings`
- 產生自己的 AI analysis / copy
- 對日本物件做 tenant-side AI usage

### Taiwan tenant cannot

- 回寫 `properties_master`
- 把 source sold 改回 available
- 跨 org 讀取他人 AI output

## 9. Staging Migration

P1.5 migration：

- [supabase/migrations/20260424170000_phase_j3_partner_management_v1.sql](/Users/chishenhsu/Desktop/Codex/星澄地所HOSHISUMI/supabase/migrations/20260424170000_phase_j3_partner_management_v1.sql)

包含：

- `partner_users.organization_id`
- `partner_users.agent_id`
- `properties_master`
- `tenant_property_bindings`
- source status sync trigger

## 10. Implementation Note

這輪 partner route 採 application-level scope enforcement。  
如果 staging DB 尚未 apply J3 migration，route 會明確回：

- `PARTNER_MODEL_NOT_INITIALIZED`

而不是模糊的 500。
