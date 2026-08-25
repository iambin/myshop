# 佈署詳細教學：Debian 13 + Docker 多站架構（小白版）

一步一步把本專案（前台商城 + 後台管理）佈署到 Debian 13 的 Docker 上。
採用「**單一共用反向代理 + 多站容器**」架構：全機只有一個 Caddy 容器對外開 80/443，
所有網站（含本專案）都躲在它後面，靠域名分流——想再加第二個、第三個網站都不用動架構。
每個步驟都附上「要做什麼、為什麼、怎麼確認成功」，照順序做即可。

## 你的環境

| 項目 | 內容 |
|---|---|
| 作業系統 | Debian 13 |
| 伺服器 IP | `192.168.1.7` |
| 域名 | `shop.example.com`（範例，**請全文替換成你自己的正式域名**） |
| Docker | 29.7.2 |
| Docker Compose | v5.5.0 |

> **前置條件**：域名必須先用 DNS A 記錄指到這台伺服器（有對外的固定 IP；
> 若是家用寬頻則需在路由器把 80/443 轉發到伺服器）。Caddy 靠域名自動申請
> Let's Encrypt 憑證，DNS 沒生效就簽不到，後面全部卡住——所以先確認再開工。

## 部署後長什麼樣（架構）

Docker 會幫你跑**三個容器**，不用自己在伺服器裝 Node.js、nginx 或 Caddy：

```
Debian 13 (192.168.1.7)
├─ caddy 容器（proxy/ 目錄）→ 全機唯一對外開 80 與 443 port
│   ├─ 自動向 Let's Encrypt 申請／續約 HTTPS 憑證（正式憑證，瀏覽器無警告）
│   └─ 依「域名」把請求分流給對應的網站容器
├─ proxy-net（跨專案共用的虛擬網路，各站容器經由它被 Caddy 找到）
│     │ 本站在這個網路上的別名是 myshop-web
│     ▼
├─ client 容器（nginx）→ 不綁主機埠，只聽內部 80
│   ├─ 提供前台 React 靜態檔（含 SPA fallback）
│   └─ 把 /api/* 轉交給 server 容器
└─ server 容器（Express + SQLite）→ 不對外開 port
    └─ 資料庫與上傳圖片存在「server-data」volume，重啟不會消失
```

請求的實際流向：

```
瀏覽器 → https://shop.example.com/
            │
            ▼
   caddy 容器（80/443：TLS 加密＋憑證＋依域名分流）
            │ reverse_proxy myshop-web:80
            ▼
   client 容器（nginx，內部 80）
    ├─ 網頁請求 (/)          → 直接回傳靜態檔
    └─ API 請求 (/api/*.*)   ──反代──▶ server 容器 (:3001)
```

## 兩層代理各自做什麼？

代理工作拆成兩層，各司其職：

**第一層：Caddy（`proxy/` 目錄，全機共用一份）**

- 獨占主機 80/443，負責 HTTPS 加密與 Let's Encrypt 憑證的自動申請、續約
- 設定檔是 `proxy/Caddyfile`，核心就一段：
  ```
  shop.example.com {
      reverse_proxy myshop-web:80
  }
  ```
  「哪個域名 → 轉交給哪個容器」一行搞定。日後加新網站就是在這裡多加一段

**第二層：client 容器裡的 nginx（本專案自己帶的）**

- 最終映像是官方 `nginx:1.27-alpine`，設定檔 `client/nginx.conf` 建置時打包進去，做三件事：
  1. 提供前台網頁（React 打包後的靜態檔）
  2. **SPA fallback**：直接拜訪 `/products/3` 這類網址時回傳 `index.html`，讓前端路由接手
  3. **反向代理**：把 `/api/*` 轉交給內部的 server 容器（`proxy_pass http://server:3001`）

所以：

- **新手照後面步驟做即可**，HTTPS 憑證與分流自動生效
- 想調整「哪些域名指向本站」→ 改 `proxy/Caddyfile` 後重啟 proxy
- 想調整站內路徑、API 轉發規則 → 改 `client/nginx.conf` 後重新 `docker compose up -d --build`

