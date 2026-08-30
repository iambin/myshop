# 專案備份策略指南（前後端與資料維護）

本手冊說明本專案（MyShop）在開發與生產環境下的備份策略，清楚區分「無需額外備份的靜態代碼」與「必須定期備份的動態資料與設定」。

---

## 📌 核心結論

**前後端的「程式碼」只要有推送到 Git 遠端倉庫（如 GitHub / GitLab）就不需要另外備份；真正必須定期備份的是「後端的動態資料（SQLite 資料庫、上傳圖片）與環境變數設定檔」。**

---

## 🔍 詳細分類說明

### 1. 不需要額外備份（由 Git 管理）

| 項目 | 路徑 | 說明 |
| :--- | :--- | :--- |
| **前端原始碼** | `client/` | React + TypeScript 靜態程式碼，隨時可由 Git 重新拉取並執行 `npm run build` |
| **後端邏輯程式碼** | `server/src/` | Express + TypeScript 業務邏輯與 API 路由，完全由 Git 版本控制 |
| **依賴套件** | `node_modules` | 由 `package.json` 與 `package-lock.json` 定義，隨時可重新 `npm install` |

---

### 2. 必須定期備份（核心動態資料與設定）

以下資料均未（且不應）納入 Git 版本控制，一旦伺服器硬碟故障或損壞即無法復原：

| 項目 | 路徑 / 位置 | 說明 | 重要程度 |
| :--- | :--- | :--- | :--- |
| **SQLite 資料庫** | `server/data/shop.db`<br>*(Docker: `myshop_server-data` 卷)* | 儲存所有商品資訊、分類、規格、進站流量統計數據 | 🔴 極高（核心資產） |
| **商品圖片資源** | `server/data/uploads/`<br>`server/data/uploads-deleted/` | 管理員上傳的實體商品圖片檔案及刪除封存檔 | 🔴 極高（實體資產） |
| **環境變數與密鑰** | `server/.env`<br>*(含 Docker Compose `.env`)* | 管理員登入密碼（`ADMIN_PASSWORD`）、Token 密鑰等設定 | 🟡 高（系統配置） |

---

## 🛠️ 備份操作實務指引

### 方式 A：Docker 部署環境（推薦）

若專案以 Docker 容器方式運行在 VPS，資料統一存放在 Docker Volume `myshop_server-data`：

```bash
# 1. 建立備份目錄
mkdir -p /root/backups

# 2. 安全打包 Docker 資料卷與環境變數檔
docker run --rm \
  -v myshop_server-data:/data:ro \
  -v /root/backups:/backup \
  alpine tar -czvf /backup/myshop_data_$(date +%Y%m%d_%H%M%S).tar.gz -C /data .

# 3. 備份 .env 設定檔
cp /root/myshop/.env /root/backups/env_$(date +%Y%m%d_%H%M%S).bak
```

---

### 方式 B：傳統 Node.js / 本地環境

若直接在主機運行 Node.js 服務：

```bash
# 1. 建立備份目錄
mkdir -p ~/backups

# 2. 透過 SQLite 專用備份指令鎖定並產出乾淨副本（避免寫入中的髒讀）
sqlite3 server/data/shop.db ".backup 'server/data/shop_backup.db'"

# 3. 打包資料庫與圖片目錄
tar -czvf ~/backups/myshop_backup_$(date +%Y%m%d).tar.gz \
  server/data/shop_backup.db \
  server/data/uploads \
  server/.env

# 4. 清理臨時副本
rm server/data/shop_backup.db
```

---

## ⏰ 定期自動備份建議（Cron Job）

可在 VPS 伺服器設定 Linux Crontab，每天凌晨自動執行一次備份，並保留最近 30 天的歷史存檔：

```bash
# 編輯 crontab
crontab -e

# 加入以下排程（每天凌晨 03:00 執行備份並清理 30 天前的舊檔）
0 3 * * * docker run --rm -v myshop_server-data:/data:ro -v /root/backups:/backup alpine tar -czvf /backup/myshop_data_$(date +\%Y\%m\%d).tar.gz -C /data . && find /root/backups -name "myshop_data_*.tar.gz" -mtime +30 -delete
```
