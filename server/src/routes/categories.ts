import { Router } from "express";
import { db } from "../db.js";
import { requireAdmin } from "../auth.js";

export const categoriesRouter = Router();

// Read stays public (front-end category sidebar uses it)
categoriesRouter.get("/", (_req, res) => {
  const rows = db
    .prepare(
      `SELECT c.id, c.name, COUNT(p.id) AS product_count
       FROM categories c LEFT JOIN products p ON p.category_id = c.id
       GROUP BY c.id ORDER BY c.name`
    )
    .all();
  res.json(rows);
});

categoriesRouter.post("/", requireAdmin);
categoriesRouter.put("/:id", requireAdmin);
categoriesRouter.delete("/:id", requireAdmin);

function parseName(body: unknown): { ok: true; name: string } | { ok: false; error: string } {
  const name = typeof (body as Record<string, unknown>)?.name === "string"
    ? ((body as Record<string, unknown>).name as string).trim()
    : "";
  if (!name) return { ok: false, error: "name is required" };
  return { ok: true, name };
}

categoriesRouter.post("/", (req, res) => {
  const parsed = parseName(req.body);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  try {
    const { lastInsertRowid } = db.prepare("INSERT INTO categories (name) VALUES (?)").run(parsed.name);
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
  const parsed = parseName(req.body);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  try {
    db.prepare("UPDATE categories SET name = ? WHERE id = ?").run(parsed.name, id);
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
