# Docker 封存圖片（uploads-deleted）人工清理教學手冊

本手冊說明當商品從後台刪除後，後端自動移至封存目錄（`uploads-deleted/`）的圖檔，如何透過 Docker 進行人工檢視、清理與刪除。

---

## 📌 目錄結構與容器路徑

* **專案實體目錄**：`server/data/uploads-deleted/`
* **Docker 容器內部路徑**：`/app/data/uploads-deleted/`
* **Docker Volume 名稱**：`myshop_server-data`（或 `server-data`）

---

## 🛠️ 操作方式 A：進入 Docker 容器手動下指令刪除（推薦）

這是最直接且能隨時檢查檔案清單的操作方式：

### 步驟 1：進入 Server 容器終端機

在 VPS 伺服器的專案目錄下（`docker-compose.yml` 所在位置）執行：

```bash
docker compose exec server sh
```

*(若是單獨運行 Docker，可使用 `docker exec -it <容器名稱或ID> sh`)*

### 步驟 2：切換至封存目錄並檢視檔案

```bash
cd /app/data/uploads-deleted
ls -lh
```

### 步驟 3：依需求執行刪除指令

* **清空目錄內所有封存圖檔（最常用）**：
  ```bash
  rm -f *
  ```

* **刪除指定單一圖檔**：
  ```bash
  rm -f <檔案名稱.jpg>
  ```

* **只刪除超過 30 天的舊圖檔（保留近期刪除記錄）**：
  ```bash
  find . -type f -mtime +30 -delete
  ```

### 步驟 4：確認並退出容器

```bash
ls -lh        # 確認檔案已被清空
exit          # 退出容器，回到 VPS 宿主機
```

---

## ⚡ 操作方式 B：在宿主機直接一行指令清理（免進容器）

若熟悉指令，可直接在 VPS 專案目錄下執行：

* **查看封存圖檔列表**：
  ```bash
  docker compose exec server ls -lh /app/data/uploads-deleted
  ```

* **直接清空封存圖檔**：
  ```bash
  docker compose exec server sh -c "rm -f /app/data/uploads-deleted/*"
  ```

---

## ⏰ 操作方式 C：設定 Linux Crontab 自動定期清理

若希望系統自動刪除過期圖片，可在 VPS 宿主機設定定時排程：

```bash
crontab -e
```

加入以下排程（每週日凌晨 04:00 自動清理超過 30 天的封存圖檔）：

```bash
0 4 * * 0 docker compose -f /root/myshop/docker-compose.yml exec -T server find /app/data/uploads-deleted -type f -mtime +30 -delete
```
