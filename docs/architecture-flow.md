# 前後端互動流程

依本專案實際架構繪製：React SPA（5173）→ Vite proxy（`/api`）→ Express API（3001）→ better-sqlite3 → `server/data/shop.db`。

## 1. 系統整體架構與資料流向

```mermaid
flowchart TD
    subgraph Client ["前端 (React 19 + Vite :5173)"]
        UI_Home["前台首頁 (HomePage)"]
        UI_Modal["商品詳情 (ProductDetailModal)"]
        UI_Admin["後台管理 (AdminPage)"]
        UI_Stats["進站統計 (VisitStatsPanel)"]
        API_Client["API 封裝層 (api/client.ts)"]
    end

    subgraph Proxy ["Vite Dev Proxy (:5173)"]
        ProxyRouter["/api/* 轉發至後端 :3001"]
    end

    subgraph Server ["後端 (Express 5 + TypeScript :3001)"]
        AuthMiddleware["認證中介層 (requireAdmin)"]
        ProductsRoute["/api/products\n(多詞跨欄位交集搜尋 / 分頁 / CRUD)"]
        CategoriesRoute["/api/categories\n(公開列表 / 統計 / 後台管理)"]
        UploadsRoute["/api/uploads\n(圖片上傳 <=5MB / 刪除歸檔)"]
        StatsRoute["/api/stats\n(心跳統計 / 即時與區間訪客)"]
    end

    subgraph Database ["資料庫 (SQLite / better-sqlite3)"]
        DB_Products[("products 表")]
        DB_Categories[("categories 表")]
        DB_Stats[("visit_stats 表")]
    end

    UI_Home --> API_Client
    UI_Modal --> API_Client
    UI_Admin --> API_Client
    UI_Stats --> API_Client

    API_Client --> ProxyRouter
    ProxyRouter --> AuthMiddleware
    ProxyRouter --> ProductsRoute
    ProxyRouter --> CategoriesRoute
    ProxyRouter --> StatsRoute

    AuthMiddleware --> ProductsRoute
    AuthMiddleware --> CategoriesRoute
    AuthMiddleware --> UploadsRoute

    ProductsRoute --> DB_Products
    ProductsRoute --> DB_Categories
    CategoriesRoute --> DB_Categories
    StatsRoute --> DB_Stats
```

---

## 2. 前台：多關鍵字搜尋、分頁切換與詳情 Modal 互動流程

```mermaid
sequenceDiagram
    autonumber
    actor User as 使用者
    participant Browser as 前端頁面 (HomePage)
    participant Modal as 詳情彈窗 (ProductDetailModal)
    participant Proxy as Vite Proxy (:5173)
    participant API as 後端 API (/api/products)
    participant DB as SQLite (shop.db)

    Note over User, DB: ── 1. 頁面載入與進站心跳 ──
    Browser->>Browser: Mount 時取得/產生 localStorage visitor UUID
    Browser->>Proxy: POST /api/stats/heartbeat { visitorId }
    Proxy->>API: 轉發請求
    API->>DB: INSERT / UPDATE visit_stats
    DB-->>API: 寫入完成
    API-->>Browser: 200 OK

    Note over User, DB: ── 2. 多關鍵字跨欄位搜尋 ──
    User->>Browser: 輸入搜尋關鍵字（例：「家居 陶瓷」）
    Browser->>Browser: 更新 URL Query (q="家居 陶瓷", page=1)
    Browser->>Proxy: GET /api/products?q=家居 陶瓷&page=1
    Proxy->>API: 轉發請求
    Note over API: 將關鍵字拆解為 ["家居", "陶瓷"]<br/>以 AND 交集比對 (p.name, c.name, p.description, p.specs)
    API->>DB: SELECT COUNT(*) + SELECT items (LIMIT 12 OFFSET 0)
    DB-->>API: 回傳商品列表與總筆數
    API-->>Browser: 200 OK { items, total, page, pageSize }
    Browser-->>User: 渲染商品網格卡片

    Note over User, DB: ── 3. 分頁切換平滑回到頁首 ──
    User->>Browser: 點選「下一頁」
    Browser->>Browser: document.getElementById('root').scrollIntoView({ behavior: 'smooth' })
    Browser->>Browser: 更新 URL Query (page=2)
    Browser->>Proxy: GET /api/products?q=家居 陶瓷&page=2
    Proxy->>API: 轉發請求
    API->>DB: 查詢第 2 頁資料 (OFFSET 12)
    DB-->>API: 回傳商品資料
    API-->>Browser: 200 OK
    Browser-->>User: 畫面平滑移至頁首，並更新商品列表

    Note over User, DB: ── 4. 查看商品詳情（Modal 彈窗） ──
    User->>Browser: 點擊商品卡片
    Browser->>Browser: 更新 URL Query (product=id)，鎖定 body 滾動 (overflow: hidden)
    Browser->>Modal: 開啟 ProductDetailModal
    Modal->>Proxy: GET /api/products/:id
    Proxy->>API: 轉發請求
    API->>DB: SELECT by id WHERE is_active = 1
    DB-->>API: 回傳商品完整規格與資訊
    API-->>Modal: 200 OK (Product)
    Modal-->>User: 彈窗展示圖片、價格、庫存與多行規格
    User->>Modal: 點擊右上角「×」按鈕關閉
    Modal->>Browser: 卸載 Modal，還原 body 滾動 (overflow: auto)
```

