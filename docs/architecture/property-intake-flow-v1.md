# Property Intake Flow v1

## Goal

建立 staging 可跑的最小 ingestion flow：

`admin upload raw file -> Supabase Storage -> Railway OCR -> Railway parse -> property_intake_cases -> human review`

本輪不直接落到 live property。

## Responsibility Split

- Railway API
  - canonical route
  - auth / org / store scope
  - file upload orchestration
  - OCR orchestration
  - AI parsing orchestration
  - review / approve write flow
- Supabase DB
  - `property_intake_cases`
  - RLS / audit columns
- Supabase Storage
  - private raw file bucket `property-intake-raw`
- Edge Functions
  - 不承擔 OCR / parse / state machine
  - 後續如需 webhook / signed URL helper 再考慮

## Canonical Flow

1. Admin hits `POST /api/admin/intake-cases` with multipart file.
2. `requireAuth` resolves `organization_id`, `agent_id`, role, and demo flag.
3. Route checks:
   - role allowed
   - not demo write
   - not production write
   - store scope valid
4. Railway uploads raw file to `property-intake-raw`.
5. Railway inserts `property_intake_cases`.
6. Railway runs OCR adapter.
7. Railway writes OCR result back to same case.
8. Railway runs parsing service when OCR text is usable.
9. Railway writes `parsed_payload` + `parse_audit_trail`.
10. Frontend later reads queue via `GET /api/admin/intake-cases`.
11. Human review writes `reviewed_payload`.
12. Approve route currently only marks `property_draft` target stub.

## Why Not Reuse `properties` As Intake Queue

repo 現況的 `/api/intake-queue` 是直接讀 `properties` 上的 `source_type / intake_status`。  
這輪需求要求 raw file、OCR text、AI payload、human-reviewed payload 都可回溯，且不能提早污染 live/master property schema。

因此本輪採獨立 canonical table：
- `property_intake_cases`

## Storage Design

- bucket: `property-intake-raw`
- private only
- path includes organization/store/case identity
- detail API 回 signed URL
- 前端不得假設 public bucket

path rule:

```text
orgs/{organization_id}/stores/{store_id|unscoped}/intake-cases/{case_id}/raw/{timestamp}-{filename}
```

## OCR Design

- adapter interface:

```js
extractTextFromDocument(file) => {
  status,
  provider,
  rawText,
  blocks,
  confidence,
  meta,
  errorCode,
  errorMessage
}
```

- current implementation:
  - image OCR can use OpenAI vision when configured
  - PDF OCR is not yet backed by a dedicated provider
  - unconfigured state is explicit, not demo-faked

## Parsing Design

- service interface:

```js
parseJapanesePropertySheet({ ocrText, ocrBlocks }) => {
  status,
  provider,
  payload,
  confidence,
  meta,
  errorCode,
  errorMessage
}
```

- strict rules:
  - JSON only
  - missing -> `null`
  - arrays stay arrays
  - no invention

## Review Boundary

- `parsed_payload` = AI draft
- `reviewed_payload` = human-confirmed version
- `parse_audit_trail` preserves parser attempts
- `review_audit_trail` preserves manual edits
- approve route does not auto-create live property

## Frontend Note

目前 repo 的前端/contract 曾有 demo sandbox 與舊 `/api/intake-queue` 概念。  
這輪 canonical backend 不提供 intake demo fallback；若 admin intake queue UI 目前在 API fail 時顯示 demo data，屬前端待改項，不是 backend contract。