## 要部署哪些程式碼？

**整個專案資料夾**（`myshop`）就是部署包，其中 `proxy/` 子目錄就是共用反向代理。不需要另外打包前端或後端：

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
   > 想縮小體積**不要直接刪原本資料夾裡的檔案**——尤其 `server\data` 是開發機的測試資料庫（git 沒備份），刪了救不回來。
   > 正確做法：先複製一份 `myshop` 成臨時副本，在**副本裡**刪掉 `node_modules`、`client\node_modules`、`client\dist`、`server\data` 後再壓縮，原專案保持完整。
   > （不清也沒關係：`.dockerignore` 已排除這些目錄，Docker 建置不受影響，只是 ZIP 較大、傳輸較久）
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

兩個都有版本號 → 跳過安裝，直接去步驟 2-2。

### 步驟 2-2：（只有沒裝才做）安裝 Docker

```bash
# 一鍵安裝官方 Docker（含 compose plugin）
curl -fsSL https://get.docker.com | sh

# 讓目前使用者免 sudo 操作 docker（要重新登入才生效）
sudo usermod -aG docker $USER
```

執行完**登出再登入**，回到步驟 2-1 驗證。

---

## 第三部分：一次性準備（共用網路 + DNS）

### 步驟 3-1：建立跨專案共用網路

```bash
docker network create proxy-net
docker network ls | grep proxy-net   # 有印出來就成功（只需建立一次，重開機也還在）
```

這是一條「容器之間的內部通道」：Caddy 和以後每個網站的容器都掛在上面，才能互相找到對方。

### 步驟 3-2：確認 DNS 已生效

先在 **Windows 開發機**上確認域名已指向這台伺服器：

```powershell
ping shop.example.com   # 解析出的 IP 應該就是這台伺服器的對外位址
```

> 家用寬頻場景：域名應指向你家對外 IP，且路由器要把 80、443 轉發到 `192.168.1.7`。
> 解析不出來或指向錯誤 → 先去域名商的 DNS 管理改正，等生效再繼續。

### 步驟 3-3：解壓縮程式碼

```bash
cd /home/yourname
unzip myshop.zip        # 若無 unzip：sudo apt update && sudo apt install -y unzip
cd myshop
ls
```

應該看到：`client/`、`server/`、`proxy/`、`docker-compose.yml`、`.env.example`、`docs/` …

> 若走方式 C（git clone），clone 完 `cd myshop` 即可。

---

## 第四部分：設定並啟動共用反向代理（全機一次就好）

### 步驟 4-1：建立 proxy 的 .env

```bash
cd proxy
cp .env.example .env
nano .env
```

把 `DOMAIN=` 後面改成你的正式域名：

```
DOMAIN=shop.example.com
```

存檔：`Ctrl+O` → `Enter` → `Ctrl+X`。

### 步驟 4-2：啟動 Caddy

```bash
docker compose up -d
docker compose ps       # caddy 應為 Up，且看得到 0.0.0.0:80->80、0.0.0.0:443->443
```

### 步驟 4-3：確認憑證申請成功

```bash
docker compose logs caddy
```

看到 `certificate obtained successfully`（或類似 successfully obtained 字樣）即代表
Let's Encrypt 憑證已簽下來，之後到期前會**自動續約**，不用管。

> 若出現 obtain certificate 失敗／timeout：九成是 DNS 未生效或外部連不到 80 port，
> 回步驟 3-2 檢查，改好後 `docker compose restart` 再看 log。

回到專案根目錄：

```bash
cd ..
```

---

## 第五部分：設定本專案環境變數（必做）

### 步驟 5-1：建立 .env

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

## 第六部分：建置並啟動本專案

### 步驟 6-1：一行指令建置 + 啟動

確定在 `myshop` 目錄下：

```bash
docker compose up -d --build
```

