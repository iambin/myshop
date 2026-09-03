import { Router } from "express";
import multer from "multer";
import path from "node:path";
import crypto from "node:crypto";
import fs from "node:fs";
import { requireAdmin } from "../auth.js";
import { DATA_DIR, db } from "../db.js";

// Keep uploads next to the SQLite file so a single volume mount covers both
export const UPLOADS_DIR = path.join(DATA_DIR, "uploads");
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// Images of deleted products are moved here instead of being removed,
// so they stay recoverable until this directory is cleaned up manually
export const DELETED_UPLOADS_DIR = path.join(DATA_DIR, "uploads-deleted");
fs.mkdirSync(DELETED_UPLOADS_DIR, { recursive: true });

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const ALLOWED_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);
const MAX_SIZE = 5 * 1024 * 1024;

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
    // Random name: avoids collisions, path traversal, and CJK filename issues.
    // Enforce extension based on MIME type, not originalname (prevents an attacker
    // sending image/jpeg with originalname="x.html" from landing a scriptable file).
    filename: (_req, file, cb) => {
      const ext = mimeToExt(file.mimetype);
      if (!ext) {
        cb(new Error("Internal error: unsupported MIME type"));
        return;
      }
      cb(null, `${crypto.randomUUID()}${ext}`);
    },
  }),
  limits: { fileSize: MAX_SIZE },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_TYPES.has(file.mimetype)) {
      cb(new Error("僅支援 JPG / PNG / WebP / GIF 圖片"));
      return;
    }
    // Double-check the extension matches the MIME type to prevent MIME-hijacked uploads
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXTS.has(ext)) {
      cb(new Error("檔案副檔名不符合圖片類型"));
      return;
    }
    cb(null, true);
  },
});

// Map common image MIME types to their canonical extensions.
function mimeToExt(mime: string): string {
  switch (mime) {
    case "image/jpeg":
      return ".jpg";
    case "image/png":
      return ".png";
    case "image/webp":
      return ".webp";
    case "image/gif":
      return ".gif";
    default:
      return "";
  }
}

export const uploadsRouter = Router();

uploadsRouter.post("/", requireAdmin, upload.single("image"), (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "請選擇圖片檔案（欄位名稱 image）" });
    return;
  }
  res.status(201).json({ url: `/api/uploads/${req.file.filename}` });
});

// Move a locally-uploaded image (url like "/api/uploads/<file>") into DELETED_UPLOADS_DIR.
// Returns false when the url is not a local upload or the source file is missing.
export function retireUploadedImage(url: string | null | undefined): boolean {
  if (!url || !url.startsWith("/api/uploads/")) return false;
  const filename = path.basename(url.slice("/api/uploads/".length));
  if (!filename) return false;
  const src = path.join(UPLOADS_DIR, filename);
  try {
    fs.renameSync(src, path.join(DELETED_UPLOADS_DIR, filename));
    return true;
  } catch {
    return false;
  }
}

uploadsRouter.post("/retire", requireAdmin, (req, res) => {
  const { url } = req.body as { url?: string };
  if (!url) {
    res.status(400).json({ error: "請提供圖片 URL" });
    return;
  }
  // Refuse to retire local uploads without checking in-use status — callers should
  // use tryRetireImage() which performs the reference count check.
  if (url.startsWith("/api/uploads/")) {
    const filename = path.basename(url.slice("/api/uploads/".length));
    if (!filename) {
      res.status(400).json({ error: "請提供有效的圖片 URL" });
      return;
    }
    const existing = db.prepare("SELECT id FROM products WHERE image_url = ? LIMIT 1").get(url);
    if (existing) {
      res.status(409).json({ error: "圖片仍被商品引用，無法刪除" });
      return;
    }
    if (!retireUploadedImage(url)) {
      res.status(400).json({ error: "圖片檔案不存在" });
      return;
    }
    res.json({ ok: true });
    return;
  }
  // Non-local URLs are accepted but nothing happens (idempotent)
  res.json({ ok: true });
});
