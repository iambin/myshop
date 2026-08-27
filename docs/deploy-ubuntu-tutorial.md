# Ubuntu VPS + Docker 完整佈署教學（小白入門保姆級指南）

本手冊專門為初學者量身打造，以最清晰、零門檻的方式，逐步引導你將「常吉園藝電商系統」佈署至雲端主機。

---

## 📋 佈署環境資訊

- **主機作業系統**：Ubuntu-web
- **主機公網 IP**：`129.146.21.37`
- **環境版本**：Docker 29.7.2 / Docker Compose v5.5.0
- **目標域名**：`iam369.dpdns.org`
- **DNS 託管商**：Cloudflare

---

## 💡 架構概念（一句話搞懂）

```
訪客瀏覽器 ──(HTTPS:443 / HTTP:80)──> [ VPS: 129.146.21.37 ]
                                            │
                                            ▼
                               [ Caddy 反向代理容器 (proxy/) ]
                                 （自動申請/維護 SSL 憑證）
                                            │ (內部網路 proxy-net)
                                            ▼
                               [ Nginx 前端容器 (client/) ]
                                 （提供網頁畫面，將 /api 轉發）
                                            │ (內部網路 default)
                                            ▼
                               [ Express 後端容器 (server/) ]
                                 （連接 SQLite 資料庫與存儲圖片）
```

- **安全隔離**：只有 Caddy 容器對外監聽 `80` 和 `443` 埠，後端與前端容器完全不對外暴露埠，安全性高。
- **資料持久化**：資料庫 `shop.db` 與上傳的商品圖片存放在 Docker 專用資料卷（`server-data`），即使重新啟動或更新程式碼，資料都不會消失。

---

## 🚀 步驟一：Cloudflare DNS 設定

