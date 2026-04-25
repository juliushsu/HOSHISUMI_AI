# Property Image Mapping Contract v1

staging and production contract

本文件定義日本物件圖片匯入時的 mapping contract，供 backend、Readdy UI、未來批次匯入工具共同遵守。

## 1. Purpose

本 contract 目的是：

- 定義物件圖片匯入的唯一識別 key
- 統一 CSV 模式與未來 ZIP 模式的檔名規則
- 明確規範 backend 的 reject 行為
- 提供可供 Readdy UI 顯示的錯誤格式
- 區分 staging 與 production 的處理原則

## 2. Unique Mapping Key

唯一 mapping key：

- `source_property_ref`

規則：

- `source_property_ref` 是圖片與物件資料之間唯一且唯一可信的對應 key
- backend 只能使用 `source_property_ref` 做 mapping
- 不可使用標題、地址、價格、格局、模糊字串或人工推測做 fallback matching
- 任一圖片若無法明確對應到單一 `source_property_ref`，即視為 mapping failure

## 3. CSV Mode

CSV 模式欄位：

- `source_property_ref`
- `cover_image_url`
- `floorplan_image_url`
- `image_1_url`
- `image_2_url`
- `image_3_url`
- `...`
- `image_n_url`

規則：

- 每一列必須以 `source_property_ref` 對應到單一物件
- `cover_image_url` 對應封面圖
- `floorplan_image_url` 對應平面圖
- `image_1_url ... image_n_url` 對應一般物件圖
- backend 不可根據圖片 URL 檔名再做第二層模糊判斷
- 欄位存在但 URL 為空值時，視為該欄位未提供圖片，不視為錯誤

## 4. ZIP Mode (Future)

ZIP 模式為未來擴充方案。

檔名必須符合：

```text
{source_property_ref}_{type}.{ext}
```

其中：

- `{source_property_ref}`：物件唯一 mapping key
- `{type}`：圖片型別
- `{ext}`：副檔名，例如 `jpg`、`jpeg`、`png`、`webp`

允許的 `type`：

- `cover`
- `floor`
- `01`
- `02`
- `03`
- `...`

規則：

- `cover` 代表封面圖
- `floor` 代表平面圖
- `01`, `02`... 代表一般物件圖，應依數字排序
- backend 不可接受未列入規範的 type
- backend 不可接受缺少 `{source_property_ref}` 或缺少 `{type}` 的檔名

合法示例：

```text
WE-123_cover.jpg
WE-123_floor.png
WE-123_01.jpg
WE-123_02.webp
```

不合法示例：

```text
cover_WE-123.jpg
WE-123-room1.jpg
WE-123_floorplan.png
tokyo-mansion-01.jpg
```

## 5. Backend Behavior

backend 行為必須明確且可預測。

### 5.1 Strict Matching

- backend 只能用 `source_property_ref` 做精確匹配
- 不允許模糊匹配
- 不允許 `LIKE`、partial match、title match、address match、OCR 推測、或其他 heuristic fallback

### 5.2 Invalid Filename

若 ZIP 模式檔名不符合規範：

- backend 必須 `reject`
- 不可自動修正
- 不可嘗試猜測 type 或 property ref

### 5.3 Missing Mapping

若 `source_property_ref` 找不到對應物件：

- backend 必須 `reject`
- 不可自動綁到相似物件
- 不可建立匿名或暫存 mapping

### 5.4 Orphan Images

若同一批次中存在無法對應到任何有效物件的圖片：

- 視為 `orphan_images`
- 需列入錯誤報表

### 5.5 No Fuzzy Matching

以下行為一律禁止：

- 根據檔名片段猜測物件
- 根據標題相似度配對
- 根據地址相似度配對
- 根據同批次順序配對
- 根據圖片內容做隱式配對

## 6. Error Reporting Contract

backend 應提供可供 Readdy UI 顯示的結構化錯誤格式。

錯誤類型：

- `missing_mapping`
- `invalid_filename`
- `orphan_images`

建議 response shape：

```json
{
  "success": false,
  "errors": [
    {
      "code": "missing_mapping",
      "message": "source_property_ref does not map to any property.",
      "source_property_ref": "WE-123",
      "filename": "WE-123_cover.jpg"
    },
    {
      "code": "invalid_filename",
      "message": "Filename must match {source_property_ref}_{type}.{ext}.",
      "filename": "cover_WE-123.jpg"
    },
    {
      "code": "orphan_images",
      "message": "One or more images could not be mapped to a valid property.",
      "filename": "tokyo-mansion-01.jpg"
    }
  ]
}
```

Readdy UI 至少應能顯示：

- `code`
- `message`
- `source_property_ref`
- `filename`

## 7. Staging vs Production

staging 與 production 的行為必須明確區分。

### 7.1 Staging

staging 可採較寬鬆策略：

- 可接受 warning 模式
- 可允許匯入流程先完成，但必須保留錯誤明細
- UI 必須明確提示使用者哪些檔案未符合 contract

適用場景：

- 新流程試跑
- partner onboarding
- 檔名規則教育與驗證

### 7.2 Production

production 必須採嚴格策略：

- 發現 `invalid_filename` 必須 fail
- 發現 `missing_mapping` 必須 fail
- 發現 `orphan_images` 必須 fail
- 不可 silently ignore
- 不可自動修復或模糊配對

## 8. Summary

本 contract 的核心原則：

- `source_property_ref` 是唯一 mapping key
- CSV 模式與 ZIP 模式都必須明確帶出 `source_property_ref`
- backend 一律採精確匹配，不允許模糊匹配
- 錯誤必須結構化回傳給 Readdy UI
- staging 可 warning
- production 必須 fail
