// types/index.ts — the shared contract. Lock this first.
// Dev 1 drafts, Dev 2 reviews. If it compiles on both sides, it integrates.
// Any change to this file is a `contract:` PR that both devs handle the same day.

export interface Profile {
  user_id: string;
  business_name: string | null;
  business_type: string | null;
  home_currency: string;        // "CAD"
  supplier_currency: string;    // "EUR"
  invoice_amount: number;       // 12000
  target_margin: number;        // 10
  days_until_due: number;       // 21
  updated_at: string;
}

export interface FXRate {
  pair: string;                 // "EUR-CAD"
  from: string;                 // "EUR"
  to: string;                   // "CAD"
  rate: number;                 // 1.6038
  rate_invoice_day: number;     // 1.6049 (the rate `days_ago` days back)
  source: string;               // "ECB / Frankfurter"
  fetched_at: string;
}

export interface ProviderQuote {
  name: string;                 // "Wise"
  received: number;             // 19195 — amount the supplier gets
  mid_market: boolean;          // true for the mid-market provider
  transfer_fee?: number;
  /** Provider's FX markup over mid-market, in percent. 0 = true mid-market. */
  markup_pct?: number;
  /** When the provider's rate was collected — quotes are not all same-day. */
  quoted_at?: string;
  logo?: string;
}

export interface CostBreakdown {
  invoice_amount: number;       // 12000
  revenue: number;              // 18000
  ecb_rate_today: number;       // 1.6038
  true_cost_today: number;      // 19246 = invoice_amount * ecb_rate_today
  margin_today: number;         // -6.9 (%)
  best_provider: ProviderQuote;
  worst_provider: ProviderQuote;
  saving_vs_worst: number;      // 767
  margin_at_risk_minus5pct: number; // -2208
  providers: ProviderQuote[];   // ranked list
}

export interface RiskResult {
  pair: string;
  hist_windows: number;         // 2796
  worst_5pct_move: number;      // 3.2 (%)
  worst_on_record: number;      // 9.8 (%)
  drift_today_pct: number;      // -0.1
  decision: "pay_now" | "wait" | "marginal";
  decision_reason: string;
}

export interface ChatAnswer {
  answer: string;               // markdown
  model?: string;
  error?: boolean;
}
