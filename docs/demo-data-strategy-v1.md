# Demo Data Strategy v1 (Phase D1)

本文件定義 HOSHISUMI 的正式 Demo Mode 資料策略，目的是支援商務展示與驗收，同時避免污染真實營運資料。

## 1. Demo Mode 目的

- 讓 storefront / admin storefront / lead inbox / property master 可用真 API 演示。
- 展示資料需完整可走流程（門店前台瀏覽 -> 詢問建立 -> 後台追蹤）。
- 避免使用 mock fallback 掩蓋缺漏 API。
- Demo 與 Production 資料必須可清楚隔離。

## 2. 隔離模型（Single Source of Truth）

本版採「**Organization-first demo isolation**」：

- 以 `organizations.is_demo = true` 作為唯一 demo tenant 標記。
- 所有 demo 子資料（stores / agents / properties / leads / publications / services）都掛在 demo organization 下。
- 不在多表重複加 `is_demo`，避免標記不一致。

為何這樣做：
- 現有 RLS 與 API 多以 `organization_id` 為主軸。
- admin 端已依 org/store scope 控制，延續成本最低。
- storefront 端可透過 demo store slug/domain 做公開展示入口。

## 3. Production Real Mode 區隔

- Real mode：使用正式 organization 帳號與其 store scope。
- Demo mode：使用 demo organization 帳號（JWT claim `organization_id` 指向 demo org）。
- Public storefront demo：使用固定 demo `storeSlug`（例如 `demo-hoshisumi-xinyi`）或 demo subdomain。
- 嚴禁在 demo 畫面混用真實 store slug。

### 3.1 Slug Canonicalization（Phase G3）

- Canonical demo storefront slug：`demo-hoshisumi-xinyi`
- Canonical staging storefront slug：`xinyi-store`
- Canonical preview rule（admin/front-end）：
  - real mode：`/store/{real_store.slug}`
  - demo mode：`/store/demo-hoshisumi-xinyi`
- 禁止前端硬編 `hoshisumi-xinyi` 作為固定 demo slug。

## 4. Seed 策略（可直接展示流程）

檔案：`supabase/demo_seed.sql`

至少包含：
- 1 個 demo organization（`is_demo = true`）
- 1 個 demo store + 1 個 demo domain
- 2 位 demo agents（公開 profile）
- 5 筆 demo properties（覆蓋 `sale/rental/management`）
- 3 筆 store services（`buy/rental/management`）
- 5 筆 store_property_publications（含 featured + normal）
- 5 筆 leads（覆蓋 `new/contacted/qualified/closed/lost`）
- 3 筆 lead_events（`lead_created/lead_status_changed/lead_note_updated`）

### 展示劇本（門店營運流程）

1. Public storefront 首頁顯示門店、服務、精選物件、公開業務。
2. Public leads 建立詢問（含 source attribution）。
3. Admin leads 可查看與篩選，並看見不同 status。
4. Admin storefront overview 直接顯示詢問量與 recent leads。
5. Admin properties 可看到完整 Property Master 上游資料。

## 5. Query / Scope 規則

### 5.1 Demo mode 指定方式

- Admin API：以 demo organization 帳號登入（最小且穩定）。
- Public API：以 demo store slug/domain 進入（例如 `/store/demo-hoshisumi-xinyi`）。

### 5.2 如何避免讀到真資料

- Authenticated admin endpoints：依 `organization_id` scope，自然只讀 demo org。
- Store-scoped endpoints：再疊加 `store_id`，避免跨店混讀。
- Public storefront endpoints：只用 demo slug/domain，不把 real slug 暴露在 demo 入口。

### 5.3 未完成 API 的 demo 行為（策略）

- Demo UI 不應把未完成 API 直接呈現 404 給展示使用者。
- 建議後續（D2）統一改為：
  - `501 NOT_IMPLEMENTED` + `error.code = DEMO_ENDPOINT_NOT_READY`
  - 或回固定 envelope 的「暫未開放」訊息
- 目標是「可解釋、可預期」，而非純 404。

## 6. 支援 Demo 的 Endpoint 範圍（D1）

Public:
- `GET /api/storefront/:storeSlug`
- `GET /api/storefront/:storeSlug/properties`
- `GET /api/storefront/:storeSlug/services`
- `GET /api/storefront/:storeSlug/agents`
- `GET /api/storefront/:storeSlug/agents/:agentSlug`
- `POST /api/storefront/:storeSlug/leads`

Admin:
- `GET/PATCH /api/admin/storefront/profile`
- `GET/PATCH/POST /api/admin/storefront/services`
- `GET/PATCH/POST /api/admin/storefront/properties`
- `GET/PATCH /api/admin/storefront/agents`
- `GET /api/admin/storefront/overview`
- `GET /api/admin/leads`
- `GET/PATCH /api/admin/leads/:id`
- `GET/POST/PATCH /api/admin/properties`

## 7. 本版落地項目

- 新增 schema foundation：`organizations.is_demo`。
- 新增 demo seed：`supabase/demo_seed.sql`（idempotent）。
- 文件化 demo scope / seed / endpoint coverage / query rule。
