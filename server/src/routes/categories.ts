import { Router } from "express";
import type { Request, Response } from "express";
import { db } from "../db.js";
import { requireAdmin } from "../auth.js";

export const categoriesRouter = Router();

interface CategoryRow {
  id: number;
  name: string;
  product_count?: number;
  is_active?: number;
  sort_order?: number;
}

// A category stays publicly visible only while it holds at least one
// ACTIVE product; otherwise it is treated as auto-delisted. The stored
// is_active flag is the manual override — no write-time sync needed.
function handleList(res: Response, includeInactive: boolean) {
  const visibility = includeInactive ? "" : "WHERE c.is_active = 1 AND active_count.n > 0";
  const rows = db
    .prepare(
      `SELECT c.id, c.name, c.is_active, c.sort_order,
              COALESCE(active_count.n, 0) AS ${includeInactive ? "active_product_count" : "product_count"}
       FROM categories c
       LEFT JOIN (SELECT category_id, COUNT(*) AS n FROM products WHERE is_active = 1 GROUP BY category_id)
         AS active_count ON active_count.category_id = c.id
       ${visibility}
       ORDER BY c.sort_order ASC, c.id ASC`
    )
    .all() as CategoryRow[];
  res.json(rows);
}

// Read stays public (front-end category sidebar uses it);
// all=1 → admin view including delisted / auto-delisted categories
categoriesRouter.get("/", (req: Request, res: Response) => {
  if (req.query.all === "1") {
    requireAdmin(req, res, () => handleList(res, true));
    return;
  }
  handleList(res, false);
});

categoriesRouter.post("/", requireAdmin);
categoriesRouter.put("/:id", requireAdmin);
categoriesRouter.delete("/:id", requireAdmin);

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

function parseCategoryBody(body: unknown): { ok: true; data: CategoryData } | { ok: false; error: string } {
  const name = typeof (body as Record<string, unknown>)?.name === "string"
    ? ((body as Record<string, unknown>).name as string).trim()
    : "";
  if (!name) return { ok: false, error: "name is required" };
  const b = body as Record<string, unknown>;
  const active = parseActiveFlag(b.is_active, 1);
  if (!active.ok) return { ok: false, error: "is_active must be a boolean" };
  const sortOrder = parseSortOrder(b.sort_order, 99);
  if (!sortOrder.ok) return { ok: false, error: sortOrder.error };
  return { ok: true, data: { name, is_active: active.data, sort_order: sortOrder.data } };
}

interface CategoryData {
  name: string;
  is_active: number;
  sort_order: number;
}

categoriesRouter.post("/", (req, res) => {
  const parsed = parseCategoryBody(req.body);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  try {
    const { lastInsertRowid } = db
      .prepare("INSERT INTO categories (name, is_active, sort_order) VALUES (?, ?, ?)")
      .run(parsed.data.name, parsed.data.is_active, parsed.data.sort_order);
    res.status(201).json({ id: Number(lastInsertRowid) });
  } catch {
    res.status(409).json({ error: "分類名稱已存在" });
  }
});

categoriesRouter.put("/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!db.prepare("SELECT id FROM categories WHERE id = ?").get(id)) {
    res.status(404).json({ error: "Category not found" });
    return;
  }
  const parsed = parseCategoryBody(req.body);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  try {
    db.prepare("UPDATE categories SET name = ?, is_active = ?, sort_order = ? WHERE id = ?").run(
      parsed.data.name,
      parsed.data.is_active,
      parsed.data.sort_order,
      id
    );
    res.json({ ok: true });
  } catch {
    res.status(409).json({ error: "分類名稱已存在" });
  }
});

categoriesRouter.delete("/:id", (req, res) => {
  const id = Number(req.params.id);
  const inUse = db.prepare("SELECT id FROM products WHERE category_id = ? LIMIT 1").get(id);
  if (inUse) {
    res.status(409).json({ error: "此分類下仍有商品，請先移除或改歸其他分類" });
    return;
  }
  const info = db.prepare("DELETE FROM categories WHERE id = ?").run(id);
  if (info.changes === 0) {
    res.status(404).json({ error: "Category not found" });
    return;
  }
  res.json({ ok: true });
});
