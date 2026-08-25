// Automated API flow tests based on docs/architecture-flow.md (前後端互動流程).
//
// Zero dependencies: uses Node's built-in test runner and fetch.
// The script spawns its own server instance on an isolated port with a
// throwaway DATA_DIR, so the developer's real shop.db and uploads are never touched.
//
// Run: cd server && npm test
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.TEST_PORT) || 3987;
const BASE = `http://127.0.0.1:${PORT}`;
const PASSWORD = "test-admin-pass-1234";

let child;
let dataDir;
let stderrChunks = [];

// auth cookie captured after successful login ("admin_token=<payload>.<sig>")
let adminCookie = "";

function spawnServer() {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "myshop-test-"));
  const tsxCli = path.join(ROOT, "node_modules", "tsx", "dist", "cli.mjs");
  if (!fs.existsSync(tsxCli)) {
    throw new Error(`tsx cli not found at ${tsxCli} — run npm install in server/ first`);
  }
  child = spawn(process.execPath, [tsxCli, "src/index.ts"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      DATA_DIR: dataDir,
      ADMIN_PASSWORD: PASSWORD,
      AUTH_SECRET: "test-secret",
    },
    stdio: ["ignore", "ignore", "pipe"],
  });
  child.stderr.on("data", (chunk) => {
    stderrChunks.push(chunk);
    if (stderrChunks.length > 50) stderrChunks.shift();
  });
}

function stderrTail() {
  return Buffer.concat(stderrChunks).toString("utf8").slice(-2000);
}

async function waitForServer(timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`server exited early (code ${child.exitCode}):\n${stderrTail()}`);
    }
    try {
      const res = await fetch(`${BASE}/api/categories`);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`server not ready after ${timeoutMs}ms:\n${stderrTail()}`);
}

async function stopServer() {
  if (!child) return;
  const exited = new Promise((resolve) => child.once("exit", resolve));
  child.kill();
  const timeout = new Promise((resolve) => setTimeout(resolve, 5000));
  const won = await Promise.race([exited, timeout]);
  if (!won && process.platform === "win32") {
    try {
      execSync(`taskkill /pid ${child.pid} /T /F`, { stdio: "ignore" });
    } catch {
      // already gone
    }
  }
}

async function api(method, pathname, opts = {}) {
  const headers = { ...(opts.headers ?? {}) };
  let body;
  if (opts.json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.json);
  }
  if (opts.cookie) headers.Cookie = opts.cookie;
  return fetch(`${BASE}${pathname}`, { method, headers, body });
}

async function login(password) {
  const res = await api("POST", "/api/admin/login", { json: { password } });
  const setCookies = res.headers.getSetCookie?.() ?? [res.headers.get("set-cookie")].filter(Boolean);
  const token = setCookies.find((c) => c.startsWith("admin_token="));
  return { res, token };
}

before(async () => {
  spawnServer();
  await waitForServer();
});

after(async () => {
  await stopServer();
  if (dataDir) fs.rmSync(dataDir, { recursive: true, force: true });
});

// ── 前台瀏覽（公開）──

test("GET /api/products 回傳空列表結構 { items, total, page, pageSize }", async () => {
  const res = await api("GET", "/api/products");
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.deepEqual(data, { items: [], total: 0, page: 1, pageSize: 12 });
});

test("GET /api/categories 公開可讀，初始為空陣列", async () => {
  const res = await api("GET", "/api/categories");
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), []);
});

test("GET /api/products/:id 不存在的商品回 404 { error }", async () => {
  const res = await api("GET", "/api/products/999999");
  assert.equal(res.status, 404);
  const data = await res.json();
  assert.ok(typeof data.error === "string" && data.error.length > 0);
});

// ── 後台管理（需認證）──

test("POST /api/admin/login 密碼錯誤 → 401", async () => {
  const res = await api("POST", "/api/admin/login", { json: { password: "wrong-password" } });
  assert.equal(res.status, 401);
  assert.equal((await res.json()).error, "密碼錯誤");
});

test("未登入呼叫寫入 API → 401（requireAdmin 擋下）", async () => {
  const res = await api("POST", "/api/products", { json: { name: "x", price: 1, category_id: 1 } });
  assert.equal(res.status, 401);
});

test("POST /api/admin/login 正確密碼 → 200 + HttpOnly admin_token cookie", async () => {
  const { res, token } = await login(PASSWORD);
  assert.equal(res.status, 200);
  assert.ok(token, "Set-Cookie should contain admin_token");
  assert.ok(token.includes("HttpOnly"));
  adminCookie = token.split(";")[0];
  assert.match(adminCookie, /^admin_token=.+\..+$/);
});

