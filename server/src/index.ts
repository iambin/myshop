import express from "express";
import { db } from "./db.js";
import { productsRouter } from "./routes/products.js";
import { categoriesRouter } from "./routes/categories.js";
import { makeToken, requireAdmin, verifyPassword, verifyToken, getAuthToken } from "./auth.js";
import { uploadsRouter, UPLOADS_DIR } from "./routes/uploads.js";
import { statsRouter } from "./routes/stats.js";

if (!process.env.ADMIN_PASSWORD) {
  console.warn("WARNING: ADMIN_PASSWORD not set; using default '1971'. Set it via env before deploying.");
}

const app = express();
app.use(express.json());

// Content Security Policy — lock down what the browser may load or execute.
// script-style / style-style allow inline styles injected by React;
// img-src permits external images the admin can paste into product fields.
const isProd = process.env.NODE_ENV === "production";
app.use((req, res, next) => {
  res.setHeader(
    "Content-Security-Policy",
    [
      `default-src 'self'`,
      `script-src 'self'`,
      `style-src 'self' 'unsafe-inline'`,
      `img-src 'self' https: data: blob:`,
      `connect-src 'self'`,
      `font-src 'self'`,
      `object-src 'none'`,
      `base-uri 'self'`,
      `form-action 'self'`,
      isProd ? "upgrade-insecure-requests" : "",
    ]
      .filter(Boolean)
      .join("; ")
  );
  next();
});
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

// Catch multer errors (wrong MIME, wrong extension, size exceeded) so the client
// gets a clear 400 instead of Express's default 500.
// Must be after the route registrations — Express error-middleware matching
// requires it to appear after the middleware that may throw.
app.use((err: any, _req: import("express").Request, res: import("express").Response, next: import("express").NextFunction) => {
  if (err.code === "LIMIT_UNEXPECTED_FILE") {
    res.status(400).json({ error: "請上傳圖片檔案" });
    return;
  }
  // fileFilter rejects have no multer code; detect by message content
  if (err instanceof Error && (err.message?.includes("僅支援") || err.message?.includes("副檔名"))) {
    res.status(400).json({ error: err.message });
    return;
  }
  next(err);
});

app.get("/api/admin/me", (req, res) => {
  const token = getAuthToken(req);
  if (!verifyToken(token)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  res.json({ ok: true });
});

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
