# Property Ingest Operations v1

staging only

本文件定義 property-ingest 主流程驗收通過後的營運化 proposal。  
目標是把 `/admin/property-ingest` 收斂成正式 staging 測試入口，並補齊清理、分頁、批次、重複偵測與自動排程能力。

## 1. Current Baseline

目前 staging 已通過的主流程：

- create job
- upload raw file
- run OCR
- run translate
- review
- approve
- create property

目前 canonical backend routes 在：

- `POST /api/admin/property-ingest/jobs`
- `GET /api/admin/property-ingest/jobs`
- `GET /api/admin/property-ingest/jobs/:id`
- `POST /api/admin/property-ingest/jobs/:id/run-ocr`
- `POST /api/admin/property-ingest/jobs/:id/run-translate`
- `POST /api/admin/property-ingest/jobs/:id/review`
- `POST /api/admin/property-ingest/jobs/:id/approve`

route mount 位置：

- [src/server.js](/Users/chishenhsu/Desktop/Codex/星澄地所HOSHISUMI/src/server.js)
- [src/routes/adminPropertyIngestJobs.js](/Users/chishenhsu/Desktop/Codex/星澄地所HOSHISUMI/src/routes/adminPropertyIngestJobs.js)

## 2. Canonical Entry Policy

### 2.1 Decision

新流程統一入口應為：

- `/admin/property-ingest`

舊流程：

- `/admin/intake-queue`

不再作為新 OCR / translate / review 驗收入口。

### 2.2 Proposal

建議分兩階段：

#### Phase O1

- 保留 `/admin/intake-queue`
- 頁面標示 `Legacy`
- 停用新上傳按鈕
- 停止把它作為 QA / smoke / UAT 驗收入口

#### Phase O2

若產品與前端都已切換完成：

- `/admin/intake-queue` 直接 redirect 到 `/admin/property-ingest`

### 2.3 Recommendation

目前建議先採：

- `保留但標示 legacy 並停用上傳`

理由：

- redirect 太快會混淆現有 legacy intake 使用者
- staging 還需要一小段觀察期，確認沒有舊流程依賴
- 先讓 QA / PM / Readdy 完全切到 `/admin/property-ingest`，再做 redirect 比較穩

## 3. Cleanup API Proposal

### 3.1 Goals

property-ingest staging 會自然累積大量：

- uploaded 但未跑 OCR 的測試 job
- OCR / translate failed 的失敗 job
- unconfigured 時期留下的垃圾資料

需要一套安全清理 API。

### 3.2 Canonical routes

```text
DELETE /api/admin/property-ingest/jobs/:id
POST   /api/admin/property-ingest/jobs/bulk-delete
POST   /api/admin/property-ingest/jobs/delete-failed
```

### 3.3 Delete eligibility

允許刪除：

- `uploaded`
- `failed`
- `ocr_status = unconfigured`
- `translation_status = unconfigured`
- staging 測試資料且尚未 approved / published

不可直接刪除：

- `approved`
- 已對應 published / storefront live property 的 job

若未來有 publication 綁定，應回：

```json
{
  "data": null,
  "error": {
    "code": "PROPERTY_INGEST_DELETE_FORBIDDEN",
    "message": "Approved or published property ingest jobs cannot be deleted.",
    "details": {
      "job_status": "approved",
      "approved_property_id": "uuid"
    }
  },
  "meta": null
}
```

### 3.4 Delete behavior

建議 staging v1 採「hard delete job graph + storage cleanup」：

會一起刪：

- `property_ingest_files`
- `property_ocr_results`
- `property_translation_results`
- `property_review_decisions`
- raw storage file

不刪：

- `approved_property_id` 指向的 property
- 任何已公開 / 已營運的正式 property 主資料

### 3.5 Why hard delete

staging 現階段主要用途是：

- OCR 調整
- provider smoke
- admin review flow 驗收

