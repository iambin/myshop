# 佈署詳細教學：Debian 13 + Docker（小白版）

一步一步把本專案（前台商城 + 後台管理）佈署到 Debian 13 的 Docker 上。
每個步驟都附上「要做什麼、為什麼、怎麼確認成功」，照順序做即可。

## 你的環境

| 項目 | 內容 |
|---|---|
| 作業系統 | Debian 13 |
| 伺服器 IP | `192.168.1.7` |
| Docker | 29.7.2 |
| Docker Compose | v5.5.0 |

## 部署後長什麼樣（架構）

Docker 會幫你跑**兩個容器**，不用自己在伺服器裝 Node.js：

```
Debian 13 (192.168.1.7)
├─ client 容器（nginx）→ 對外開 80 port
│   ├─ 提供網頁畫面（前台靜態檔）
│   └─ 把 /api/* 轉交給 server 容器
└─ server 容器（Express + SQLite）→ 不對外開 port，只有內部互通
    └─ 資料庫與上傳圖片存在「server-data」volume，重啟不會消失
```

瀏覽器只跟 80 port 溝通；API、資料庫都在內部，比較安全。

## nginx 代理在哪裡？

**本專案需要 nginx 做反向代理，但它已經打包進 client 容器了，不用在 Debian 主機上另外安裝。**

- `client/Dockerfile` 的最終映像就是官方 `nginx:1.27-alpine`——容器本身跑的就是 nginx
- 設定檔是專案裡的 `client/nginx.conf`，建置時會被複製進容器。它做三件事：
  1. 提供前台網頁（React 打包後的靜態檔）
  2. **SPA fallback**：直接拜訪 `/products/3` 這類網址時回傳 `index.html`，讓前端路由接手
  3. **反向代理**：把 `/api/*` 的請求轉交給內部的 server 容器（`proxy_pass http://server:3001`）

```
瀏覽器 → http://192.168.1.7/
            │
            ▼
   client 容器 (nginx, port 80)
    ├─ 網頁請求 (/)          → 直接回傳靜態檔
    └─ API 請求 (/api/*.*)   ──反代──▶ server 容器 (:3001)
```

所以：

- **新手什麼都不用做**，照後面步驟部署即可，代理自動生效
- 未來想調整代理規則（例如加上 HTTPS、改路徑），改 `client/nginx.conf` 後重新執行 `docker compose up -d --build` 即可

## 要部署哪些程式碼？

**整個專案資料夾**（`myshop`）就是部署包。不需要另外打包前端或後端：

- 建置動作全部在容器內進行（`npm ci`、`npm run build` 都由 Dockerfile 做），所以 **node_modules、dist 不用帶**（`.dockerignore` 已排除，就算壓縮時沒刪也不會出事）
- **不要**把開發機上的 `server/data/`（測試用資料庫、圖片）帶上正式環境

---

## 第一部分：在 Windows 開發機打包程式

### 步驟 1-1：清理專案（可選但建議）

在專案根目錄確認沒有不該上線的檔案：

```powershell
git status --short
```

> 本專案的 `.env`（真密碼）已被 `.gitignore` 排除，`git` 方式不會帶上去；
> 用壓縮方式則要注意**手動排除** `.env`。

### 步驟 1-2：取得程式碼到伺服器（二選一）

**方式 A：壓縮資料夾 + WinSCP（最簡單，推薦新手）**

1. 在檔案總管找到 `myshop` 資料夾，按右鍵 →「壓縮成 ZIP 檔」
   （若想縮小體積，先刪掉裡面的 `node_modules`、`client\node_modules`、`client\dist`、`server\data`）
