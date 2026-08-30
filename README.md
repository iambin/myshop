# MyShop 輕量級電商商品展示與後台管理系統

一個基於 **React 19**、**Node.js Express** 與 **SQLite** 打造的現代化、輕量級前後端分離電商展示與商品管理系統。支援多關鍵字搜尋、商品規格管理、本地圖片上傳、進站流量統計與響應式移動端體驗。

---

## ✨ 核心特色與功能

### 🛍️ 前台商城（商品瀏覽與搜尋）
- **多關鍵字跨欄位搜尋**：支援以空格分隔多個關鍵詞，跨「分類、商品名稱、描述、規格」進行交集匹配。
- **靈活篩選與排序**：可依分類篩選，並支援「最新上架」、「價格由低到高」、「價格由高到低」即時排序。
- **商品詳情彈窗（Modal）**：點擊商品卡片即可彈窗檢視完整商品介紹、規格參數與庫存狀態，內建背景防穿透滾動鎖定。
- **URL 驅動狀態管理**：搜尋、分類、排序與分頁狀態完全同步至網址 Query String，支援瀏覽器上一頁/下一頁與網址直接分享。
- **平滑切換體驗**：分頁切換時自動平滑滾動回頂部。

### ⚙️ 後台管理（內容維護與數據統計）
- **安全認證機制**：自製 HMAC-SHA256 安全 Token，透過 `HttpOnly` Cookie 傳遞管理員 Session。
- **商品全生命週期管理**：
  - 新增/編輯商品：內建常用規格預設範本（品名、高度、寬度、容器等快速填寫）。
  - 本地圖片上傳：支援最大 5MB 圖片直接上傳至後端伺服器。
  - 安全刪除機制：刪除商品時實體圖片自動移至封存資料夾（`uploads-deleted/`），避免誤刪或磁碟殘留。
- **分類管理與防呆保護**：
  - 即時統計各分類下的商品數量。
  - 分類若仍有關聯商品時，禁止直接刪除或下架。
- **進站流量統計（Analytics）**：
  - 自動採集訪客 Heartbeat，準確統計「即時在線、今日、本週、本月、歷史總計」進站人次。
  - 後台內建折疊式統計面板，定期自動輪詢更新。

### 📱 行動端最佳化（Mobile First）
- 完整適應手機與平板螢幕，後台表格在小螢幕下自動切換為**自適應卡片佈局**。
- 手機端分類側邊欄、統計面板與表單彈窗均經過觸控與頂部對齊優化。

---

## 🛠️ 技術架構

```
┌────────────────────────────────────────────────────────┐
│                   使用者瀏覽器 / 訪客                  │
└───────────┬────────────────────────────────┬───────────┘
            │                                │
            ▼ (Port 5173 / 前端靜態資源)     ▼ (轉發 /api 請求)
┌───────────────────────┐        ┌───────────────────────┐
│     React 19 SPA      │───────>│   Vite Reverse Proxy  │
│  (TypeScript + Vite)  │        └───────────┬───────────┘
└───────────────────────┘                    │
                                             ▼ (Port 3001)
                                 ┌───────────────────────┐
                                 │   Express 5 應用伺服器 │
                                 │     (TypeScript)      │
                                 └───────────┬───────────┘
                                             │
                                             ▼
                                 ┌───────────────────────┐
                                 │   SQLite (WAL Mode)   │
                                 │   data/shop.db        │
                                 └───────────────────────┘
```

- **前端（Client）**：React 19 + TypeScript + Vite 7 + 原生現代 CSS（CSS Variables 色彩系統）
- **後端（Server）**：Node.js + Express 5 + TypeScript + better-sqlite3（同步高效能資料庫引擎，開啟 WAL 模式）
- **認證方式**：自製 HMAC-SHA256 簽名 Cookie 認證
- **容器化與部署**：Docker / Docker Compose / Nginx / Caddy 反向代理支援

---

## 📁 目錄結構

```text
myshop/
├── client/                     # 前端 React 專案
│   ├── src/
│   │   ├── api/client.ts       # API 請求封裝
│   │   ├── components/         # 共用 UI 元件（Modal, ProductCard, VisitStats 等）
│   │   ├── pages/              # 頁面（HomePage, ProductDetail, Admin, Categories）
│   │   ├── types.ts            # 前端 TypeScript 資料型別定義
│   │   └── index.css           # 全域樣式與主題變數
│   └── vite.config.ts          # Vite 設定檔（含 /api 反向代理）
├── server/                     # 後端 Express 專案
│   ├── src/
│   │   ├── routes/             # API 路由（products, categories, uploads, stats）
│   │   ├── auth.ts             # HMAC-SHA256 認證中間件
│   │   ├── db.ts               # SQLite 資料庫初始化與 Schema
│   │   └── index.ts            # Express 主程式入口
│   ├── data/                   # 本地資料儲存區（SQLite DB 與上傳圖片，不進 Git）
│   └── tests/api-flow.test.mjs # 完整 API 整合自動化測試
├── docs/                       # 開發、部署、更新與備份手冊
│   ├── architecture-flow.md    # 詳細系統架構與 Mermaid 流程圖
│   ├── backup-strategy.md      # 資料庫與上傳圖片備份策略
│   ├── deploy-ubuntu-tutorial.md # Ubuntu VPS + Docker 部署指南
│   └── deploy-update-tutorial.md # 版本無痛更新升級教學
├── start.bat                   # Windows 本地一鍵啟動腳本
└── stop.bat                    # Windows 本地一鍵停止腳本
```

---

## 🚀 快速開始（本地開發環境）

### 1. 環境需求
- **Node.js**：v18+ 或 v20+
- **npm**：v9+

### 2. 下載專案
```bash
git clone https://github.com/iambin/myshop.git
cd myshop
```

### 3. 後端啟動（Server）
```bash
cd server
npm install
npm run seed     # 匯入預設測試資料（5大分類與40筆精選商品）
npm run dev      # 啟動後端開發伺服器（預設 Port: 3001）
```

> **預設管理員資訊**：
> - 後台登入密碼：`1971`（可在 `server/.env` 中設定 `ADMIN_PASSWORD` 自訂）

### 4. 前端啟動（Client）
另開終端機視窗：
```bash
cd client
npm install
npm run dev      # 啟動 Vite 前端伺服器（預設網址: http://localhost:5173）
```

### 5. Windows 用戶快捷指令
專案根目錄已提供便利腳本：
- 雙擊執行 `start.bat`：自動在新視窗啟動前後端伺服器
- 雙擊執行 `stop.bat`：一鍵關閉前後端背景進程

---

## 🧪 測試與驗證

後端內建完整的自動化整合測試套件，涵蓋認證、商品增刪查改、複合搜尋、圖片上傳生命週期與進站統計：

```bash
# 執行所有 API 自動化整合測試
node server/tests/api-flow.test.mjs

# 執行前端 TypeScript 型別檢查
cd client && npx tsc -b
```

---

## 📖 部署與維運手冊

詳細的生產環境部署與運維指南請參閱 `docs/` 目錄：

- 📘 [Ubuntu VPS Docker 部署教學](docs/deploy-ubuntu-tutorial.md)
- 🔄 [版本無痛更新升級指南](docs/deploy-update-tutorial.md)
- 💾 [專案資料與資料庫備份策略](docs/backup-strategy.md)
- 🗺️ [系統資料流架構圖 (Mermaid)](docs/architecture-flow.md)

---

## 📄 開源授權

本專案採用 [MIT License](LICENSE) 進行授權。
