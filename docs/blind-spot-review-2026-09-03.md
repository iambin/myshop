# 專案盲點審查與驗證紀錄（2026-09-03）

針對前後端全部源碼、部署配置（docker-compose / Caddyfile / nginx）與測試的全面審查，並已於 2026-09-03 完成程式碼實質驗證。

---

## 一、寫好但沒接線的「死代碼」

### 1. `client/src/pages/ProductDetailPage.tsx` 是孤兒頁面（已證實屬實）

- 該頁面檔案存在，但 `client/src/App.tsx` 的路由表**沒有掛載 `/products/:id`**。
- 商品詳情目前改由 `HomePage` 以 query param `?product=id` 觸發 `ProductDetailModal` 彈窗。
- 影響：
  - 此獨立頁面代碼完全未被使用；
  - `client/nginx.conf:8` 註解與 `CLAUDE.md` 仍宣稱「/products/:id 直接拜訪由前端路由接手」，但部署後直接在瀏覽器輸入 `/products/5` 會走 nginx fallback 回 `index.html`，前端 Router 找不到對應路由，畫面只剩 Footer（核心內容空白）。
- 建議處理：二選一
  - 方案 A（維持彈窗機制）：刪除 `ProductDetailPage.tsx`，並在前端路由增加相容轉址或 fallback，同時更新 `CLAUDE.md` 與 `nginx.conf` 註解。
  - 方案 B（支援獨立商品頁與外部連結）：在 `App.tsx` 重新掛回 `<Route path="/products/:id" element={<ProductDetailPage />} />`。

### 2. `client/src/components/VisitorStats.tsx`（已驗證：誤判 / 非盲點）

- **驗證現狀**：此項目經查**非孤兒元件**。
- `client/src/components/Footer.tsx` 第 2 行與第 35 行已明確 `import { VisitorStats }` 並渲染 `<VisitorStats />`，而 `<Footer />` 在 `App.tsx` 中常駐載入。
- `VisitorStats.tsx` 內部定期每 60 秒呼叫 `sendHeartbeat()` 與 `fetchVisitStats()`，線上人數統計鏈完全正常運作，不需更動。

---

## 二、部署白畫面風險（已證實屬實，且比預期更嚴重）

- **問題機制**：
  1. `client/nginx.conf` 對 `location /` 一律 `try_files $uri $uri/ /index.html`，未對 `index.html` 設定 `no-cache`。瀏覽器可能依啟發式快取取得舊的 `index.html`。
  2. 更嚴重的問題在於靜態資源 fallback：發版後，舊版 JS bundle（如 `/assets/index-oldhash.js`）在新容器中已不存在。此時 nginx 的 `try_files` 會將該 JS 請求 fallback 回傳 `index.html`（HTML 文本），導致瀏覽器解析 `<script>` 時噴出 `SyntaxError: Unexpected token '<'`，造成整站 JavaScript 執行崩潰、徹底白畫面。
- **改善方案**：在 `client/nginx.conf` 分離 HTML 與靜態資源規則：
  ```nginx
  # 1. index.html 不快取，確保每次載入最新 bundle
  location = /index.html {
      add_header Cache-Control "no-cache, no-store, must-revalidate";
  }

  # 2. 靜態資源使用長快取，若找不到必須回傳 404，嚴禁 fallback 到 index.html
  location /assets/ {
      expires 1y;
      add_header Cache-Control "public, immutable";
      try_files $uri =404;
  }

  # 3. SPA 路由 fallback
  location / {
      try_files $uri $uri/ /index.html;
  }
  ```

---

## 三、其他問題（依重要性排序）

1. **`.log` 被 git 追蹤（屬實）**：
   - `client/client-dev.log`、`server/server-dev.log` 已在 git 追蹤中，`.gitignore` 缺少 `*.log`。
   - 改善：`.gitignore` 補上 `*.log`，並執行 `git rm --cached client/client-dev.log server/server-dev.log`。

2. **價格精度不一致（屬實）**：
   - 後台表單 `AdminPage.tsx:421` 價格輸入框設為 `step="0.01"`，但後端 `server/src/routes/products.ts:60` 做 `Math.round(price)` 轉成整數（註解載明：TWD 不使用小數）。
   - 改善：前端 `AdminPage.tsx` 的價格輸入框改為 `step="1"`、`min="0"`。