失敗測試資料保留價值有限，硬刪比 soft delete 更乾淨，也能同步清掉 storage 成本。

### 3.6 Route contracts

#### `DELETE /api/admin/property-ingest/jobs/:id`

用途：

- 刪單筆 job

success:

```json
{
  "data": {
    "deleted_job_id": "uuid",
    "deleted_file_count": 1,
    "deleted_ocr_result_count": 1,
    "deleted_translation_result_count": 1,
    "deleted_review_decision_count": 0,
    "storage_cleanup": {
      "attempted": true,
      "removed_paths": [
        "orgs/.../property-ingest/jobs/.../raw/file.jpg"
      ],
      "failed_paths": []
    }
  },
  "error": null,
  "meta": null
}
```

#### `POST /api/admin/property-ingest/jobs/bulk-delete`

request:

```json
{
  "job_ids": ["uuid-1", "uuid-2", "uuid-3"],
  "store_id": "optional-uuid"
}
```

success:

```json
{
  "data": {
    "requested_count": 3,
    "deleted_count": 2,
    "skipped_count": 1,
    "results": [
      {
        "job_id": "uuid-1",
        "status": "deleted"
      },
      {
        "job_id": "uuid-2",
        "status": "skipped",
        "reason_code": "PROPERTY_INGEST_DELETE_FORBIDDEN"
      }
    ]
  },
  "error": null,
  "meta": null
}
```

#### `POST /api/admin/property-ingest/jobs/delete-failed`

request:

```json
{
  "store_id": "optional-uuid",
  "created_before": "2026-04-24T00:00:00.000Z",
  "statuses": ["failed", "uploaded"],
  "include_unconfigured": true,
  "dry_run": false
}
```

success:

```json
{
  "data": {
    "matched_count": 12,
    "deleted_count": 12,
    "skipped_count": 0,
    "dry_run": false
  },
  "error": null,
  "meta": null
}
```

### 3.7 Implementation notes

建議由 service layer 實作成 transaction-like orchestration：

1. fetch job in scope
2. 判斷是否可刪
3. 先查出所有 `property_ingest_files.storage_path`
4. 先刪 DB graph
5. 再清 storage
6. 若 storage cleanup 部分失敗，回 partial warning 到 `meta`

因為 Supabase storage 與 Postgres 不共用 transaction，storage cleanup 失敗不應回滾整筆 DB 刪除。

## 4. Paging and Filters Proposal

### 4.1 Current state

目前 `GET /api/admin/property-ingest/jobs` 已支援：

- `page`
- `limit`
- `status`
- `processing_strategy`
- `store_id`
- `search`

實作位置：

- [src/services/propertyIngestJobs.js](/Users/chishenhsu/Desktop/Codex/星澄地所HOSHISUMI/src/services/propertyIngestJobs.js)

### 4.2 Canonical proposal

向前相容擴充為：

- `page`
- `pageSize`
- `total`
- `status`
- `ocr_status`
- `translation_status`
- `batch_id`
- `source_type`
- `created_from`
- `created_to`
- `store_id`
- `search`

### 4.3 Compatibility rule

建議：

- `pageSize` 為新 canonical query key
- `limit` 保留為 legacy alias

server 解析規則：

- 先讀 `pageSize`
- 若沒有，再回退 `limit`

response meta canonical：

```json
{
  "page": 1,
  "page_size": 20,
  "total": 120,
  "total_pages": 6
}
```

### 4.4 Filter behavior

- `status`: job status
- `ocr_status`: OCR pipeline status
- `translation_status`: translate pipeline status
- `batch_id`: 只看特定批次
- `source_type`: `manual_admin | partner_upload | api_import`
- `created_from / created_to`: `created_at` 範圍

### 4.5 Example

```text
GET /api/admin/property-ingest/jobs?page=1&pageSize=20&status=failed&ocr_status=failed&created_from=2026-04-01T00:00:00.000Z
```

success:

