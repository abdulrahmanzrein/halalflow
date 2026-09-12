"use client";
import { useState, useEffect } from "react";
import { currencySymbol } from "@/lib/fixtures";
import { useAppData } from "@/hooks/use-app-data";
import { usePageFade } from "@/components/page-fade";
import { Badge } from "@/components/ui/badge";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer, ReferenceLine, ReferenceDot, CartesianGrid,
} from "recharts";
import type { MouseHandlerDataParam } from "recharts";

// Hardcoded for SVG — CSS vars don't resolve inside SVG attribute strings
const LINE_COLOR = "#f87171";

type RatePoint = { date: string; rate: number };
type SelectedPoint = RatePoint & { cost: number; diff: number };

/** The headline answer, in words a first-time importer can act on. */
const VERDICT = {
  pay_now: {
    label: "Lean towards paying now",
    variant: "success" as const,
    plain: "Today's rate is good relative to how this pair usually moves. Waiting risks more than it stands to gain.",
  },
  wait: {
    label: "Lean towards waiting",
    variant: "warning" as const,
    plain: "Today's rate is poor relative to how this pair usually moves. You have room on the calendar to wait.",
  },
  marginal: {
    label: "Too close to call",
    variant: "muted" as const,
    plain: "Neither paying now nor waiting is clearly better. If a stable bill matters more to you than a slightly cheaper one, pay now.",
  },
};

function Stat({
  label, value, sub, tone = "neutral",
}: {
  label: string;
  value: string;
  sub: string;
  tone?: "neutral" | "good" | "bad";
}) {
  const color =
    tone === "good" ? "var(--color-positive)"
    : tone === "bad" ? "var(--color-negative)"
    : "var(--color-fg)";
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-5">
      <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--color-muted-fg)]">
        {label}
      </p>
      <p className="font-money mt-2 text-[30px] font-bold leading-none tabular" style={{ color }}>
        {value}
      </p>
      <p className="mt-2 text-xs leading-relaxed text-[var(--color-muted-fg)]">{sub}</p>
    </div>
  );
}

