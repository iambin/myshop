import { useEffect, useState } from "react";
import type { VisitStats } from "../types";
import { fetchVisitStats } from "../api/client";

const POLL_INTERVAL_MS = 60 * 1000;

export function VisitStatsPanel() {
  const [stats, setStats] = useState<VisitStats | null>(null);

  useEffect(() => {
    let cancelled = false;

    function refresh() {
      fetchVisitStats()
        .then((data) => {
          if (!cancelled) setStats(data);
        })
        .catch(() => {
          // stats are non-critical; keep last known values
        });
    }

    refresh();
    const timer = setInterval(refresh, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const items: Array<{ label: string; value: number | undefined }> = [
    { label: "今日進站", value: stats?.today },
    { label: "本周進站", value: stats?.week },
    { label: "本月進站", value: stats?.month },
    { label: "總進站", value: stats?.total },
  ];

  return (
    <section className="visit-stats-panel" aria-label="進站統計">
      <h2>進站統計</h2>
      <div className="stats-grid">
        {items.map((item) => (
          <div className="stat-card" key={item.label}>
            <span className="stat-value">{item.value ?? "—"}</span>
            <span className="stat-label">{item.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
