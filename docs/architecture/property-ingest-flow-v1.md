# Property Ingest Flow v1

## Scope

日本物件資料辨識匯入 V1 只做 staging 可用版，不做 production rollout，不接 demo fallback。

## Responsibilities

- Railway:
  - canonical route orchestration
  - OCR provider call
  - translator provider call
  - review / approve orchestration
- Supabase:
  - ingest jobs tables
  - raw file storage
  - RLS / storage policies
- Edge:
  - 不是主流程

## Runtime Flow

1. `POST /api/admin/property-ingest/jobs`
   - 建立 `property_ingest_jobs`
   - 上傳 raw file 到 `property-ingest-raw`
   - 建立 `property_ingest_files`
2. `POST /api/admin/property-ingest/jobs/:id/run-ocr`
   - 從 storage 下載 raw file
   - 走 `ocrProvider.extractText(...)`
   - 寫入 `property_ocr_results`
   - 更新 `property_ingest_jobs.current_ocr_text_ja`
3. `POST /api/admin/property-ingest/jobs/:id/run-translate`
   - 走 `translatorProvider.translatePropertyFields(...)`
   - 寫入 `property_translation_results`
   - 更新 `property_ingest_jobs.current_translated_fields_json`
4. `POST /api/admin/property-ingest/jobs/:id/review`
   - append `property_review_decisions`
   - 更新 `property_ingest_jobs.current_reviewed_fields_json`
5. `POST /api/admin/property-ingest/jobs/:id/approve`
   - 依 mapping proposal 寫入 `properties`
   - 更新 job `approved_property_id`

## Why This V1 Shape

- 不把 OCR/翻譯流程塞進 SQL function
- provider 可替換，不把 OpenAI 寫死在 route
- AI 原始輸出保留 `raw_json`，方便 staging 除錯
- review 採 append-only decision log，保留核准前後差異
- `properties` 只在 approve 後才被寫入
