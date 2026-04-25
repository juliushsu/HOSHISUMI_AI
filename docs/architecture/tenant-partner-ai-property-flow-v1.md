# Tenant Partner AI Property Flow v1

本文件定義星澄地所系統在 multi-tenant、Japan partner、AI assistant、以及 property ingest / approve / marketing flow 下的統一架構規則。

本文件目的：

- 定義 `organization_id` 的唯一來源與責任
- 定義 tenant 與 partner 的角色邊界
- 定義日本物件從 OCR 到 AI 行銷的完整資料流
- 定義所有 API / UI / AI / DB 必須遵守的 org context 規則

本文件優先級高於任何單頁實作邏輯。

## 0. Scope

本文件適用於：

- staging architecture alignment
- tenant / partner / AI / property flow 設計
- API / DB / UI org context consistency audit

本文件不直接代表：

- production rollout 已完成
- runtime implementation 已完成
- approve flow 已全數切換完成

## 1. Core Concepts

### 1.1 Organization

系統中所有資料與操作，都必須隸屬於一個 `organization_id`。

`organization_id` 代表唯一租戶。

範例：

| 類型 | organization_id | 說明 |
| --- | --- | --- |
| 台灣公司 | `hoshisumi_taipei_xinyi` | 星澄地所台北信義店 |
| 日本公司 | `world_eye_jp` | 日本合作房仲 |
| 日本公司 | `nippon_prime_realty` | 日本合作房仲 |

### 1.2 Tenant

tenant 是系統使用者，代表台灣房仲 organization。

tenant 擁有：

- 客戶資料
- 行銷文案
- AI 使用
- 上架權限

### 1.3 Partner

partner 是資料供應方，代表日本房仲 organization。

partner 擁有：

- 原始物件資料
- 日本地址 / 價格 / 格局
- source-of-truth 狀態

### 1.4 Tenant vs Partner

本系統的核心原則是：

- 資料來源（日本）不等於使用者（台灣）
- tenant organization 與 partner organization 必須分離
- 二者透過授權關係連結，不直接混成同一 org

### 1.5 Partner Authorization

tenant 與 partner 的關係由 `partner_authorizations` 定義。

若不存在有效授權，tenant 不得使用 partner 資料。

## 2. Staging Standard Organizations

staging 必須有固定標準測試組織，不可各頁各自假設不同 partner / org 關係。

### 2.1 Tenant

- `hoshisumi_taipei_xinyi`

### 2.2 Partners

- `world_eye`
- `nippon_prime_realty`

### 2.3 Required Authorizations

staging 必須至少存在：

- `hoshisumi_taipei_xinyi` ↔ `world_eye`（active）
- `hoshisumi_taipei_xinyi` ↔ `nippon_prime_realty`（active）

所有 staging flow 必須以這組授權關係為基準。

## 3. Property Flow

### 3.1 Step 1: OCR Ingest

`property_ingest_jobs` 必須包含：

- `organization_id`
- `source_partner_id`

意義：

- `organization_id`: 誰在匯入，代表台灣 tenant
- `source_partner_id`: 資料來源，代表日本 partner

### 3.2 Step 2: Review

在 `/admin/property-ingest/:id` 審核階段，需補正：

- 地址完整度
- 是否隱藏詳細地址
- 欄位修正

### 3.3 Step 3: Approve

approve 後需產生兩層資料：

1. `properties_master`
   - 屬於 `source_partner_id`
   - 永遠代表日本原始資料

2. `tenant_property_bindings`
   - 屬於 `organization_id`
   - 決定 tenant 端是否顯示、是否行銷、是否封存

### 3.4 Step 4: Admin Properties

`/api/admin/properties` 應只顯示 tenant-visible property subject。

也就是：

- 應以 `tenant_property_bindings` 為核心
- 不應直接把日本 source master 當成 tenant list

### 3.5 Step 5: AI Assistant

AI assistant 必須使用 tenant organization context。

AI 產物包括：

- 行銷文案
- 分析結果

這些資料都屬於 tenant，而不是 partner。

## 4. AI Flow

### 4.1 Wrong Pattern

錯誤模式：

- AI assistant 沒有 `organization_id`
- 無法歸屬用量
- 無法正確關聯 property subject

### 4.2 Correct Pattern

正確模式：

1. AI API 接收 `organization_id`
2. 查找 tenant-visible property subject
3. 產生 marketing 文案 / 分析結果
4. 更新 `marketing_status`

### 4.3 Ownership

AI 一定是 tenant 行為，不是 partner 行為。

## 5. Address Governance

地址資料分成兩層：

- `full_private_address`
  - 完整地址
  - 只供內部、partner、enrichment、geocoding 使用

- `public_display_address`
  - 對外顯示地址
  - 可遮蔽番地

治理規則：

- 地址不完整：`address_review_required = true`
- 要隱藏詳細地址：`hide_exact_address = true`
- AI / Maps / Geocoding 只能使用 private address

## 6. Marketing Status

`marketing_status` 必須屬於：

- `tenant_property_bindings`

狀態：

- `not_generated`
- `generated`
- `updated`
- `stale`

顯示位置：

- `/admin/properties`
- `/admin/ai-assistant`

## 7. Organization Consistency Rules

### RULE 1

所有 API 必須帶：

- `x-organization-id`

### RULE 2

所有資料表都必須能回答：

- 這筆資料屬於哪個 `organization_id`

若資料本體不是 tenant-owned，也必須有明確的 ownership layer 或 authorization layer。

### RULE 3

不得出現以下斷裂情況：

- UI 有組織
- API 沒組織
- DB 不知道組織

### RULE 4

AI 一定是 tenant 行為，不是 partner 行為。

## 8. Future Expansion

本模型應支援跨國同集團 scenario。

例如：

- 信義台灣 = organization A
- 信義日本 = organization B

二者仍應是不同 organization，透過 `partner_authorizations` 連接，而不是把兩者混成同一 org。

## 9. Final Principle

本系統的最終設計核心是：

- 資料來源（日本）不等於使用者（台灣）
- partner source-of-truth 與 tenant operating layer 必須分離
- org context 必須從 UI、API、DB、AI 貫穿一致
