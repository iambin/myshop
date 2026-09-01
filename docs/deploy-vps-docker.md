# 佈署速查：VPS + Docker（多站架構）

將本專案（電商前台 + 後台）佈署到 VPS 的 Docker 環境。
架構為「單一共用反向代理 + 多站容器」：全機只有 Caddy 對外開 80/443，
各網站容器掛同一條 `proxy-net` 網路由它依域名分流，互不影響。

> 逐步詳細版（含截圖級說明與故障排查）見 `docs/deploy-debian13-tutorial.md`。

## 架構

```
VPS (Docker)
├─ caddy 容器（proxy/）→ 全機唯一對外開 80/443
│   ├─ Let's Encrypt 憑證自動申請＋續約（正式憑證，瀏覽器無警告）
│   └─ 依域名分流：shop.example.com → myshop-web:80
├─ proxy-net（跨專案共用網路；本站別名 myshop-web）
├─ client 容器（nginx）→ 不綁主機埠，只聽內部 80
│   ├─ 前台靜態檔（SPA fallback）
│   └─ /api/* 反向代理 ↓
└─ server 容器（Express + SQLite）→ 不對外開 port
    └─ 資料（shop.db、上傳圖片）存於 named volume「server-data」持久化
```

## 相關檔案

| 檔案 | 用途 |
|---|---|
| `docker-compose.yml` | 編排 client/server 兩容器；client 掛外部網路 `proxy-net`（alias `myshop-web`）；`ADMIN_PASSWORD` 未設定會拒絕啟動 |
| `server/Dockerfile` + `.dockerignore` | Node 22 slim，`npm ci` 後以 tsx 執行（better-sqlite3 在 Debian glibc 有預編譯二進位檔） |
| `client/Dockerfile` | 多階段建置：Node build → nginx:alpine 服務靜態檔（純 HTTP，TLS 由 Caddy 終結） |
| `client/nginx.conf` | SPA fallback + `/api/` 反代到 server:3001 + 上傳上限 6MB |
| `proxy/` | 共用反向代理（Caddy）：`docker-compose.yml` 獨占 80/443、`Caddyfile` 域名分流、`.env.example` 的 `DOMAIN` |
| `.env.example` | 後台密碼 `ADMIN_PASSWORD` 範本（域名在 `proxy/.env` 設定） |

## 首次佈署

```bash
# 0. 安裝 Docker（若尚未安裝）
curl -fsSL https://get.docker.com | sh

# 1. 建立跨專案共用網路（全機一次性）
docker network create proxy-net

# 2. 取得專案（先在本機 git push，VPS 上 clone）
git clone <你的 repo 網址> && cd myshop

# 3. 啟動共用反向代理（全機一次就好；DOMAIN 需 DNS A 記錄已生效）
cd proxy
cp .env.example .env
nano .env                  # 改 DOMAIN=shop.example.com
docker compose up -d
docker compose logs caddy  # 看到 certificate obtained successfully 即成功
cd ..

# 4. 設定後台密碼並啟動本專案
cp .env.example .env
nano .env                  # 改 ADMIN_PASSWORD
docker compose up -d --build

# 5. （可選）灌入測試資料：5 分類 40 商品
#    注意：seed 會清空現有資料後重寫，正式環境有資料時勿執行
docker compose exec server npm run seed

# 6. 驗證（正式憑證，不需 -k）
curl https://shop.example.com/api/categories
```

之後瀏覽：

- 前台：`https://shop.example.com/`
- 後台：`https://shop.example.com/admin`

## 日常維護

```bash
# 更新版程式碼（myshop 目錄）
git pull && docker compose up -d --build

# 改域名分流設定（新增網站／換域名；proxy 目錄）
nano Caddyfile && docker compose restart

# 備份 SQLite + 上傳圖片（整包打包 volume）
docker run --rm -v myshop_server-data:/data -v $(pwd):/backup \
  alpine tar czf /backup/shop-backup-$(date +%F).tar.gz -C /data .

# 人工清理被刪除的封存圖片（uploads-deleted/）
docker compose exec server sh -c "rm -f /app/data/uploads-deleted/*"
# 詳細進階與手動步驟見 docs/cleanup-deleted-images.md

# 看日誌
docker compose logs -f server   # 本專案後端
cd proxy && docker compose logs caddy   # 反向代理／憑證
```

## 注意事項

- **HTTPS**：由 Caddy 以 Let's Encrypt 正式憑證處理，自動申請、自動續約。簽發失敗九成是 DNS 未生效或外部連不到 80 port（Let's Encrypt 驗證需求），排查見詳細版常見問題
- **埠占用**：全機只有 `proxy/` 的 Caddy 能綁 80/443。任何網站專案（含本專案）的 compose 都不得寫 `ports: 80/443` 映射，一律走 `expose` + `proxy-net`
- **防火牆**：`ufw allow 80,443/tcp` 即可，3001 不需對外開
- **資料持久化**：SQLite 與上傳圖片都在 named volume `server-data`，重建容器（`down` / `up`）不會丟資料；只有 `docker volume rm` 才會刪除。Caddy 憑證存於 `proxy_caddy-data`，遺失會自動重簽，不必備份
- **better-sqlite3**：Dockerfile 使用 Debian glibc 基底映像，依賴官方預編譯 binary；若在特殊架構上建置失敗，需在 `server/Dockerfile` 加裝 `python3 make g++` 後重新 `npm rebuild`
- **新增第二個網站**：該專案容器掛 `proxy-net` 外部網路 + 取全機唯一 alias + 在 `proxy/Caddyfile` 加一段 `reverse_proxy` → `cd proxy && docker compose restart`
