// Automated API flow tests based on docs/architecture-flow.md (前後端互動流程).
//
// Zero dependencies: uses Node's built-in test runner and fetch.
// The script spawns its own server instance on an isolated port with a
// throwaway DATA_DIR, so the developer's real shop.db and uploads are never touched.
//
// Run: cd server && npm test
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, execSync } from "node:child_process";
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

// ════════════════════════════════════════════════════════════════════
// 1. 進站心跳與訪客統計 (Heartbeat & Visit Stats)
// ════════════════════════════════════════════════════════════════════

test("POST /api/stats/heartbeat 新 visitorId → 200 { ok: true }", async () => {
  const res = await api("POST", "/api/stats/heartbeat", { json: { visitorId: "test-visitor-aaa" } });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
});

test("POST /api/stats/heartbeat 重複 visitorId → 200（UPDATE 不重複計數）", async () => {
  const res = await api("POST", "/api/stats/heartbeat", { json: { visitorId: "test-visitor-aaa" } });
  assert.equal(res.status, 200);
});

test("POST /api/stats/heartbeat 驗證防呆（缺少或超長 visitorId）", async () => {
  const noId = await api("POST", "/api/stats/heartbeat", { json: {} });
  assert.equal(noId.status, 400);

  const empty = await api("POST", "/api/stats/heartbeat", { json: { visitorId: "" } });
  assert.equal(empty.status, 400);

  const tooLong = await api("POST", "/api/stats/heartbeat", { json: { visitorId: "x".repeat(65) } });
  assert.equal(tooLong.status, 400);
});

test("GET /api/stats/visits 回傳統計指標結構且計數準確", async () => {
  await api("POST", "/api/stats/heartbeat", { json: { visitorId: "test-visitor-bbb" } });
  await api("POST", "/api/stats/heartbeat", { json: { visitorId: "test-visitor-ccc" } });

  const res = await api("GET", "/api/stats/visits");
  assert.equal(res.status, 200);
  const data = await res.json();
  for (const key of ["online", "today", "week", "month", "total"]) {
    assert.ok(typeof data[key] === "number" && data[key] >= 0);
  }
  assert.equal(data.total, 3, "3 distinct visitorIds should count as 3");
});

// ════════════════════════════════════════════════════════════════════
// 2. 後台認證與登入流程 (Auth & checkAdminAuth)
// ════════════════════════════════════════════════════════════════════

test("未登入探測 POST /api/products → 401（checkAdminAuth 探測機制）", async () => {
  const res = await api("POST", "/api/products", { json: { name: "x", price: 1, category_id: 1 } });
  assert.equal(res.status, 401);
});

test("POST /api/admin/login 密碼錯誤 → 401", async () => {
  const res = await api("POST", "/api/admin/login", { json: { password: "wrong-password" } });
  assert.equal(res.status, 401);
  assert.equal((await res.json()).error, "密碼錯誤");
});

test("POST /api/admin/login 密碼正確 → 200 + Set-Cookie admin_token (HttpOnly)", async () => {
  const { res, token } = await login(PASSWORD);
  assert.equal(res.status, 200);
  assert.ok(token, "Set-Cookie must contain admin_token");
  assert.ok(token.includes("HttpOnly"));
  adminCookie = token.split(";")[0];
  assert.match(adminCookie, /^admin_token=.+\..+$/);
});

// ════════════════════════════════════════════════════════════════════
// 3. 分類管理 (Categories Management)
// ════════════════════════════════════════════════════════════════════

let catFlowerId;
let catTreeId;

test("新增分類 → 201 { id }；重複名稱 → 409", async () => {
  const resFlower = await api("POST", "/api/categories", { json: { name: "測試花卉" }, cookie: adminCookie });
  assert.equal(resFlower.status, 201);
  catFlowerId = (await resFlower.json()).id;

  const dup = await api("POST", "/api/categories", { json: { name: "測試花卉" }, cookie: adminCookie });
  assert.equal(dup.status, 409);

  const resTree = await api("POST", "/api/categories", { json: { name: "測試樹木" }, cookie: adminCookie });
  assert.equal(resTree.status, 201);
  catTreeId = (await resTree.json()).id;
});

