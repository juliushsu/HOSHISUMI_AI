# Staging Org Consistency Remediation P1 Preflight

staging only

本文件整理 staging org consistency remediation P1 的 preflight 盤點結果。  
本輪僅做只讀資料檢查與文件整理，不修改 runtime，不 apply migration，不碰 production。

## 1. Purpose

本 preflight 目的：

- 確認 `partner_authorizations` 是否已足以支撐 P1 source partner 驗證切換
- 找出 `property_ingest_jobs.source_partner_id` 目前為 `null` 的 staging 歷史資料
- 確認 `tenant_property_bindings` 目前資料量、org 分布、是否有 orphan
- 確認日本 `public.properties` 是否可追溯回 ingest job
- 預判若套用 P1 `tenant_property_bindings` RLS proposal，現有 API 的風險點

## 2. Preflight Method

本次盤點方式：

- 使用 staging 只讀查詢
- 直接讀取 staging Supabase 現有資料
- 不寫入任何資料
- 不執行 migration
- 不修改任何 runtime code

## 3. Scope

本次 preflight 檢查：

1. staging 現有 `partner_authorizations`
2. `property_ingest_jobs` 中 `source_partner_id is null`
3. `tenant_property_bindings` 現況
4. 日本 `public.properties` 與 `property_ingest_jobs` 的可追溯性
5. P1 RLS proposal 對現有 API 的潛在影響

## 4. Findings

### 4.1 Partner Authorizations

Tenant org：

- `33333333-3333-4333-8333-333333333333`

目前已存在以下 active 授權：

1. `world_eye`
   - `partner_id = 90000000-0000-4000-8000-000000000001`
   - `authorization_id = 92000000-0000-4000-8000-000000000001`
   - `is_active = true`

2. `nippon_prime_realty`
   - `partner_id = 90000000-0000-4000-8000-000000000002`
   - `authorization_id = 92000000-0000-4000-8000-000000000002`
   - `is_active = true`

結論：

- P1-A 所需的 authorization-based source partner 驗證，在 staging seed 關係上已具備基礎條件。
- 至少對 tenant org `333...` 而言，切換到 `partner_authorizations` 驗證不會因為缺少 active authorization 而全面失敗。

### 4.2 `property_ingest_jobs` Null `source_partner_id`

目前 `source_partner_id is null` 的筆數：

- `11`

狀態分布：

- `approved`: 4
- `translated`: 1
- `uploaded`: 5
- `failed`: 1

#### 已 approved 且 `source_partner_id = null` 的重要資料

1. `3aa6be9d-7c66-4387-8303-45493bac0029`
   - `status = approved`
   - `approved_property_id = 526e5b6d-b675-4824-90d9-1dc4d7e7e380`
   - `primary_file_name = IMG_9701.JPG`
   - `created_at = 2026-04-25T05:40:15.536217+00:00`

2. `de37cfeb-2dbd-450e-9647-3ad779b18ebf`
   - `status = approved`
   - `approved_property_id = 0bebfa68-37d4-4ff3-9e3b-d50a8bfc3cb8`
   - `primary_file_name = IMG_8900.JPG`
   - `created_at = 2026-04-24T04:39:47.002177+00:00`

3. `f9c7ef98-cdc7-4417-b121-c0bc9e025921`
   - `status = approved`
   - `approved_property_id = 7bad4e17-5c2f-44a1-b4f6-38b1af92a36b`
   - `primary_file_name = property-ingest-smoke.jpg`
   - `created_at = 2026-04-23T12:52:13.922182+00:00`

#### 其他代表性 null-source jobs

4. `3db609ca-a860-4720-8b3b-edab92e0b3a2`
   - `status = translated`
   - `approved_property_id = null`
   - `source_channel = raw-http-probe`

5. `88bb18e2-df9b-4b2a-8e92-7ea77a8fbb33`
   - `status = failed`
   - `ocr_status = unconfigured`
   - `source_channel = smoke`

其餘多筆為：

- `uploaded`
- `ocr_status = pending`
- `translation_status = pending`

結論：

- 若後續要正式強化 `source_partner_id` 為 required governance rule，這 11 筆是 staging 需要先處理的歷史資料。
- 其中最優先應處理的是 3 筆已 approved 且已生成 `public.properties` 的資料。

### 4.3 `tenant_property_bindings` Current State

目前總筆數：

- `2`

organization_id 分布：

- `33333333-3333-4333-8333-333333333333`: 2

目前兩筆資料：

1. `82222222-2222-4222-8222-222222222222`
   - `property_master_id = 81111111-1111-4111-8111-111111111112`
   - `linked_property_id = null`
   - `visibility = active`
   - `tenant_status = draft`
   - `source_status = available`
   - `effective_status = available`

2. `82222222-2222-4222-8222-222222222221`
   - `property_master_id = 81111111-1111-4111-8111-111111111111`
   - `linked_property_id = null`
   - `visibility = active`
   - `tenant_status = marketing`
   - `source_status = available`
   - `effective_status = available`

orphan 檢查：

- orphan linked bindings: `0`
- orphan master bindings: `0`