3. **安全小漏洞（屬實）**：
   - `POST /api/admin/logout`（`server/src/index.ts:42`）未套用 `requireAdmin` middleware。
   - `POST /api/admin/login` 未實作嘗試次數限制或 rate limiter，具備暴力破解風險。

4. **預設密碼訊息互相矛盾（屬實）**：
   - `server/src/index.ts:10` 警告輸出預設密碼為 `admin123`；
   - `server/src/auth.ts:9` 與 `CLAUDE.md` 實際預設密碼為 `1971`。
   - 改善：將 `server/src/index.ts:10` 的警告文字統一修正為 `1971`。

5. **圖片共用的隱患（屬實）**：
   - `server/src/routes/products.ts` 在更新圖片或刪除商品時，直接呼叫 `retireUploadedImage` 將檔案移至 `uploads-deleted/`。
   - 若有兩筆以上商品共用相同的本地圖片 URL，刪除其中一個商品會導致另一商品的圖片立即失效（404）。
   - 改善：在移至封存區前，先查詢資料庫 `SELECT COUNT(*) FROM products WHERE image_url = ?`，若仍有其他商品引用則略過封存。

6. **搜尋拆詞偏鬆（已驗證：誤判 / 描述錯誤）**：
   - 報告原稱「中文無空白，搜『紅茶』=『含紅且含茶』」，經查為理解偏差。
   - 程式碼為 `q.split(/\s+/)`。中文字串未含空格時，拆解結果為單一元素 `["紅茶"]`，產生的 SQL 條件為 `LIKE '%紅茶%'`，不會將詞拆開。只有使用者手動輸入空格（如「紅 茶」）才會以多詞 AND 查詢，符合一般搜尋邏輯，無須更動。

7. **`checkAdminAuth` 探測機制脆弱（屬實，成因更正）**：
   - 前端採用發送畸形 POST 請求探測 401/400 狀態碼（`client/src/api/client.ts:95`）。
   - 當後端回傳 500 時，`res.status !== 401` 會回傳 `true`，被誤判為「已登入」；當後端完全當機或網路中斷時，`fetch` 丟出錯誤被外層 `.catch(() => setAuthed(false))` 捕捉，又會被誤判為「未登入」而顯示登入表單，干擾障礙排查。
   - 改善：後端增加標準輕量端點 `GET /api/admin/me`，使前端能明確區分 401（未登入）與 5xx/網路中斷（系統異常）。

---

## 四、本次新增盲點（2026-09-03 第二次審查）

上次審查後修復已驗證：`/products/:id` 路由已啟用、`nginx.conf` 已快取規則修正、圖片退役前已加入引用計數檢查。以下為本次新發現的隱藏盲區：

### 🔴 高風險

**1. 登入無速率限制（`server/src/auth.ts` + `server/src/index.ts`）**
`/api/admin/login` 無任何防濫刷機制。攻擊者可無限次嘗試密碼，預設 `1971` 容易被猜中。建議加 IP 階梯延遲或鎖定。

**2. CSRF / Secure flag 缺失**
登出入 Cookie 只有 `HttpOnly; SameSite=Lax; Path=/`，缺 `Secure` flag（生產環境應強制 HTTPS）。`SameSite=Lax` 對 POST 有基本防護，但部署到外部時若為 HTTP 仍會暴露 session。

**3. 圖片 URL 未驗證（`client/src/pages/AdminPage.tsx`）**
管理後台可直接輸入任意 `image_url`（包含外部網址或惡意 scheme）。雖然 React JSX 的 `<img src>` 不執行 `javascript:` URI，但可連結到惡意圖床竊取流量或污染資料。建議在 `parseProductBody` 中驗證 URL scheme 僅允許 `http://` / `https://` / `/api/uploads/...`。

### 🟡 中風險

**4. 型別重複定義（`client/src/types.ts` vs `client/src/api/client.ts`）**
`ProductInput` 和 `CategoryInput` 在各自檔案中各定義一次。任何一側修改都會不同步。應統一在 `types.ts` 匯出，`client.ts` import 使用。