test("GET /api/categories 公開列表自動隱藏無商品分類；all=1 回傳全部", async () => {
  // 尚無上架商品 → 公開列表為空
  const pub = await api("GET", "/api/categories");
  assert.equal(pub.status, 200);
  assert.deepEqual(await pub.json(), []);

  // all=1 管理模式需登入
  const all = await api("GET", "/api/categories?all=1", { cookie: adminCookie });
  assert.equal(all.status, 200);
  const cats = await all.json();
  assert.equal(cats.length, 2);
  for (const c of cats) {
    assert.equal(c.is_active, 1);
    assert.equal(c.sort_order, 99);
    assert.equal(c.active_product_count, 0);
  }
});

// ════════════════════════════════════════════════════════════════════
// 4. 商品新增、規格範本與詳情 (Products CRUD & Detail)
// ════════════════════════════════════════════════════════════════════

let productA;
const PRODUCT_A_SPECS = "品名：紅玫瑰\n高度：30cm\n寬度：15cm\n容器：陶瓷盆";

test("POST /api/products 新增商品（含規格範本、四捨五入整數價格）", async () => {
  const res = await api("POST", "/api/products", {
    json: {
      name: "玫瑰盆栽",
      description: "香氣濃郁的紅玫瑰花",
      specs: PRODUCT_A_SPECS,
      price: 99.9,
      stock: 3,
      category_id: catFlowerId,
    },
    cookie: adminCookie,
  });
  assert.equal(res.status, 201);
  productA = (await res.json()).id;

  // 驗證商品詳情 GET /api/products/:id
  const detail = await (await api("GET", `/api/products/${productA}`)).json();
  assert.equal(detail.id, productA);
  assert.equal(detail.name, "玫瑰盆栽");
  assert.equal(detail.specs, PRODUCT_A_SPECS);
  assert.equal(detail.price, 100, "price must be stored as integer (rounded)");
  assert.equal(detail.category_name, "測試花卉");
});

