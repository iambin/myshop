# 前後端互動流程

依本專案實際架構繪製：React SPA（5173）→ Vite proxy（`/api`）→ Express API（3001）→ better-sqlite3 → `server/data/shop.db`。

```mermaid
sequenceDiagram
    actor U as 使用者瀏覽器
    participant C as React SPA<br/>(localhost:5173)
    participant P as Vite Proxy<br/>(轉發 /api)
    participant E as Express API<br/>(localhost:3001)
    participant D as SQLite<br/>(shop.db)

    Note over U,D: ── 前台瀏覽（公開）──

    U->>C: 開啟首頁 /
    C->>P: GET /api/products?page&q&category&sort
    P->>E: 轉發請求
    E->>D: SELECT + COUNT<br/>(named params、SORTS 白名單)
    D-->>E: 商品列 + 總筆數
    E-->>P: { items, total, page, pageSize }
    P-->>C: JSON 回應
    C-->>U: 渲染商品卡片列表／分頁／空狀態

    C->>P: GET /api/categories
    P->>E: 轉發請求
    E->>D: LEFT JOIN 統計 product_count
    D-->>E: 分類陣列
    E-->>C: JSON（經 P）
    C-->>U: 側欄分類按鈕

    U->>C: 點擊商品卡 → /products/:id
    C->>P: GET /api/products/:id
    P->>E: 轉發請求
    alt 商品存在
        E->>D: SELECT by id
        D-->>E: 商品資料
        E-->>C: 200 JSON（經 P）
        C-->>U: 商品詳情頁
    else 不存在
        E-->>C: 404 { error }
        C-->>U: 「商品不存在或已下架」＋返回連結
    end

    Note over U,D: ── 後台管理（需認證）──

    U->>C: /admin 輸入密碼登入
    C->>P: POST /api/admin/login { password }
    P->>E: 轉發請求
    alt 密碼正確（ADMIN_PASSWORD / 預設 1971）
        E-->>C: 200 + Set-Cookie admin_token<br/>(HttpOnly, HMAC-SHA256)
        C-->>U: 進入管理介面
    else 密碼錯誤
        E-->>C: 401
        C-->>U: 顯示登入表單與錯誤
    end

    U->>C: 新增／編輯商品
    opt 上傳圖片
        C->>P: POST /api/uploads (FormData, ≤5MB)
        P->>E: 轉發（requireAdmin 驗證 cookie）
        E->>E: 存入 data/uploads/
        E-->>C: { url }
    end
    C->>P: POST /api/products 或 PUT /api/products/:id
    P->>E: 轉發（requireAdmin）
    E->>E: 驗證欄位（price 取整數等）
    E->>D: INSERT / UPDATE
    D-->>E: 寫入結果
    E-->>C: 201 / 200（經 P）
    C-->>U: 更新列表（refreshTick 重查）

    U->>C: 刪除商品
    C->>P: DELETE /api/products/:id
    P->>E: 轉發（requireAdmin）
    E->>D: DELETE by id
    E->>E: 圖片移至 data/uploads-deleted/
    E-->>C: { ok: true }（經 P）
    C-->>U: 列表刷新；若頁數超過範圍自動回第一頁

    U->>C: 登出
    C->>P: POST /api/admin/logout
    P->>E: 轉發
    E-->>C: 清除 cookie
    C-->>U: 導回登入表單
```

## 要點

- 前後端分離：SPA 只透過 `/api` 溝通，dev 由 Vite proxy 轉發，避免 CORS
- 認證：自製 HMAC-SHA256 token 存 HttpOnly cookie（`admin_token`），寫入操作都過 `requireAdmin`
- SQL 安全：WHERE 用 named parameters、排序取自 `SORTS` 白名單，不可拼接使用者輸入
- 圖片檔案：上傳存 `server/data/uploads/`，刪除商品時移至 `data/uploads-deleted/`