// ── 分類管理 ──

let catFlowerId;
let catTreeId;

test("新增分類 → 201 { id }；重複名稱 → 409", async () => {
  const res = await api("POST", "/api/categories", { json: { name: "測試花卉" }, cookie: adminCookie });
  assert.equal(res.status, 201);
  catFlowerId = (await res.json()).id;

  const dup = await api("POST", "/api/categories", { json: { name: "測試花卉" }, cookie: adminCookie });
  assert.equal(dup.status, 409);

  const resTree = await api("POST", "/api/categories", { json: { name: "測試樹木" }, cookie: adminCookie });
  catTreeId = (await resTree.json()).id;
});

test("GET /api/categories 附 product_count", async () => {
  const res = await api("GET", "/api/categories");
  const cats = await res.json();
  assert.ok(Array.isArray(cats) && cats.length === 2);
  for (const c of cats) {
    assert.equal(c.product_count, 0);
  }
});

// ── 商品新增／詳情／欄位驗證 ──

let productA;
const PRODUCT_A = {
  name: "玫瑰盆栽",
  description: "香氣濃郁的玫瑰花",
  specs: "高度約 30cm\n含盆出貨",
  price: 99.9,
  stock: 3,
};

test("POST /api/products → 201；詳情欄位與 server 對齊（price 取整數、附 category_name）", async () => {
  const res = await api("POST", "/api/products", {
    json: { ...PRODUCT_A, category_id: catFlowerId },
    cookie: adminCookie,
  });
  assert.equal(res.status, 201);
  productA = (await res.json()).id;

  const detail = await (await api("GET", `/api/products/${productA}`)).json();
  assert.equal(detail.id, productA);
  assert.equal(detail.name, "玫瑰盆栽");
  assert.equal(detail.price, 100, "price must be stored as integer");
  assert.equal(detail.category_id, catFlowerId);
  assert.equal(detail.category_name, "測試花卉");
  assert.ok(typeof detail.created_at === "string");
});

test("欄位驗證：負數價格／負庫存／不存在的分類 → 400", async () => {
  const badPrice = await api("POST", "/api/products", {
    json: { name: "x", price: -1, category_id: catFlowerId },
    cookie: adminCookie,
  });
  assert.equal(badPrice.status, 400);

  const badStock = await api("POST", "/api/products", {
    json: { name: "x", price: 1, stock: -5, category_id: catFlowerId },
    cookie: adminCookie,
  });
  assert.equal(badStock.status, 400);

  const badCat = await api("POST", "/api/products", {
    json: { name: "x", price: 1, category_id: 999999 },
    cookie: adminCookie,
  });
  assert.equal(badCat.status, 400);
});

// ── 商品列表：q / category / sort / 分頁 ──

let productB;
let productC;

test("再建兩筆商品供列表查詢測試", async () => {
  productB = (
    await (
      await api("POST", "/api/products", {
        json: { name: "榕樹苗", description: "好照顧的樹", price: 300, stock: 0, category_id: catTreeId },
        cookie: adminCookie,
      })
    ).json()
  ).id;
  productC = (
    await (
      await api("POST", "/api/products", {
        json: { name: "桂花樹", description: "秋天開花", price: 200, stock: 7, category_id: catTreeId },
        cookie: adminCookie,
      })
    ).json()
  ).id;
  assert.ok(productB && productC);
});

test("列表總筆數與 newest 排序（id 由新到舊）", async () => {
  const data = await (await api("GET", "/api/products")).json();
  assert.equal(data.total, 3);
  assert.equal(data.items.length, 3);
  const ids = data.items.map((p) => p.id);
  assert.deepEqual(ids.sort((a, b) => b - a), ids);
});

test("sort=price_asc 由便宜到貴", async () => {
  const data = await (await api("GET", "/api/products?sort=price_asc")).json();
  assert.deepEqual(
    data.items.map((p) => p.price),
    [100, 200, 300]
  );
});

test("q 搜尋命中名稱或描述", async () => {
  const data = await (await api("GET", "/api/products?q=%E7%8E%AB%E7%91%B0")).json(); // 玫瑰
  assert.equal(data.total, 1);
  assert.equal(data.items[0].name, "玫瑰盆栽");

  const descHit = await (await api("GET", "/api/products?q=%E9%96%8B%E8%8A%B1")).json(); // 開花
  assert.equal(descHit.total, 1);
  assert.equal(descHit.items[0].name, "桂花樹");
});

