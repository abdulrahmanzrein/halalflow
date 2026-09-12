"use client";
import { useState, useEffect } from "react";
import { MOCK_PROFILE, SAMPLE } from "@/lib/fixtures";
import { useFlows } from "./use-flows";
import { daysUntilDue } from "@/lib/flows/flow";
import type { FXRate, ProviderQuote, RiskResult } from "@/types";

export interface AppData {
  loading: boolean;
  error: boolean;
  // Invoice (echoes current)
  invoiceAmount: number;
  fromCurrency: string;
  toCurrency: string;
  daysUntilDue: number;
  /** Days elapsed since the invoice was issued — the drift baseline. */
  daysSinceInvoiced: number;
  invoiceLabel: string;
  // FX
  ecbRateToday: number;
  ecbRateInvoiceDay: number;
  rateSource: string;
  // Cost
  trueCostToday: number;
  // Providers
  providers: ProviderQuote[];
  bestProvider: ProviderQuote;
  worstProvider: ProviderQuote;
  savingVsWorst: number;
  // Risk
  driftTodayPct: number;
  worst5pctMove: number;
  histWindows: number;
  marginAtRiskMinus5pct: number;
  decision: "pay_now" | "wait" | "marginal";
  decisionReason: string;
  // Rate history for chart
  rateHistory: { day: string; rate: number }[];
}

const FALLBACK_PROVIDERS: ProviderQuote[] = SAMPLE.providers.map((p) => ({
  name: p.name,
  received: p.received,
  mid_market: !!p.midMarket,
}));

function buildFallback(inv: {
  amount: number; from: string; to: string; days: number; since: number; label: string;
}): AppData {
  return {
    loading: false,
    error: true,
    invoiceAmount: inv.amount,
    fromCurrency: inv.from,
    toCurrency: inv.to,
    daysUntilDue: inv.days,
    daysSinceInvoiced: inv.since,
    invoiceLabel: inv.label,
    ecbRateToday: SAMPLE.ecbRateToday,
    ecbRateInvoiceDay: SAMPLE.ecbRateInvoiceDay,
    rateSource: "ECB / Frankfurter",
    trueCostToday: Math.round(inv.amount * SAMPLE.ecbRateToday),
    providers: FALLBACK_PROVIDERS,
    bestProvider:  { name: SAMPLE.bestProvider.name,  received: SAMPLE.bestProvider.received,  mid_market: true  },
    worstProvider: { name: SAMPLE.worstProvider.name, received: SAMPLE.worstProvider.received, mid_market: false },
    savingVsWorst: SAMPLE.savingVsWorst,
    driftTodayPct: SAMPLE.driftTodayPct,
    worst5pctMove: SAMPLE.worst5pctMove,
    histWindows:   SAMPLE.histWindows,
    marginAtRiskMinus5pct: SAMPLE.marginAtRiskMinus5pct,
    decision: SAMPLE.decision,
    decisionReason: SAMPLE.decisionReason,
    rateHistory: [],
  };
}

/** Whole days between an ISO date and today, floored at 0. */
function daysSince(isoDate: string): number {
  const then = new Date(`${isoDate}T00:00:00Z`).getTime();
  if (!Number.isFinite(then)) return 0;
  const today = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`).getTime();
  return Math.max(0, Math.round((today - then) / 86_400_000));
}

function shortDay(iso: string) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-CA", { month: "short", day: "numeric" });
}

export function useAppData(): AppData {
  const { current, ready } = useFlows();

  const [data, setData] = useState<AppData>(() => ({
    ...buildFallback({
      amount: MOCK_PROFILE.invoice_amount,
      from:   MOCK_PROFILE.supplier_currency,
      to:     MOCK_PROFILE.home_currency,
      days:   MOCK_PROFILE.days_until_due,
      since:  MOCK_PROFILE.days_until_due,
      label:  "Sample",
    }),
    loading: true,
    error: false,
  }));

  useEffect(() => {
    if (!ready) return;

    const inv   = current.amount;
    const from  = current.currency;
    const to    = current.home_currency;
    // Derived, not stored, so the window shrinks as the due date approaches.
    const days  = daysUntilDue(current);
    const label = current.label;
    // Drift is measured from the issue date; the risk window looks forward to the due date.
    const since = daysSince(current.invoiced_on);

    setData((prev) => ({ ...prev, loading: true, error: false }));

    async function load() {
      try {
        const [fxRes, provRes, riskRes, histRes] = await Promise.all([
          fetch(`/api/fx?pair=${from}-${to}&days_ago=${since}`),
          fetch(`/api/providers?from=${from}&to=${to}&amount=${inv}`),
          fetch(`/api/risk?pair=${from}-${to}&days_ago=${since}&window_days=${days}&years=10`),
          fetch(`/api/history?pair=${from}-${to}&years=1`),
        ]);

        if (!fxRes.ok || !provRes.ok || !riskRes.ok) throw new Error("API error");

        const fx: FXRate          = await fxRes.json();
        const providers: ProviderQuote[] = await provRes.json();
        const risk: RiskResult    = await riskRes.json();

        const trueCostToday = Math.round(inv * fx.rate);
        const best   = providers[0];
        const worst  = providers[providers.length - 1];
        const saving = best ? Math.round(best.received - worst.received) : 0;
        const margin5pct = -(inv * fx.rate * 0.05);

        let rateHistory: { day: string; rate: number }[] = [];
        if (histRes.ok) {
          const hist: { rates: Record<string, number> } = await histRes.json();
          const all = Object.entries(hist.rates)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([date, rate]) => ({ day: shortDay(date), rate }));
          rateHistory = all.slice(-60);
        }

        setData({
          loading: false,
          error: false,
          invoiceAmount: inv,
          fromCurrency:  from,
          toCurrency:    to,
          daysUntilDue:  days,
          daysSinceInvoiced: since,
          invoiceLabel:  label,
          ecbRateToday:      fx.rate,
          ecbRateInvoiceDay: fx.rate_invoice_day,
          rateSource:        fx.source,
          trueCostToday,
          providers,
          bestProvider:  best  ?? FALLBACK_PROVIDERS[0],
          worstProvider: worst ?? FALLBACK_PROVIDERS[FALLBACK_PROVIDERS.length - 1],
          savingVsWorst: saving,
          driftTodayPct: risk.drift_today_pct,
          worst5pctMove: risk.worst_5pct_move,
          histWindows:   risk.hist_windows,
          marginAtRiskMinus5pct: Math.round(margin5pct),
          decision:       risk.decision,
          decisionReason: risk.decision_reason,
          rateHistory,
        });
      } catch {
        setData(buildFallback({ amount: inv, from, to, days, since, label }));
      }
    }

    load();
  }, [ready, current.amount, current.currency, current.home_currency, current.due_on, current.invoiced_on, current.label]);

  return data;
}
