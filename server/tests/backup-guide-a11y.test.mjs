import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const GUIDE_PATH = path.join(ROOT, "docs", "backup-and-restore-guide.html");

test("備份與還原文檔存在且格式符合 HTML5", () => {
  assert.equal(fs.existsSync(GUIDE_PATH), true, "文檔必須存在於 docs/ 目錄下");
  const content = fs.readFileSync(GUIDE_PATH, "utf-8");
  assert.match(content, /<!DOCTYPE html>/i);
  assert.match(content, /<html lang="zh-Hant">/i);
});

test("文檔具備閱讀障礙友善 (Dyslexia-friendly) 之核心輔助功能", () => {
  const content = fs.readFileSync(GUIDE_PATH, "utf-8");

  // 1. 閱讀輔助尺規
  assert.match(content, /id="reading-ruler"/, "必須包含滑鼠跟隨之輔助尺規元素");
  assert.match(content, /isRulerActive/, "必須包含尺規啟動與跟隨邏輯");

  // 2. 主題底色與字體縮放
  assert.match(content, /class="a11y-toolbar"/, "必須包含頂部無障礙控制列");
  assert.match(content, /btn-theme-cream/, "必須包含柔和米黃護眼主題");
  assert.match(content, /font-large/, "必須支援特大字體切換");

  // 3. 語音朗讀功能 (Web Speech API)
  assert.match(content, /speechSynthesis/, "必須整合語音朗讀 API 輔助視讀");
  assert.match(content, /zh-TW/, "發音語言必須支援繁體中文 (zh-TW)");
});

test("文檔包含網站三寶與備份還原之白話步驟與指令", () => {
  const content = fs.readFileSync(GUIDE_PATH, "utf-8");

  // 核心檔案指引
  assert.match(content, /shop\.db/, "必須說明 SQLite 資料庫位置");
  assert.match(content, /uploads/, "必須說明商品圖片資料夾位置");
  assert.match(content, /\.env/, "必須說明設定檔位置");

  // 還原流程
  assert.match(content, /sqlite3/, "需提供 sqlite3 快照指令避免 WAL 髒讀");
  assert.match(content, /黃金三步/, "需提供直觀清晰之步驟指引");
  assert.match(content, /copyCode/, "需提供一鍵複製指令按鈕");
  assert.match(content, /checklist-item/, "需提供自我驗收勾選清單");
});
