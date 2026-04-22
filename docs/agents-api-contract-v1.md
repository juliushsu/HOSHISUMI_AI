# Agents API Contract v1.0 (Profile Editing + Avatar Upload Reserve)

本文件定義 `GET/PATCH /api/agents/:id` 的 canonical profile contract，避免前端再猜欄位。

## Canonical Envelope

Success:

```json
{
  "data": {},
  "error": null,
  "meta": null
}
```

Error:

```json
{
  "data": null,
  "error": {
    "code": "ERROR_CODE",
    "message": "Unable to update agent profile.",
    "details": null
  },
  "meta": null
}
```

## Permissions

- `owner` / `super_admin`: 可讀寫同 organization 內全部 agent profiles。
- `manager` / `store_manager` / `store_editor`: 可讀寫自己 `store_id` 範圍內 agent profiles。
- `agent` 本人：可讀寫自己的 profile。
- 其他角色：僅可讀公開必要欄位（`is_public=true && is_active=true`），不可寫入。

## Canonical DTO: AgentProfile

required fields:
- `id`
- `name`
- `role`
- `languages` (array)
- `service_areas` (array)
- `specialties` (array)
- `is_visible_on_card`
- `created_at`
- `updated_at`

optional fields:
- `name_en`
- `email`
- `title`
- `phone`
- `line_id`
- `bio`
- `office_name`
- `license_note`
- `avatar_url`

array fields:
- `languages: string[]`
- `service_areas: string[]`
- `specialties: string[]`

fallback rules:
- `languages/service_areas/specialties` 永遠回 array（不回 `null`）。
- `service_areas` 若空且舊欄位 `service_area` 有值，會回傳 `[service_area]`。
- `phone` 若未填，會 fallback `phone_public`（若有）。

---

## 1) GET /api/agents/:id

用途：
- 取得單一 agent profile 詳細資料（AgentEditDrawer 開啟時使用）。

sample success:

```json
{
  "data": {
    "id": "44444444-4444-4444-8444-444444444444",
    "name": "王小明",
    "name_en": "Michael Wang",
    "email": "a@example.com",
    "role": "senior_agent",
    "title": "資深業務",
    "phone": "0900-000-001",
    "line_id": "michaelwang",
    "languages": ["中文", "日文"],
    "service_areas": ["台北市", "新北市"],
    "specialties": ["豪宅", "日本投資客"],
    "bio": "專注於高資產客戶與跨境不動產服務。",
    "office_name": "台北信義店",
    "license_note": "不動產經紀人",
    "is_visible_on_card": true,
    "avatar_url": "https://img.hoshisumi.test/agents/a.jpg",
    "created_at": "2026-03-27T00:00:00.000Z",
    "updated_at": "2026-03-27T00:00:00.000Z"
  },
  "error": null,
  "meta": null
}
```

sample error:

```json
{
  "data": null,
  "error": {
    "code": "FORBIDDEN",
    "message": "You do not have permission to view this agent profile.",
    "details": null
  },
  "meta": null
}
```

---

## 2) PATCH /api/agents/:id

用途：
- 更新 agent 個人檔案（局部更新）。

canonical editable fields:
- `title`
- `phone`
- `line_id`
- `languages`
- `service_areas`
- `specialties`
- `bio`
- `office_name`
- `license_note`
- `is_visible_on_card`
- `avatar_url`

validation:
- `phone`: 6-32 字元（不綁死格式）。
- `bio`: 最長 500 字元。
- `languages/service_areas/specialties`: 必須是 array，元素 trim 後不可空字串。
- `avatar_url`: 若有值需為合法 `http/https` URL。
- `is_visible_on_card`: 必須是 boolean。

sample success:

```json
{
  "data": {
    "id": "44444444-4444-4444-8444-444444444444",
    "name": "王小明",
    "name_en": null,
    "email": null,
    "role": "agent",
    "title": "資深業務",
    "phone": "0900-000-001",
    "line_id": "michaelwang",
    "languages": ["中文", "日文"],
    "service_areas": ["台北市", "新北市"],
    "specialties": ["豪宅"],
    "bio": "專注跨境不動產服務。",
    "office_name": "台北信義店",
    "license_note": "不動產經紀人",
    "is_visible_on_card": true,
    "avatar_url": "https://img.hoshisumi.test/agents/a.jpg",
    "created_at": "2026-03-27T00:00:00.000Z",
    "updated_at": "2026-03-27T02:00:00.000Z"
  },
  "error": null,
  "meta": {
    "message": "Agent profile updated successfully."
  }
}
```

---

## 3) POST /api/agents/:id/avatar-upload-url

用途：
- Avatar upload adapter 的最小後端能力（產生 signed upload URL）。

request fields:
- `file_name` (required)
- `content_type` (optional)
- `file_size` (optional)

限制：
- max size: `5MB`
- allowed extensions: `jpg | jpeg | png | webp`
- allowed content type: `image/jpeg | image/png | image/webp`
- file key pattern: `agents/{agent_id}/avatar-{timestamp}-{random}.{ext}`
- storage bucket: `SUPABASE_AVATAR_BUCKET`（預設 `agent-avatars`）

sample success:

```json
{
  "data": {
    "bucket": "agent-avatars",
    "file_key": "agents/4444.../avatar-1777777777777-a1b2c3d4.jpg",
    "upload_url": "https://...signed-upload-url...",
    "upload_token": "...",
    "avatar_url": "https://<supabase-url>/storage/v1/object/public/agent-avatars/agents/4444.../avatar-1777777777777-a1b2c3d4.jpg",
    "constraints": {
      "max_file_size_bytes": 5242880,
      "allowed_extensions": ["jpg", "jpeg", "png", "webp"],
      "allowed_content_types": ["image/jpeg", "image/png", "image/webp"]
    }
  },
  "error": null,
  "meta": null
}
```