```json
{
  "data": [
    {
      "id": "uuid",
      "status": "failed",
      "ocr_status": "failed",
      "translation_status": "pending",
      "batch_id": "batch-uuid",
      "source_type": "manual_admin",
      "raw_file_name": "sample.jpg"
    }
  ],
  "error": null,
  "meta": {
    "page": 1,
    "page_size": 20,
    "total": 1,
    "total_pages": 1
  }
}
```

## 5. Batch Upload Proposal

### 5.1 Goal

一批圖片上傳時：

- 每張圖仍是獨立 job
- 但需要一個 batch 粒度來看總進度、成功數、失敗數與清理

### 5.2 Schema

建議新增 `property_ingest_batches`

```sql
create table public.property_ingest_batches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  company_id uuid null,
  store_id uuid null references public.stores(id) on delete set null,
  batch_label text null,
  batch_source text not null default 'manual_upload'
    check (batch_source in ('manual_upload', 'partner_upload', 'api_import', 'retry_failed')),
  total_count int not null default 0 check (total_count >= 0),
  success_count int not null default 0 check (success_count >= 0),
  failed_count int not null default 0 check (failed_count >= 0),
  pending_count int not null default 0 check (pending_count >= 0),
  created_by uuid null references public.agents(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

然後在 `property_ingest_jobs` 新增：

```sql
batch_id uuid null references public.property_ingest_batches(id) on delete set null
```

### 5.3 Count semantics

- `total_count`: 該 batch 建立的總 job 數
- `success_count`: 已 `approved` 或至少 `pending_review` 並可人工接手的數量
- `failed_count`: `failed` 或 `unconfigured`
- `pending_count`: 尚未結束的數量

建議實際實作時以 query / materialized counters 為主，不靠 client 自算。

### 5.4 Batch API

建議新增：

```text
POST /api/admin/property-ingest/batches
GET  /api/admin/property-ingest/batches
GET  /api/admin/property-ingest/batches/:id
POST /api/admin/property-ingest/batches/:id/upload
```

但若 staging v1 要更保守，可以先不開獨立 batches route，只做：

- create batch row
- upload 多檔時把 `batch_id` 填到每張 job
- list jobs 支援 `batch_id` filter

## 6. Duplicate Detection Proposal

### 6.1 Goal

同一 org 內若同檔案重複上傳，應能提醒：

- 已有相同檔案
- 可以跳過
- 可以仍建立新 job
- 或直接關聯到既有 job

### 6.2 Schema adjustment

在 `property_ingest_files` 新增：

```sql
file_checksum_sha256 text null
```

並加 index：

```sql
create index idx_property_ingest_files_org_checksum
  on public.property_ingest_files(organization_id, file_checksum_sha256);
```

### 6.3 Detection rule

create job 時：

1. 對 raw file buffer 算 `sha256`
2. 在同 org scope 搜索同 checksum
3. 若命中，帶回 duplicate candidates

### 6.4 API behavior

建議 create route 支援：

- `duplicate_mode = warn_only | skip | create_new | attach_existing`

預設：

- `warn_only`

#### `warn_only`

- 仍建立新 job
- response `meta.duplicate_detected = true`

#### `skip`

- 不建立新 job
- 回傳既有 job 摘要

#### `create_new`

- 明知重複仍建立新 job

#### `attach_existing`

- 不建立新 job
- 直接回既有 job detail / summary，前端跳轉到舊 job

### 6.5 Example response

```json
{
  "data": {
    "job": {
      "id": "new-job-uuid"
    },
    "file": {
      "id": "file-uuid"
    }
  },
  "error": null,
  "meta": {
    "duplicate_detected": true,
    "duplicate_candidates": [
      {
        "job_id": "existing-job-uuid",
        "status": "pending_review",
        "created_at": "2026-04-24T08:00:00.000Z"
      }
    ]
  }
}
```

## 7. Auto Scheduling Proposal

### 7.1 Goal

目前需要手動：

- run-ocr
- run-translate

營運上太重，staging v1 應改成：

1. 上傳成功後自動排入 OCR
2. OCR 成功後自動進 translate
3. translate 成功後進 `pending_review`
4. 失敗時收斂 `failed`

### 7.2 Canonical state machine

```text
uploaded
  -> ocr_processing
  -> ocr_done
  -> translating
  -> pending_review

