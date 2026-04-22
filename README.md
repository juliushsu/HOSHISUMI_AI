# 星澄地所 HOSHISUMI MVP Backend (Supabase)

## 內容
- Supabase migration: `supabase/migrations/20260326130500_mvp_backend.sql`
- Seed data: `supabase/seed.sql`
- API server: `src/`

## 啟動
1. 安裝依賴
```bash
npm install
```
2. 設定環境變數
```bash
cp .env.example .env
```
3. 啟動 API
```bash
npm run dev
```

## API
Public routes（不需 auth）:
- `GET /api/health`
- `POST /api/leads`

Protected routes（需 auth）:
- Header: `Authorization: Bearer <supabase_access_token>`
- Header: `x-organization-id: <organization_uuid>`

### Clients
- `GET /api/clients`
- `POST /api/clients`
- `PATCH /api/clients/:id`（canonical）

### Properties
- `GET /api/properties`
- `POST /api/properties`

### AI
- `POST /api/ai/translate-property`
- `POST /api/ai/generate-post`

### Dashboard
- `GET /api/dashboard/summary`

## Response Envelope
所有 API 統一：

```json
{
  "data": {},
  "error": null,
  "meta": null
}
```

錯誤時：

```json
{
  "data": null,
  "error": {
    "code": "SOME_ERROR_CODE",
    "message": "Human readable message",
    "details": null
  },
  "meta": null
}
```

## JWT claims 建議
為了讓 RLS 與 API middleware 正常運作，token 需包含：
- `organization_id`
- `agent_id`
- `role` (`owner` / `manager` / `agent`)

可放在 `app_metadata`（建議）或 `user_metadata`。
