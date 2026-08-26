# 交接文檔：商品／分類下架欄位與自訂排序

> 產生日期：2026-08-25
> 範圍：products 與 categories 兩表新增 `is_active`（下架旗標）與 `sort_order`（自訂排序），
> 分類具備「無上架商品即自動下架」行為，前後台 UI 同步支援。
> 本文檔記錄設計決策、現狀、風險與待辦，供下次工作接手參考。

## 一、設計決策（為什麼這樣做）

| 決策 | 內容 | 理由 |
|---|---|---|
| 欄位命名 `is_active` | INTEGER，1=上架 0=下架，預設 1 | SQLite 慣用布林；語意是「啟用中」，下架只是反向描述 |
| `sort_order` 預設值 | products 999、categories 99（依需求指定） | 新資料自然排尾；整數比較即可排序 |
| 分類自動下架＝查詢時推導 | 公開列表只回「`is_active=1` 且至少一筆上架商品」的分類，**不回寫欄位** | 自我修復：商品重新上架分類自動恢復；不用在每個商品寫入點同步分類狀態；單一事實來源 |
| 手動下架需先清空上架商品（2026-08-26 修正，原為「強制覆蓋」） | 分類下仍有上架商品時 `PUT` 下架 → 409「此分類下仍有上架中的商品」；刪除分類同理，有任何商品即 409 | 防止前台殘留孤兒上架商品：分類消失後商品仍四處可見卻無法從分類導航觸及 |
| 管理視圖走 `?all=1` | products、categories 的公開 GET 加 `all=1` 參數 → 需 admin cookie，回全部資料含新欄位 | 沿用現有 router 掛 requireAdmin 的模式，不另開路由；未登入打 all=1 得 401 |
| 商品預設排序改為 `sort=default` | `sort_order ASC, id DESC`（平手時新者先）；無 sort 參數時即此排序；`newest` 仍保留可明指定 | 全部 999 時行為等同舊預設「最新上架」，既有列表顯示不變 |
| 下架商品詳情回 404 | 公開 `GET /api/products/:id` 加 `is_active=1` 條件 | client 的錯誤訊息本來就寫「商品不存在或已下架」，前後端語意剛好對齊 |
| 舊庫遷移在 `initSchema()` 內 | `addColumnIfMissing()` 用 PRAGMA table_info 判斷後 ALTER TABLE，import 時自動執行 | 容器一啟動就完成遷移，部署無需手動步驟 |

## 二、本次變更的檔案（尚未 git commit）

| 狀態 | 檔案 |
|---|---|
| 修改（server） | `server/src/db.ts`、`server/src/routes/products.ts`、`server/src/routes/categories.ts`、`server/tests/api-flow.test.mjs`（新增 8 條測試） |
| 修改（client） | `client/src/types.ts`、`client/src/api/client.ts`、`client/src/pages/AdminPage.tsx`、`client/src/pages/CategoriesAdminPage.tsx`、`client/src/pages/HomePage.tsx`、`client/src/index.css`（badge/checkbox-label/row-inactive 樣式） |
| 修改（文檔） | `AGENTS.md`（schema 與路由描述同步） |
| 雜訊（勿提交） | `server/server-dev.log`、`client/client-dev.log` 為開發日誌，維持不 commit |

## 三、API 契約重點（client/server 對齊用）

- `GET /api/products`：公開只回上架商品；回應 items 含 `is_active`、`sort_order`
- `GET /api/products?all=1`：管理視圖（需登入），含下架商品
- `PUT /api/products/:id`：**全欄位替換**。省略 `is_active` 會重置為 1、省略 `sort_order` 重置為 999——呼叫方必須送完整表單（現有 client 是如此）
- `GET /api/categories`：公開，僅回有效分類，附 `product_count`（上架商品數）
- `GET /api/categories?all=1`：管理視圖（需登入），附 `active_product_count`／`is_active`／`sort_order`
- `POST/PUT /api/categories`：接受 `{ name, is_active?, sort_order? }`，省略者套預設

## 四、驗證現狀（已完成）

1. server 測試 **28/28 通過**（`cd server && npm test`；新增：預設值、下架隱藏、詳情 404、自動下架／恢復、分類下架防護、分類刪除防護、排序順序、欄位驗證、all=1 未登入 401）
2. server `npx tsc --noEmit` 通過；client `npx tsc -b` + `npm run build` 通過
3. **舊庫遷移實測**：複製真實 shop.db 到暫存目錄以 `DATA_DIR` 開啟，四個欄位補齊、既有 40 筆拿到預設值（1/999/1/99）。暫存檔已清

## 五、已知風險與注意事項

1. **預設排序行為變了**：無 sort 參數從「最新上架」變「自訂排序」。目前所有商品都是 999，兩者顯示順序相同（平手規則同為新者先）；一旦開始填自訂排序就會分道——若有人回報「順序怪怪的」先查這裡
2. **PUT 半更新陷阱**：直接用 curl 或第三方工具 PUT 商品時漏帶 `is_active`/`sort_order` 會靜默重置（上架＋999）。修改 client 表單以外的呼叫端要留意
3. **CategoriesAdminPage 載入時機**：列表改打需認證的 `all=1`，故 load() 移到 authed 通過後才執行（useEffect 監聽 authed）；若日後加第二個管理頁沿用此模式，避免未登入時殘留 401 錯誤訊息
4. **seed 不設新欄位**：`npm run seed` 灌的資料全部上架、排序值皆預設。需要示範排序效果得手動改幾筆
5. **HomePage 直接 fetch("/api/categories")**：沒走 api/client 封裝（既有寫法，本次未動）；公開端點過濾後側欄自動正確，但若日後公開契約再變，這裡是漏網之魚
6. **效能**：目前規模不需索引；商品數上千後可考慮 `(is_active, sort_order)` 複合索引

## 六、待辦／改善建議（依優先序）

1. **git commit**：本功能全部未提交（等使用者明確指示；dev.log 兩個檔案不要納入）
2. **批次排序 UI**：現在要逐筆開編輯視窗輸數字；商品多之後值得做拖曳排序或表格內直接編輯 sort_order
3. **部署提醒**：正式環境 `git pull && docker compose up -d --build` 即自動遷移舊 volume 內的 DB，無需手動 SQL；建議部署後先進後台確認商品/分類列表正常再對外
4. `docs/architecture-flow.md` 可選補充：序列圖中的 `sort` 參數與 all=1 視圖（非急件）
5. ~~若日後要「分類下架連帶隱藏其商品」~~ → 2026-08-26 已改為「有上架商品即禁止下架分類」（見設計決策表），商品與分類狀態不再脫鉤

## 七、快速指標

- schema／遷移：`server/src/db.ts`（`addColumnIfMissing`）
- 自動下架 SQL：`server/src/routes/categories.ts` 的 `handleList()`（LEFT JOIN active_count + WHERE 推導）
- 排序白名單：`server/src/routes/products.ts` 的 `SORTS`（default|newest|price_asc|price_desc）
- 後台三態狀態顯示：`client/src/pages/CategoriesAdminPage.tsx` 的 `categoryStatus()`
- 架構慣例：`AGENTS.md` Server/Client 小節（已同步本次變更）
