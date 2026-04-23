# Readdy Handoff Checklist v1

Readdy 在接 frontend -> backend 前，先只看這份。

## 1. API Base URL

- `preview` / `staging` 一律用：
  - `https://hoshisumi-api-staging.up.railway.app/api`
- `production` 一律用：
  - `https://hoshisumi-api-production.up.railway.app/api`

禁止：
- preview/staging fallback 到 production API
- hardcode production 當 default

## 2. `VITE_API_BASE_URL`

只允許：

```env
VITE_API_BASE_URL=https://hoshisumi-api-staging.up.railway.app/api
```

或 production：

```env
VITE_API_BASE_URL=https://hoshisumi-api-production.up.railway.app/api
```

若缺值：
- 直接報錯
- 不要自動改接 production

## 3. Org Header

所有 admin API 都要帶：

- `Authorization: Bearer <token>`
- `x-organization-id: <real_org_uuid>`

禁止：
- `demo-org`
- `demo-org-*`
- `(none)`
- 任意 placeholder

## 4. Staging Smoke Test

接新 route 前先驗：

```bash
curl -i https://hoshisumi-api-staging.up.railway.app/api/health
curl -i https://hoshisumi-api-staging.up.railway.app/api/admin/intake-cases
```

預期：
- `/api/health` => `200`
- `/api/admin/intake-cases` => 不是 `404`
- 沒 auth 時回 `401` 是正常

## 5. 什麼時候不能切 production

以下任一成立就不能切：

- staging 還沒 smoke test
- preview/staging 還在打 production
- admin request 還送 placeholder org id
- route 在 staging 還是 `404`

## 6. 深入文件

若需要完整規範，再看：

- [environment-routing-v1.md](/Users/chishenhsu/Desktop/Codex/星澄地所HOSHISUMI/docs/environment-routing-v1.md)
- [frontend-api-config-v1.md](/Users/chishenhsu/Desktop/Codex/星澄地所HOSHISUMI/docs/frontend-api-config-v1.md)
- [deploy-governance-v1.md](/Users/chishenhsu/Desktop/Codex/星澄地所HOSHISUMI/docs/deploy-governance-v1.md)