2. 下載並安裝 [WinSCP](https://winscp.net/)
3. 開 WinSCP → 新增連線：
   - 主機名稱：`192.168.1.7`
   - 埠號：`22`
   - 使用者／密碼：Debian 的帳密
4. 連線後把 `myshop.zip` 拖到右邊的家目錄（例如 `/home/你的帳號/`）

**方式 B：scp 指令（PowerShell 直接傳）**

```powershell
# 在 Windows PowerShell 執行（路徑照實際改）
scp C:\Users\bin\Desktop\Memo\myshop.zip yourname@192.168.1.7:/home/yourname/
```

**方式 C：git clone（如果之後想用 git 更新）**

先把專案 push 到 GitHub / Gitea 等遠端 repo，之後在伺服器直接：

```bash
git clone <你的repo網址> && cd myshop
```

---

## 第二部分：Debian 13 環境搭建

以下指令都在 **Debian 伺服器**上執行。先用 ssh 或主機螢幕登入。

### 步驟 2-1：確認 Docker 已可用

你的機器已裝好 Docker，先驗證：

```bash
docker version          # 應顯示 Version: 29.7.2
docker compose version  # 應顯示 v5.5.0
```

兩個都有版本號 → 跳過安裝，直接去步驟 2-3。

### 步驟 2-2：（只有沒裝才做）安裝 Docker

```bash
# 一鍵安裝官方 Docker（含 compose plugin）
curl -fsSL https://get.docker.com | sh

# 讓目前使用者免 sudo 操作 docker（要重新登入才生效）
sudo usermod -aG docker $USER
```

執行完**登出再登入**，回到步驟 2-1 驗證。

### 步驟 2-3：解壓縮程式碼

```bash
cd /home/yourname
unzip myshop.zip        # 若無 unzip：sudo apt update && sudo apt install -y unzip
cd myshop
ls
```

應該看到：`client/`、`server/`、`docker-compose.yml`、`.env.example`、`docs/` …

> 若走方式 C（git clone），clone 完 `cd myshop` 即可。

---

## 第三部分：設定環境變數（必做）

### 步驟 3-1：建立 .env

```bash
cp .env.example .env
nano .env
```

把 `ADMIN_PASSWORD=` 後面改成你要用的後台密碼，例如：

```
ADMIN_PASSWORD=MyStrongPass2026!
```

存檔：`Ctrl+O` → `Enter` → `Ctrl+X`。

> **重要**：不設 `ADMIN_PASSWORD` 的話，下一步 `docker compose up` 會**直接拒絕啟動**並顯示中文提示——這是刻意設計，避免用預設密碼上線。
>
> 可選：再加一行 `AUTH_SECRET=隨便一串長亂碼`，否則每次容器重啟後台都要重新登入一次（影響很小）。

---

## 第四部分：建置並啟動

### 步驟 4-1：一行指令建置 + 啟動

確定在 `myshop` 目錄下：

```bash
docker compose up -d --build
```

第一次執行會花幾分鐘（下載 base image、容器內 `npm ci`、建置前端）。它做的事：

1. 依 `server/Dockerfile` 建 server 映像（Node 22 + npm ci）
2. 依 `client/Dockerfile` 建映像（Node 建置 → nginx 打包靜態檔）
3. 建立 `server-data` volume（放資料庫和圖片）
4. 背景啟動兩個容器

### 步驟 4-2：確認容器狀態

```bash
docker compose ps
```

成功的樣子（兩個都是 `Up` / `running`）：

```
NAME              IMAGE           STATUS         PORTS
myshop-client-1   nginx:1.27...   Up 10 seconds  0.0.0.0:80->80/tcp
myshop-server-1   myshop-server   Up 10 seconds
```

若某個是 `Exited` 或一直重啟，看日誌找原因：

```bash
docker compose logs server   # 看後端日誌
docker compose logs client   # 看前端(nginx)日誌
```

---

## 第五部分：測試是否成功

### 測試 1：API 通不通（在伺服器上）

```bash
curl http://localhost/api/categories
```

成功會回傳 JSON 分類陣列（空資料時是 `[]`）。失敗的話回頭看 `docker compose logs server`。

### 測試 2：瀏覽器開前台

在**同一區網的任何電腦**瀏覽器輸入：

```
http://192.168.1.7
```

應看到商品列表頁。全新資料庫是空的，屬正常（下一步灌測試資料或自己新增商品）。

### 測試 3：後台登入

```
http://192.168.1.7/admin
```

輸入剛剛 `.env` 設定的密碼 → 應能進入商品管理，看到「進站統計」面板。

### 測試 4：新增一筆商品 + 上傳圖片

後台點「＋ 新增商品」→ 填名稱價格 → 用「上傳圖片」傳一張小於 **5MB** 的圖 → 儲存。
回前台重新整理，能看到新商品即全鏈路（nginx → API → SQLite → 圖片服務）都正常。

### 測試 5：（全新環境才做）灌入示範資料

```bash
docker compose exec server npm run seed
```

會寫入 5 分類 × 8 商品 = 40 筆。
> 注意：seed 會**清空現有資料**再重寫，正式營運後不要再執行。

---

## 第六部分：日常維護

```bash
# 改了程式碼要更新（在 myshop 目錄）
docker compose up -d --build

# 看即時日誌（Ctrl+C 離開）
docker compose logs -f server

# 重啟兩個容器
docker compose restart

# 停止 / 移除容器（資料在 volume，不會丟）
docker compose down

# 備份資料庫+圖片（產生 tar.gz 在當前目錄）
docker run --rm -v myshop_server-data:/data -v $(pwd):/backup \
  alpine tar czf /backup/shop-backup-$(date +%F).tar.gz -C /data .
```

> 更新版流程（方式 C git）：`git pull` → `docker compose up -d --build`。
> 方式 A/B：重新壓縮上傳覆蓋後，同樣執行 `up -d --build`。

---

## 常見問題排查

| 症狀 | 原因與處理 |
|---|---|
| 要在 Debian 主機上裝 nginx 嗎？ | 不用。nginx 已打包進 client 容器（見「nginx 代理在哪裡？」一節） |
| `up` 時出現「請先複製 .env.example 為 .env…」 | 沒設 `ADMIN_PASSWORD`，回第三部分 |
| `curl localhost/api/categories` 沒反應 | `docker compose logs server` 看 error；常見是 .env 沒建好 |
| 瀏覽器打不開 `http://192.168.1.7` | ①確認與伺服器同一區網 ②防火牆：`sudo ufw allow 80/tcp`（有啟用 ufw 才需要）③80 port 被占：`sudo ss -tlnp \| grep :80` |
| 上傳圖片失敗 | 單檔上限 5MB（nginx 層 6MB）；超過會被擋 |
| 建置時 better-sqlite3 編譯錯誤 | 正常 x86 Debian 不會發生（用預編譯 binary）；特殊架構需在 `server/Dockerfile` 加裝 `python3 make g++` |
| 重啟後後台要重新登入 | 正常現象；設 `AUTH_SECRET` 可解決 |

## 上線前提醒

- 目前只開 HTTP（80）。對外正式服務建議前面加 Caddy 或 Nginx Proxy Manager 做 HTTPS（443），`client/nginx.conf` 不用改
- 定期做第六部分的備份；volume 名稱以 `docker volume ls` 查到的為準（通常是 `myshop_server-data`）

更精簡的速查版見 `docs/deploy-vps-docker.md`，架構細節見 `docs/architecture-flow.md`。
