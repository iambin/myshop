import { Router } from "express";
import { db } from "../db.js";

export const statsRouter = Router();

// A visitor counts as "online" if we received a heartbeat within this window
const ONLINE_WINDOW_MS = 5 * 60 * 1000;
const MAX_VISITOR_ID_LENGTH = 64;
// Rate limit: max one heartbeat per visitor_id per 30 seconds
const HEARTBEAT_COOLDOWN_MS = 30 * 1000;
// Max distinct visitors in the table before pruning starts
const MAX_STAT_ROWS = 5000;

function parseVisitorId(body: unknown): string | null {
  const id = (body as Record<string, unknown> | null)?.visitorId;
  if (typeof id !== "string") return null;
  const trimmed = id.trim();
  if (!trimmed || trimmed.length > MAX_VISITOR_ID_LENGTH) return null;
  return trimmed;
}

statsRouter.post("/heartbeat", (req, res) => {
  const visitorId = parseVisitorId(req.body);
  if (!visitorId) {
    res.status(400).json({ error: "visitorId is required" });
    return;
  }
  const now = Date.now();
  // Throttle duplicate heartbeats from the same visitor
  const last = db.prepare("SELECT last_seen_at FROM visit_stats WHERE visitor_id = ?").get(visitorId) as
    | { last_seen_at: number }
    | undefined;
  if (last && now - last.last_seen_at < HEARTBEAT_COOLDOWN_MS) {
    res.json({ ok: true });
    return;
  }
  db.prepare(
    `INSERT INTO visit_stats (visitor_id, first_seen_at, last_seen_at)
     VALUES (?, ?, ?)
     ON CONFLICT(visitor_id) DO UPDATE SET last_seen_at = excluded.last_seen_at`
  ).run(visitorId, now, now);
  res.json({ ok: true });
});

function startOfToday(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// Week starts on Monday
function startOfWeek(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  return d.getTime();
}

function startOfMonth(): number {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

statsRouter.get("/visits", (_req, res) => {
  const now = Date.now();
  // Period counts are based on last activity so returning visitors are counted
  const countSince = db.prepare(
    "SELECT COUNT(*) AS n FROM visit_stats WHERE last_seen_at >= ?"
  );
  res.json({
    online: (
      db
        .prepare("SELECT COUNT(*) AS n FROM visit_stats WHERE last_seen_at > ?")
        .get(now - ONLINE_WINDOW_MS) as { n: number }
    ).n,
    today: (countSince.get(startOfToday()) as { n: number }).n,
    week: (countSince.get(startOfWeek()) as { n: number }).n,
    month: (countSince.get(startOfMonth()) as { n: number }).n,
    total: (
      db.prepare("SELECT COUNT(*) AS n FROM visit_stats").get() as { n: number }
    ).n,
  });
});