請先登入 [Cloudflare 控制台](https://dash.cloudflare.com/) 進行解析設定：

1. 點擊你的託管域名。
2. 進入左側選單 **DNS** -> **Records (記錄)**。
3. 點擊 **Add record (新增記錄)**：
   - **Type (類型)**：`A`
   - **Name (名稱)**：`iam369`（如果根域名是 `dpdns.org`，輸入子域名前綴 `iam369`）
   - **IPv4 address (IP 位址)**：`129.146.21.37`
   - **Proxy status (代理狀態)**：**重要！請切換為「DNS only（僅限 DNS / 灰色雲朵）」**
     *(說明：Caddy 在首次啟動時需要直接驗證 Let's Encrypt 憑證，灰色雲朵最不易出錯)*
   - **TTL**：`Auto`
4. 點擊 **Save (儲存)**。

> 💡 **小撇步**：開啟本機終端機輸入 `ping iam369.dpdns.org`，確認回傳 IP 為 `129.146.21.37` 即代表 DNS 解析生效。

---

## 📦 步驟二：打包並上傳程式碼到 VPS

你可以選擇以下 **【方式 A（推薦 Git）】** 或 **【方式 B（直接打包壓縮檔）】**。

### 【方式 A：使用 Git（最推薦）】

如果你有將程式碼推送到 GitHub / Gitee：

1. 連線到 VPS：
   ```bash
   ssh root@129.146.21.37
   ```
2. 在 VPS 上直接下載專案：
   ```bash
   git clone <你的專案Git網址> myshop
   cd myshop
   ```

---

### 【方式 B：本地打包上傳（無 Git 適用）】

在你的本機電腦（Windows / Mac）執行：

#### 1. 打包程式碼（排除巨大相依檔 node_modules）
在專案根目錄（`myshop`）打開終端機或 PowerShell：

```bash
# Windows PowerShell 或 Git Bash 執行：
tar --exclude="node_modules" --exclude=".git" --exclude="dist" -czvf myshop.tar.gz .
```

#### 2. 上傳壓縮檔至伺服器
```bash
scp myshop.tar.gz root@129.146.21.37:/root/
```

#### 3. 登入伺服器解壓縮
```bash
ssh root@129.146.21.37

# 建立並進入目錄
mkdir -p /root/myshop
tar -xzvf /root/myshop.tar.gz -C /root/myshop
cd /root/myshop
```

---

## 🛠️ 步驟三：伺服器環境搭建（建立共用網路）

在 VPS 終端機中，確認進入 `/root/myshop` 目錄後，執行以下命令：

### 1. 建立 Docker 跨容器共用網路
這條網路是 Caddy 與網站容器通訊的橋樑，**全主機只需要建立一次**：

```bash
docker network create proxy-net
```

*(如果提示 `network with name proxy-net already exists`，代表之前已建過，直接跳過即可)*

### 2. 開放 Ubuntu 防火牆埠口
確保 80 與 443 埠口可以連線：

```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow OpenSSH
sudo ufw enable
```

---

## 🔒 步驟四：啟動 Caddy 反向代理（自動簽發 HTTPS 憑證）

進入 `proxy` 目錄配置反向代理：

```bash
cd /root/myshop/proxy
```

### 1. 建立設定檔
複製範本檔案：
```bash
cp .env.example .env
```

### 2. 修改 `.env` 設定域名
使用 `nano` 編輯器修改：
```bash
nano .env
```
將內容改為你的專屬域名：
```ini
DOMAIN=iam369.dpdns.org
```
> 💡 *nano 操作提示：修改完成後按 `Ctrl + O` 儲存，按 `Enter` 確認檔名，再按 `Ctrl + X` 離開。*

### 3. 啟動 Caddy 容器
```bash
docker compose up -d
```

### 4. 檢查憑證申請狀態
```bash
docker compose logs caddy
```
👀 **成功標誌**：若看到日誌出現 `certificate obtained successfully` 或 `serving initial configuration`，代表 SSL 憑證已成功申請完畢！

---

## 🌐 步驟五：啟動電商網站主程式（前後端容器）

回到專案根目錄，準備啟動網站：

```bash
cd /root/myshop
```

### 1. 設定後台管理員密碼
複製環境變數範本：
```bash
cp .env.example .env
nano .env
```
設定一組安全、屬於你的管理員密碼（請自行替換 `YourStrongPassword123`）：
```ini
ADMIN_PASSWORD=YourStrongPassword123
```
*(設定完按 `Ctrl + O` 儲存，`Enter` 確認，`Ctrl + X` 離開)*

### 2. 建置並啟動所有容器
執行建置並於背景啟動：
```bash
docker compose up -d --build
```
> ⏳ *第一次執行會自動下載 Node/Nginx 映像檔並進行前端編譯，大約需要 1~3 分鐘。*

### 3. 查看容器運行狀態
```bash
docker compose ps
```
確認 `myshop-server-1` 與 `myshop-client-1` 狀態皆為 `Up` (運行中)。

---

## 🌿 步驟六：初始化商品測試資料（可選）

如果你希望一上線就有預設的園藝商品（5 大分類、40 項商品）供展示：

```bash
docker compose exec server npm run seed
```
> ⚠️ **注意**：`npm run seed` 會清空資料庫並重新寫入範例資料，已有正式營業資料時請勿執行！

---

## ✅ 步驟七：驗證與測試是否成功

### 1. 命令行快速驗證
在 VPS 伺服器或本機電腦執行：

```bash
# 測試分類 API（公開端點）
curl -i https://iam369.dpdns.org/api/categories

# 測試商品列表 API
curl -i https://iam369.dpdns.org/api/products
```
若回傳 `HTTP/2 200` 及 JSON 格式資料，代表全線串接正常！

### 2. 瀏覽器畫面驗證
打開瀏覽器訪問：

- 🛍️ **前台商城首頁**：`https://iam369.dpdns.org/`
  - 檢查網址列是否有安全鎖頭 🔒 (HTTPS 正常)
  - 測試點擊商品分類、商品搜尋、進入商品詳情頁
- ⚙️ **後台管理系統**：`https://iam369.dpdns.org/admin`
  - 輸入你在 `.env` 設定的 `ADMIN_PASSWORD`
  - 登入後測試新增/編輯商品、上傳圖片、分類管理與查看進站統計數據

---

## 🔧 步驟八：日常維護與常用指令

### 1. 查看即時運行日誌（除錯用）
```bash
# 查看後端 API 執行日誌
docker compose logs -f server

# 查看前端 Nginx 存取日誌
docker compose logs -f client

# 查看 Caddy 反向代理與 HTTPS 日誌
cd /root/myshop/proxy && docker compose logs -f caddy
```

### 2. 更新程式碼後重新發布
日後若本機修改了程式碼，更新步驟：
```bash
cd /root/myshop

# 若使用 Git：
git pull

# 重新編譯並熱更新容器：
docker compose up -d --build
```

### 3. 一鍵備份資料庫與上傳圖片
資料庫與圖片皆存在 `myshop_server-data` 資料卷中，可使用以下指令一鍵打包備份至當前目錄：

```bash
docker run --rm -v myshop_server-data:/data -v $(pwd):/backup \
  alpine tar czf /backup/shop-backup-$(date +%Y%m%d).tar.gz -C /data .
```
執行後會產生如 `shop-backup-20260827.tar.gz` 的壓縮備份檔。

---

## ❓ 常見問題排查 (FAQ)

### Q1：訪問網站出現 `502 Bad Gateway`？
- **原因**：Caddy 找不到網站的前端容器，通常是 `proxy-net` 網路未正確連通。
- **解法**：
  1. 確認主專案容器是否正常運行：`docker compose ps`
  2. 確認網路是否連接：`docker network inspect proxy-net`，檢查裡面是否有 `myshop-client-1` (別名 `myshop-web`)。

### Q2：瀏覽器提示「無法提供安全連線」或 SSL 憑證錯誤？
- **原因**：Let's Encrypt 憑證尚未簽發成功，可能因 80 埠未通或 Cloudflare 開啟了橘色雲朵代理。
- **解法**：
  1. 檢查 Cloudflare DNS 是否為 **灰色雲朵 (DNS only)**。
  2. 檢查 VPS 防火牆是否放行 80 埠：`sudo ufw status`。
  3. 查看 Caddy 報錯日誌：`cd proxy && docker compose logs caddy`。

### Q3：後台登入一直提示密碼錯誤？
- **原因**：`.env` 中的密碼未正確載入或修改後未重啟容器。
- **解法**：
  1. 確認 `/root/myshop/.env` 裡面的 `ADMIN_PASSWORD` 內容。
  2. 執行 `docker compose up -d` 讓設定重新生效。

### Q4：伺服器已有安裝 Portainer.io，會與 Caddy 反向代理衝突嗎？
- **結論**：**預設不會衝突**。
  - **Portainer** 預設使用 `9443` (HTTPS) 或 `9000` (HTTP) 埠。
  - **Caddy** 獨占 `80` (HTTP) 與 `443` (HTTPS) 埠。
- **如何檢查是否衝突**：
  在 VPS 上執行：
  ```bash
  docker ps --format "table {{.Names}}\t{{.Ports}}"
  ```
  如果看到 `portainer` 佔用了 `0.0.0.0:80` 或 `0.0.0.0:443`，才代表衝突。
- **衝突時的解決方法**：
  停止並將 Portainer 重新綁定回標準埠口（將 80/443 讓出給 Caddy）：
  ```bash
  docker stop portainer && docker rm portainer
  docker run -d \
    -p 8000:8000 \
    -p 9443:9443 \
    --name portainer \
    --restart=always \
    -v /var/run/docker.sock:/var/run/docker.sock \
    -v portainer_data:/data \
    portainer/portainer-ce:latest
  ```
  之後 Portainer 後台改由 `https://129.146.21.37:9443` 連線，Caddy 則可正常綁定 80/443。

