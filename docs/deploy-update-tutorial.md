# Ubuntu VPS + Docker 版本更新教學（小白入門保姆級指南）

本手冊專門為初學者打造，詳細說明當你在本地（電腦）修改了前後端程式碼或修復 Bug 後，如何一步一步、安全無痛地將 VPS 雲端主機上的舊版本升級為新版本，且**保證資料庫與上傳圖片 100% 不丟失**。

---

## 📋 伺服器與專案環境資訊

- **主機作業系統**：Ubuntu-web
- **主機公網 IP**：`129.146.21.37`
- **環境版本**：Docker 29.7.2 / Docker Compose v5.5.0
- **網站域名**：`iam369.dpdns.org`
- **DNS 託管商**：Cloudflare
- **專案路徑**：`/root/myshop`

---

## 💡 更新前必讀：為什麼更新不會丟失資料？

在 Docker 架構中，**程式碼**與**商業資料**是完全分開存放的：

```
[ 新版程式碼 (前端 Nginx / 後端 Express) ] ──更新覆蓋──> 容器重新編譯 (無狀態)
                                                               │
                                                               ▼ 讀寫掛載
[ Docker 資料卷: myshop_server-data ] ───安全保留───> [ 資料庫 shop.db + 上傳圖片 ]
```

- **程式碼更新**：只會重新打包與替換前端靜態網頁（`myshop-client`）與後端 API 程式碼（`myshop-server`）。
- **資料庫與圖片**：儲存在獨立的 Docker Volume（`myshop_server-data`），無論容器如何重新編譯、重啟或刪除，裡面的商品、分類、圖片都**完好如初**。

---

## 🛡️ 步驟零：更新前安全防護（強烈建議！一鍵備份）

在進行任何更新操作前，先做好備份是最好的工程習慣。

### 1. SSH 連線進入伺服器
打開你電腦的終端機（PowerShell 或 Terminal）：
```bash
ssh root@129.146.21.37
```

### 2. 進入專案目錄並執行一鍵備份
```bash
cd /root/myshop

# 將目前的資料庫與圖片打包壓縮至當前目錄
docker run --rm -v myshop_server-data:/data -v $(pwd):/backup \
  alpine tar czf /backup/shop-backup-$(date +%Y%m%d_%H%M%S).tar.gz -C /data .
```
> 💡 執行後會在 `/root/myshop` 下生成一個帶有當前時間戳記的壓縮檔（例如 `shop-backup-20260830_153000.tar.gz`），備份完成！

---

## 🚀 步驟一：將最新程式碼同步至 VPS

根據你平常管理程式碼的方式，選擇 **【方式 A（推薦 Git）】** 或 **【方式 B（本地打包上傳）】**。

---

### 【方式 A：使用 Git 更新（最推薦、最快速）】

如果你有將程式碼託管在 GitHub / Gitee / GitLab：

#### 1. 本地電腦：確認修改已推送（Push）
在你的本機電腦終端機確認已將改動推送到遠端倉庫：
```bash
git add .
git commit -m "更新前後端功能"
git push origin master  # 或 main
```

#### 2. VPS 伺服器：拉取最新程式碼（Pull）
在 VPS 的 `/root/myshop` 目錄下執行：
```bash
cd /root/myshop
git pull
```
看到類似 `Updating ... Fast-forward` 即代表最新程式碼已下載完成。

---

### 【方式 B：本地打包上傳覆蓋（無 Git 適用）】

如果你沒有使用 Git，可以直接從本機打包並上傳：

#### 1. 本地電腦：打包程式碼（排除 node_modules 等大檔案）
在你的本機專案根目錄（`myshop`）打開 PowerShell 或 Git Bash 執行：

```bash
tar --exclude="node_modules" --exclude=".git" --exclude="dist" -czvf myshop-update.tar.gz .
```

#### 2. 本地電腦：上傳至 VPS 伺服器
```bash
scp myshop-update.tar.gz root@129.146.21.37:/root/
```

#### 3. VPS 伺服器：解壓縮覆蓋
在 VPS 伺服器上執行：
```bash
cd /root/myshop
tar -xzvf /root/myshop-update.tar.gz -C /root/myshop/
```

---

## ⚙️ 步驟二：重新編譯並熱更新容器

程式碼同步完成後，只需要一條指令即可讓 Docker 重新編譯前端與後端並上線：

```bash
cd /root/myshop
docker compose up -d --build
```