結論：

- 現有 binding 資料乾淨，全部落在同一個台灣 tenant org。
- 但目前 `linked_property_id` 全部為 `null`，表示 binding 與現有 `public.properties` 尚未建立正式映射。
- 這也說明 `/api/admin/properties` 暫時還不能直接切為 binding-first read model。

### 4.4 Japan `public.properties` Traceability

本次檢查條件：

- `country = jp`
- `source_type in ('image_draft', 'import')`

目前符合條件的物件數：

- `4`

結果：

- 可透過 `raw_source_payload.property_ingest_job_id` 對應回 ingest job：`3`
- 無法對應回 ingest job：`1`

#### 可對應的 3 筆

1. `526e5b6d-b675-4824-90d9-1dc4d7e7e380`
   - `title = 戴亞宮殿堀江公園`
   - `source_type = image_draft`
   - `property_ingest_job_id = 3aa6be9d-7c66-4387-8303-45493bac0029`
   - 對應 job 已 `approved`
   - 但 job 的 `source_partner_id = null`

2. `0bebfa68-37d4-4ff3-9e3b-d50a8bfc3cb8`
   - `title = Lions Mansion 京都河原町`
   - `source_type = image_draft`
   - `property_ingest_job_id = de37cfeb-2dbd-450e-9647-3ad779b18ebf`
   - 對應 job 已 `approved`
   - 但 job 的 `source_partner_id = null`

3. `7bad4e17-5c2f-44a1-b4f6-38b1af92a36b`
   - `title = 霞關公寓101`
   - `source_type = image_draft`
   - `property_ingest_job_id = f9c7ef98-cdc7-4417-b121-c0bc9e025921`
   - 對應 job 已 `approved`
   - 但 job 的 `source_partner_id = null`

#### 無法對應的 1 筆

1. `a5555555-5555-4555-8555-555555555555`
   - `title = 京都中京區旅宿改裝案`
   - `source_type = import`
   - `property_ingest_job_id = null`

結論：

- 現有日本 `image_draft` 物件大多數可追溯回 ingest job。
- 但這些已可追溯資料仍未完成 `source_partner_id` attribution。
- 至少有 1 筆較早期 legacy import 物件無法追回 ingest job，需要另做人工補綁或 legacy mapping。

### 4.5 P1 RLS Proposal Impact

若只套用 P1 `tenant_property_bindings` RLS proposal，而不改 runtime：

短期預估不會直接壞掉的現有主要 API：

- `/api/admin/property-ingest/*`
  - 目前不直接依賴 `tenant_property_bindings`

- `/api/admin/properties`
  - 目前仍讀 `public.properties`

- `/api/admin/ai-assistant`
  - 目前仍讀 `public.properties` 與 AI tables

- `/api/partner/properties`
  - 目前用 service role 讀 binding summary
  - service role 會 bypass RLS

短期風險結論：

- 若只 apply P1 RLS proposal，現有主要 API 不太會立即大規模出現 empty / 403。

但要注意的未來風險點：

1. `/api/admin/properties`
   - 若後續改成直接讀 `tenant_property_bindings`
   - 就會正式受 RLS 影響

2. `/api/admin/ai-assistant`
   - 若後續 property subject resolver 直接讀 binding
   - 也會正式受 RLS 影響

3. 任意非 service-role 的 debug / internal path
   - 若直接讀 `tenant_property_bindings`
   - 但 JWT org context 不一致
   - 可能出現 empty / 403

## 5. Preflight Conclusion

本次 preflight 總結：

- `partner_authorizations` 已具備切換到 authorization-based source partner 驗證的基本條件
- `property_ingest_jobs` 目前有 11 筆 `source_partner_id = null`
- 其中至少 3 筆已經 approved 並生成日本 `public.properties`
- `tenant_property_bindings` 目前只有 2 筆，資料乾淨，沒有 orphan
- 但 binding 尚未與現有 `public.properties` 建立 `linked_property_id` 映射
- 日本 `public.properties` 中有 3 筆可回追 ingest job，1 筆為 legacy unmatched import
- 若只 apply P1 RLS proposal，現有 API 短期不太會立刻壞掉
- 真正風險會在後續開始把 admin properties / AI assistant 接到 tenant-visible read model 時出現

## 6. Recommended P1 Execution Order

建議 P1 執行順序如下：

1. 先 backfill 已 approved 的 3 筆 `null source_partner_id`
   - 暫定綁到 `world_eye`
   - 或由人工指定正確 partner

2. 再改 `property-ingest` source partner 驗證為 `partner_authorizations`
   - 不再要求 `partners.organization_id = auth.organizationId`

3. 再補 `tenant_property_bindings` `marketing_status` migration
   - 讓 admin properties / AI assistant 的新欄位有正式 schema 支撐

4. 最後才規劃 `/api/admin/properties` 切到 tenant-visible read model
   - 先做 response adapter
   - 再逐步淡化對 `public.properties` 的唯一依賴

## 7. This Round Does Not Do

本輪明確不做：

- runtime code 修改
- migration apply
- RLS apply
- production schema 變更
- production runtime rollout
