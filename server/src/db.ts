import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, "..", "data");
mkdirSync(dataDir, { recursive: true });

export const db = new Database(join(dataDir, "shop.db"));
db.pragma("journal_mode = WAL");

export function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE
    );
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      specs TEXT DEFAULT '',
      price INTEGER NOT NULL,
      image_url TEXT,
      stock INTEGER DEFAULT 0,
      category_id INTEGER REFERENCES categories(id),
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS visit_stats (
      visitor_id TEXT PRIMARY KEY,
      first_seen_at INTEGER NOT NULL,
      last_seen_at INTEGER NOT NULL
    );
  `);
}