---

## 3. 後台：登入驗證、商品管理（預設範本）與圖片上傳

```mermaid
sequenceDiagram
    autonumber
    actor Admin as 管理員
    participant AdminUI as 後台介面 (AdminPage)
    participant Proxy as Vite Proxy (:5173)
    participant Auth as 驗證系統 (/api/admin)
    participant UploadAPI as 上傳 API (/api/uploads)
    participant ProductAPI as 商品 API (/api/products)
    participant DB as SQLite (shop.db)
    participant FS as 檔案系統 (data/uploads/)

    Note over Admin, DB: ── 1. 登入狀態探測與驗證 ──
    Admin->>AdminUI: 進入 /admin 頁面
    AdminUI->>ProductAPI: POST /api/products (checkAdminAuth 探測)
    ProductAPI-->>AdminUI: 401 Unauthorized
    AdminUI-->>Admin: 顯示 AdminLoginPage 登入表單
    Admin->>AdminUI: 輸入管理密碼
    AdminUI->>Proxy: POST /api/admin/login { password }
    Proxy->>Auth: 轉發請求
    Auth->>Auth: 驗證密碼（ADMIN_PASSWORD / 1971）
    Auth-->>AdminUI: 200 OK + Set-Cookie: admin_token (HttpOnly, HMAC-SHA256)
    AdminUI-->>Admin: 進入管理主畫面

    Note over Admin, DB: ── 2. 新增商品（自動帶入預設規格）與圖片上傳 ──
    Admin->>AdminUI: 點擊「＋ 新增商品」
    AdminUI->>AdminUI: 鎖定 body 滾動，彈出商品編輯 Modal<br/>規格 textarea 自動帶入預設範本：<br/>品名：\n高度：\n寬度：\n容器：\n
    
    opt 上傳商品圖片
        Admin->>AdminUI: 選擇圖檔
        AdminUI->>Proxy: POST /api/uploads (multipart/form-data)
        Proxy->>UploadAPI: 轉發（requireAdmin 驗證 Cookie）
        UploadAPI->>UploadAPI: 檢查副檔名與大小（<=5MB）
        UploadAPI->>FS: 存入 server/data/uploads/xxx.webp
        FS-->>UploadAPI: 儲存成功
        UploadAPI-->>AdminUI: 201 Created { url: "/api/uploads/xxx.webp" }
        AdminUI-->>Admin: 顯示圖片預覽
    end

    Admin->>AdminUI: 填寫名稱、價格、庫存等資訊後點擊「儲存」
    AdminUI->>Proxy: POST /api/products { name, price, specs, image_url, ... }
    Proxy->>ProductAPI: 轉發（requireAdmin 驗證 Cookie）
    ProductAPI->>ProductAPI: 驗證必填欄位與數值型別
    ProductAPI->>DB: INSERT INTO products (...) VALUES (...)
    DB-->>ProductAPI: 寫入成功
    ProductAPI-->>AdminUI: 201 Created { id }
    AdminUI->>AdminUI: 關閉 Modal，還原 body 滾動
    AdminUI->>ProductAPI: GET /api/products?all=1 重新載入列表
    ProductAPI-->>AdminUI: 200 OK
    AdminUI-->>Admin: 顯示「商品已新增」並更新列表
```

---

## 4. 架構核心設計要點

1. **前後端分離與 Proxy**：
   - 前端 React SPA 透過 Vite Proxy（`/api`）轉發請求至 Express 後端，開發與生產環境均保持一致路徑。
2. **多關鍵字跨欄位搜尋（Multi-term Tokenized AND Search）**：
   - 將搜尋字串依空格切分，每個單字獨立比對 `(p.name LIKE @q_i OR c.name LIKE @q_i OR p.description LIKE @q_i OR p.specs LIKE @q_i)`，並以 `AND` 交集比對，支援任意順序與跨欄位組合。
3. **安全認證**：
   - 自製 HMAC-SHA256 Token 存於 `HttpOnly` + `SameSite=Lax` Cookie（`admin_token`），所有修改與上傳操作皆經 `requireAdmin` 驗證。
4. **SQL 防護**：
   - 所有 SQL 查詢均採用具名參數（Named Parameters `@param`），排序使用白名單映射（`SORTS`），防止 SQL Injection。
5. **使用者互動體驗**：
   - **Modal 背景鎖定**：彈窗開啟時自動將 `body` 設為 `overflow: hidden`，遮罩設定 `overscroll-behavior: contain` 防止背景滾動穿透。
   - **分頁平滑滾動**：切換分頁時自動透過 `document.getElementById('root').scrollIntoView({ behavior: 'smooth' })` 平滑回到頁面頂部。
