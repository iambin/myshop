import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
// DATA_DIR override lets tests run against a throwaway directory
export const DATA_DIR = process.env.DATA_DIR
  ? resolve(process.env.DATA_DIR)
  : join(__dirname, "..", "data");
mkdirSync(DATA_DIR, { recursive: true });

export const db = new Database(join(DATA_DIR, "shop.db"));
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
  // Migrations for databases created before the listing/sort columns existed.
  addColumnIfMissing("products", "is_active", "INTEGER NOT NULL DEFAULT 1");
  addColumnIfMissing("products", "sort_order", "INTEGER NOT NULL DEFAULT 999");
  addColumnIfMissing("categories", "is_active", "INTEGER NOT NULL DEFAULT 1");
  addColumnIfMissing("categories", "sort_order", "INTEGER NOT NULL DEFAULT 99");
}

function addColumnIfMissing(table: string, column: string, ddl: string) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
  }
}

// Run at import time: route modules prepare statements while loading,
// which fails on a fresh empty database if the schema doesn't exist yet.
initSchema();
