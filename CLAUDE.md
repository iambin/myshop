# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 注意事項

- 每次改動完成後，都必須創建一個對應的Git commit，以便後續追蹤和回滾。
- 每次改動後，都必須編寫或更新相關測試，並在交付給用戶前，確保所有測試和驗證全部通過。
- 本次session context 快要滿(約80%),請提我。

## 專案概觀

電商前台商城（商品瀏覽、搜尋與後台管理），前後端分離的單一 repo：

- `server/` — Node.js + Express 5 + TypeScript，SQLite（better-sqlite3），port 3001
- `client/` — React 19 + Vite 7 + TypeScript，dev 模式透過 proxy 把 `/api` 轉發到後端，port 5173

UI 語言為繁體中文；代碼、變數名、commit message 用英文。

## 常用指令

```bash
# 後端
cd server
npm run dev      # tsx watch 熱重載啟動（port 3001）
npm run seed     # 重灌測試資料到 server/data/shop.db（清空後寫入 5 分類 40 商品）

# 前端
cd client
npm run dev      # Vite dev server（port 5173）
npx tsc -b       # 型別檢查
npm run build    # 生產構建（含 tsc -b）
```

以 Node.js 內建 `node --test` 撰寫 API 流程測試，位於 `server/tests/api-flow.test.mjs`。驗證 API 亦可用 curl 直接打 `http://localhost:3001/api/...`。

## npm install 注意事項

此環境的 npm 會擋 install scripts。`better-sqlite3`（原生模組）與 `esbuild` 需在各自 package.json 的 `allowScripts` 中核准後 `npm rebuild`，否則 SQLite 無法載入。兩個 package.json 已設定好。

## 架構

資料流：client fetch → Vite proxy (`vite.config.ts`) → Express routes → better-sqlite3 同步查詢 → `server/data/shop.db`。

### Server

- `src/db.ts` — 建立 SQLite 連線（WAL mode）+ `initSchema()` 建表。schema：`categories(id, name)`、`products(id, name, description, specs, price, image_url, stock, category_id, created_at)`
- `src/auth.ts` — 自製 HMAC-SHA256 token 認證。session 以 cookie `admin_token` 傳遞（HttpOnly + SameSite=Lax）；`requireAdmin` middleware 驗證 token。預設密碼 `1971`，生產環境請透過 `ADMIN_PASSWORD` 環境變數覆蓋。
- `src/routes/products.ts` — `GET /api/products`（query: `page`, `pageSize`(上限50), `q` 搜尋, `category`, `sort`= newest|price_asc|price_desc）、`GET /api/products/:id`、`POST/PUT/DELETE` 需 admin 認證
- `src/routes/categories.ts` — `GET /api/categories`（公開，附 `product_count`）、`POST/PUT/DELETE` 需 admin 認證
- `src/routes/uploads.ts` — `POST /api/uploads`（上傳圖片，存於 `data/uploads/`，最多 5MB）；提供 `retireUploadedImage()` 在刪除商品時將圖片移至 `data/uploads-deleted/`
- `src/routes/stats.ts` — `POST /api/stats/heartbeat`（寫入/更新 `visit_stats` 表，visitor_id 為 localStorage UUID）、`GET /api/stats/visits`（回傳 online/today/week/month/total，均為公開端點）
- `src/index.ts` — 掛載所有路由、`/api/admin/login`、`/api/admin/logout`

SQL 動態組 WHERE 子句時一律用 named parameters（`@q`），排序子句從白名單 `SORTS` map 取用，不可直接拼接使用者輸入。

### Client

- URL query string 是列表頁的唯一狀態來源（`page`/`q`/`category`/`sort`），改篩選條件 = `setSearchParams`，`useEffect` 監聽參數重新 fetch。新增列表功能時沿用此模式，不要另建 state
- API 封裝集中在 `src/api/client.ts`，型別在 `src/types.ts`，需與 server 回傳欄位對齊
- 樣式為單一 `src/index.css`（純 CSS，CSS variables 定義色彩 token），不使用 UI 框架
- 路由：`/`（商品列表）、`/products/:id`（商品詳情）、`/admin`（商品管理）、`/admin/categories`（分類管理）；`/admin` 頁面內自動檢查登入狀態並導向登入表單
- `checkAdminAuth()` 的實作是用 `POST /api/products` 探測：401 = 未登入、400（其他驗證錯誤）= 已登入，非常規手法，勿誤改
- Modal 元件（`src/components/Modal.tsx`）只能透過右上角「×」按鈕關閉，不支援點擊背景或 Escape 鍵關閉——這是刻意設計，不要重新加入這兩種關閉方式
- 進站統計：前台頁面 mount 時呼叫 `sendHeartbeat()`（帶 localStorage visitor UUID），後台 `VisitStatsPanel` 每分鐘 poll `GET /api/stats/visits`
