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
  created_at: string;
}

const SORTS: Record<string, string> = {
  newest: "p.created_at DESC, p.id DESC",
  price_asc: "p.price ASC",
  price_desc: "p.price DESC",
};

function parseProductBody(body: unknown): { ok: true; data: NewProductData } | { ok: false; error: string } {
  const b = body as Record<string, unknown>;
  const name = typeof b.name === "string" ? b.name.trim() : "";
  if (!name) return { ok: false, error: "name is required" };
  const price = Number(b.price);
  if (!Number.isFinite(price) || price < 0) return { ok: false, error: "price must be a non-negative number" };
  // round to 2 decimals to avoid float artifacts (e.g. 42.690000000000005) entering the DB
  const roundedPrice = Math.round(price * 100) / 100;
  const stock = b.stock === undefined || b.stock === null || b.stock === "" ? 0 : Number(b.stock);
  if (!Number.isInteger(stock) || stock < 0) return { ok: false, error: "stock must be a non-negative integer" };
  const category_id = Number(b.category_id);
  if (!Number.isInteger(category_id) || !db.prepare("SELECT id FROM categories WHERE id = ?").get(category_id)) {
    return { ok: false, error: "category_id is invalid" };
  }
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
}

const insertProductStmt = db.prepare(`
  INSERT INTO products (name, description, specs, price, image_url, stock, category_id)
  VALUES (@name, @description, @specs, @price, @image_url, @stock, @category_id)
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
     image_url = @image_url, stock = @stock, category_id = @category_id WHERE id = @id`
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

productsRouter.get("/", (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(req.query.pageSize) || 12));
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const category = typeof req.query.category === "string" ? req.query.category : "";
  const sort = typeof req.query.sort === "string" && SORTS[req.query.sort] ? req.query.sort : "newest";

  const where: string[] = [];
  const params: Record<string, unknown> = {};
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
    .prepare(
      `SELECT p.id, p.name, p.description, p.specs, p.price, p.image_url, p.stock,
              p.category_id, c.name AS category_name, p.created_at
       FROM products p JOIN categories c ON c.id = p.category_id
       ${whereClause}
       ORDER BY ${SORTS[sort]}
       LIMIT @limit OFFSET @offset`
    )
    .all({ ...params, limit: pageSize, offset: (page - 1) * pageSize }) as ProductRow[];

  res.json({ items, total, page, pageSize });
});

productsRouter.get("/:id", (req, res) => {
  const row = db
    .prepare(
      `SELECT p.id, p.name, p.description, p.specs, p.price, p.image_url, p.stock,
              p.category_id, c.name AS category_name, p.created_at
       FROM products p JOIN categories c ON c.id = p.category_id
       WHERE p.id = ?`
    )
    .get(Number(req.params.id)) as ProductRow | undefined;

  if (!row) {
    res.status(404).json({ error: "Product not found" });
    return;
  }
  res.json(row);
});
