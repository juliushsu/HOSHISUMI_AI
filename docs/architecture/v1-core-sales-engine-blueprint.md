🧭 HOSHISUMI v1 核心銷售引擎藍圖
（Taiwan Agent × Japan Partner Lead Engine）

⸻

1. 🎯 目標（為什麼要做這個）
本系統 v1 目標不是「房仲管理系統」，而是：
✅ 讓台灣業務能「拿物件 → 生成文案 → 綁客戶 → 交給日本方成交」
核心價值：
* AI 賦能業務（不是取代業務）
* 跨境銷售（台 → 日）
* 多客戶非獨家綁定
* 可追蹤來源與成交責任

⸻

2. 🧱 系統三方角色
🟢 系統方（HOSHISUMI）
* 管理 SaaS
* 控制 AI quota
* 控制功能模組
* 管理 tenant / partner 授權

⸻

🔵 台灣房仲（Tenant）
* 使用 AI 文案
* 綁定客戶
* 推薦日本物件
* 不負責最終成交

⸻

🔴 日本合作方（Partner）
* 提供物件（source of truth）
* 接手 lead
* 帶看 / 簽約
* 完成成交

⸻

3. 🏗️ 核心資料分層（不可混）
① Property Master（來源層）
properties_master
來源：日本 partner
特性：
* 唯一真實資料
* 不可被台灣端修改
* 包含：
    * title_ja
    * address_ja
    * price / rent
    * nearest_station
    * walk_minutes

⸻

② Tenant Binding（可見層）
tenant_property_bindings
用途：
* 控制台灣是否可見
* 控制是否可推薦
欄位：
* tenant_id
* property_master_id
* is_enabled
* marketing_status

⸻

③ Marketing Workspace（業務操作層）
marketing_properties
用途：
* AI 文案
* 圖片整理
* 行銷版本

⸻

④ Lead（客戶層）
leads
來源：
* 台灣業務建立

⸻

⑤ Lead Binding（關鍵）
lead_property_bindings
👉 核心設計：
* 一個物件 → 多客戶
* 一個客戶 → 可看多物件
* 非獨家

⸻

⑥ Handoff（成交橋）
lead_handoffs
用途：
👉 台灣 → 日本交接
欄位：
* lead_id
* property_master_id
* taiwan_agent_id
* japan_partner_id
* status（new / contacted / viewing / closed）
* disclosed_at

⸻

4. 🔁 完整流程（Mermaid）
flowchart LR

A[日本 Partner 上架物件] --> B[Property Master]

B --> C[Tenant Binding 開啟]
C --> D[台灣業務看到物件]

D --> E[AI 分析 + 文案生成]
E --> F[選擇客戶]

F --> G[建立 Lead]
G --> H[綁定物件]

H --> I[送出 Handoff]

I --> J[日本方接收]
J --> K[聯繫客戶]
K --> L[帶看 / 成交]

⸻

5. 🧠 AI 模組定位（很重要）
AI 不是決策者，而是：
✅ 業務的加速器（Sales Copilot）

⸻

AI 負責：
* 文案生成（FB / IG / LINE）
* 投資敘事整理
* 地段價值轉換（重點）

⸻

AI 不負責：
* 決定價格
* 判斷投報率（無資料時）
* 做最終投資建議

⸻

6. 🧾 文案規格（業務導向）
❌ 禁止（內部語）
* 資料待補
* 無法驗證
* 保守評估
* 先用…切入
* 等…補齊後

⸻

✅ 必須（客戶語）
* 「適合…的買方」
* 「可以先放進比較」
* 「我們可以協助…」
* 「幫你整理比較表」

⸻

📌 地段轉換（強制）
四ツ橋站步行5分鐘
→ 必須轉為：

四ツ橋站步行約5分鐘，對通勤與出租需求都有加分

⸻

7. ⚠️ 系統一致性（重要）
AI quota
唯一來源：
GET /api/admin/ai-assistant/quota
應用於：
* dashboard
* header
* ai-assistant
不得各自計算

⸻

8. 🧩 v1 範圍（嚴格限制）
✅ 要完成
* AI 文案
* 物件選擇（JP/TW）
* 客戶綁定
* lead handoff
* quota 控制

⸻

❌ 暫不做
* ERP
* ESG
* 財務系統
* 進銷存
* 進階 BI

⸻

9. 🚀 v1 成功定義
當以下成立，即完成 v1：
* 台灣業務可：
    * 選日本物件
    * 產生文案
    * 綁客戶
    * 送出 lead
* 日本方可：
    * 看到客戶
    * 聯繫
    * 成交
👉 這就是可變現 MVP
