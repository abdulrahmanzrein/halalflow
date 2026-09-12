"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTheme } from "next-themes";
import { currencySymbol } from "@/lib/fixtures";
import { useAppData } from "@/hooks/use-app-data";
import { useUser } from "@/hooks/use-user";
import { VerdictStrip } from "@/components/dashboard/verdict-strip";
import {
  estimateCorrespondentFees,
  PER_HOP_USD,
  BENEFICIARY_USD,
} from "@/lib/correspondent-fees";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, ReferenceLine,
} from "recharts";
import { Bot, Sparkles, ArrowRight, TrendingUp } from "lucide-react";

/* ------------------------------------------------------------------ */
/* Config                                                              */
/* ------------------------------------------------------------------ */

// Rank -> opacity for the spread bar. One hue from the theme, so the scale stays
// on-palette. Intensity rises with rank: the worst provider loses the most and
// reads the strongest, the best barely registers.
function rankOpacity(i: number, n: number): number {
  if (n <= 1) return 1;
  return 0.32 + (i / (n - 1)) * 0.68;
}

const DESCRIPTIONS: Record<string, string> = {
  Wise:            "Real mid market rate with a transparent flat fee. Best for small businesses.",
  Instarem:        "Regulated remittance provider. Small spread on top of mid market.",
  "Deutsche Bank": "Traditional bank wire. Bakes the FX spread into the exchange rate.",
  "Western Union": "Retail remittance service. Widest spread of the tested providers.",
  PayPal:          "Consumer payment platform. Adds a large FX conversion margin.",
};

// Fade-reveal timing (ms) — plays once per mount (fires on every navigation to /dashboard)
const STAGGER = 95;

// Advisor tile motes. Staggered so they never pulse in unison; long durations
// keep the drift ambient rather than something that pulls the eye off the data.
const ADVISOR_MOTES = [
  { left: "9%",  top: "62%", size: 10, duration: 15, delay: 0,   alpha: 0.16 },
  { left: "23%", top: "78%", size: 6,  duration: 19, delay: 3.4, alpha: 0.12 },
  { left: "37%", top: "56%", size: 14, duration: 17, delay: 1.1, alpha: 0.09 },
  { left: "51%", top: "84%", size: 8,  duration: 21, delay: 5.6, alpha: 0.14 },
  { left: "64%", top: "66%", size: 11, duration: 16, delay: 2.3, alpha: 0.11 },
  { left: "79%", top: "80%", size: 7,  duration: 20, delay: 7.2, alpha: 0.15 },
  { left: "90%", top: "58%", size: 12, duration: 18, delay: 4.1, alpha: 0.08 },
];

/* ------------------------------------------------------------------ */
/* Small helpers / hooks                                              */
/* ------------------------------------------------------------------ */

/** Whole days since a provider's rate was collected — quotes are not all same-day. */
function quoteAgeDays(iso?: string): number {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.floor((Date.now() - t) / 86_400_000));
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(m.matches);
    const on = () => setReduced(m.matches);
    m.addEventListener?.("change", on);
    return () => m.removeEventListener?.("change", on);
  }, []);
  return reduced;
}

// Re-animates from 0 whenever `cycle` changes (so numbers re-count each reveal).
function useReCountUp(target: number, cycle: number, reduced: boolean, duration = 1400) {
  const [v, setV] = useState(reduced ? target : 0);
  useEffect(() => {
    if (reduced) { setV(target); return; }
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min((now - t0) / duration, 1);
      setV(target * (1 - Math.pow(1 - p, 3)));       // easeOutCubic
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, cycle, duration, reduced]);
  return v;
}

