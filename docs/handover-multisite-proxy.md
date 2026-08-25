# 交接文檔：多站反向代理架構改版

> 產生日期：2026-08-25
> 範圍：本專案從「client 容器自簽憑證直接對外開 80/443」改為「共用 Caddy 反向代理 + 多站容器」。
> 本文檔記錄決策、現狀、風險與待辦，供下次工作接手參考。

## 一、架構決策（為什麼這樣改）

| 決策 | 內容 | 理由 |
|---|---|---|
| 單一反向代理獨占 80/443 | `proxy/`（Caddy 容器）是全機唯一綁主機 80/443 的服務 | 主機上一個 port 只能被一個服務綁定；多站共存的正規解法 |
| 各站容器不碰主機埠 | 本專案 client 改 `expose: 80`，掛外部網路 `proxy-net`，alias `myshop-web` | 新網站 = 掛同一網路 + 取唯一 alias + Caddyfile 加一段，互不影響 |
| 選 Caddy 而非 Traefik/nginx | `caddy:2-alpine`，設定一行一個站 | 最簡、自動申請續約 Let's Encrypt；文件原第 309 行既有的建議方向 |
| TLS 在代理層終結 | client 的 nginx 改純 HTTP；自簽憑證機制整組移除 | 憑證集中管理；瀏覽器警告消失；client 映像少裝 openssl |

**鐵律（之後任何新站都適用）**：任何專案的 compose 不得出現 `ports: 80/443` 映射；對外一律走 proxy-net + 唯一 alias。

## 二、本次變更的檔案（尚未 git commit）

| 狀態 | 檔案 |
|---|---|
| 新增 | `proxy/docker-compose.yml`、`proxy/Caddyfile`、`proxy/.env.example` |
| 修改 | `docker-compose.yml`（移除埠映射/client-certs，加 networks）、`client/Dockerfile`（移除 openssl/entrypoint）、`client/nginx.conf`（純 HTTP）、`.env.example`（移除 CERT_HOSTNAME）、`AGENTS.md`、`docs/deploy-debian13-tutorial.md`、`docs/deploy-vps-docker.md` |
| 刪除 | `client/docker-entrypoint.sh` |

## 三、首次上線必做驗證（重要）

**本機（Windows）沒有 Docker，所有 compose/Caddyfile/nginx.conf 只做過 YAML 語法解析，從未實際運行。** 到伺服器部署時照順序確認：

1. 舊版容器還在跑的話先停（它占著 80/443）：到舊專案目錄 `docker compose down`
2. `docker network create proxy-net`
3. DNS 先生效再啟動 proxy（`ping shop.example.com` 指向本機）；否則 Caddy 簽不到憑證
4. `cd proxy && cp .env.example .env`（設 DOMAIN）→ `up -d` → log 出現 `certificate obtained successfully`
5. 本專案 `.env` 設 ADMIN_PASSWORD → `docker compose up -d --build`
6. `curl https://<域名>/api/categories`（不需 `-k`）；瀏覽器鎖頭無警告
7. 後台登入、新增商品含圖片上傳（全鏈路）
8. 失敗排查對照表見 `docs/deploy-debian13-tutorial.md` 常見問題一節

## 四、已知風險與注意事項

1. **X-Forwarded-Proto 會是 http**：Caddy(https) → nginx(http) → Express，nginx 以 `$scheme` 傳遞。目前應用沒用到 proto，無影響；但**若未來要設 Secure cookie 或判斷是否 HTTPS**，需讓 Express 信任代理或由 nginx 固定轉發 `X-Forwarded-Proto https`
2. **alias 唯一性**：`myshop-web` 這類別名在同一個 proxy-net 上全域唯一，第二個網站取 alias 前先想好命名（建議 `<專案名>-web`）
3. **volume 名稱前綴跟著專案資料夾名走**：備份指令寫死 `myshop_server-data`，若日後改資料夾名稱，用 `docker volume ls` 重新確認
4. **殘留的舊憑證 volume**：若伺服器曾跑過舊版，會留下孤兒 volume `myshop_client-certs`，確認新版正常後可 `docker volume rm` 清掉（屬刪除操作，動手前先告知使用者）
5. **AUTH_SECRET 未設**：每次容器重啟後台要重登（影響小，屬既有行為，未改）
6. **Caddy admin endpoint**：預設只聽容器內 localhost:2019，未對外暴露，目前安全；不要在 Caddyfile 加 `admin :2019` 之類的全域開放

## 五、待辦／改善建議（依優先序）

1. **實際部署一次並回頭修文件**：教學文件的預期輸出（如 `docker compose ps` 畫面、Caddy log 字樣）是合理推測，實跑後若有出入以實際為準修正
2. **git commit**：上述變更全部未提交（等使用者明確指示）
3. **零停機載入 Caddyfile**：目前教學寫 `docker compose restart`（會短暫斷線）；可改成 `docker compose exec caddy caddy reload --config /etc/caddy/Caddyfile`，站多之後值得換
4. **容器 healthcheck**：compose 加 `healthcheck`，502 問題能更快定位（例如 caddy 打 client `/`）
5. **Caddy 層強化**（視需求）：加 HSTS header、IP rate limit（Caddy 外掛）或 fail2ban；上傳上限已在 nginx 層 6MB，可在 Caddy 再擋一道
6. **防火牆**：確認 ufw 至少放行 22、80、443；3001 維持不對外
7. **`docs/architecture-flow.md` 可選補充**：該文件只畫 dev 流程，可加一小節「正式環境請求路徑：瀏覽器 → Caddy → nginx → Express」，非急件

## 六、快速指標

- 部署 SOP：`docs/deploy-vps-docker.md`（速查）、`docs/deploy-debian13-tutorial.md`(詳細)
- 域名分流設定：`proxy/Caddyfile`
- 架構慣例：`AGENTS.md` 部署（Docker）一節