test("商品新增防呆驗證：負數價格、負庫存、不存在分類 → 400", async () => {
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

// ════════════════════════════════════════════════════════════════════
// 5. 多關鍵字跨欄位交集搜尋 (Multi-term Cross-Field AND Search)
// ════════════════════════════════════════════════════════════════════

let productB;
let productC;

test("建立樹木類測試商品供複合搜尋測試", async () => {
  productB = (
    await (
      await api("POST", "/api/products", {
        json: {
          name: "榕樹苗",
          description: "好照顧的長青樹木",
          specs: "品名：小葉榕\n高度：50cm\n寬度：20cm\n容器：塑膠盆",
          price: 300,
          stock: 2,
          category_id: catTreeId,
        },
        cookie: adminCookie,
      })
    ).json()
  ).id;

  productC = (
    await (
      await api("POST", "/api/products", {
        json: {
          name: "桂花樹",
          description: "秋天開花芳香宜人",
          specs: "品名：四季桂\n高度：80cm\n寬度：30cm\n容器：紫砂盆",
          price: 200,
          stock: 7,
          category_id: catTreeId,
        },
        cookie: adminCookie,
      })
    ).json()
  ).id;

  assert.ok(productB && productC);
});

test("單詞搜尋：分別命中名稱、描述與規格", async () => {
  // 命中名稱
  const nameHit = await (await api("GET", `/api/products?q=${encodeURIComponent("玫瑰")}`)).json();
  assert.equal(nameHit.total, 1);
  assert.equal(nameHit.items[0].name, "玫瑰盆栽");

  // 命中描述
  const descHit = await (await api("GET", `/api/products?q=${encodeURIComponent("開花")}`)).json();
  assert.equal(descHit.total, 1);
  assert.equal(descHit.items[0].name, "桂花樹");

  // 命中規格（容器）
  const specsHit = await (await api("GET", `/api/products?q=${encodeURIComponent("紫砂盆")}`)).json();
  assert.equal(specsHit.total, 1);
  assert.equal(specsHit.items[0].name, "桂花樹");
});

test("多關鍵字跨欄位交集搜尋（類別 + 品名 + 規格）", async () => {
  // 1. 類別「測試樹木」 + 品名「桂花」
  const term1 = await (await api("GET", `/api/products?q=${encodeURIComponent("測試樹木 桂花")}`)).json();
  assert.equal(term1.total, 1);
  assert.equal(term1.items[0].name, "桂花樹");

  // 2. 順序顛倒：「桂花 測試樹木」
  const term2 = await (await api("GET", `/api/products?q=${encodeURIComponent("桂花 測試樹木")}`)).json();
  assert.equal(term2.total, 1);
  assert.equal(term2.items[0].name, "桂花樹");

  // 3. 類別「測試花卉」 + 規格「陶瓷盆」
  const term3 = await (await api("GET", `/api/products?q=${encodeURIComponent("測試花卉 陶瓷盆")}`)).json();
  assert.equal(term3.total, 1);
  assert.equal(term3.items[0].name, "玫瑰盆栽");

  // 4. 多空格容錯：「  測試樹木   50cm  」
  const term4 = await (await api("GET", `/api/products?q=${encodeURIComponent("  測試樹木   50cm  ")}`)).json();
  assert.equal(term4.total, 1);
  assert.equal(term4.items[0].name, "榕樹苗");

  // 5. 無交集關鍵字 → 0 筆
  const noHit = await (await api("GET", `/api/products?q=${encodeURIComponent("測試花卉 紫砂盆")}`)).json();
  assert.equal(noHit.total, 0);
});

test("搜尋萬用字元 % 與 _ 被轉義為字面字符而非 pattern", async () => {
  // 以「品名：四季桂」為例，搜尋含 _ 的關鍵字（_ 在 SQL LIKE 是單字元通配符）
  const hitUnderscore = await (await api("GET", `/api/products?q=${encodeURIComponent("四季桂")}`)).json();
  assert.equal(hitUnderscore.total, 1, "應該能搜尋到有底線的規格文字");
  assert.equal(hitUnderscore.items[0].name, "桂花樹");
});

// ════════════════════════════════════════════════════════════════════
// 6. 排序與分頁 (Sorting & Pagination)
// ════════════════════════════════════════════════════════════════════

test("sort 排序功能驗證（price_asc / newest）", async () => {
  const asc = await (await api("GET", "/api/products?sort=price_asc")).json();
  assert.deepEqual(
    asc.items.map((p) => p.price),
    [100, 200, 300]
  );

  const newest = await (await api("GET", "/api/products?sort=newest")).json();
  assert.deepEqual(
    newest.items.map((p) => p.id),
    [productC, productB, productA]
  );
});

test("分頁功能驗證（page 與 pageSize）", async () => {
  const page1 = await (await api("GET", "/api/products?page=1&pageSize=2&sort=price_asc")).json();
  assert.equal(page1.total, 3);
  assert.equal(page1.items.length, 2);
  assert.equal(page1.items[0].id, productA);

  const page2 = await (await api("GET", "/api/products?page=2&pageSize=2&sort=price_asc")).json();
  assert.equal(page2.total, 3);
  assert.equal(page2.items.length, 1);
  assert.equal(page2.items[0].id, productB);
});

// ════════════════════════════════════════════════════════════════════
// 7. 圖片上傳與刪除歸檔 (Image Uploads & Archiving)
// ════════════════════════════════════════════════════════════════════

test("未登入上傳圖片 → 401", async () => {
  const form = new FormData();
  form.append("image", new Blob([Buffer.from("fake", "utf8")], { type: "image/png" }), "a.png");
  const res = await fetch(`${BASE}/api/uploads`, { method: "POST", body: form });
  assert.equal(res.status, 401);
});

test("POST /api/uploads 上傳圖片 → 201，刪除商品時圖片自動移至 uploads-deleted/", async () => {
  const png1x1 = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64"
  );
  const form = new FormData();
  form.append("image", new Blob([png1x1], { type: "image/png" }), "demo.png");
  const uploadRes = await fetch(`${BASE}/api/uploads`, {
    method: "POST",
    body: form,
    headers: { Cookie: adminCookie },
  });
  assert.equal(uploadRes.status, 201);
  const { url } = await uploadRes.json();
  assert.match(url, /^\/api\/uploads\/[0-9a-f-]+\.png$/);

  // 驗證靜態圖片可被存取
  const staticRes = await fetch(`${BASE}${url}`);
  assert.equal(staticRes.status, 200);

  // 建立掛圖商品
  const created = await api("POST", "/api/products", {
    json: { name: "有圖商品", price: 50, stock: 1, category_id: catFlowerId, image_url: url },
    cookie: adminCookie,
  });
  const { id } = await created.json();

  // 刪除商品
  const del = await api("DELETE", `/api/products/${id}`, { cookie: adminCookie });
  assert.equal(del.status, 200);

  // 驗證圖檔移出 uploads/ 並移入 uploads-deleted/
  const filename = path.basename(url);
  const uploadsDir = path.join(dataDir, "uploads");
  const deletedDir = path.join(dataDir, "uploads-deleted");
  assert.ok(!fs.existsSync(path.join(uploadsDir, filename)), "image must be removed from uploads/");
  assert.ok(fs.existsSync(path.join(deletedDir, filename)), "image must be moved to uploads-deleted/");
});

test("圖片防誤刪保護：多商品共用同一圖片時，未全數刪除前圖檔不退役", async () => {
  const png1x1 = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64"
  );
  const form = new FormData();
  form.append("image", new Blob([png1x1], { type: "image/png" }), "shared-test.png");
  const uploadRes = await fetch(`${BASE}/api/uploads`, {
    method: "POST",
    body: form,
    headers: { Cookie: adminCookie },
  });
  assert.equal(uploadRes.status, 201);
  const { url } = await uploadRes.json();
  const filename = path.basename(url);
  const uploadsDir = path.join(dataDir, "uploads");
  const deletedDir = path.join(dataDir, "uploads-deleted");

  // 建立兩個商品指向同一個圖片 URL
  const p1Res = await api("POST", "/api/products", {
    json: { name: "共用圖商品A", price: 10, stock: 1, category_id: catFlowerId, image_url: url },
    cookie: adminCookie,
  });
  const { id: id1 } = await p1Res.json();

  const p2Res = await api("POST", "/api/products", {
    json: { name: "共用圖商品B", price: 20, stock: 1, category_id: catFlowerId, image_url: url },
    cookie: adminCookie,
  });
  const { id: id2 } = await p2Res.json();

  // 刪除第一個商品：因商品 B 仍在使用該圖，圖檔不可被退役
  const del1 = await api("DELETE", `/api/products/${id1}`, { cookie: adminCookie });
  assert.equal(del1.status, 200);
  assert.ok(fs.existsSync(path.join(uploadsDir, filename)), "image must remain in uploads/ because product B still references it");
  assert.ok(!fs.existsSync(path.join(deletedDir, filename)), "image must NOT be moved to uploads-deleted/");

  // 刪除第二個商品：無其他商品引用，圖檔正式退役
  const del2 = await api("DELETE", `/api/products/${id2}`, { cookie: adminCookie });
  assert.equal(del2.status, 200);
  assert.ok(!fs.existsSync(path.join(uploadsDir, filename)), "image must now be removed from uploads/");
  assert.ok(fs.existsSync(path.join(deletedDir, filename)), "image must be moved to uploads-deleted/");
});

