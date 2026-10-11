# Ubuntu VPS + Docker 網站備份與還原教學（小白入門保姆級指南）

本手冊專門為初學者量身打造，針對依照 [Ubuntu VPS 佈署教學](deploy-ubuntu-tutorial.md) 建立的電商網站，以最白話、零門檻的方式，逐步教你如何**備份網站**以及在突發狀況下**秒級還原網站**。

---

## 📋 伺服器與專案環境資訊

- **主機作業系統**：Ubuntu-web
- **主機公網 IP**：`129.146.21.37`
- **環境版本**：Docker 29.7.2 / Docker Compose v5.5.0
- **網站域名**：`iam369.dpdns.org`
- **專案路徑**：`/root/myshop`
- **反向代理路徑**：`/root/myshop/proxy`
- **資料持久化卷 (Volume)**：`myshop_server-data`
- **核心資料庫**：SQLite (`shop.db`)
- **商品圖片資料夾**：`/app/data/uploads` 與 `/app/data/uploads-deleted`

---

## 💡 備份前必讀：什麼需要備份？什麼不需要？

很多新手以為備份網站就是「整台主機打包」，這樣不僅檔案極為肥大，還很容易出錯。在 Docker 與 Git 架構下，其實非常簡單：

```
┌────────────────────────────────────────────────────────┐
│  ❌ 不需要備份（因為 Git 和 Docker 會隨時重新生出來）    │
├────────────────────────────────────────────────────────┤
│  • 前端程式碼 (client/) & 編譯產物 (dist/)             │
│  • 後端程式碼 (server/src/)                            │
│  • 巨大相依套件 (node_modules/)                        │
│  • Docker 映像檔 (隨時可重新 build 下載)               │
└────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────┐
│  🔴 必須備份（【網站三寶】一旦遺失就再也找不回來！）   │
├────────────────────────────────────────────────────────┤
│  1. SQLite 資料庫檔案：shop.db（所有商品、分類、訂單） │
│  2. 商品實體圖片：uploads/ 與 uploads-deleted/         │
│  3. 系統密碼與金鑰：.env（網站登入密碼、Token 密鑰）   │
└────────────────────────────────────────────────────────┘
```

> 🎯 **一句話口訣**：**「程式碼交給 Git，我們只要備份資料庫、圖片和 .env！」**

---

## 📦 第一部分：網站備份操作指南

備份有兩種方式，推薦初學者使用 **【方式 A（小白首選：3秒冷備份）】**，保證 100% 不會損壞資料庫！

---

### 【方式 A：小白零失敗首選（3秒冷備份）】★ 最推薦

SQLite 資料庫在寫入時會使用 WAL（預寫式日誌）機制。如果直接在營業中強行複製檔案，極小機率會遇到資料寫入一半的不完整狀態。
最穩妥又簡單的作法：**暫停後端容器 3 秒鐘 ➔ 打包資料 ➔ 重新啟動**。

#### 步驟 1：登入 VPS 伺服器並進入專案目錄
在個人電腦開啟終端機（PowerShell 或 Terminal）：
```bash
ssh root@129.146.21.37
cd /root/myshop
```

#### 步驟 2：建立備份集中資料夾
```bash
mkdir -p /root/backups
```

#### 步驟 3：執行一鍵安全備份指令
請整段複製並貼上執行：
```bash
# 1. 暫停後端寫入（前端畫面仍能顯示快取或短暫重試，前後僅需 3 秒）
docker compose stop server

# 2. 安全打包資料卷（包含 SQLite 資料庫與所有商品圖片）
docker run --rm \
  -v myshop_server-data:/data:ro \
  -v /root/backups:/backup \
  alpine tar -czf /backup/myshop_data_$(date +%Y%m%d_%H%M%S).tar.gz -C /data .

# 3. 同步備份環境變數設定檔（密碼與金鑰）
cp /root/myshop/.env /root/backups/myshop_env_$(date +%Y%m%d_%H%M%S).bak

# 4. 立即恢復後端服務運行
docker compose start server
```

> 🎉 **大功告成！** 終端機看到 `Started server`，網站即恢復運作。你可以輸入 `ls -lh /root/backups` 查看剛剛產生的備份檔案！

---

### 【方式 B：零停機熱備份（不中斷對外營業）】

如果你是在高流量時段，希望一秒鐘都不暫停後端服務：

#### 步驟 1：在 VPS 上執行熱備份容器
```bash
cd /root/myshop
mkdir -p /root/backups

docker run --rm \
  -v myshop_server-data:/data:ro \
  -v /root/backups:/backup \
  alpine/sh -c '
    apk add --no-cache sqlite >/dev/null 2>&1 && \
    sqlite3 /data/shop.db ".backup /backup/temp_shop.db" && \
    tar -czf /backup/myshop_hot_$(date +%Y%m%d_%H%M%S).tar.gz \
      -C /backup temp_shop.db \
      -C /data uploads uploads-deleted && \
    rm -f /backup/temp_shop.db
  '

# 備份環境變數
cp /root/myshop/.env /root/backups/myshop_env_$(date +%Y%m%d_%H%M%S).bak
```
> 💡 *說明：這段指令會透過 SQLite 官方 `.backup` API 將記憶體與 WAL 日誌中的交易安全鎖定匯出，確保資料庫一致性。*