failure at any step
  -> failed
```

補充：

- `ocr_status` / `translation_status` 保留細分
- `status` 作為頁面主狀態欄

### 7.3 Recommended staging v1 design

先不引入重型 queue system，採「DB row + background worker / lightweight poller」：

#### Option A: in-process async dispatch

create job 成功後：

- response 先回 `201`
- server 背景 fire-and-forget 啟動 OCR

優點：

- 實作快

缺點：

- Railway instance restart 時容易中斷
- 不夠可靠

#### Option B: DB-backed worker loop

新增 worker：

- 週期性掃描 `uploaded` / `ocr_done` jobs
- 執行下一步

優點：

- staging 穩定度比較好
- 容易補 retry

缺點：

- 比 in-process 多一點基礎設施

### 7.4 Recommendation

建議 staging v1 採：

- `DB-backed worker loop`

理由：

- 現在已經有明確 job table，狀態機很適合 worker 拉取
- 不必一開始就做外部 queue
- 比 in-process 更接近未來 production 化方向

### 7.5 Auto flow rules

#### create job

- 建立 job 後，若 `auto_pipeline = true`，寫入：
  - `status = uploaded`
  - `ocr_status = pending`
  - `translation_status = pending`

#### worker step 1: OCR

符合條件：

- `status = uploaded`
- `ocr_status = pending`

執行後：

- success:
  - `status = ocr_done`
  - `ocr_status = done`
- failure:
  - `status = failed`
  - `ocr_status = failed | unconfigured`
  - `failure_code` / `failure_message` 寫入 job

#### worker step 2: translate

符合條件：

- `ocr_status = done`
- `translation_status = pending`

執行後：

- success:
  - `status = pending_review`
  - `translation_status = done`
- failure:
  - `status = failed`
  - `translation_status = failed | unconfigured`
  - `failure_code` / `failure_message` 寫入 job

### 7.6 Retry policy

staging v1 建議保留手動 retry route：

- `POST /api/admin/property-ingest/jobs/:id/run-ocr`
- `POST /api/admin/property-ingest/jobs/:id/run-translate`

也就是：

- 自動排程處理第一輪
- 手動 route 處理例外 / retry

### 7.7 Failure convergence

所有 provider / storage / routing 失敗都收斂到：

```json
{
  "status": "failed",
  "failure_code": "SOME_MACHINE_READABLE_CODE",
  "failure_message": "Human-readable summary"
}
```

不要停在：

- `ocr_processing`
- `translating`
- `pending_review`

這能避免頁面出現看似可審核、其實上游早已失敗的不一致狀態。

## 8. Recommended Delivery Order

### P1

- 統一入口政策
- `GET /jobs` paging/filter 擴充
- failed cleanup API

### P2

- batch schema + `batch_id`
- duplicate detection

### P3

- auto OCR -> translate worker
- retry / cleanup / batch dashboard 收斂

## 9. Canonical Decisions

這輪定稿如下：

1. `/admin/property-ingest` 是唯一新流程驗收入口
2. `/admin/intake-queue` 先保留但標示 legacy，停用新上傳
3. failed / unconfigured / uploaded 測試資料可刪，approved / published 不可刪
4. 刪除 job 時同步清 DB graph 與 raw storage file
5. `GET /jobs` 擴充到營運所需分頁與篩選
6. batch 採 `一批多 job` 模型
7. duplicate 以 `sha256 checksum + org scope` 偵測
8. 自動流程採 DB-backed worker loop，手動 route 保留作 retry