第一次執行會花幾分鐘（下載 base image、容器內 `npm ci`、建置前端）。它做的事：

1. 依 `server/Dockerfile` 建 server 映像（Node 22 + npm ci）
2. 依 `client/Dockerfile` 建映像（Node 建置 → nginx 打包靜態檔）
3. 建立 `server-data` volume（放資料庫和圖片）
4. 背景啟動兩個容器；client 同時掛上 `proxy-net` 網路，別名 `myshop-web`

### 步驟 6-2：確認容器狀態

```bash
docker compose ps
```

成功的樣子（兩個都是 `Up`；注意 client **沒有**對外埠映射，這是正常的——對外統一走 Caddy）：

```
NAME              IMAGE           STATUS         PORTS
myshop-client-1   nginx:1.27...   Up 10 seconds
myshop-server-1   myshop-server   Up 10 seconds
```

若某個是 `Exited` 或一直重啟，看日誌找原因：

```bash
docker compose logs server   # 看後端日誌
docker compose logs client   # 看前端(nginx)日誌
```

---

## 第七部分：測試是否成功

### 測試 1：API 通不通（在伺服器上）

```bash
curl https://shop.example.com/api/categories
```

這次**不用加 `-k`**——憑證是 Let's Encrypt 正式憑證，瀏覽器和 curl 都直接信任。
成功會回傳 JSON 分類陣列（空資料時是 `[]`）。
失敗的話：先看 Caddy 有沒有跑起來（第四部分），再看 `docker compose logs server`。

### 測試 2：瀏覽器開前台

在任何電腦的瀏覽器輸入：

```
https://shop.example.com
```

**網址列應該直接是鎖頭（安全連線），沒有任何警告**——因為用的是正式憑證，
不再是以前的自簽憑證。若瀏覽器顯示憑證錯誤，代表 Caddy 簽憑證失敗，回步驟 4-3 排查。

之後應看到商品列表頁。全新資料庫是空的，屬正常（下一步灌測試資料或自己新增商品）。

### 測試 3：後台登入

```
https://shop.example.com/admin
```

輸入剛剛 `.env` 設定的密碼 → 應能進入商品管理，看到「進站統計」面板。

### 測試 4：新增一筆商品 + 上傳圖片

後台點「＋ 新增商品」→ 填名稱價格 → 用「上傳圖片」傳一張小於 **5MB** 的圖 → 儲存。
回前台重新整理，能看到新商品即全鏈路（Caddy → nginx → API → SQLite → 圖片服務）都正常。

### 測試 5：（全新環境才做）灌入示範資料

```bash
docker compose exec server npm run seed
```

會寫入 5 分類 × 8 商品 = 40 筆。
> 注意：seed 會**清空現有資料**再重寫，正式營運後不要再執行。

---

## 第八部分：日常維護

```bash
# ── 本專案（在 myshop 目錄）──
docker compose up -d --build        # 改了程式碼要更新
docker compose logs -f server       # 看即時日誌（Ctrl+C 離開）
docker compose restart              # 重啟兩個容器
docker compose down                 # 停止/移除容器（資料在 volume，不會丟）

# ── 共用反向代理（在 proxy 目錄）──
cd proxy
nano Caddyfile                      # 改域名分流設定（例如新增網站）
docker compose restart              # 讓新設定生效
docker compose logs caddy           # 看 Caddy／憑證日誌
cd ..
```

> 更新版流程（方式 C git）：`git pull` → `docker compose up -d --build`。
> 方式 A/B：重新壓縮上傳覆蓋後，同樣執行 `up -d --build`。

### 備份資料庫 + 圖片（定期做）

```bash
docker run --rm -v myshop_server-data:/data -v $(pwd):/backup \
  alpine tar czf /backup/shop-backup-$(date +%F).tar.gz -C /data .
```

### 日後新增第二個網站（三步驟，互不影響）

