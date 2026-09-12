"use client";
import { useState, useEffect } from "react";
import { currencySymbol, MOCK_PROFILE } from "@/lib/fixtures";
import { useAppData } from "@/hooks/use-app-data";
import { useUser } from "@/hooks/use-user";
import { useFlows } from "@/hooks/use-flows";
import { NaturalHedgeCard } from "@/components/natural-hedge-card";
import { usePageFade } from "@/components/page-fade";

interface BreakevenData {
  break_even_rate: number;
  cushion_pct: number;
  verdict: "comfortable" | "watch" | "danger";
  verdict_reason: string;
  today_rate: number;
  today_rate_source: string;
  hist_windows: number;
  /** Typical bad-stretch move over comparable historical windows (%) — powers the plain-language room sentence. */
  history_5pct: number;
}

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-[var(--color-muted)] ${className ?? ""}`} />;
}

const VERDICT = {
  comfortable: { color: "#3DD68C", bg: "rgba(61,214,140,0.12)", label: "Comfortable" },
  watch:       { color: "#FACC15", bg: "rgba(250,204,21,0.12)",  label: "Watch"       },
  danger:      { color: "#f87171", bg: "rgba(248,113,113,0.12)", label: "Danger"      },
};

export default function BreakevenPage() {
  const d = useAppData();
  const user = useUser();
  const { flows } = useFlows();
  const sym = currencySymbol(d.toCurrency);
  const pair = `${d.fromCurrency}-${d.toCurrency}`;
  const { fade } = usePageFade();

  // This business prices deals as: invoice at the invoice-day rate, plus the
  // target margin from their profile. Replaces the old hardcoded 18000, which
  // made every deal inherit Aisha's sample economics.
  const pricingRate = d.ecbRateInvoiceDay > 0 ? d.ecbRateInvoiceDay : d.ecbRateToday;
  const targetMargin = user.profile?.target_margin ?? MOCK_PROFILE.target_margin;
  const revenue = Math.round(d.invoiceAmount * pricingRate * (1 + targetMargin / 100) * 100) / 100;
  const [be, setBe]       = useState<BreakevenData | null>(null);
  const [beErr, setBeErr] = useState(false);

  useEffect(() => {
    if (d.loading || user.loading) return;

    fetch(`/api/breakeven?invoice=${d.invoiceAmount}&revenue=${revenue}&pair=${pair}`)
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then(setBe)
      .catch(() => setBeErr(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d.loading, user.loading, user.profile, pair, d.invoiceAmount, d.ecbRateInvoiceDay, d.ecbRateToday]);

  const v = be ? VERDICT[be.verdict] : null;

  return (
    <div className="space-y-8">
      <div style={fade(0)}>
        <h1 className="font-serif text-3xl font-normal text-[var(--color-fg)]">Breakeven &amp; hedge</h1>
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-[var(--color-muted-fg)]">
          Every deal has a rate at which it stops making money. This page shows where
          that point is for your {currencySymbol(d.fromCurrency)}
          {d.invoiceAmount.toLocaleString()} invoice, and how much room you have before
          you reach it.
        </p>
      </div>

      {/* Breakeven cushion */}
      {beErr ? (
        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-6" style={fade(1)}>
          <p className="text-sm text-[var(--color-muted-fg)]">Could not load breakeven data. Check your connection and refresh.</p>
        </div>
      ) : !be ? (
        <Skeleton className="h-40 rounded-2xl" />
      ) : (
        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-6" style={fade(1)}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-medium text-[var(--color-muted-fg)] mb-2">
                {be.cushion_pct > 0
                  ? "Room before this deal stops making money"
                  : "This deal is under water at today's rate"}
              </p>
              <p className="font-money text-5xl font-bold leading-none tabular" style={{ color: v!.color }}>
                {be.cushion_pct.toFixed(1)}%
              </p>
              <p className="mt-2 text-sm text-[var(--color-muted-fg)]">
                Breakeven rate: <span className="font-money font-semibold text-[var(--color-fg)] tabular">{be.break_even_rate.toFixed(4)}</span>
                {" "}· Today: <span className="font-money font-semibold text-[var(--color-fg)] tabular">{be.today_rate.toFixed(4)}</span>
              </p>
            </div>
            <span
              className="shrink-0 rounded-full px-3 py-1 text-xs font-semibold"
              style={{ color: v!.color, background: v!.bg }}
            >
              {v!.label}
            </span>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-[var(--color-fg)]">{be.verdict_reason}</p>
          <p className="mt-2 text-xs text-[var(--color-muted-fg)]">
            Assumes a {sym}{Math.round(revenue).toLocaleString()} sale: your {targetMargin}% target
            margin on this invoice, priced at the rate on the day it was issued ({pricingRate.toFixed(4)}).
          </p>

          {/* Stats row */}
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {[
              { label: "Breakeven rate", value: be.break_even_rate.toFixed(4) },
              { label: "Today's rate",   value: be.today_rate.toFixed(4)      },
              { label: "Past stretches compared", value: be.hist_windows.toLocaleString() },
            ].map((s) => (
              <div key={s.label} className="rounded-xl border border-[var(--color-border)] p-4">
                <p className="text-xs text-[var(--color-muted-fg)] mb-1">{s.label}</p>
                <p className="font-money font-semibold text-[var(--color-fg)] tabular">{s.value}</p>
              </div>
            ))}
          </div>

          <p className="mt-3 text-xs text-[var(--color-muted-fg)]">Source: {be.today_rate_source}</p>
        </div>
      )}

      {/* How to read it */}
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-6" style={fade(2)}>
        <h2 className="font-semibold text-[var(--color-fg)] mb-3">How to read this</h2>
        <div className="space-y-3 text-sm text-[var(--color-muted-fg)] leading-relaxed">
          <p>
            The <strong className="text-[var(--color-fg)]">breakeven rate</strong> is the
            worst {d.fromCurrency}/{d.toCurrency} rate at which you still cover your costs.
            Past it, the invoice costs more than you earn on the sale.
          </p>
          <p className="mt-2">
            The <strong className="text-[var(--color-fg)]">room</strong> is how far
            today&apos;s rate can move before you reach that point. More room means more
            margin for a bad week.
          </p>
          <div className="flex flex-col gap-2 mt-3">
            {Object.entries(VERDICT).map(([k, v]) => (
              <div key={k} className="flex items-center gap-2">
                <span className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold" style={{ color: v.color, background: v.bg }}>{v.label}</span>
                <span>
                  {k === "comfortable" && "More room than even the roughest comparable stretch used. You have a real buffer."}
                  {k === "watch"       && "A rough stretch could use up most of your room. Check again before the due date."}
                  {k === "danger"      && "Almost no room left. Even a small move puts the deal in the red."}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Natural hedge detector */}
      <div style={fade(3)}>
        <NaturalHedgeCard flows={flows} />
      </div>

      <p className="text-xs text-[var(--color-muted-fg)]">
        HalalFlow never moves money and never predicts exchange rates. This is education only, not financial advice.
      </p>
    </div>
  );
}
