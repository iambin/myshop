import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

if (!process.env.AUTH_SECRET) {
  throw new Error(
    "AUTH_SECRET is required for production. Set it via environment variable before starting the server."
  );
}

const SESSION_TTL_MS = 7 * 24 * 3600 * 1000;

const SECRET = process.env.AUTH_SECRET;
const PASSWORD = process.env.ADMIN_PASSWORD ?? "1971";

function sign(payload: string): string {
  return createHmac("sha256", SECRET).update(payload).digest("hex");
}

export function verifyPassword(input: unknown): boolean {
  if (typeof input !== "string") return false;
  const a = Buffer.from(input);
  const b = Buffer.from(PASSWORD);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function makeToken(now = Date.now()): string {
  const expiresAt = String(now + SESSION_TTL_MS);
  return `${expiresAt}.${sign(expiresAt)}`;
}

export function verifyToken(token: string | undefined): boolean {
  if (!token) return false;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return false;
  const payload = token.slice(0, dot);
  const sig = Buffer.from(token.slice(dot + 1));
  const expected = Buffer.from(sign(payload));
  if (sig.length !== expected.length || !timingSafeEqual(sig, expected)) return false;
  const expiresAt = Number(payload);
  return Number.isFinite(expiresAt) && expiresAt > Date.now();
}

export function getAuthToken(req: Request): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === "admin_token") return rest.join("=");
  }
  return undefined;
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!verifyToken(getAuthToken(req))) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}