**5. Modal 錯誤狀態無重試（`client/src/components/ProductDetailModal.tsx`）**
根據 CLAUDE.md 規定只能透過 × 關閉，符合設計。但若 `fetchProduct` 拋出錯誤且網絡異常，用戶只能 × 關閉，無法重試。可考慮加「錯誤重試」按鈕。

**6. 心跳發送時機（`client/src/components/VisitorStats.tsx`）**
`sendHeartbeat()` 僅在 `VisitorStats`（掛在 `Footer`）中呼叫，Footer 在 SPA 導航下只 mount 一次。目前線上人數（5 分鐘視窗）追蹤正確，但若未來需要「頁面瀏覽」或「活躍頁面」統計則不足。

**7. 分類以 name 作為 React key（`client/src/pages/HomePage.tsx` L108）**
`key={name}` 在名稱重複時會導致列表渲染錯誤。後端有 `UNIQUE` 約束，實務上不會發生，但防禦性程式碼應改用 `id`。

### 🟢 低風險 / 建議改善

**8. 無 CSP Header**
目前沒有設定 `Content-Security-Policy`。若未來任意字串被渲染到 HTML 中（如規格說明），會有 XSS 風險。建議加上基本的 CSP。

**9. 登出不驗證當前登入狀態（`client/src/pages/AdminPage.tsx` L250-253）**
登出按鈕在任何狀態下都可點擊，直接發 POST 請求。若已經未登入，仍會發一次無效請求。影響不大。

**10. 圖片移除按鈕不觸發 retire（`client/src/pages/AdminPage.tsx` L488）**
「移除」按鈕只清空表單中的 `image_url`，不會呼叫 `retireUploadedImage()`。若用戶先前上傳了圖片再點擊移除，該圖片會停留在 `uploads/` 目錄中成為孤兒檔案。

---

## 五、提問方式建議（寫給 AI 協作）

1. **把「端到端路徑」寫進提問**：例「新增商品詳情頁，路徑 `/products/5` 直接打開要能看到內容」，要求主動檢查路由、nginx fallback、測試整條鏈，而非只寫元件。
2. **報 bug 用「預期行為 + 實際行為」句式**：例「後台輸入價格 123.45，儲存後前台顯示 123；預期是……」。
3. **一次一個目標，附上「不要動」的邊界**：repo 有刻意設計（Modal 只能 × 關閉等），明確說「其他都不改」可避免順手重構。
4. **要求可驗證的收尾**：UI 類改動加一句「請用 curl 打 API 或列出手動驗證步驟」，讓驗收標準明面化。

---

## 修正後的下一步建議任務清單（依優先級）

### 高優先級（線上穩定性與防護）
- [x] 修改 `client/nginx.conf`：為 `/index.html` 增加 `no-cache`，為 `/assets/` 設置 `try_files $uri =404` 與長快取
- [x] 處理 `ProductDetailPage.tsx`：於 `App.tsx` 掛上路由
- [x] `.gitignore` 增加 `*.log`，並執行 `git rm --cached` 移除已追蹤的 log
- [x] `server/src/routes/products.ts` 在退役圖片前加入引用計數檢查
- [ ] 登入加速率限制或階梯延遲
- [x] `parseProductBody` 中驗證圖片 URL scheme（新增 `validateImageUrl()`）
- [ ] 登出入 Cookie 補上 `Secure` flag（生產環境）

### 中優先級（業務邏輯與安全性修正）
- [x] 統一 `server/src/index.ts` 預設密碼警告文案為 `1971`
- [x] `AdminPage.tsx` 價格欄位 `step` 修正為 `1`
- [x] 統一 `ProductInput` / `CategoryInput` 型別至 `types.ts`（移除 `client.ts` 重複定義）
- [x] 分類 React key 改用 `id`（`HomePage.tsx`）
- [x] 圖片「移除」按鈕觸發 `retireImage()` + 新增 `POST /api/uploads/retire` 端點
- [x] `checkAdminAuth` 改用 `GET /api/admin/me` 標準端點（替代畸形探測 POST）
- [x] 登出不驗證當前登入狀態：登出前加 `if (!authed) return`

### 低優先級
- [ ] 加 CSP header
- [ ] Modal 錯誤狀態加重試按鈕