---

## 💾 第二部分：將備份檔下載回「本機電腦」（異地備援）

> ⚠️ **新手極度容易忽略的致命陷阱**：
> 「如果你的備份檔只放在同一台 VPS 上，萬一伺服器主機硬碟故障、雲端廠商故障或帳號異常，備份會連同主機一起消失！」
> **真正的備份，一定要存一份在自己的電腦或隨身碟裡！**

打開你**自己本機電腦的終端機**（Windows 上的 PowerShell / Git Bash，或 Mac 的 Terminal）：

### 1. 建立本機電腦存放備份的資料夾
- **Windows (PowerShell)**:
  ```powershell
  mkdir D:\myshop_backups -Force
  cd D:\myshop_backups
  ```
- **Mac / Linux**:
  ```bash
  mkdir -p ~/myshop_backups
  cd ~/myshop_backups
  ```

### 2. 用 `scp` 指令把伺服器備份檔載回電腦
```bash
# 下載 /root/backups 下所有的備份檔到當前目錄
scp root@129.146.21.37:/root/backups/myshop_data_*.tar.gz .
scp root@129.146.21.37:/root/backups/myshop_env_*.bak .
```
看見進度條跑到 `100%`，代表備份檔案已經安全躺在你的實體電腦硬碟了！

---

## ⏰ 第三部分：設定 Linux 自動定時備份（免人工看守）

讓伺服器每天凌晨半夜 `03:00` 自動備份一次，並自動刪除 30 天以前的舊檔案，避免塞爆硬碟：

### 1. 開啟定時任務排程器
在 VPS 終端機執行：
```bash
crontab -e
```
*(如果第一次執行詢問選擇編輯器，請輸入數字選擇 `nano`)*

### 2. 在檔案最底下新增以下一行排程指令
```cron
0 3 * * * mkdir -p /root/backups && cd /root/myshop && docker compose stop server && docker run --rm -v myshop_server-data:/data:ro -v /root/backups:/backup alpine tar -czf /backup/myshop_auto_$(date +\%Y\%m\%d).tar.gz -C /data . && cp /root/myshop/.env /root/backups/myshop_env_$(date +\%Y\%m\%d).bak && docker compose start server && find /root/backups -name "myshop_*" -mtime +30 -delete
```

### 3. 儲存離開
- 按鍵盤 `Ctrl + O` ➔ 按 `Enter` 儲存 ➔ 按 `Ctrl + X` 離開。
- 終端機顯示 `crontab: installing new crontab` 代表設定成功！

---

## 🔄 第四部分：網站還原操作指南（手把手救援實戰）

當遇到「誤刪商品」、「資料庫損壞」或甚至「整台伺服器重新安裝」時，請依照下列步驟還原。

---

### 【情境一：日常救急！在原伺服器還原舊資料】

如果不小心在後台誤刪了一批商品或刪錯圖片，想恢復到昨天的備份狀態：

#### 步驟 1：連線至伺服器並進入專案目錄
```bash
ssh root@129.146.21.37
cd /root/myshop
```

#### 步驟 2：查看你有哪些備份存檔
```bash
ls -lh /root/backups/
```
挑選你要還原的檔案名稱，例如：`myshop_data_20261011_120000.tar.gz`。

#### 步驟 3：暫停網站服務（避免還原到一半又有新訪客寫入）
```bash
docker compose down
```

#### 步驟 4：清空損壞的舊資料卷並注入備份檔
將指令中的 `myshop_data_20261011_120000.tar.gz` 替換成你的備份檔名：

```bash
# 1. 確保資料卷乾淨，清空現有資料卷內容
docker run --rm -v myshop_server-data:/data alpine sh -c "rm -rf /data/* /data/.* 2>/dev/null || true"

# 2. 將備份檔完整解壓縮回資料卷
docker run --rm \
  -v myshop_server-data:/data \
  -v /root/backups:/backup \
  alpine tar -xzf /backup/myshop_data_20261011_120000.tar.gz -C /data

# 3. （可選）若 .env 也有變更，可同時還原 .env
# cp /root/backups/myshop_env_20261011_120000.bak /root/myshop/.env
```

#### 步驟 5：重新啟動電商網站
```bash
docker compose up -d
```

#### 步驟 6：檢查運行狀態
```bash
docker compose ps
```
確認 `myshop-server-1` 與 `myshop-client-1` 都顯示 `Up` (healthy)，還原完成！

