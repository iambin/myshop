import { Router } from "express";
import { db } from "../db.js";
import { requireAdmin } from "../auth.js";
import { retireUploadedImage } from "./uploads.js";

export const productsRouter = Router();

// Read endpoints stay public; mutations require admin login
productsRouter.post("/", requireAdmin);
productsRouter.put("/:id", requireAdmin);
productsRouter.delete("/:id", requireAdmin);

interface ProductRow {
  id: number;
  name: string;
  description: string;
  specs: string;
  price: number;
  image_url: string | null;
  stock: number;
  category_id: number;
  category_name: string;
  is_active: number;
  sort_order: number;
  created_at: string;
}

// "default" = admin-controlled order (smaller sort_order first),
// falling back to newest-first for ties (e.g. untouched default 999)
const SORTS: Record<string, string> = {
  default: "p.sort_order ASC, p.id DESC",
  newest: "p.created_at DESC, p.id DESC",
  price_asc: "p.price ASC",
  price_desc: "p.price DESC",
};

function parseActiveFlag(value: unknown, fallback: number): { ok: true; data: number } | { ok: false } {
  if (value === undefined || value === null || value === "") return { ok: true, data: fallback };
  if (value === true || value === 1 || value === "1") return { ok: true, data: 1 };
  if (value === false || value === 0 || value === "0") return { ok: true, data: 0 };
  return { ok: false };
}

function parseSortOrder(value: unknown, fallback: number): { ok: true; data: number } | { ok: false; error: string } {
  if (value === undefined || value === null || value === "") return { ok: true, data: fallback };
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) {
    return { ok: false, error: "sort_order must be a non-negative integer" };
  }
  return { ok: true, data: n };
}

function parseProductBody(body: unknown): { ok: true; data: NewProductData } | { ok: false; error: string } {
  const b = body as Record<string, unknown>;
  const name = typeof b.name === "string" ? b.name.trim() : "";
  if (!name) return { ok: false, error: "name is required" };
  const price = Number(b.price);
  if (!Number.isFinite(price) || price < 0) return { ok: false, error: "price must be a non-negative number" };
  // store prices as integers (TWD cents are not used)
  const roundedPrice = Math.round(price);
  const stock = b.stock === undefined || b.stock === null || b.stock === "" ? 0 : Number(b.stock);
  if (!Number.isInteger(stock) || stock < 0) return { ok: false, error: "stock must be a non-negative integer" };
  const category_id = Number(b.category_id);
  if (!Number.isInteger(category_id) || !db.prepare("SELECT id FROM categories WHERE id = ?").get(category_id)) {
    return { ok: false, error: "category_id is invalid" };
  }
  const active = parseActiveFlag(b.is_active, 1);
  if (!active.ok) return { ok: false, error: "is_active must be a boolean" };
  const sortOrder = parseSortOrder(b.sort_order, 999);
  if (!sortOrder.ok) return { ok: false, error: sortOrder.error };
  return {
    ok: true,
    data: {
      name,
      description: typeof b.description === "string" ? b.description : "",
      specs: typeof b.specs === "string" ? b.specs : "",
      price: roundedPrice,
      image_url: typeof b.image_url === "string" && b.image_url.trim() ? b.image_url.trim() : null,
      stock,
      category_id,
      is_active: active.data,
      sort_order: sortOrder.data,
    },
  };
}

interface NewProductData {
  name: string;
  description: string;
  specs: string;
  price: number;
  image_url: string | null;
  stock: number;
  category_id: number;
  is_active: number;
  sort_order: number;
}

const insertProductStmt = db.prepare(`
  INSERT INTO products (name, description, specs, price, image_url, stock, category_id, is_active, sort_order)
  VALUES (@name, @description, @specs, @price, @image_url, @stock, @category_id, @is_active, @sort_order)
`);

