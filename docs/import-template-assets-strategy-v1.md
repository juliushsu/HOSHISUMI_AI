# Import Template Assets Strategy v1

本文件定義日本物件匯入模板檔的最小可行交付策略（CSV/XLSX + 欄位說明 + 圖片命名規則）。

## 1) 模板檔放哪裡最穩

建議採「雙層」：

1. 單一真實來源：Object Storage（S3 / Supabase Storage）  
2. 後端只回 metadata/link（避免前端 hardcode 檔名）

理由：
- 可版本化與替換，不需重新部署前端。
- 支援後續權限、下載統計、灰度更新。

## 2) 檔名與版本策略

必須帶版本號，避免欄位變更造成舊模板混淆：

- `japan-property-import-template-v1.xlsx`
- `japan-property-import-template-v1.csv`
- 後續升版：
  - `...-v1.1.xlsx`
  - 或 `...-v2.xlsx`（breaking）

## 3) 欄位說明與圖片命名規則放哪裡

最小可行方案：

1. `xlsx` 第二分頁：`README`  
   - 欄位說明  
   - 必填/選填  
   - enum 值  
   - 範例資料
2. 另附一份 `md`（或可轉 html）  
   - 版本變更記錄  
   - 圖片命名規則與常見錯誤

PDF 不是第一優先，因為維護成本高且不利版本 diff。

## 4) 圖片命名規則（預留）

建議先固定 pattern（供後續 ZIP 對應）：

- `{property_code}_cover.jpg`
- `{property_code}_floorplan.png`
- `{property_code}_g01.jpg`, `{property_code}_g02.jpg`

後端 parse 策略（後續）：
- `cover` -> `cover_image_url`
- `floorplan` -> `floorplan_image_url`
- `gNN` -> `gallery_urls[]`

## 5) 與 API 契約對齊

對齊 [`property-import-api-contract-v1.md`](/Users/chishenhsu/Desktop/Codex/星澄地所HOSHISUMI/docs/property-import-api-contract-v1.md):
- `POST /api/admin/import-batches` 先吃 pre-parsed rows（Phase 4.5B）
- 後續再加模板下載 endpoint（建議 v1.1）