// Width-fill bar that replays whenever `cycle` changes.
function AnimatedBar({
  width, color, cycle, reduced, delay = 0,
}: { width: string; color: string; cycle: number; reduced: boolean; delay?: number }) {
  const [w, setW] = useState("0%");
  useEffect(() => {
    if (reduced) { setW(width); return; }
    setW("0%");
    const t = setTimeout(() => setW(width), 60 + delay);
    return () => clearTimeout(t);
  }, [cycle, width, delay, reduced]);
  return (
    <div
      className="h-full rounded-full"
      style={{ width: w, background: color, transition: "width 900ms cubic-bezier(0.16,1,0.3,1)" }}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function DashboardPage() {
  const d = useAppData();
  const user = useUser();
  const reduced = usePrefersReducedMotion();
  const { resolvedTheme } = useTheme();
  const [themeMounted, setThemeMounted] = useState(false);
  useEffect(() => setThemeMounted(true), []);
  const isDark = themeMounted && resolvedTheme === "dark";

  // ---- fade-reveal state (plays once per mount) ----
  const [visible, setVisible] = useState(false);
  const [cycle, setCycle] = useState(0);
  const [openProvider, setOpenProvider] = useState<string | null>(null);

  useEffect(() => {
    if (d.loading) return;
    if (reduced) { setVisible(true); setCycle(1); return; }

    // Small delay so the browser has a paint frame at opacity: 0 first,
    // otherwise the transition won't fire and the cards just pop in.
    const t = window.setTimeout(() => {
      setCycle(1);      // triggers count-ups + bar fills
      setVisible(true); // triggers the staggered fade-in
    }, 100);
    return () => clearTimeout(t);
  }, [d.loading, reduced]);

  // ---- derived data (safe with fallback while loading) ----
  const sym = currencySymbol(d.toCurrency);
  const mid = d.trueCostToday;
  const ranked = [...d.providers].sort((a, b) => b.received - a.received);
  const minR = Math.min(...ranked.map((p) => p.received), mid);
  const widthFor = (v: number) => `${30 + ((v - minR) / ((mid - minR) || 1)) * 70}%`;

  const slices = ranked.map((p, i) => ({
    name: p.name,
    received: p.received,
    markup: Math.max(1, mid - p.received),
    opacity: rankOpacity(i, ranked.length),
    description: DESCRIPTIONS[p.name] ?? "Provider quote from Wise Comparison API.",
  }));
  const totalSpread = slices.reduce((s, x) => s + x.markup, 0);

  // Count-up hooks called at top level (Rules of Hooks safe)
  const midAnim    = useReCountUp(mid, cycle, reduced);
  const bestAnim   = useReCountUp(d.bestProvider.received, cycle, reduced);
  const spreadAnim = useReCountUp(totalSpread, cycle, reduced);

  // Applies the fade to any element; `i` sets the stagger order on the way in.
  const fade = (i: number): React.CSSProperties => ({
    opacity: visible ? 1 : 0,
    transform: visible ? "none" : "translateY(16px) scale(0.985)",
    filter: visible ? "none" : "blur(7px)",
    transition:
      "opacity 0.72s cubic-bezier(.22,.61,.36,1), transform 0.78s cubic-bezier(.22,.61,.36,1), filter 0.72s ease",
    transitionDelay: visible ? `${i * STAGGER}ms` : "0ms",
    willChange: "opacity, transform, filter",
  });

  if (d.loading) return <DashboardSkeleton />;

  const chartData = d.rateHistory.length ? d.rateHistory : [{ day: "…", rate: d.ecbRateToday }];
  const money = (n: number) => `${sym}${Math.round(n).toLocaleString()}`;

  // Cost breakdown rows — every value carries its source, as the old /cost page did.
  const breakdown = [
    {
      label: "Invoice amount",
      note: "your input",
      value: `${currencySymbol(d.fromCurrency)}${d.invoiceAmount.toLocaleString()}`,
    },
    { label: "ECB mid market rate", note: d.rateSource, value: d.ecbRateToday.toFixed(4) },
    { label: "True mid market cost", note: "invoice × rate", value: money(mid) },
    { label: "Implied customer quote", note: "invoice-day rate × (1 + target margin)", value: money(d.revenue) },
    {
      label: "Margin today",
      note: "(quote − true cost) / quote",
      value: `${d.marginToday.toFixed(1)}%`,
      good: d.marginToday >= 0,
    },
    {
      label: `Best: ${d.bestProvider.name}`,
      note: "Wise Comparison API",
      value: money(d.bestProvider.received),
    },
    {
      label: `Worst: ${d.worstProvider.name}`,
      note: "Wise Comparison API",
      value: money(d.worstProvider.received),
    },
    {
      label: "Saving by switching",
      note: "best vs worst",
      value: money(d.savingVsWorst),
      good: true,
    },
  ];

  const card =
    "rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-5 flex flex-col min-h-0 overflow-hidden";

  return (
    // Adjust the calc() offset to match your app-shell header height so it fits one screen.
    <div className="flex flex-col gap-4 lg:h-[calc(100dvh-4.75rem)]">

      {/* Header — greeting + name, then invoice summary */}
      <header style={fade(0)}>
        <h1 className="font-serif text-3xl md:text-4xl font-normal text-[var(--color-fg)]">
          {user.name ? (
            <>
              Welcome back,{" "}
              <span className="text-[var(--color-primary)]">{user.name}</span>
            </>
          ) : (
            "Welcome back"
          )}
        </h1>
        <p className="text-[var(--color-muted-fg)] mt-2 text-sm">
          Your{" "}
          <span className="font-money tabular text-[var(--color-fg)]">
            {currencySymbol(d.fromCurrency)}{d.invoiceAmount.toLocaleString()}
          </span>{" "}
          supplier invoice, <span className="tabular">{d.daysUntilDue}</span> days on terms.
        </p>
      </header>

      <div style={fade(1)}>
        <VerdictStrip d={d} />
      </div>

      <div className="grid gap-4 flex-1 min-h-0 lg:grid-cols-[1fr_1.12fr] lg:grid-rows-2">

        {/* 1 — Compare banks (top N) */}
        <section className={card} style={fade(1)}>
          <span className="text-xs font-medium text-[var(--color-muted-fg)]">
            Compare banks. {ranked.length} providers. Scroll for all, tap a row for detail.
          </span>

          <div className="flex items-end justify-between gap-3 pb-3 mt-1 border-b border-[var(--color-border)]">
            <div>
              <div className="text-xs font-medium" style={{ color: "var(--color-primary)" }}>True mid market</div>
              <div className="font-money text-3xl font-bold tabular text-[var(--color-fg)] leading-none mt-2">
                {money(midAnim)}
              </div>
              <div className="h-[7px] rounded-full overflow-hidden mt-2 bg-[var(--color-muted)]">
                <AnimatedBar width="100%" color="var(--color-primary)" cycle={cycle} reduced={reduced} />
              </div>
            </div>
            <div className="text-right text-[11px] text-[var(--color-muted-fg)] tabular shrink-0">
              <div>ECB {d.fromCurrency}/{d.toCurrency} {d.ecbRateToday.toFixed(4)}</div>
              <div className="mt-1">{currencySymbol(d.fromCurrency)}{d.invoiceAmount.toLocaleString()} invoice</div>
            </div>
          </div>

          <ul className="slim-scroll fade-bottom mt-4 flex flex-1 min-h-0 flex-col gap-4 overflow-y-auto pr-2">
            {ranked.map((p, i) => {
              const gap = mid - p.received;
              const isBest = i === 0;
              const open = openProvider === p.name;
              return (
                <li key={p.name} className="flex flex-col gap-2">
                  <button
                    onClick={() => setOpenProvider(open ? null : p.name)}
                    aria-expanded={open}
                    className="flex items-center justify-between gap-2 text-left text-sm transition-opacity hover:opacity-80"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="w-4 shrink-0 text-xs tabular text-[var(--color-muted-fg)]">{i + 1}</span>
                      <span className="truncate font-medium text-[var(--color-fg)]">{p.name}</span>
                      {isBest && (
                        <span
                          className="shrink-0 rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider"
                          style={{ color: "var(--color-primary)", borderColor: "var(--color-primary)" }}
                        >
                          mid market
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 font-money tabular text-[var(--color-fg)]">{money(p.received)}</span>
                  </button>

                  <div className="h-[7px] overflow-hidden rounded-full bg-[var(--color-muted)]">
                    <AnimatedBar
                      width={widthFor(p.received)}
                      color="var(--color-primary)"
                      cycle={cycle}
                      reduced={reduced}
                      delay={i * 60}
                    />
                  </div>

                  <div className="text-[11px] leading-relaxed text-[var(--color-muted-fg)]">
                    {gap > 0 ? (
                      <>
                        Costs you{" "}
                        <span className="font-money tabular" style={{ color: "var(--color-negative)" }}>
                          {money(gap)}
                        </span>{" "}
                        vs mid market
                        {/* The stated fee and the rate markup are different charges. The
                            markup is the one that never appears on the invoice, so it is
                            shown from the provider's own quote rather than derived. */}
                        {typeof p.markup_pct === "number" && (
                          <>
                            {". "}
                            <span
                              className="tabular font-medium"
                              style={{ color: p.markup_pct > 0 ? "var(--color-negative)" : "var(--color-primary)" }}
                            >
                              {p.markup_pct > 0 ? `${p.markup_pct}% rate markup` : "no rate markup"}
                            </span>
                          </>
                        )}
                        {typeof p.transfer_fee === "number" && (
                          <>
                            {" + "}
                            <span className="tabular">
                              {p.transfer_fee > 0
                                ? `${money(p.transfer_fee * d.ecbRateToday)} stated fee`
                                : "no stated fee"}
                            </span>
                          </>
                        )}
                      </>
                    ) : (
                      <span style={{ color: "var(--color-primary)" }}>At mid market. No hidden spread.</span>
                    )}
                    {quoteAgeDays(p.quoted_at) > 1 && (
                      <span className="ml-1.5 text-[var(--color-warning)]">
                        Rate quoted {quoteAgeDays(p.quoted_at)} days ago.
                      </span>
                    )}
                  </div>

                  {(() => {
                    const est = estimateCorrespondentFees(p.provider_type);
                    if (!est) return null;
                    return (
                      <p
                        className="text-[11px] leading-relaxed"
                        style={{ color: "var(--color-warning)" }}
                      >
                        Bank wires can leave your supplier US${est.minUsd} to ${est.maxUsd} short
                        of what this quote shows. The payment often passes through {est.hopsMin} to {est.hopsMax}{" "}
                        correspondent banks, and each can take a fee the quote does not show.
                      </p>
                    );
                  })()}

                  {open && (
                    <p className="rounded-lg bg-[var(--color-muted)] px-3 py-2 text-[11px] leading-relaxed text-[var(--color-muted-fg)]">
                      {DESCRIPTIONS[p.name] ?? "Provider quote from Wise Comparison API."}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>

          <p className="mt-3 shrink-0 border-t border-[var(--color-border)] pt-3 text-[10.5px] leading-relaxed text-[var(--color-muted-fg)]">
            Correspondent estimates are a published range, not a firm quote.
            Expect about US${PER_HOP_USD.min} to ${PER_HOP_USD.max} per intermediary bank
            plus a US${BENEFICIARY_USD.min} to ${BENEFICIARY_USD.max} receiving fee.
            These are not knowable before the transfer completes. Source: Airwallex.
          </p>
        </section>

        {/* 2 — Best provider net + rate history */}
        <section className={card} style={fade(2)}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[var(--color-muted-fg)]">Best provider net received</span>
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold rounded-full px-2.5 py-1"
              style={{ color: "#3DD68C", background: "rgba(61,214,140,.12)" }}>
              <TrendingUp className="h-3.5 w-3.5" /> Favorable
            </span>
          </div>
          <div className="font-money text-3xl font-bold tabular text-[var(--color-fg)] leading-none mt-2">
            {money(bestAnim)}
          </div>
          <div className="text-[11px] text-[var(--color-muted-fg)] mt-1.5">
            {d.bestProvider.name}. Mid market rate. No hidden spread.
          </div>

          <div className="flex-1 min-h-0 mt-2 -mx-2">
            <ResponsiveContainer key={cycle} width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 6, right: 8, bottom: 0, left: -28 }}>
                <defs>
                  <linearGradient id="rateFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3DD68C" stopOpacity={0.32} />
                    <stop offset="100%" stopColor="#3DD68C" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--color-border)" vertical={false} />
                <XAxis dataKey="day" tick={{ fontSize: 10, fill: "var(--color-muted-fg)" }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                <YAxis domain={["auto", "auto"]} tick={{ fontSize: 10, fill: "var(--color-muted-fg)" }} axisLine={false} tickLine={false} tickFormatter={(v) => v.toFixed(3)} />
                <Tooltip content={<RateTooltip sym={sym} invoiceAmount={d.invoiceAmount} />} />
                <ReferenceLine y={d.ecbRateInvoiceDay} stroke="var(--color-muted-fg)" strokeDasharray="4 3" strokeOpacity={0.4} />
                <Area type="monotone" dataKey="rate" stroke="#3DD68C" strokeWidth={2} fill="url(#rateFill)" dot={false}
                  animationDuration={900} animationEasing="ease-out" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* 3 — Cost breakdown (same top N) */}
        <section className={card} style={fade(3)}>
          <span className="text-xs font-medium text-[var(--color-muted-fg)]">Cost breakdown. Where your margin goes.</span>

          <div className="mt-2">
            <div className="font-money text-3xl font-bold leading-none tabular" style={{ color: "var(--color-negative)" }}>
              {money(spreadAnim)}
            </div>
            <p className="mt-1.5 text-[11px] text-[var(--color-muted-fg)]">
              total spread lost across {slices.length} providers vs the ECB mid market
            </p>
          </div>

          {/* Spread distribution — each segment sized by that provider's cut */}
          <div className="mt-4 flex h-3 gap-[2px] overflow-hidden rounded-full">
            {slices.map((s) => (
              <span
                key={s.name}
                className="min-w-[3px] rounded-[2px]"
                style={{
                  flex: `${s.markup} 1 0`,
                  background: "var(--color-negative)",
                  opacity: s.opacity,
                }}
                title={`${s.name}: ${money(s.markup)} lost`}
              />
            ))}
          </div>
          <p className="mt-2 text-[11px] text-[var(--color-muted-fg)]">
            Best to worst, left to right. Full list in Compare banks.
          </p>

          {/* Every figure labelled with where it came from */}
          <dl className="mt-4 flex flex-1 min-h-0 flex-col justify-between gap-1 border-t border-[var(--color-border)] pt-3 text-[12px]">
            {breakdown.map((row) => (
              <div key={row.label} className="flex items-baseline justify-between gap-3">
                <dt className="min-w-0">
                  <span className="block truncate text-[var(--color-fg)]">{row.label}</span>
                  <span className="block text-[10.5px] text-[var(--color-muted-fg)]">{row.note}</span>
                </dt>
                <dd
                  className="shrink-0 font-money tabular font-semibold"
                  style={{ color: row.good ? "var(--color-primary)" : "var(--color-fg)" }}
                >
                  {row.value}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        {/* 4 — HalalFlow AI Advisor */}
        <section
          className="relative rounded-2xl p-5 flex flex-col min-h-0 overflow-hidden border"
          style={{
            ...fade(4),
            borderColor: isDark ? "rgba(34,197,94,0.30)" : "rgba(22,163,74,0.30)",
            background: isDark
              ? "radial-gradient(88% 58% at 50% 103%, rgba(34,197,94,0.62), rgba(34,197,94,0.20) 38%, rgba(34,197,94,0.05) 60%, transparent 78%), linear-gradient(to top, #07130A, #050505 62%)"
              : "radial-gradient(88% 58% at 50% 103%, rgba(22,163,74,0.34), rgba(22,163,74,0.12) 38%, rgba(22,163,74,0.03) 60%, transparent 78%), linear-gradient(to top, #EAF7ED, #FFFFFF 62%)",
          }}
        >
          {/* Decorative motes rising out of the glow */}
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
            {ADVISOR_MOTES.map((m, i) => (
              <span
                key={i}
                className="advisor-mote absolute rounded-[3px]"
                style={{
                  left: m.left,
                  top: m.top,
                  width: m.size,
                  height: m.size,
                  background: isDark
                    ? `rgba(74,222,128,${m.alpha})`
                    : `rgba(22,163,74,${m.alpha * 0.9})`,
                  "--rise-duration": `${m.duration}s`,
                  "--rise-delay": `${m.delay}s`,
                } as React.CSSProperties}
              />
            ))}
          </div>

          <div
            className="rounded-2xl grid place-items-center relative z-10"
            style={{
              width: 52, height: 52,
              background: "radial-gradient(circle at 30% 30%, #4ADE80, #16A34A)",
              boxShadow:  isDark ? "0 0 26px rgba(34,197,94,0.45)" : "0 4px 18px rgba(22,163,74,0.35)",
            }}
          >
            <Bot className="h-6 w-6" style={{ color: "#04120A" }} />
          </div>
          <h3 className="font-serif text-xl font-normal mt-3.5 relative z-10" style={{ color: "var(--color-fg)" }}>
            HalalFlow AI Advisor
          </h3>
          <p className="text-[12.5px] leading-relaxed mt-2 relative z-10" style={{ color: "var(--color-muted-fg)" }}>
            Automated margin protection, real time rate insight, and Sharia aligned hedging guidance, grounded in cited sources, never a fatwa.
          </p>
          <div className="flex gap-2.5 mt-auto pt-4 relative z-10">
            <Link
              href="/ask"
              className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 transition-opacity"
              style={{ background: "linear-gradient(135deg, #16A34A, #22C55E)", color: "#04120A" }}
            >
              <Sparkles className="h-4 w-4" /> Try now
            </Link>
            <Link
              href="/risk"
              className="inline-flex items-center gap-2 rounded-lg border border-[var(--color-border)] px-4 py-2.5 text-sm font-medium text-[var(--color-fg)] hover:bg-[var(--color-muted)] transition-colors"
            >
              See risk <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>

      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Tooltips + skeleton                                                 */
/* ------------------------------------------------------------------ */

function RateTooltip({ active, payload, label, sym, invoiceAmount }: any) {
  if (!active || !payload?.length) return null;
  const rate = payload[0]?.value as number;
  return (
    <div className="rounded-xl border px-3 py-2.5 text-xs shadow-lg"
      style={{ background: "var(--color-card)", borderColor: "var(--color-border)", minWidth: 130 }}>
      <p className="text-[10px] mb-1" style={{ color: "var(--color-muted-fg)" }}>{label}</p>
      <p className="font-money font-bold text-sm tabular text-[var(--color-fg)]">{rate.toFixed(4)}</p>
      <p className="text-[10px] mt-0.5" style={{ color: "var(--color-muted-fg)" }}>
        invoice ≈ {sym}{Math.round(invoiceAmount * rate).toLocaleString()}
      </p>
    </div>
  );
}

function DashboardSkeleton() {
  const box = "animate-pulse rounded-2xl bg-[var(--color-muted)]";
  return (
    <div className="flex flex-col gap-4 lg:h-[calc(100dvh-4.75rem)]">
      <div className={`${box} h-12 w-64`} />
      <div className="grid gap-4 flex-1 min-h-0 lg:grid-cols-[1fr_1.12fr] lg:grid-rows-2">
        <div className={box} /><div className={box} /><div className={box} /><div className={box} />
      </div>
    </div>
  );
}
