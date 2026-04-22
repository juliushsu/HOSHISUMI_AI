# API Runtime Strategy v1

本文件定義 HOSHISUMI 現階段 API 在 Runtime 的分工建議，避免把 heavy path 放錯地方。

## 原則

- Edge：低延遲、輕邏輯、無重度資料處理。
- Railway：資料密集、流程型、需要較長 CPU/IO 的 API。
- Observe later：目前先不搬，等流量與效能資料再決策。

## Edge Candidate

- `GET /health`
- `GET /api/health`
- （未來）純 cache/read-only 的 storefront 靜態摘要 endpoint（若無 join-heavy）

說明：
- 這類 endpoint 幾乎不做重運算，不含批次資料處理。

## Railway Candidate

- 所有 admin CRUD（需 auth + scope + join）
  - `/api/admin/storefront/*`
  - `/api/admin/leads*`
  - `/api/admin/properties*`
  - `/api/admin/import-batches*`
- 交易流程 API
  - `/api/rental*`
  - `/api/management*`
  - `/api/management-events*`
- 匯入流程（Phase 4.5B）
  - validation、batch、row-level errors、draft creation

說明：
- 以上 API 涉及 RLS、跨表 join、批次驗證、寫入流程與錯誤明細，屬 heavy path。
- **Import pipeline 固定建議 Railway**。

## Observe Later

- Public storefront read APIs：
  - `/api/storefront/:storeSlug`
  - `/api/storefront/:storeSlug/properties`
  - `/api/storefront/:storeSlug/services`
  - `/api/storefront/:storeSlug/agents`
  - `/api/storefront/:storeSlug/agents/:agentSlug`
- Public lead capture：
  - `POST /api/storefront/:storeSlug/leads`

說明：
- 目前仍有 DB join 與 attribution 邏輯，先留 Railway。
- 後續若導入 cache/materialized view，可評估部分 read endpoint edge 化。

## 決策節奏

1. 先保持單一 Runtime（Railway）確保 contract 穩定。  
2. 觀測 p95 latency、錯誤率、資源消耗。  
3. 僅把「純 read + 穩定 schema + 低耦合」端點逐步拆到 Edge。  
