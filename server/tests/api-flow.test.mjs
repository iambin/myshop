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

test("GET /api/categories 公開列表隱藏無上架商品的分類；all=1（管理）回全部含新欄位", async () => {
  // 尚無任何上架商品 → 兩個分類都應被自動下架，公開列表為空
  const pub = await api("GET", "/api/categories");
  assert.equal(pub.status, 200);
  assert.deepEqual(await pub.json(), []);

  const all = await api("GET", "/api/categories?all=1", { cookie: adminCookie });
  assert.equal(all.status, 200);
  const cats = await all.json();
  assert.ok(Array.isArray(cats) && cats.length === 2);
  for (const c of cats) {
    assert.equal(c.is_active, 1);
    assert.equal(c.sort_order, 99, "default sort_order should be 99");
    assert.equal(c.active_product_count, 0);
  }

  // all=1 未登入 → 401
  const unauthorized = await api("GET", "/api/categories?all=1");
  assert.equal(unauthorized.status, 401);
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

test("q 搜尋命中名稱或描述，以及類別+品名多詞組合搜尋", async () => {
  const data = await (await api("GET", "/api/products?q=%E7%8E%AB%E7%91%B0")).json(); // 玫瑰
  assert.equal(data.total, 1);
  assert.equal(data.items[0].name, "玫瑰盆栽");

  const descHit = await (await api("GET", "/api/products?q=%E9%96%8B%E8%8A%B1")).json(); // 開花
  assert.equal(descHit.total, 1);
  assert.equal(descHit.items[0].name, "桂花樹");

  // 類別「測試樹木」 + 品名「桂花」組合搜尋
  const multiTermHit = await (await api("GET", `/api/products?q=${encodeURIComponent("測試樹木 桂花")}`)).json();
  assert.equal(multiTermHit.total, 1);
  assert.equal(multiTermHit.items[0].name, "桂花樹");

  // 順序相反「桂花 測試樹木」依然命中
  const reverseTermHit = await (await api("GET", `/api/products?q=${encodeURIComponent("桂花 測試樹木")}`)).json();
  assert.equal(reverseTermHit.total, 1);
  assert.equal(reverseTermHit.items[0].name, "桂花樹");
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

// ── 商品下架／自訂排序／分類自動下架 ──

test("新商品預設 is_active=1、sort_order=999", async () => {
  const data = await (await api("GET", "/api/products?all=1", { cookie: adminCookie })).json();
  const a = data.items.find((p) => p.id === productA);
  assert.equal(a.is_active, 1);
  assert.equal(a.sort_order, 999);
});

test("商品下架後：公開列表與詳情看不到，all=1 仍可見", async () => {
  const res = await api("PUT", `/api/products/${productA}`, {
    json: {
      name: "玫瑰盆栽（大）",
      description: "改版描述",
      specs: "",
      price: 150,
      stock: 5,
      category_id: catFlowerId,
      image_url: null,
      is_active: false,
    },
    cookie: adminCookie,
  });
  assert.equal(res.status, 200);

  const pub = await (await api("GET", "/api/products")).json();
  assert.ok(!pub.items.some((p) => p.id === productA), "delisted product must be hidden publicly");

  const detail = await api("GET", `/api/products/${productA}`);
  assert.equal(detail.status, 404);

  const all = await (await api("GET", "/api/products?all=1", { cookie: adminCookie })).json();
  const a = all.items.find((p) => p.id === productA);
  assert.equal(a.is_active, 0);
});

test("分類底下沒有上架商品時自動下架（公開列表消失，all=1 仍在）", async () => {
  // 花卉唯一的商品剛被下架 → 公開列表應只剩樹木
  const pub = await (await api("GET", "/api/categories")).json();
  assert.deepEqual(
    pub.map((c) => c.name),
    ["測試樹木"]
  );

  const all = await (await api("GET", "/api/categories?all=1", { cookie: adminCookie })).json();
  const flower = all.find((c) => c.id === catFlowerId);
  const tree = all.find((c) => c.id === catTreeId);
  assert.equal(flower.active_product_count, 0);
  assert.equal(tree.active_product_count, 2);
});

test("欄位驗證：is_active 非布林／sort_order 負數或非整數 → 400", async () => {
  const badActive = await api("POST", "/api/products", {
    json: { name: "x", price: 1, category_id: catFlowerId, is_active: "yes" },
    cookie: adminCookie,
  });
  assert.equal(badActive.status, 400);

  const badSort = await api("PUT", `/api/products/${productA}`, {
    json: {
      name: "x", price: 1, category_id: catFlowerId, sort_order: -1,
    },
    cookie: adminCookie,
  });
  assert.equal(badSort.status, 400);

  const badCatSort = await api("PUT", `/api/categories/${catFlowerId}`, {
    json: { name: "測試花卉", sort_order: 1.5 },
    cookie: adminCookie,
  });
  assert.equal(badCatSort.status, 400);
});

test("sort_order 越小越前面；商品重新上架時分類自動恢復上架", async () => {
  // 重新上架玫瑰並給最小排序；B/C 維持預設 999
  const putA = await api("PUT", `/api/products/${productA}`, {
    json: {
      name: "玫瑰盆栽（大）",
      description: "改版描述",
      specs: "",
      price: 150,
      stock: 5,
      category_id: catFlowerId,
      image_url: null,
      is_active: true,
      sort_order: 1,
    },
    cookie: adminCookie,
  });
  assert.equal(putA.status, 200);

  // 預設排序：sort_order 小者先，平手時 id 新者先 → [A(1), C(999), B(999)]
  const def = await (await api("GET", "/api/products")).json();
  assert.deepEqual(def.items.map((p) => p.id), [productA, productC, productB]);

  // 明指定 newest 維持由新到舊 → [C, B, A]
  const newest = await (await api("GET", "/api/products?sort=newest")).json();
  assert.deepEqual(newest.items.map((p) => p.id), [productC, productB, productA]);

  // 花卉有上架商品了 → 公開分類列表自動恢復，順序 sort_order 小者先、平手 id 小者先
  const pub = await (await api("GET", "/api/categories")).json();
  assert.deepEqual(
    pub.map((c) => c.name),
    ["測試花卉", "測試樹木"]
  );
  assert.equal(pub[0].product_count, 1);
  assert.equal(pub[1].product_count, 2);
});

test("分類下架防護：仍有上架商品 → 409；商品全下架後才可下架", async () => {
  // 樹木仍有 B/C 兩筆上架商品 → 下架應被拒絕
  const blocked = await api("PUT", `/api/categories/${catTreeId}`, {
    json: { name: "測試樹木", is_active: false },
    cookie: adminCookie,
  });
  assert.equal(blocked.status, 409);
  assert.match((await blocked.json()).error, /上架/);

  const pubBefore = await (await api("GET", "/api/categories")).json();
  assert.deepEqual(
    pubBefore.map((c) => c.name),
    ["測試花卉", "測試樹木"],
    "blocked delist must not hide the category"
  );

  // 下架 B、C 後即可成功下架分類
  const productsOff = await Promise.all(
    [
      [productB, { name: "榕樹苗", description: "好照顧的樹", price: 300, stock: 0 }],
      [productC, { name: "桂花樹", description: "秋天開花", price: 200, stock: 7 }],
    ].map(([pid, base]) =>
      api("PUT", `/api/products/${pid}`, {
        json: { ...base, specs: "", category_id: catTreeId, image_url: null, is_active: false },
        cookie: adminCookie,
      })
    )
  );
  for (const r of productsOff) assert.equal(r.status, 200);

  const off = await api("PUT", `/api/categories/${catTreeId}`, {
    json: { name: "測試樹木", is_active: false },
    cookie: adminCookie,
  });
  assert.equal(off.status, 200);

  let pub = await (await api("GET", "/api/categories")).json();
  assert.deepEqual(
    pub.map((c) => c.name),
    ["測試花卉"]
  );

  // 還原：分類與 B/C 重新上架
  const on = await api("PUT", `/api/categories/${catTreeId}`, {
    json: { name: "測試樹木" },
    cookie: adminCookie,
  });
  assert.equal(on.status, 200);

  const productsOn = await Promise.all(
    [
      [productB, { name: "榕樹苗", description: "好照顧的樹", price: 300, stock: 0 }],
      [productC, { name: "桂花樹", description: "秋天開花", price: 200, stock: 7 }],
    ].map(([pid, base]) =>
      api("PUT", `/api/products/${pid}`, {
        json: { ...base, specs: "", category_id: catTreeId, image_url: null, is_active: true },
        cookie: adminCookie,
      })
    )
  );
  for (const r of productsOn) assert.equal(r.status, 200);

  pub = await (await api("GET", "/api/categories")).json();
  assert.deepEqual(
    pub.map((c) => c.name),
    ["測試花卉", "測試樹木"]
  );
});

test("分類刪除防護：分類下仍有商品（含下架）→ 409", async () => {
  const res = await api("DELETE", `/api/categories/${catTreeId}`, { cookie: adminCookie });
  assert.equal(res.status, 409);
  assert.match((await res.json()).error, /仍有商品/);

  const cats = await (await api("GET", "/api/categories?all=1", { cookie: adminCookie })).json();
  assert.ok(cats.some((c) => c.id === catTreeId), "blocked delete must keep the category");
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

// ── 進站統計（stats heartbeat / visits）──

test("POST /api/stats/heartbeat 新 visitorId → 200 { ok: true }", async () => {
  const res = await api("POST", "/api/stats/heartbeat", { json: { visitorId: "test-visitor-aaa" } });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
});

test("POST /api/stats/heartbeat 重複 visitorId → 200（UPDATE，不重複計算）", async () => {
  const res = await api("POST", "/api/stats/heartbeat", { json: { visitorId: "test-visitor-aaa" } });
  assert.equal(res.status, 200);
});

test("POST /api/stats/heartbeat visitorId 缺少或空字串 → 400", async () => {
  const noId = await api("POST", "/api/stats/heartbeat", { json: {} });
  assert.equal(noId.status, 400);

  const empty = await api("POST", "/api/stats/heartbeat", { json: { visitorId: "" } });
  assert.equal(empty.status, 400);
});

test("POST /api/stats/heartbeat visitorId 超過 64 字元 → 400", async () => {
  const res = await api("POST", "/api/stats/heartbeat", { json: { visitorId: "x".repeat(65) } });
  assert.equal(res.status, 400);
});

test("GET /api/stats/visits 回傳 { online, today, week, month, total } 結構", async () => {
  // 先發幾筆 heartbeat（aaa 已存在，再加 bbb、ccc）
  await api("POST", "/api/stats/heartbeat", { json: { visitorId: "test-visitor-bbb" } });
  await api("POST", "/api/stats/heartbeat", { json: { visitorId: "test-visitor-ccc" } });

  const res = await api("GET", "/api/stats/visits");
  assert.equal(res.status, 200);
  const data = await res.json();

  for (const key of ["online", "today", "week", "month", "total"]) {
    assert.ok(typeof data[key] === "number" && data[key] >= 0, `${key} must be a non-negative number`);
  }
  // 3 個不同 visitorId 都在本日，total 至少 3
  assert.ok(data.total >= 3);
  assert.ok(data.today >= 3);
  assert.ok(data.online >= 3, "all heartbeats are recent, should be counted as online");
});

test("GET /api/stats/visits 重複 visitor 只計一次", async () => {
  // aaa 已送過多次 heartbeat，仍只算一個 unique visitor
  const res = await api("GET", "/api/stats/visits");
  const { total } = await res.json();
  // total 應是 3（aaa, bbb, ccc），不因重送而膨脹
  assert.equal(total, 3);
});
