# Property Ingest Flow v1

## Scope

日本物件資料辨識匯入 V1 只做 staging 可用版，不做 production rollout，不接 demo fallback。

## Responsibilities

- Railway:
  - canonical route orchestration
  - OCR provider call
  - translator provider call
  - vision fallback provider call
  - review / approve orchestration
- Supabase:
  - ingest jobs tables
  - raw file storage
  - RLS / storage policies
- Edge:
  - 不是主流程

## Strategy Routing

1. 先跑 OCR
2. 依 OCR confidence + key field coverage 推薦下一步
   - `ocr_then_ai`
   - `hybrid_assist`
   - `vision_only_fallback`
3. 所有結果都保留 raw output / token / estimated cost，供人工 review 與成本比較

## Runtime Flow

1. `POST /api/admin/property-ingest/jobs`
   - 建立 `property_ingest_jobs`
   - 上傳 raw file 到 `property-ingest-raw`
   - 建立 `property_ingest_files`
2. `POST /api/admin/property-ingest/jobs/:id/run-ocr`
   - 從 storage 下載 raw file
   - 走 `ocrProvider.extractText(...)`
   - 寫入 `property_ocr_results`
   - 更新 job:
     - `current_ocr_text_ja`
     - `current_ocr_confidence`
     - `key_field_coverage_json`
     - `recommended_next_step`
3. `POST /api/admin/property-ingest/jobs/:id/run-translate`
   - `ocr_then_ai`
     - 走 `translatorProvider.translatePropertyFields(...)`
   - `hybrid_assist`
     - 走 `visionPropertyProvider.extractAndTranslate(...)`
     - 帶入 OCR text / blocks 當 hint
   - `vision_only_fallback`
     - 走 `visionPropertyProvider.extractAndTranslate(...)`
     - 不依賴 OCR text
   - 寫入 `property_translation_results`
   - 更新 job:
     - `processing_strategy`
     - `current_translated_fields_json`
     - token / cost totals
4. `POST /api/admin/property-ingest/jobs/:id/review`
   - append `property_review_decisions`
   - 更新 `property_ingest_jobs.current_reviewed_fields_json`
5. `POST /api/admin/property-ingest/jobs/:id/approve`
   - 依 mapping proposal 寫入 `properties`
   - 更新 job `approved_property_id`

## Why This Shape

- OCR 好時優先走文字路徑，通常比 vision-only 便宜
- OCR 不夠時再升級到 hybrid 或 vision fallback，避免每筆都直接燒 vision 成本
- provider 可替換，不把 OpenAI 硬綁在 route
- AI 原始輸出保留 `raw_json`
- token / cost 可回頭比較哪條策略最省
- review 採 append-only decision log，保留核准前後差異