---

### 【情境二：全站重練！全新主機災難重建】

如果原本的主機完全損壞，你新買了一台全新 Ubuntu 主機（例如主機重灌）：

#### 步驟 1：在全新主機依照 [部署教學](deploy-ubuntu-tutorial.md) 準備好環境
1. 安裝 Docker 與 Docker Compose。
2. 建立 Docker 跨容器共用網路：
   ```bash
   docker network create proxy-net
   ```
3. 下載專案程式碼：
   ```bash
   git clone <你的Git倉庫網址> /root/myshop
   ```

#### 步驟 2：將你保存在電腦裡的備份檔上傳到新伺服器
在**你自己的個人電腦終端機**執行：
```bash
scp myshop_data_20261011_120000.tar.gz root@<新伺服器IP>:/root/
scp myshop_env_20261011_120000.bak root@<新伺服器IP>:/root/
```

#### 步驟 3：登入新主機還原 `.env` 與資料
回到新伺服器執行：
```bash
ssh root@<新伺服器IP>

# 1. 還原 .env 系統設定檔
cp /root/myshop_env_20261011_120000.bak /root/myshop/.env

# 2. 自動建立 Volume 並把備份注入
mkdir -p /root/backups
mv /root/myshop_data_20261011_120000.tar.gz /root/backups/

docker run --rm \
  -v myshop_server-data:/data \
  -v /root/backups:/backup \
  alpine tar -xzf /backup/myshop_data_20261011_120000.tar.gz -C /data
```

#### 步驟 4：啟動 Caddy 反向代理與電商網站
```bash
# 啟動 Caddy
cd /root/myshop/proxy
cp .env.example .env
nano .env  # 確認填寫 DOMAIN=iam369.dpdns.org
docker compose up -d

# 啟動網站主程式
cd /root/myshop
docker compose up -d --build
```
整座網站、所有商品與圖片、登入密碼便完整復活上線！

---

## ✅ 第五部分：還原後的自我驗收測試

還原後千萬不要只看指令跑完，請務必按照以下步驟檢查：

### 1. 命令行快速測試（檢查 API 是否能吐出資料）
在 VPS 伺服器終端機執行：
```bash
# 測試是否能取得商品分類
curl -s http://127.0.0.1:3001/api/categories | grep -q "id" && echo "✅ 分類 API 正常" || echo "❌ 分類 API 異常"

# 測試公開網址是否已順利回應
curl -I https://iam369.dpdns.org/api/products
```
看見 `HTTP/2 200` 代表後端與資料庫已無縫對接。

### 2. 瀏覽器畫面手動檢查
1. 打開 `https://iam369.dpdns.org/`：
   - 瀏覽商品列表，確認**商品名稱與價格**是否為備份時的資料。
   - 確認**商品圖片是否正常顯示**（無破損圖示）。
2. 打開 `https://iam369.dpdns.org/admin`：
   - 輸入原先的 `ADMIN_PASSWORD` 登入。
   - 檢查「進站統計人數」與「分類管理」是否完整存在。

---

## ❓ 常見故障排除與新手防坑 FAQ

### Q1：還原後開啟網頁，文字都有，但所有商品圖片都變成叉叉或破圖？
- **原因**：解壓縮時路徑層級錯誤，導致圖片沒有直接落在 `/app/data/uploads`。
- **排查方法**：
  進入資料卷檢查目錄結構：
  ```bash
  docker run --rm -v myshop_server-data:/data alpine ls -la /data
  ```
  正常情況下應該要看到：
  - `shop.db`
  - `uploads/`
  - `uploads-deleted/`
- **修正方式**：如果發現檔案被包在例如 `/data/data/uploads`，代表打包時多了一層目錄，請重新解壓時注意使用 `-C /data` 參數。

### Q2：還原後訪問網站出現 `502 Bad Gateway`？
- **原因**：Caddy 反向代理找不到容器，通常是因為 `proxy-net` 網路未正確連通。
- **解法**：
  1. 檢查主網站是否啟動：`docker compose ps`。
  2. 檢查網路是否加入：`docker network inspect proxy-net`，確認裡面有 `myshop-client-1` (myshop-web)。
  3. 若無，執行 `docker compose up -d` 重新連入網路。

### Q3：資料庫顯示 `database is locked` 或 `malformed`？
- **原因**：過去直接複製正在寫入中的 SQLite 檔案所致。
- **解法**：依照本教學的【方式 A】，在備份前執行 `docker compose stop server`，或使用還原清單中較早時間點乾淨的備份檔還原。

### Q4：伺服器硬碟容量被備份檔塞滿了怎麼辦？
- **查詢剩餘空間**：
  ```bash
  df -h
  ```
- **手動清理超過 14 天的歷史備份**：
  ```bash
  find /root/backups -name "myshop_*" -mtime +14 -delete
  ```