test("category 篩選只回該分類商品", async () => {
  const data = await (await api("GET", "/api/products?category=%E6%B8%AC%E8%A9%A6%E6%A8%B9%E6%9C%A8")).json(); // 測試樹木
  assert.equal(data.total, 2);
  for (const p of data.items) {
    assert.equal(p.category_name, "測試樹木");
  }
});

test("分頁：pageSize 與 page 生效", async () => {
  const page1 = await (await api("GET", "/api/products?page=1&pageSize=2&sort=price_asc")).json();
  assert.equal(page1.total, 3);
  assert.equal(page1.items.length, 2);

  const page2 = await (await api("GET", "/api/products?page=2&pageSize=2&sort=price_asc")).json();
  assert.equal(page2.items.length, 1);
  assert.equal(page2.items[0].price, 300);
});

test("PUT /api/products/:id 更新欄位生效", async () => {
  const res = await api("PUT", `/api/products/${productA}`, {
    json: {
      name: "玫瑰盆栽（大）",
      description: "改版描述",
      specs: "",
      price: 150,
      stock: 5,
      category_id: catFlowerId,
      image_url: null,
    },
    cookie: adminCookie,
  });
  assert.equal(res.status, 200);
  const detail = await (await api("GET", `/api/products/${productA}`)).json();
  assert.equal(detail.name, "玫瑰盆栽（大）");
  assert.equal(detail.price, 150);
  assert.equal(detail.stock, 5);
});

// ── 圖片上傳與刪除搬移 ──

test("未登入上傳圖片 → 401", async () => {
  const form = new FormData();
  form.append("image", new Blob([Buffer.from("fake", "utf8")], { type: "image/png" }), "a.png");
  const res = await fetch(`${BASE}/api/uploads`, { method: "POST", body: form });
  assert.equal(res.status, 401);
});

test("POST /api/uploads 上傳 PNG → 201 { url }，且可被服務", async () => {
  const png1x1 = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64"
  );
  const form = new FormData();
  form.append("image", new Blob([png1x1], { type: "image/png" }), "t.png");
  const res = await fetch(`${BASE}/api/uploads`, {
    method: "POST",
    body: form,
    headers: { Cookie: adminCookie },
  });
  assert.equal(res.status, 201);
  const { url } = await res.json();
  assert.match(url, /^\/api\/uploads\/[0-9a-f-]+\.png$/);

  const imgRes = await fetch(`${BASE}${url}`);
  assert.equal(imgRes.status, 200);
  assert.match(imgRes.headers.get("content-type") ?? "", /^image\//);

  // 建立掛此圖的商品，供下一個刪除測試驗證「圖片移至 uploads-deleted」
  const created = await api("POST", "/api/products", {
    json: { name: "有圖商品", price: 50, stock: 1, category_id: catFlowerId, image_url: url },
    cookie: adminCookie,
  });
  const { id } = await created.json();

  const del = await api("DELETE", `/api/products/${id}`, { cookie: adminCookie });
  assert.equal(del.status, 200);
  assert.deepEqual(await del.json(), { ok: true });

  const filename = path.basename(url);
  const uploadsDir = path.join(dataDir, "uploads");
  const deletedDir = path.join(dataDir, "uploads-deleted");
  assert.ok(!fs.existsSync(path.join(uploadsDir, filename)), "image must leave uploads/");
  assert.ok(fs.existsSync(path.join(deletedDir, filename)), "image must be moved to uploads-deleted/");

  const gone = await api("GET", `/api/products/${id}`);
  assert.equal(gone.status, 404);
});

test("DELETE 後分類的 product_count 同步減少", async () => {
  const cats = await (await api("GET", "/api/categories")).json();
  const flower = cats.find((c) => c.id === catFlowerId);
  assert.equal(flower.product_count, 1); // 只剩玫瑰盆栽
});

// ── 登出 ──

test("POST /api/admin/logout 回傳 ok 並設定過期 cookie（client 端登出）", async () => {
  const res = await api("POST", "/api/admin/logout", { cookie: adminCookie });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
  // Stateless token design: logout only expires the cookie on the client,
  // so assert the expired-cookie header rather than server-side revocation
  const setCookie = res.headers.getSetCookie().find((c) => c.startsWith("admin_token="));
  assert.ok(setCookie?.includes("Max-Age=0"));
});
