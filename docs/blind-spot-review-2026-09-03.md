# 專案盲點審查（2026-09-03）

針對前後端全部源碼、部署配置（docker-compose / Caddyfile / nginx）與測試的全面審查。
發現按重要性分四類：死代碼、部署風險、其他問題、提問方式建議。

## 一、寫好但沒接線的「死代碼」（最嚴重）

### 1. `client/src/pages/ProductDetailPage.tsx` 是孤兒頁面

- 該頁面存在，但 `client/src/App.tsx` 的路由表中**沒有 `/products/:id`**，
  商品詳情目前改由 `HomePage` 以 `?product=id` 彈出 `ProductDetailModal`。
- 影響：
  - 此頁面永遠無法被訪問；
  - `client/nginx.conf:8` 註解與 `CLAUDE.md` 都宣稱「/products/:id 直接拜訪由前端路由接手」，
    但部署後直接開 `/products/5` 會走 nginx fallback 回 `index.html`，前端無此路由 → 白畫面。
- 待決：正式掛上路由，或刪除該頁面並同步更新 `CLAUDE.md` 與 nginx 註解。

### 2. `client/src/components/VisitorStats.tsx` 是孤兒元件

- 「目前 N 人在線上」元件存在，但**沒有任何頁面 import 它**。
- 後端 `POST /api/stats/heartbeat` 因此沒有前台呼叫方；只有後台 `VisitStatsPanel` 在 poll
  （且該面板不顯示 online 數字）。線上統計這條功能鏈是斷的。
- 待決：把 `VisitorStats` 接進前台（例如 Footer），或評估是否整條移除
  （含 `VisitorStats.tsx`、heartbeat 端點與 `visit_stats` 相關邏輯）。

## 二、部署白畫面風險

- nginx 對 `location /` 一律 `try_files → index.html`，**包含 `/index.html` 本身**，
  Caddy 也不會特別加 no-cache。
- 後果：更新部署後，訪客若拿到快取的舊 `index.html` → 引用舊 hash 的 JS bundle →
  新容器裡已不存在 → 全站白畫面，且無自愈機制。
- 建議：nginx 對 `/index.html` 明確加 `add_header Cache-Control "no-cache"`。

## 三、其他問題（依重要性排序）

1. **`.log` 被 git 追蹤**：`client/client-dev.log`、`server/server-dev.log` 已在 git 中
   （`start.bat` 重定向產出），但 `.gitignore` 沒有 `*.log`，每次 dev 都會讓 repo 變髒。
   建議加 pattern 並 `git rm --cached`（保留歷史）。
2. **價格精度不一致**：後台表單 `step="0.01"`（`AdminPage.tsx`）允許小數，
   但 `server/src/routes/products.ts:60` 做 `Math.round` 存整數（註解：TWD 不用分）。
   輸入 123.45 會存成 123。應二選一：前端 step 改 1，或後端支援兩位小數。
3. **安全小漏洞**：
   - `POST /api/admin/logout`（`server/src/index.ts:42`）沒套 `requireAdmin`；
     且 cookie 為 `SameSite=Lax`，跨站 top-level POST 導航會帶 cookie，
     攻擊者可逼迫登出（低危，補上只有一行）。
   - 登入端點 `POST /api/admin/login` **沒有 rate-limit 或嘗試次數限制**；
     公開網域 + 預設密碼 `1971` 的組合值得警惕（Docker 部署已強制設定 `ADMIN_PASSWORD`）。
4. **預設密碼訊息互相矛盾**：
   - `server/src/index.ts:10` 警告寫預設是 `admin123`；
   - 實際預設是 `1971`（`server/src/auth.ts:9`）；
   - `CLAUDE.md` 又寫 `1971`。三處應統一。
5. **圖片共用的隱患**：`retireUploadedImage`（`server/src/routes/uploads.ts`）會把被取代/
   被刪的本地圖 rename 到 `uploads-deleted/`。若兩個商品填同一個 `/api/uploads/xxx` 網址，
   刪除任一商品會連帶弄壞另一個的圖。目前 UI 是「上傳後把 url 填入欄位」，理論上可重覆貼同址。
6. **搜尋拆詞偏鬆**：`q` 按空白拆成多個 AND LIKE（`products.ts` handleList）。
   中文無空白，搜「紅茶」=「含『紅』且含『茶』」。可接受但要知情；
   若要精準可對 CJK 字元整串 LIKE。
7. **`checkAdminAuth` 誤判後端故障**：`client/src/api/client.ts:95` 只看 401，
   網路失敗或 500 會被當成「未登入」，後端當機時後台會顯示登入表單，易誤導排查。
   建議僅在 `res.status === 401` 時回 false，其餘 throw。

## 四、提問方式建議（寫給 AI 協作）

1. **把「端到端路徑」寫進提問**：例「新增商品詳情頁，路徑 `/products/5` 直接打開要能看到內容」，
   要求主動檢查路由、nginx fallback、測試整條鏈，而非只寫元件。
   （上述兩塊死代碼都是「後端寫了前端沒接」「頁面寫了路由沒掛」造成。）
2. **報 bug 用「預期行為 + 實際行為」句式**：例「後台輸入價格 123.45，儲存後前台顯示 123；預期是……」。
3. **一次一個目標，附上「不要動」的邊界**：repo 有刻意設計（Modal 只能 × 關閉、
   `checkAdminAuth` 的 401/400 手法），明確說「其他都不改」可避免順手重構。
4. **要求可驗證的收尾**：UI 類改動加一句「請用 curl 打 API 或列出手動驗證步驟」，讓驗收標準明面化。

## 建議的下一步 prompt（依序）

1. 處理 `ProductDetailPage`：刪除並同步修正 `CLAUDE.md` 與 nginx 註解，或掛上路由。
2. 把 `VisitorStats` 接進前台 Footer，或說明為何該刪掉它。
3. nginx 對 `index.html` 加 no-cache；`.gitignore` 加 `*.log` 並 `git rm --cached` 兩個 log。
4. logout 加 `requireAdmin`；統一預設密碼三處文案；價格改整數（前端 `step=1`）。
