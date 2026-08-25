import { useEffect, useState } from "react";
import { fetchVisitStats, sendHeartbeat } from "../api/client";

const POLL_INTERVAL_MS = 60 * 1000;

export function VisitorStats() {
  const [online, setOnline] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function refresh() {
      try {
        await sendHeartbeat();
        const data = await fetchVisitStats();
        if (!cancelled) setOnline(data.online);
      } catch {
        // stats are non-critical; ignore failures
      }
    }

    refresh();
    const timer = setInterval(refresh, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  return (
    <div className="visitor-stats">
      <span className="visitor-online">
        <span className="visitor-dot" aria-hidden="true" />
        目前 {online ?? "—"} 人在線上
      </span>
    </div>
  );
}
