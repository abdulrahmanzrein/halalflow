"use client";
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { TickerQuote } from "@/lib/fx";

function Sparkline({ points, up }: { points: number[]; up: boolean }) {
  if (points.length < 2) return <span className="w-[52px]" />;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const coords = points
    .map((p, i) => `${(i / (points.length - 1)) * 52},${15 - ((p - min) / span) * 12}`)
    .join(" ");
  return (
    <svg width="52" height="17" viewBox="0 0 52 17" fill="none" aria-hidden="true">
      <polyline
        points={coords}
        fill="none"
        stroke={up ? "var(--color-positive)" : "var(--color-negative)"}
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** ECB reference rates publish on TARGET business days, around 16:00 CET. */
function marketIsOpen(): boolean {
  const day = new Date().getUTCDay();
  return day !== 0 && day !== 6;
}

export function MarketTicker() {
  const [quotes, setQuotes] = useState<TickerQuote[] | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/ticker")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("ticker"))))
      .then((data: TickerQuote[]) => {
        if (!cancelled) setQuotes(data);
      })
      .catch(() => {
        if (!cancelled) setQuotes([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function scrollBy(direction: 1 | -1) {
    scroller.current?.scrollBy({ left: direction * 300, behavior: "smooth" });
  }

  // Nothing useful to show if the feed is unreachable — stay out of the way.
  if (quotes?.length === 0) return null;

  const open = marketIsOpen();

  return (
    <div className="flex h-11 shrink-0 items-center gap-1 border-b border-[var(--color-border)] bg-[var(--color-card)] pl-4 min-[920px]:pl-4 max-[919px]:pl-16">
      <span className="hidden sm:flex shrink-0 items-center gap-2 pr-3 text-[11px] text-[var(--color-muted-fg)]">
        <span
          className="h-1.5 w-1.5 rounded-full"
          style={{ background: open ? "var(--color-positive)" : "var(--color-muted-fg)" }}
        />
        {open ? "Market open" : "Market closed"}
      </span>

      <button
        onClick={() => scrollBy(-1)}
        aria-label="Scroll rates left"
        className="hidden sm:flex h-6 w-6 shrink-0 items-center justify-center rounded text-[var(--color-muted-fg)] transition-[color,background-color,scale] duration-150 hover:bg-[var(--color-muted)] hover:text-[var(--color-fg)] active:scale-[0.96]"
      >
        <ChevronLeft size={14} />
      </button>

      <div
        ref={scroller}
        className="no-scrollbar flex flex-1 items-center gap-0.5 overflow-x-auto"
      >
        {quotes === null
          ? Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex shrink-0 items-center gap-2 px-2.5 py-1.5">
                <div className="h-3 w-14 animate-pulse rounded bg-[var(--color-muted)]" />
                <div className="h-3 w-10 animate-pulse rounded bg-[var(--color-muted)]" />
              </div>
            ))
          : quotes.map((q) => {
              const up = q.change_pct >= 0;
              return (
                <div
                  key={q.pair}
                  className="flex shrink-0 items-center gap-2 rounded-md px-2.5 py-1.5 transition-colors hover:bg-[var(--color-muted)]"
                  title={`${q.from}/${q.to} ${q.rate.toFixed(4)}, 30-day change`}
                >
                  <span className="whitespace-nowrap text-[11.5px] font-semibold text-[var(--color-fg)]">
                    {q.from}/{q.to}
                  </span>
                  <span className="font-mono tabular text-[11px] text-[var(--color-muted-fg)]">
                    {q.rate.toFixed(4)}
                  </span>
                  <Sparkline points={q.spark} up={up} />
                  <span
                    className="font-mono tabular whitespace-nowrap text-[11px] font-semibold"
                    style={{ color: up ? "var(--color-positive)" : "var(--color-negative)" }}
                  >
                    {up ? "+" : ""}
                    {q.change_pct.toFixed(2)}%
                  </span>
                </div>
              );
            })}
      </div>

      <button
        onClick={() => scrollBy(1)}
        aria-label="Scroll rates right"
        className="hidden sm:flex mr-2 h-6 w-6 shrink-0 items-center justify-center rounded text-[var(--color-muted-fg)] transition-[color,background-color,scale] duration-150 hover:bg-[var(--color-muted)] hover:text-[var(--color-fg)] active:scale-[0.96]"
      >
        <ChevronRight size={14} />
      </button>
    </div>
  );
}