### 🔍 指令細節說明：
- `--build`：告訴 Docker「程式碼有改動，請重新編譯前端 React 靜態檔與後端 Node.js 映像檔」。
- `-d`：背景執行（Detached mode），編譯與重啟完成後會回到命令提示字元。
- **無縫切換**：Docker 會先編譯好新容器，在啟動瞬間平滑替換掉舊容器，服務中斷時間僅需數秒。

---

## 📋 步驟三：確認容器運行狀態

更新完成後，檢查容器是否正常運作：

```bash
docker compose ps
```

### 👀 預期輸出結果：
確認狀態（STATUS）皆為 `Up`：
```text
NAME                IMAGE               COMMAND                  SERVICE   CREATED         STATUS         PORTS
myshop-client-1     myshop-client       "/docker-entrypoint.…"   client    10 seconds ago  Up 9 seconds   80/tcp
myshop-server-1     myshop-server       "docker-entrypoint.s…"   server    10 seconds ago  Up 9 seconds   3001/tcp
```

---

## ✅ 步驟四：線上驗證新版本

### 1. 命令行快速測試 API
在 VPS 或本機測試後端 API 是否正常回應：
```bash
curl -i https://iam369.dpdns.org/api/categories
```
若回傳 `HTTP/2 200` 且能看到分類 JSON 資料，代表後端正常！

### 2. 瀏覽器畫面檢查（重要：強制清除快取）
開啟瀏覽器訪問：
- 🛍️ **前台首頁**：`https://iam369.dpdns.org/`
- ⚙️ **後台管理**：`https://iam369.dpdns.org/admin`

> ⚠️ **新手常犯錯誤：瀏覽器快取**
> 前端更新後，瀏覽器可能會暫存舊版的 `.js` 或 `.css` 檔案。
> - **Windows** 請按：`Ctrl + F5` 或 `Ctrl + Shift + R`（強制重新載入）
> - **Mac** 請按：`Cmd + Shift + R`
> - 或使用**無痕視窗（Incognito Window）**開啟網頁確認最新畫面。

---

## 📑 版本更新極速指令卡（日常更新抄這段即可）

如果你已經熟練，日常更新只需要連上 VPS 貼上以下三行：

```bash
# 1. 進入目錄
cd /root/myshop

# 2. 拉取最新代碼
git pull

# 3. 重新編譯並重啟
docker compose up -d --build
```

---

## ❓ 常見問題排查 (FAQ)

### Q1：執行 `git pull` 時提示 `error: Your local changes to the following files would be overwritten by merge`？
- **原因**：VPS 上的某些檔案被手動修改過，與 Git 倉庫產生衝突。
- **解法**：放棄 VPS 本地的非預期改動，強制對齊遠端倉庫：
  ```bash
  git reset --hard origin/master
  git pull
  docker compose up -d --build
  ```

### Q2：更新後打開網頁還是舊介面？
- **原因 1**：瀏覽器快取了舊版前端檔案。
  - **解法**：在瀏覽器按下 `Ctrl + F5`（或 `Cmd + Shift + R`）強制刷新，或用無痕視窗開啟。
- **原因 2**：執行指令時漏掉了 `--build` 參數。
  - **解法**：重新執行 `docker compose up -d --build`，確保 Docker 有重新編譯前端。

### Q3：更新後網頁出現 `502 Bad Gateway` 或無法載入？
- **檢查步驟**：
  1. 查看後端即時日誌：
     ```bash
     docker compose logs -f server
     ```
     檢查是否有 TypeScript 報錯或語法錯誤導致伺服器崩潰。
  2. 查看前端 Nginx 日誌：
     ```bash
     docker compose logs -f client
     ```
  3. 檢查 `proxy-net` 網路是否正常：
     ```bash
     docker network inspect proxy-net
     ```

### Q4：若更新後發生重大 Bug，如何緊急還原（回滾 Rollback）？

#### 情況 A：程式碼有 Bug，想退回上一個 Git 版本
```bash
cd /root/myshop
# 退回前一個 commit
git reset --hard HEAD~1
# 重新編譯舊版
docker compose up -d --build
```

#### 情況 B：資料庫意外損壞，想還原步驟零的備份
```bash
cd /root/myshop
# 暫停服務
docker compose down

# 將備份檔案解壓還原至 server-data 資料卷
docker run --rm -v myshop_server-data:/data -v $(pwd):/backup \
  alpine sh -c "rm -rf /data/* && tar xzf /backup/你的備份檔名.tar.gz -C /data"

# 重新啟動
docker compose up -d
```
