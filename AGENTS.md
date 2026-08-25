# AGENTS.md

This file provides guidance to AI coding assistants when working with code in this repository.

## 專案概觀

電商前台商城（商品瀏覽、搜尋與後台管理），前後端分離的單一 repo：

- `server/` — Node.js + Express 5 + TypeScript，SQLite（better-sqlite3），port 3001
- `client/` — React 19 + Vite 7 + TypeScript，dev 模式透過 proxy 把 `/api` 轉發到後端，port 5173

UI 語言為繁體中文；代碼、變數名、commit message 用英文。

## 常用指令

```bash
# 後端
cd server
npm run dev           # tsx watch 熱重載啟動（port 3001）
npx tsc --noEmit      # 型別檢查（server 無獨立 script）
npm run seed          # 重灌測試資料到 server/data/shop.db（清空後寫入 5 分類 × 8 商品 = 40 筆）

# 前端
cd client
npm run dev           # Vite dev server（port 5173）
npx tsc -b            # 型別檢查
npm run build         # 生產構建（含 tsc -b）
```

無前端測試。後端 API 測試：`cd server && npm test`（Node 內建 runner，自動在隔離 port + 拋棄式 `DATA_DIR` 啟動 server，不會動到 `server/data/shop.db`）。手動驗證用 curl 打 `http://localhost:3001/api/...`。

`DATA_DIR` 環境變數可覆寫資料目錄（DB 與上傳圖片），僅供測試隔離用；schema 於 `db.ts` import 時自動初始化（route 模組載入時就會 prepare statement，全新空資料庫必須先建表）。

## npm install 注意事項

此環境的 npm 會擋 install scripts。`better-sqlite3`（原生模組）與 `esbuild` 需在各自 package.json 的 `allowScripts` 中核准後 `npm rebuild`，否則 SQLite 無法載入。兩個 package.json 已設定好。

## 架構

資料流：client fetch → Vite proxy (`vite.config.ts`) → Express routes → better-sqlite3 同步查詢 → `server/data/shop.db`。

### Server

- `src/db.ts` — 建立 SQLite 連線（WAL mode）+ `initSchema()` 建表。schema：`categories(id, name)`、`products(id, name, description, specs, price, image_url, stock, category_id, created_at)`、`visit_stats(visitor_id PK, first_seen_at, last_seen_at)`（epoch ms，避免時區問題）
- `src/auth.ts` — 自製 HMAC-SHA256 token 認證。session 以 cookie `admin_token` 傳遞（HttpOnly + SameSite=Lax）；`requireAdmin` middleware 驗證 token。預設密碼 `1971`，生產環境請透過 `ADMIN_PASSWORD` 環境變數覆蓋；`AUTH_SECRET` 未設定時每次重啟會使所有 session 失效
- `src/routes/products.ts` — `GET /api/products`（query: `page`, `pageSize`(上限50), `q` 搜尋, `category`, `sort`= newest|price_asc|price_desc）、`GET /api/products/:id`、`POST/PUT/DELETE` 需 admin 認證
- `src/routes/categories.ts` — `GET /api/categories`（公開，附 `product_count`）、`POST/PUT/DELETE` 需 admin 認證
- `src/routes/uploads.ts` — `POST /api/uploads`（上傳圖片，存於 `data/uploads/`，最多 5MB）；提供 `retireUploadedImage()` 在刪除商品時將圖片移至 `data/uploads-deleted/`
- `src/routes/stats.ts` — `POST /api/stats/heartbeat`（訪客心跳，visitorId 上報）、`GET /api/stats/visits`（公開：`online`/`today`/`week`/`month`/`total`；online = 最後心跳 5 分鐘內，各期以最後活動時間落在期間內計，週界為週一）
- `src/index.ts` — 掛載所有路由、`/api/admin/login`、`/api/admin/logout`

SQL 動態組 WHERE 子句時一律用 named parameters（`@q`），排序子句從白名單 `SORTS` map 取用，不可直接拼接使用者輸入。

### Client

- URL query string 是列表頁的唯一狀態來源（`page`/`q`/`category`/`sort`），改篩選條件 = `setSearchParams`，`useEffect` 監聽參數重新 fetch。新增列表功能時沿用此模式，不要另建 state
- API 封裝集中在 `src/api/client.ts`，型別在 `src/types.ts`，需與 server 回傳欄位對齊
- 樣式為單一 `src/index.css`（純 CSS，CSS variables 定義色彩 token），不使用 UI 框架
- 路由：`/`（商品列表）、`/products/:id`（商品詳情）、`/admin`（商品管理）、`/admin/categories`（分類管理）；`/admin` 頁面內自動檢查登入狀態並導向登入表單
- 訪客統計：`VisitorStats.tsx`（前台 footer，只顯示線上人數）與 `VisitStatsPanel.tsx`（後台顯示四項統計）每 60 秒 heartbeat + 拉取；訪客 ID 存 localStorage `shop_visitor_id`；統計失敗時靜默不影響頁面

### 部署（Docker）

```bash
cp .env.example .env   # 必須設定 ADMIN_PASSWORD，否則 compose 拒絕啟動
docker compose up -d --build
```

- `client` 容器：Node build → nginx，對外開 port 80，SPA fallback + 反代 `/api/` 到 `server:3001`
- `server` 容器：不對外開 port；DB 與上傳圖片持久化在 named volume `server-data`（容器內 `/app/data`）
- 完整部署手冊見 `docs/deploy-vps-docker.md`、架構圖見 `docs/architecture-flow.md`
