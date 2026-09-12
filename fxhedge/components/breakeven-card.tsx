"use client";

import { useEffect, useState } from "react";

interface BreakevenPayload {
  break_even_rate: number;
  cushion_pct: number;
  verdict: "comfortable" | "watch" | "danger";
  verdict_reason: string;
  today_rate: number;
  today_rate_source: string;
  hist_windows: number;
  history_5pct: number;
}

// ui-context.md: never color alone — every verdict carries a text label.
// Colors come from the design tokens; no hardcoded hex.
const VERDICT_STYLE: Record<
  BreakevenPayload["verdict"],
  { pill: string; label: string }
> = {
  comfortable: {
    pill: "bg-primary-highlight text-primary",
    label: "COMFORTABLE",
  },
  watch: {
    pill: "bg-surface-offset text-warning",
    label: "WATCH",
  },
  danger: {
    pill: "bg-surface-offset text-error",
    label: "DANGER",
  },
};

export function BreakevenCard({
  invoice,
  revenue,
  pair = "EUR-CAD",
}: {
  invoice: number;
  revenue: number;
  pair?: string;
}) {
  const [data, setData] = useState<BreakevenPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/breakeven?invoice=${invoice}&revenue=${revenue}&pair=${pair}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [invoice, revenue, pair]);

  if (error)
    return (
      <div className="rounded-lg border border-border bg-surface p-6 text-sm text-error">
        Could not load your cushion: {error}
      </div>
    );
  if (!data)
    return (
      <div className="rounded-lg border border-border bg-surface p-6 text-sm text-text-muted">
        Loading your cushion…
      </div>
    );

  const style = VERDICT_STYLE[data.verdict];

  return (
    <section
      aria-label="Break-even cushion"
      className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-6"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-text-muted">
            Break-even cushion
          </p>
          <p className="text-3xl font-bold [font-feature-settings:'tnum'_1,'lnum'_1]">
            {data.cushion_pct.toFixed(1)}%
          </p>
          <p className="text-xs text-text-muted [font-feature-settings:'tnum'_1,'lnum'_1]">
            break-even {data.break_even_rate.toFixed(4)}, today {data.today_rate.toFixed(4)}{" "}
            <span className="rounded-full bg-primary-highlight px-1.5 py-0.5 text-[10px] uppercase text-primary">
              live
            </span>
          </p>
        </div>
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-semibold uppercase ${style.pill}`}
        >
          {style.label}
        </span>
      </div>
      <p className="text-sm text-text-muted">{data.verdict_reason}</p>
    </section>
  );
}
