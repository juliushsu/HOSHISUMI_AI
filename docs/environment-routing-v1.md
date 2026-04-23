# Environment Routing v1

本文件定義 HOSHISUMI 前後端在 `preview / staging / production` 三個環境下的 canonical routing 規則。  
目標是避免 preview 或 staging 誤接 production backend。

## Canonical Rule

- `preview` 前端不得預設接 `production` backend
- `staging` 前端不得接 `production` backend
- `production` 前端只能接 `production` backend
- 環境切換必須明確靠 config，不可用 hardcode fallback

## Backend API Domain Mapping

### Preview

- frontend runtime: Readdy preview / PR preview / local verification preview
- backend target: `staging` backend
- canonical API base:
  - `https://hoshisumi-api-staging.up.railway.app/api`

說明：
- preview 的目的在於驗證未正式上線的 UI/flow
- preview 若接 production，會導致：
  - route mismatch 誤判
  - production data 污染風險
  - staging bug 被 production masking

### Staging

- frontend runtime: staging admin / staging preview
- backend target: `staging` backend
- canonical API base:
  - `https://hoshisumi-api-staging.up.railway.app/api`

### Production

- frontend runtime: 正式站
- backend target: `production` backend
- canonical API base:
  - `https://hoshisumi-api-production.up.railway.app/api`

## Railway Mapping

### Project

- staging project:
  - `hoshisumi-api-staging`
- service:
  - `hoshisumi-api`

### Environment -> Domain

- Railway project `hoshisumi-api-staging`
  - environment `staging`
  - service `hoshisumi-api`
  - domain `hoshisumi-api-staging.up.railway.app`

- Railway project `hoshisumi-api-staging`
  - environment `production`
  - service `hoshisumi-api`
  - domain `hoshisumi-api-production.up.railway.app`

重要：
- domain mapping 必須和實際 environment 對齊
- preview / staging 若打到 `hoshisumi-api-production.up.railway.app`，視為 routing misconfiguration

## Frontend Routing Policy

- `preview` builds:
  - `VITE_API_BASE_URL` 必須指向 staging backend
- `staging` builds:
  - `VITE_API_BASE_URL` 必須指向 staging backend
- `production` builds:
  - `VITE_API_BASE_URL` 必須指向 production backend

禁止事項：
- 不可在 preview/staging 缺值時 fallback 到 production API
- 不可在 client code 內硬編 production domain 當 default
- 不可用 demo placeholder 代替 org scope header

## Org Header Rule

所有 admin-side authenticated API 都遵守：

- `x-organization-id` 必須是「真實 org UUID」
- 不可為空
- 不可用：
  - `demo-org`
  - `demo-org-xxx`
  - `staging-org`
  - 任何 placeholder / human-readable label

backend 驗證依據在 [src/middleware/auth.js](/Users/chishenhsu/Desktop/Codex/星澄地所HOSHISUMI/src/middleware/auth.js)：
- `x-organization-id` 必須符合 UUID 格式

## Routing Acceptance

以下條件成立，才算 routing 正確：

1. `preview/staging` 的 API base URL 是 `hoshisumi-api-staging.up.railway.app/api`
2. `production` 的 API base URL 是 `hoshisumi-api-production.up.railway.app/api`
3. `GET /api/health` 在對應環境回應正常
4. `GET /api/admin/intake-cases` 在未帶 auth 時至少回 `401`，不可回 `404`
5. admin authenticated request 送出的 `x-organization-id` 是真實 UUID
