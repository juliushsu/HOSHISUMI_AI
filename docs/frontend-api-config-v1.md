# Frontend API Config v1

本文件定義 frontend 如何設定 `VITE_API_BASE_URL`，以及 admin API client 如何注入 canonical auth/context headers。

## `VITE_API_BASE_URL` Principle

`VITE_API_BASE_URL` 必須由 environment 明確決定，不可依缺值 fallback 到 production。

## Canonical Values

### Preview / Staging

```env
VITE_API_BASE_URL=https://hoshisumi-api-staging.up.railway.app/api
```

### Production

```env
VITE_API_BASE_URL=https://hoshisumi-api-production.up.railway.app/api
```

## Forbidden Patterns

以下做法禁止：

```ts
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://hoshisumi-api-production.up.railway.app/api';
```

原因：
- preview/staging env 漏設時，會把測試流量誤送到 production

禁止用法：
- hardcoded production default
- preview/staging 自動 fallback production
- 依某個 demo mode boolean 決定是否打 production

## Recommended Pattern

```ts
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

if (!API_BASE_URL) {
  throw new Error('Missing VITE_API_BASE_URL');
}
```

## Auth Header Rule

admin API client 必須帶：

- `Authorization: Bearer <access_token>`
- `x-organization-id: <real_org_uuid>`

## `x-organization-id` Rule

只允許：
- 真實 organization UUID

不允許：
- `demo-org`
- `demo-org-*`
- `placeholder`
- `(none)`
- 任何 store slug / org code / 顯示名稱

## Source of Truth

`x-organization-id` 應來自：
- authenticated org context
- current tenant selection
- server-issued / auth-resolved organization UUID

不應來自：
- demo fallback constant
- hardcoded mock value
- stale localStorage placeholder

## Client-side Validation

frontend 在送 request 前應先做最小驗證：

- `access_token` 存在
- `organization_id` 存在
- `organization_id` 看起來是 UUID

若不成立：
- 不要發 request
- 不要送 demo placeholder 充數
- 直接顯示 org context missing / auth context invalid

## Smoke Test for Frontend Config

在 preview/staging build 完後，至少驗以下兩條：

1. `GET {VITE_API_BASE_URL}/health`
  - 必須成功

2. `GET {VITE_API_BASE_URL}/admin/intake-cases`
  - 未帶 auth 時應回 `401`
  - 帶 auth + 真實 org UUID 時不可回 `404`

## Intake Queue Specific Rule

`/admin/intake-queue` 與其他 admin 頁面一樣：

- preview/staging 必須打 staging backend
- 不可接 production backend 驗證新功能
- `x-organization-id` 必須是真實 UUID

## Change Management

只要發生以下情況，就必須重新檢查 `VITE_API_BASE_URL`：

- 新增 preview environment
- 新增 staging environment
- Railway domain 改名
- frontend deploy pipeline 變更
- API service 拆分 / 合併
