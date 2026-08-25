# 佈署指南：Ubuntu VPS + Docker

將本專案（電商前台 + 後台）佈署到 Ubuntu VPS 的 Docker 環境。

## 架構

```
VPS (Ubuntu + Docker)
├─ client 容器（nginx）→ 對外開 80 port
│   ├─ 提供前台靜態檔（SPA fallback）
│   └─ /api/* 反向代理 ↓
└─ server 容器（Express + SQLite）→ 僅 compose 內部網路，不對外開 port
    └─ 資料（shop.db、上傳圖片）存放在 named volume「server-data」持久化
```

## 相關檔案

| 檔案 | 用途 |
|---|---|
| `docker-compose.yml` | 編排兩個容器；`ADMIN_PASSWORD` 未設定會拒絕啟動 |
| `server/Dockerfile` + `.dockerignore` | Node 22 slim，`npm ci` 後以 tsx 執行（better-sqlite3 在 Debian glibc 有預編譯二進位檔） |
| `client/Dockerfile` | 多階段建置：Node build → nginx:alpine 服務靜態檔 |
| `client/nginx.conf` | SPA fallback + `/api/` 反代到 server:3001 + 上傳上限 6MB |
| `.env.example` | 密碼範本 |

## 首次佈署

```bash
# 1. 安裝 Docker（Ubuntu）
curl -fsSL https://get.docker.com | sh

# 2. 取得專案（先在本機 git push，VPS 上 clone）
git clone <你的 repo 網址> && cd myshop

# 3. 設定後台密碼
cp .env.example .env
nano .env   # 改 ADMIN_PASSWORD

# 4. 建置並啟動
docker compose up -d --build

# 5. （可選）灌入測試資料：5 分類 40 商品
#    注意：seed 會清空現有資料後重寫，正式環境有資料時勿執行
docker compose exec server npm run seed

# 6. 驗證
curl http://localhost/api/categories
```

之後瀏覽：

- 前台：`http://<VPS_IP>/`
- 後台：`http://<VPS_IP>/admin`

## 日常維護

```bash
# 更新版程式碼
git pull && docker compose up -d --build

# 備份 SQLite + 上傳圖片（整包打包 volume）
docker run --rm -v myshop_server-data:/data -v $(pwd):/backup \
  alpine tar czf /backup/shop-backup-$(date +%F).tar.gz -C /data .

# 看日誌
docker compose logs -f server
```

## 注意事項

- **HTTPS**：目前只開 80。要上線建議在前面加一層 Caddy（自動 Let's Encrypt）或 Nginx Proxy Manager，把對外 port 改成 443；`client/nginx.conf` 的反代設定不需動。
- **防火牆**：`ufw allow 80,443/tcp` 即可，3001 不需對外開。
- **資料持久化**：SQLite 與上傳圖片都在 named volume `server-data`，重建容器（`down` / `up`）不會丟資料；只有 `docker volume rm` 才會刪除。
- **better-sqlite3**：Dockerfile 使用 Debian glibc 基底映像，依賴官方預編譯 binary；若在特殊架構上建置失敗，需在 `server/Dockerfile` 加裝 `python3 make g++` 後重新 `npm rebuild`。
