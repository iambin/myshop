import { Router } from "express";
import multer from "multer";
import path from "node:path";
import crypto from "node:crypto";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { requireAdmin } from "../auth.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Keep uploads next to the SQLite file so a single volume mount covers both
export const UPLOADS_DIR = path.resolve(__dirname, "../../data/uploads");
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// Images of deleted products are moved here instead of being removed,
// so they stay recoverable until this directory is cleaned up manually
export const DELETED_UPLOADS_DIR = path.resolve(__dirname, "../../data/uploads-deleted");
fs.mkdirSync(DELETED_UPLOADS_DIR, { recursive: true });

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const MAX_SIZE = 5 * 1024 * 1024;

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
    // Random name: avoids collisions, path traversal, and CJK filename issues
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `${crypto.randomUUID()}${ext}`);
    },
  }),
  limits: { fileSize: MAX_SIZE },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_TYPES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("僅支援 JPG / PNG / WebP / GIF 圖片"));
    }
  },
});

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
