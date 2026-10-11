import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DEPLOY_DOC = path.join(ROOT, "docs", "deploy-ubuntu-tutorial.md");
const BACKUP_DOC = path.join(ROOT, "docs", "backup-restore-ubuntu-tutorial.md");

test("備份與還原教學文檔存在且與 deploy-ubuntu-tutorial.md 環境參數一致", () => {
  assert.equal(fs.existsSync(DEPLOY_DOC), true, "deploy-ubuntu-tutorial.md 必須存在");
  assert.equal(fs.existsSync(BACKUP_DOC), true, "backup-restore-ubuntu-tutorial.md 必須存在");

  const content = fs.readFileSync(BACKUP_DOC, "utf-8");

  // 驗證與佈署教學文檔一致的環境資訊
  assert.match(content, /129\.146\.21\.37/, "必須包含目標 VPS IP");
  assert.match(content, /iam369\.dpdns\.org/, "必須包含目標域名");
  assert.match(content, /\/root\/myshop/, "必須包含專案部署目錄");
  assert.match(content, /\/root\/myshop\/proxy/, "必須包含 Caddy 反向代理目錄");
  assert.match(content, /myshop_server-data/, "必須包含 Docker Volume 名稱");
  assert.match(content, /proxy-net/, "必須包含跨容器共用網路名稱");
});

test("備份教學涵蓋網站三寶、冷熱備份、異地ダウンロード與自動排程", () => {
  const content = fs.readFileSync(BACKUP_DOC, "utf-8");

  // 核心備份資產
  assert.match(content, /shop\.db/, "必須明確標示 SQLite 資料庫");
  assert.match(content, /uploads/, "必須明確標示商品圖片資料夾");
  assert.match(content, /uploads-deleted/, "必須涵蓋已退役圖片封存目錄");
  assert.match(content, /\.env/, "必須明確標示環境變數設定檔");

  // 備份與異地下載指令
  assert.match(content, /docker compose stop server/, "需包含冷備份安全停寫指令");
  assert.match(content, /\.backup/, "需包含熱備份 SQLite 快照指令");
  assert.match(content, /scp root@129\.146\.21\.37/, "需包含下載至本機電腦之異地備份指令");
  assert.match(content, /crontab -e/, "需包含 Linux 自動定時排程教學");
});

test("還原教學涵蓋原機救援、全新主機重建、驗證步驟與常見問題排查", () => {
  const content = fs.readFileSync(BACKUP_DOC, "utf-8");

  // 還原指令與兩大情境
  assert.match(content, /tar -xzf/, "需包含解壓縮還原至 Volume 之指令");
  assert.match(content, /情境一/, "需包含原伺服器誤刪還原情境");
  assert.match(content, /情境二/, "需包含全新主機災難重建情境");

  // 還原後驗證與 FAQ
  assert.match(content, /\/api\/categories/, "需包含 API 驗證測試指令");
  assert.match(content, /\/api\/products/, "需包含商品列表 API 驗證指令");
  assert.match(content, /502 Bad Gateway/, "需包含常見故障排查 FAQ");
});