productsRouter.post("/", (req, res) => {
  const parsed = parseProductBody(req.body);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  const { lastInsertRowid } = insertProductStmt.run(parsed.data);
  res.status(201).json({ id: Number(lastInsertRowid) });
});

productsRouter.put("/:id", (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare("SELECT id, image_url FROM products WHERE id = ?").get(id) as
    | { id: number; image_url: string | null }
    | undefined;
  if (!existing) {
    res.status(404).json({ error: "Product not found" });
    return;
  }
  const parsed = parseProductBody(req.body);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  db.prepare(
    `UPDATE products SET name = @name, description = @description, specs = @specs, price = @price,
     image_url = @image_url, stock = @stock, category_id = @category_id,
     is_active = @is_active, sort_order = @sort_order WHERE id = @id`
  ).run({ ...parsed.data, id });
  // image replaced → retire the previous local upload so it doesn't linger in UPLOADS_DIR
  if (existing.image_url && existing.image_url !== parsed.data.image_url) {
    retireUploadedImage(existing.image_url);
  }
  res.json({ ok: true });
});

productsRouter.delete("/:id", (req, res) => {
  const row = db.prepare("SELECT image_url FROM products WHERE id = ?").get(Number(req.params.id)) as
    | { image_url: string | null }
    | undefined;
  if (!row) {
    res.status(404).json({ error: "Product not found" });
    return;
  }
  db.prepare("DELETE FROM products WHERE id = ?").run(Number(req.params.id));
  retireUploadedImage(row.image_url);
  res.json({ ok: true });
});

const PRODUCT_SELECT = `
  SELECT p.id, p.name, p.description, p.specs, p.price, p.image_url, p.stock,
          p.category_id, c.name AS category_name, p.is_active, p.sort_order, p.created_at
  FROM products p JOIN categories c ON c.id = p.category_id`;

productsRouter.get("/", (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(req.query.pageSize) || 12));
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const category = typeof req.query.category === "string" ? req.query.category : "";
  const sort = typeof req.query.sort === "string" && SORTS[req.query.sort] ? req.query.sort : "default";
  // all=1 → admin view including delisted products; requires login
  if (req.query.all === "1") {
    requireAdmin(req, res, () => {
      handleList(req, res, { page, pageSize, q, category, sort, includeInactive: true });
    });
    return;
  }
  handleList(req, res, { page, pageSize, q, category, sort, includeInactive: false });
});

function handleList(
  req: import("express").Request,
  res: import("express").Response,
  opts: {
    page: number;
    pageSize: number;
    q: string;
    category: string;
    sort: string;
    includeInactive: boolean;
  }
) {
  const { page, pageSize, q, category, sort, includeInactive } = opts;

  const where: string[] = [];
  const params: Record<string, unknown> = {};
  if (!includeInactive) where.push("p.is_active = 1");
  if (q) {
    where.push("(p.name LIKE @q OR p.description LIKE @q)");
    params.q = `%${q}%`;
  }
  if (category) {
    where.push("c.name = @category");
    params.category = category;
  }
  const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const total = (
    db.prepare(`SELECT COUNT(*) AS n FROM products p JOIN categories c ON c.id = p.category_id ${whereClause}`).get(params) as { n: number }
  ).n;

  const items = db
    .prepare(`${PRODUCT_SELECT} ${whereClause} ORDER BY ${SORTS[sort]} LIMIT @limit OFFSET @offset`)
    .all({ ...params, limit: pageSize, offset: (page - 1) * pageSize }) as ProductRow[];

  res.json({ items, total, page, pageSize });
}

productsRouter.get("/:id", (req, res) => {
  // delisted products are hidden from the public detail endpoint
  const row = db
    .prepare(`${PRODUCT_SELECT} WHERE p.id = ? AND p.is_active = 1`)
    .get(Number(req.params.id)) as ProductRow | undefined;

  if (!row) {
    res.status(404).json({ error: "Product not found" });
    return;
  }
  res.json(row);
});