export default function RiskPage() {
  const d = useAppData();
  const { fade } = usePageFade();
  const [rateData, setRateData] = useState<RatePoint[]>([]);
  const [chartLoading, setChartLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [selected, setSelected] = useState<SelectedPoint | null>(null);

  const pair = `${d.fromCurrency}-${d.toCurrency}`;

  useEffect(() => {
    let alive = true;
    fetch(`/api/history?pair=${pair}&years=1`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("fetch failed"))))
      .then((data: { rates: Record<string, number> }) => {
        if (!alive) return;
        setRateData(
          Object.entries(data.rates)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([date, rate]) => ({ date, rate })),
        );
        // A pinned day belongs to the pair it was picked from.
        setSelected(null);
        setFetchError(false);
      })
      .catch(() => alive && setFetchError(true))
      .finally(() => alive && setChartLoading(false));
    return () => { alive = false; };
  }, [pair]);

  function handleChartClick(next: MouseHandlerDataParam) {
    const i = Number(next.activeTooltipIndex);
    const p = Number.isFinite(i) ? rateData[i] : undefined;
    if (!p) return;
    const cost = Math.round(d.invoiceAmount * p.rate);
    setSelected({ ...p, cost, diff: cost - d.trueCostToday });
  }

  const sym = currencySymbol(d.toCurrency);
  const money = (n: number) => `${sym}${Math.round(n).toLocaleString()}`;

  const firstPoint = rateData[0];
  const currentPoint = rateData[rateData.length - 1];
  const yearChangePct =
    firstPoint && currentPoint
      ? ((currentPoint.rate - firstPoint.rate) / firstPoint.rate) * 100
      : null;

  const rates = rateData.map((p) => p.rate);
  const minRate = rates.length ? Math.min(...rates) * 0.997 : 1.4;
  const maxRate = rates.length ? Math.max(...rates) * 1.003 : 1.6;
  const xInterval = Math.max(1, Math.floor(rateData.length / 6));

  const fmtDate = (iso: string) =>
    new Date(iso + "T00:00:00").toLocaleDateString("en-CA", { month: "short", day: "numeric" });

  // The swing that shows up in the worst 1-in-20 stretches, priced on this invoice.
  const swingPct = d.worst5pctMove;
  const cheaper = d.trueCostToday * (1 - swingPct / 100);
  const dearer = d.trueCostToday * (1 + swingPct / 100);
  const driftMoney = Math.abs(d.trueCostToday * (d.driftTodayPct / 100));

  const v = VERDICT[d.decision];

  return (
    <div className="space-y-6">
      <div style={fade(0)}>
        <h1 className="font-serif text-3xl font-semibold text-[var(--color-fg)]">Risk explorer</h1>
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-[var(--color-muted-fg)]">
          Exchange rates move every day. This page shows how much your{" "}
          <span className="font-money tabular text-[var(--color-fg)]">
            {currencySymbol(d.fromCurrency)}{d.invoiceAmount.toLocaleString()}
          </span>{" "}
          bill could move with them before it is due in {d.daysUntilDue} days.
        </p>
      </div>

      {/* The answer, first */}
      <section
        className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-5"
        style={fade(1)}
      >
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="font-semibold text-[var(--color-fg)]">Should you pay now or wait?</h2>
          <Badge variant={v.variant}>{v.label}</Badge>
        </div>
        <p className="mt-2.5 max-w-3xl text-sm leading-relaxed text-[var(--color-fg)]">{v.plain}</p>
        <p className="mt-2 max-w-3xl text-xs leading-relaxed text-[var(--color-muted-fg)]">
          {d.driftTodayPct === 0
            ? `The rate has not moved in the ${d.daysSinceInvoiced} days since your invoice was issued.`
            : `In the ${d.daysSinceInvoiced} days since your invoice was issued the rate has moved ${Math.abs(d.driftTodayPct)}% ${d.driftTodayPct < 0 ? "in your favour" : "against you"}, about ${money(driftMoney)} on this bill.`}{" "}
          The bigger question is the {swingPct}% swing that shows up in the roughest 1 in 20
          stretches, which is worth about {money(dearer - d.trueCostToday)} here.
        </p>
      </section>

      {/* What the bill could actually become */}
      <section
        className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-5"
        style={fade(2)}
      >
        <h2 className="font-semibold text-[var(--color-fg)]">What your bill could become</h2>
        <p className="mt-1 max-w-3xl text-xs leading-relaxed text-[var(--color-muted-fg)]">
          We looked at every {d.daysUntilDue}-day stretch in the last 10 years, {d.histWindows} of
          them. In the roughest 1 in 20, the rate swung {swingPct}%. That is the range below. It is
          not a forecast. Nobody can predict rates.
        </p>

        <div className="mt-5">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-[11px] text-[var(--color-muted-fg)]">If it moves your way</p>
              <p
                className="font-money mt-1 text-lg font-bold tabular"
                style={{ color: "var(--color-positive)" }}
              >
                {money(cheaper)}
              </p>
            </div>
            <div className="text-center">
              <p className="text-[11px] text-[var(--color-muted-fg)]">Today</p>
              <p className="font-money mt-1 text-2xl font-bold tabular text-[var(--color-fg)]">
                {money(d.trueCostToday)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[11px] text-[var(--color-muted-fg)]">If it moves against you</p>
              <p
                className="font-money mt-1 text-lg font-bold tabular"
                style={{ color: "var(--color-negative)" }}
              >
                {money(dearer)}
              </p>
            </div>
          </div>

          <div
            className="relative mt-3 h-2.5 rounded-full"
            style={{
              background:
                "linear-gradient(to right, var(--color-positive), var(--color-muted) 50%, var(--color-negative))",
            }}
          >
            <span
              aria-hidden="true"
              className="absolute top-1/2 h-5 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--color-fg)]"
              style={{ left: "50%" }}
            />
          </div>

          <p className="mt-3 text-xs leading-relaxed text-[var(--color-muted-fg)]">
            Worst case here is{" "}
            <span className="font-money tabular" style={{ color: "var(--color-negative)" }}>
              {money(dearer - d.trueCostToday)} more
            </span>{" "}
            than paying today. That is the number worth protecting against.
          </p>
        </div>
      </section>

      {/* Three plain-language stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3" style={fade(3)}>
        <Stat
          label="Today's rate"
          value={currentPoint ? currentPoint.rate.toFixed(4) : d.ecbRateToday.toFixed(4)}
          sub={`One ${d.fromCurrency} costs this many ${d.toCurrency}, before any provider adds a markup.`}
        />
        <Stat
          label={`Since your invoice (${d.daysSinceInvoiced}d)`}
          value={`${d.driftTodayPct > 0 ? "+" : ""}${d.driftTodayPct}%`}
          tone={d.driftTodayPct < 0 ? "good" : d.driftTodayPct > 0 ? "bad" : "neutral"}
          sub={
            d.driftTodayPct === 0
              ? "The rate is unchanged since the day your invoice was issued."
              : d.driftTodayPct < 0
              ? `The rate fell, so your bill is about ${money(driftMoney)} cheaper than on the day it was issued.`
              : `The rate rose, so your bill is about ${money(driftMoney)} dearer than on the day it was issued.`
          }
        />
        <Stat
          label="Past 12 months"
          value={yearChangePct === null ? "…" : `${yearChangePct > 0 ? "+" : ""}${yearChangePct.toFixed(2)}%`}
          sub={
            yearChangePct === null
              ? "Loading a year of history."
              : `How far the rate has drifted since ${firstPoint ? fmtDate(firstPoint.date) : "last year"}. A feel for how jumpy this pair is.`
          }
        />
      </div>

      {/* History */}
      <div
        className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-5"
        style={fade(4)}
      >
        <figure>
          <h2 className="font-semibold text-[var(--color-fg)]">
            The last 12 months, day by day
          </h2>
          <p className="mt-1 mb-4 text-xs text-[var(--color-muted-fg)]">
            Higher line means a dearer bill for you. Click any day to price your invoice at that
            day&apos;s rate.
          </p>

          <figcaption className="sr-only">
            Area chart of the {d.fromCurrency}/{d.toCurrency} exchange rate over the past 12 months,
            sourced from the ECB via Frankfurter. Click any point for what the invoice would have
            cost at that historical rate.
          </figcaption>

          <div className="h-72" aria-hidden="true">
            {chartLoading && (
              <div className="flex h-full items-center justify-center">
                <p className="text-sm text-[var(--color-muted-fg)]">Loading rate history…</p>
              </div>
            )}

            {!chartLoading && fetchError && (
              <div className="flex h-full items-center justify-center">
                <p className="text-sm text-[var(--color-muted-fg)]">
                  Could not load live rates. Check your connection and refresh.
                </p>
              </div>
            )}

            {!chartLoading && !fetchError && (
              <ResponsiveContainer key={`chart-${rateData.length}`} width="100%" height="100%">
                <AreaChart
                  data={rateData}
                  margin={{ top: 8, right: 4, left: 0, bottom: 4 }}
                  onClick={handleChartClick}
                  style={{ cursor: "crosshair" }}
                >
                  <defs>
                    <linearGradient id="rateGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={LINE_COLOR} stopOpacity={0.32} />
                      <stop offset="95%" stopColor={LINE_COLOR} stopOpacity={0} />
                    </linearGradient>
                  </defs>

                  <CartesianGrid strokeDasharray="4 4" stroke="var(--color-border)" vertical={false} />

                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11, fill: "var(--color-muted-fg)" }}
                    axisLine={{ stroke: "var(--color-border)" }}
                    tickLine={false}
                    interval={xInterval}
                    tickFormatter={(x) =>
                      new Date(x + "T00:00:00").toLocaleDateString("en-CA", { month: "short" })
                    }
                  />

                  <YAxis
                    width={52}
                    domain={[minRate, maxRate]}
                    tick={{ fontSize: 11, fill: "var(--color-muted-fg)" }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(x) => x.toFixed(3)}
                  />

                  <Tooltip
                    contentStyle={{
                      background: "var(--color-card)",
                      border: "1px solid var(--color-border)",
                      borderRadius: 8,
                      fontSize: 12,
                      color: "var(--color-fg)",
                    }}
                    formatter={(x) => [(x as number).toFixed(4), `${d.fromCurrency}/${d.toCurrency}`]}
                    labelFormatter={(x) =>
                      new Date(x + "T00:00:00").toLocaleDateString("en-CA", {
                        year: "numeric", month: "short", day: "numeric",
                      })
                    }
                  />

                  {selected && (
                    <>
                      <ReferenceLine
                        x={selected.date}
                        stroke="var(--color-muted-fg)"
                        strokeDasharray="4 2"
                        strokeOpacity={0.7}
                      />
                      <ReferenceDot
                        x={selected.date}
                        y={selected.rate}
                        r={6}
                        fill={LINE_COLOR}
                        stroke="var(--color-card)"
                        strokeWidth={2}
                      />
                    </>
                  )}

                  <Area
                    dataKey="rate"
                    stroke={LINE_COLOR}
                    strokeWidth={2}
                    fill="url(#rateGrad)"
                    dot={false}
                    activeDot={{ r: 5, fill: LINE_COLOR, stroke: "var(--color-card)", strokeWidth: 2 }}
                    animationDuration={280}
                    animationEasing="ease-out"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>

          {selected && (
            <div
              className="mt-5 rounded-lg border border-[var(--color-border)] p-4"
              role="region"
              aria-label={`Scenario for ${fmtDate(selected.date)}`}
            >
              <div className="mb-3 flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-[var(--color-fg)]">
                    {fmtDate(selected.date)}, rate {selected.rate.toFixed(4)}
                  </p>
                  <p className="mt-0.5 text-xs text-[var(--color-muted-fg)]">
                    Had you paid on this day
                  </p>
                </div>
                <button
                  onClick={() => setSelected(null)}
                  className="shrink-0 text-xs text-[var(--color-muted-fg)] transition-colors hover:text-[var(--color-fg)]"
                  aria-label="Close scenario"
                >
                  ✕
                </button>
              </div>

              <div className="mb-3 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="mb-0.5 text-xs text-[var(--color-muted-fg)]">Your bill</p>
                  <p className="font-money font-bold tabular text-[var(--color-fg)]">
                    {money(selected.cost)}
                  </p>
                </div>
                <div>
                  <p className="mb-0.5 text-xs text-[var(--color-muted-fg)]">Compared with today</p>
                  <p
                    className="font-money text-sm font-bold tabular"
                    style={{
                      color:
                        selected.diff > 0 ? LINE_COLOR
                        : selected.diff < 0 ? "var(--color-positive)"
                        : "var(--color-muted-fg)",
                    }}
                  >
                    {selected.diff > 0
                      ? `${money(selected.diff)} more`
                      : selected.diff < 0
                      ? `${money(Math.abs(selected.diff))} less`
                      : "No difference"}
                  </p>
                </div>
              </div>

              <p className="mt-2 border-t border-[var(--color-border)] pt-3 text-xs leading-relaxed text-[var(--color-fg)]">
                {selected.diff > 0
                  ? "The rate was worse for you then than it is now. Today is the better of the two."
                  : selected.diff < 0
                  ? "The rate was better for you then than it is now. A reminder of how far it can move against you."
                  : "The rate that day was the same as today's."}
              </p>
            </div>
          )}

          {!selected && !chartLoading && !fetchError && (
            <p className="mt-4 text-center text-xs text-[var(--color-muted-fg)]">
              ↑ Click any day to price your invoice at that rate
            </p>
          )}
        </figure>
      </div>

      <p className="text-xs leading-relaxed text-[var(--color-muted-fg)]">
        Every figure here comes from past rates published by the European Central Bank. HalalFlow
        never predicts exchange rates and never moves your money.
      </p>
    </div>
  );
}