1. 到新專案目錄，把它 compose 裡對外那個容器的 `ports:` 主機埠映射**全部拿掉**
   （不能碰 80/443），改成掛外部網路並取唯一別名：

   ```yaml
   services:
     web:                    # 該專案對外的服務名稱
       # ...（原本的 build、restart 等設定不變，但刪掉 ports:）
       networks:
         default: {}
         proxy-net:
           aliases:
             - blog-web      # 每個網站的別名必須全機唯一

   networks:
     proxy-net:
       external: true        # 檔案最底層也要加這段宣告
   ```

2. 在 `proxy/Caddyfile` 加一段（檔案裡已有現成註解範本可抄）：

   ```
   blog.example.com {
       reverse_proxy blog-web:80
   }
   ```

3. `cd proxy && docker compose restart`

新舊網站各自獨立運作，誰更新、重啟都不影響對方。

---

## 常見問題排查

| 症狀 | 原因與處理 |
|---|---|
| 要在 Debian 主機上裝 nginx 或 Caddy 嗎？ | 都不用。nginx 打包在 client 容器、Caddy 打包在 proxy 容器 |
| 啟動時出現「請先複製 .env.example 為 .env…」 | 本專案＝沒設 `ADMIN_PASSWORD`（第五部分）；proxy＝沒設 `DOMAIN`（第四部分） |
| 瀏覽器打不開 `https://shop.example.com` | ①`ping shop.example.com` 確認 DNS 指到這台 ②防火牆開 80 與 443：`sudo ufw allow 80,443/tcp`（有啟用 ufw 才需要）③`cd proxy && docker compose ps` 確認 Caddy 在跑 |
| Caddy log 出現憑證簽發失敗（obtain certificate / timeout） | Let's Encrypt 要從**外部**連到這台的 80 port 驗證域名。①DNS 尚未生效→等一下再 `docker compose restart` ②家用寬頻→確認路由器有把 80/443 轉發進來 ③ISP 封鎖 80→考慮改用支援 DNS 驗證的進階設定 |
| 開網站出現 502 Bad Gateway | Caddy 活著但找不到本站容器：①`docker compose ps` 確認 client 是 Up ②確認 `docker network ls` 有 proxy-net 且本專案有掛上（第六部分重跑 `up -d --build`） |
| `up` 時報「Bind for 0.0.0.0:80 failed: port is already allocated」 | 80/443 只有 **proxy 的 Caddy** 能綁。①本專案絕不能再寫 `ports: 80/443` 映射 ②若是舊版容器還占著：到舊專案目錄 `docker compose down` ③若是系統帶的 apache2/nginx：`sudo systemctl stop apache2 nginx && sudo systemctl disable apache2 nginx`。查占位：`sudo ss -tlnp \| grep -E ':80 \|:443 '` |
| 想換域名 | 改 `proxy/.env` 的 `DOMAIN` → `cd proxy && docker compose up -d`。Caddy 會自動簽新憑證，本專案完全不用動 |
| 上傳圖片失敗 | 單檔上限 5MB（nginx 層 6MB）；超過會被擋 |
| 建置時 better-sqlite3 編譯錯誤 | 正常 x86 Debian 不會發生（用預編譯 binary）；特殊架構需在 `server/Dockerfile` 加裝 `python3 make g++` |
| 重啟後後台要重新登入 | 正常現象；設 `AUTH_SECRET` 可解決 |

## 上線前提醒

- HTTPS 由 Caddy 用正式域名憑證（Let's Encrypt）處理，**自動申請、自動續約**，瀏覽器無警告；憑證狀態可在 `cd proxy && docker compose logs caddy` 查看
- 安全邊界：全機只有 Caddy 對外開 80/443；本專案的 client/server 容器都不綁主機埠，從外部摸不到，只能透過域名進來
- 定期做第八部分的備份；volume 名稱以 `docker volume ls` 查到的為準（通常是 `myshop_server-data`；Caddy 憑證存在 `proxy_caddy-data`，遺失也會自動重簽，不必備份）

更精簡的速查版見 `docs/deploy-vps-docker.md`，架構細節見 `docs/architecture-flow.md`。
