# Deploy Governance v1

本文件定義 HOSHISUMI 在 `staging` 與 `production` 的 deploy / acceptance governance。  
目標是避免未驗證的 frontend/backend 直接切 production。

## Environment Purpose

### Staging

用途：
- 驗證新 route / 新 flow / 新 UI wiring
- 驗證 preview 與 Readdy 接線
- 驗證 env/config/cors/header 注入

### Production

用途：
- 正式對外服務
- 只接受經過 staging smoke test 的版本切換

## When Frontend May Point to Staging

以下情況應指向 staging：

- preview builds
- staging builds
- Readdy 首次接新 backend route
- admin API wiring 驗證期
- canonical route 上線前 smoke test

## When Frontend Must Not Point to Production

以下情況禁止指向 production：

- route 尚未在 staging 驗證
- preview build
- 新增 backend route 的第一輪接線
- `x-organization-id` header 注入尚未驗證
- staging `/api/health` 還沒通
- staging `/api/admin/...` 還在 `404`

## Staging Smoke Test Rule

切任何 admin flow 到 production 前，至少完成以下 staging 驗收：

1. service online
2. domain mapping 正確
3. `GET /api/health` 回 `200`
4. `GET /api/admin/intake-cases` 未帶 auth 時回 `401`，不可 `404`
5. authenticated request 帶真實 `x-organization-id` 時，不可出現 invalid header
6. preview frontend 實際打到 staging，不是 production

## Minimal Smoke Test Commands

### Health

```bash
curl -i https://hoshisumi-api-staging.up.railway.app/api/health
```

預期：
- `200 OK`

### Route Existence

```bash
curl -i https://hoshisumi-api-staging.up.railway.app/api/admin/intake-cases
```

預期：
- `401 UNAUTHORIZED`
- 只要不是 `404` 就代表 route 已存在

### Authenticated Admin Request

```bash
curl -i https://hoshisumi-api-staging.up.railway.app/api/admin/intake-cases \
  -H "Authorization: Bearer <TOKEN>" \
  -H "x-organization-id: <REAL_ORG_UUID>"
```

預期：
- 不可 `404`
- 不可 `INVALID_ORGANIZATION_HEADER`

## Production Cut Criteria

只有以下條件都成立，才可以切 production：

1. staging backend deploy 成功
2. staging frontend 指向 staging backend 驗證完成
3. `VITE_API_BASE_URL` 未 fallback production
4. `x-organization-id` 注入為真實 org UUID
5. staging smoke tests 全部通過
6. 該 route/flow 沒有再依賴 demo fallback

## Do Not Cut Production If

任何以下條件成立，都不得切 production：

- staging service offline
- staging domain `Application not found`
- preview/staging 還在打 production API
- admin request 還送 `demo-org` 或 placeholder
- route 在 staging 仍回 `404`
- health check 未通

## Railway Governance

### Canonical Mapping

- staging project / env / domain:
  - project `hoshisumi-api-staging`
  - environment `staging`
  - service `hoshisumi-api`
  - domain `hoshisumi-api-staging.up.railway.app`

- production project / env / domain:
  - project `hoshisumi-api-staging`
  - environment `production`
  - service `hoshisumi-api`
  - domain `hoshisumi-api-production.up.railway.app`

### Deployment Governance

- staging environment 必須先 deploy 並 smoke test
- production 不應作為 preview/staging 的臨時 backend
- 若新增 environment，必須同步更新：
  - frontend env config
  - routing doc
  - smoke test record

## Handoff Rule for Readdy / Other AI

任何協作方在接 frontend -> backend wiring 前，都應先讀：

- [environment-routing-v1.md](/Users/chishenhsu/Desktop/Codex/星澄地所HOSHISUMI/docs/environment-routing-v1.md)
- [frontend-api-config-v1.md](/Users/chishenhsu/Desktop/Codex/星澄地所HOSHISUMI/docs/frontend-api-config-v1.md)
- [deploy-governance-v1.md](/Users/chishenhsu/Desktop/Codex/星澄地所HOSHISUMI/docs/deploy-governance-v1.md)

若遇到 preview/staging request 問題，先檢查：

1. API base URL 是否打到 staging
2. service/domain 是否 online
3. `x-organization-id` 是否真實 UUID
4. `/api/health` 與 route existence smoke test 是否通過
