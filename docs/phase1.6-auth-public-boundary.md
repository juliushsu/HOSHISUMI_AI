# Auth / Public Boundary + Readdy 接線說明 (Phase 1.7)

## Public Routes
- `GET /api/health`
- `POST /api/leads`
- `GET /health`（legacy internal health）

## Protected Routes
以下都需要：
- `Authorization: Bearer <token>`
- `x-organization-id: <org_uuid>`

Routes:
- `GET /api/clients`
- `POST /api/clients`
- `PATCH /api/clients/:id`
- `GET /api/properties`
- `POST /api/properties`
- `POST /api/ai/translate-property`
- `POST /api/ai/generate-post`
- `GET /api/dashboard/summary`

## Readdy Envelope 拆解
所有回應都固定：

```json
{
  "data": {},
  "error": null,
  "meta": null
}
```

前端處理規則：
1. 若 `error !== null`，顯示 `error.message`
2. 若 `error === null`，只讀取 `data`
3. `meta` 僅用於附帶資訊（如 tokens）

TypeScript 範例：

```ts
type ApiEnvelope<T> = {
  data: T | null;
  error: { code: string; message: string; details: unknown } | null;
  meta: Record<string, unknown> | null;
};

function unwrap<T>(resp: ApiEnvelope<T>): T {
  if (resp.error) throw new Error(resp.error.message);
  return resp.data as T;
}
```