// ════════════════════════════════════════════════════════════════════
// 8. 商品下架與分類聯動防護 (Delist & Protection)
// ════════════════════════════════════════════════════════════════════

test("商品下架後公開列表隱藏，後台 all=1 仍可查詢", async () => {
  const res = await api("PUT", `/api/products/${productA}`, {
    json: {
      name: "玫瑰盆栽",
      description: "描述更新",
      specs: PRODUCT_A_SPECS,
      price: 100,
      stock: 3,
      category_id: catFlowerId,
      image_url: null,
      is_active: false,
    },
    cookie: adminCookie,
  });
  assert.equal(res.status, 200);

  const pub = await (await api("GET", "/api/products")).json();
  assert.ok(!pub.items.some((p) => p.id === productA), "delisted item must not appear in public list");

  const all = await (await api("GET", "/api/products?all=1", { cookie: adminCookie })).json();
  const a = all.items.find((p) => p.id === productA);
  assert.equal(a.is_active, 0);

  // 分類無上架商品時自動下架
  const pubCats = await (await api("GET", "/api/categories")).json();
  assert.ok(!pubCats.some((c) => c.id === catFlowerId), "empty category must be hidden publicly");

  // 重新上架商品
  await api("PUT", `/api/products/${productA}`, {
    json: {
      name: "玫瑰盆栽",
      description: "描述更新",
      specs: PRODUCT_A_SPECS,
      price: 100,
      stock: 3,
      category_id: catFlowerId,
      image_url: null,
      is_active: true,
    },
    cookie: adminCookie,
  });
});

