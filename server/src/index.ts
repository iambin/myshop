import express from "express";
import { db } from "./db.js";
import { productsRouter } from "./routes/products.js";
import { categoriesRouter } from "./routes/categories.js";
import { makeToken, requireAdmin, verifyPassword } from "./auth.js";
import { uploadsRouter, UPLOADS_DIR } from "./routes/uploads.js";
import { statsRouter } from "./routes/stats.js";

if (!process.env.ADMIN_PASSWORD) {
  console.warn("WARNING: ADMIN_PASSWORD not set; using default '1971'. Set it via env before deploying.");
}

const app = express();
app.use(express.json());
app.use("/api/products", productsRouter);
app.use("/api/categories", categoriesRouter);
app.use("/api/uploads", uploadsRouter);
app.use("/api/stats", statsRouter);
// Serve uploaded images; long cache is safe because filenames are unique
app.use(
  "/api/uploads",
  express.static(UPLOADS_DIR, {
    fallthrough: false,
    maxAge: "30d",
    index: false,
  })
);

app.post("/api/admin/login", (req, res) => {
  if (!verifyPassword((req.body as { password?: unknown })?.password)) {
    res.status(401).json({ error: "密碼錯誤" });
    return;
  }
  // HttpOnly + SameSite=Lax keeps the session cookie out of scripts and cross-site posts
  res.setHeader(
    "Set-Cookie",
    `admin_token=${makeToken()}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${7 * 24 * 3600}`
  );
  res.json({ ok: true });
});

app.post("/api/admin/logout", requireAdmin, (_req, res) => {
  res.setHeader("Set-Cookie", "admin_token=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0");
  res.json({ ok: true });
});

const PORT = Number(process.env.PORT) || 3001;
app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