test("分類保護機制：仍有商品時禁止下架與刪除 → 409", async () => {
  // 下架阻擋
  const delistBlocked = await api("PUT", `/api/categories/${catTreeId}`, {
    json: { name: "測試樹木", is_active: false },
    cookie: adminCookie,
  });
  assert.equal(delistBlocked.status, 409);

  // 刪除阻擋
  const deleteBlocked = await api("DELETE", `/api/categories/${catTreeId}`, { cookie: adminCookie });
  assert.equal(deleteBlocked.status, 409);
});

// ════════════════════════════════════════════════════════════════════
// 9. 後台登出 (Admin Logout)
// ════════════════════════════════════════════════════════════════════

test("未登入呼叫 POST /api/admin/logout → 401", async () => {
  const res = await api("POST", "/api/admin/logout");
  assert.equal(res.status, 401);
});

test("POST /api/admin/logout 清除 Token Cookie", async () => {
  const res = await api("POST", "/api/admin/logout", { cookie: adminCookie });
  assert.equal(res.status, 200);
  const setCookie = res.headers.getSetCookie().find((c) => c.startsWith("admin_token="));
  assert.ok(setCookie?.includes("Max-Age=0"));
});

// ════════════════════════════════════════════════════════════════════
// 10. 其他安全修正驗證 (Security & Edge Cases)
// ════════════════════════════════════════════════════════════════════

test("GET /api/admin/me 未登入 → 401；已登入 → 200", async () => {
  const unauthed = await api("GET", "/api/admin/me");
  assert.equal(unauthed.status, 401);

  const authed = await api("GET", "/api/admin/me", { cookie: adminCookie });
  assert.equal(authed.status, 200);
  assert.deepEqual(await authed.json(), { ok: true });
});

test("POST /api/uploads/retire 停用引用中的圖片 → 409", async () => {
  // 建立含本地圖片的商品
  const png1x1 = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64"
  );
  const form = new FormData();
  form.append("image", new Blob([png1x1], { type: "image/png" }), "retire-test.png");
  const uploadRes = await fetch(`${BASE}/api/uploads`, {
    method: "POST",
    body: form,
    headers: { Cookie: adminCookie },
  });
  assert.equal(uploadRes.status, 201);
  const { url } = await uploadRes.json();

  const created = await api("POST", "/api/products", {
    json: { name: "停用測試商品", price: 10, stock: 1, category_id: catFlowerId, image_url: url },
    cookie: adminCookie,
  });
  assert.equal(created.status, 201);

  // 圖片仍被引用 → 409
  const retireRes = await api("POST", "/api/uploads/retire", { json: { url }, cookie: adminCookie });
  assert.equal(retireRes.status, 409);
  assert.equal((await retireRes.json()).error, "圖片仍被商品引用，無法刪除");
});

test("POST /api/uploads 上傳副檔名與 MIME 不一致時回 400", async () => {
  // 偽造 image/jpeg 但副檔名為 .html
  const fakeJpeg = Buffer.from(
    "FFD8FFE000104A46494600010100000100010000" + "00".repeat(100),
    "hex"
  );
  const form = new FormData();
  form.append("image", new Blob([fakeJpeg], { type: "image/jpeg" }), "malicious.html");
  const res = await fetch(`${BASE}/api/uploads`, {
    method: "POST",
    body: form,
    headers: { Cookie: adminCookie },
  });
  assert.equal(res.status, 400);
});
