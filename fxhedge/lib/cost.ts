/**
 * lib/cost.ts — the hero margin-impact engine (PRD §3 layer 1).
 *
 * Pure, framework-agnostic math that connects REAL FX cost data to the
 * business outcome: "what does this payment do to my margin?"
 * No React, no Next.js imports — fully unit-testable (architecture.md
 * invariant 5). Consumes contract types only.
 */

import type { CostBreakdown, ProviderQuote } from "@/types";

/** True cost of delivering `amount` at the reference rate. */
export function computeTrueCost(
  invoiceAmount: number,
  rate: number,
): number {
  if (!Number.isFinite(invoiceAmount) || !Number.isFinite(rate) || rate <= 0) {
    return 0;
  }
  return invoiceAmount * rate;
}

/**
 * Margin % given revenue (customer quote) and true cost.
 * Prototype: (revenue - cost) / revenue * 100. Zero revenue -> -100 (total loss).
 */
export function computeMargin(revenue: number, cost: number): number {
  if (revenue === 0) return cost === 0 ? 0 : -100;
  return ((revenue - cost) / revenue) * 100;
}

/**
 * What the importer quoted their customer: invoice at the invoice-day
 * reference rate, plus the target margin from their profile.
 * Rounded to cents so the dashboard and the breakeven engine see one number.
 */
export function impliedRevenue(
  invoiceAmount: number,
  invoiceDayRate: number,
  targetMarginPct: number,
): number {
  if (!Number.isFinite(invoiceAmount) || invoiceAmount <= 0) return 0;
  if (!Number.isFinite(invoiceDayRate) || invoiceDayRate <= 0) return 0;
  const margin = Number.isFinite(targetMarginPct) ? targetMarginPct : 0;
  return Math.round(invoiceAmount * invoiceDayRate * (1 + margin / 100) * 100) / 100;
}

export interface CostBreakdownInput {
  invoiceAmount: number;
  revenue: number;
  ecbRateToday: number;
  /** Ranked or unranked — function sorts internally. */
  providers: ProviderQuote[];
  /** Rate-move % for the at-risk figure. Default -5 (adverse). */
  riskMovePct?: number;
}

function bestAndWorst(ranked: ProviderQuote[]): {
  best: ProviderQuote | null;
  worst: ProviderQuote | null;
} {
  if (ranked.length === 0) return { best: null, worst: null };
  return {
    best: ranked[0],
    worst: ranked.length > 1 ? ranked[ranked.length - 1] : ranked[0],
  };
}

/**
 * Assemble the full CostBreakdown contract shape from live inputs.
 * margin_at_risk: the PROFIT dollars lost if the rate moves adversely
 * by riskMovePct vs today (prototype: -5% move -> -$2,208 on Aisha's deal).
 */
export function buildCostBreakdown(input: CostBreakdownInput): CostBreakdown {
  const { invoiceAmount, revenue, ecbRateToday, providers, riskMovePct = 5 } = input;

  const ranked = [...providers].sort((a, b) => b.received - a.received);
  const { best, worst } = bestAndWorst(ranked);
  if (!best || !worst) {
    throw new Error("buildCostBreakdown requires at least one provider quote");
  }

  const trueCostToday = computeTrueCost(invoiceAmount, ecbRateToday);
  const marginToday = computeMargin(revenue, trueCostToday);
  const savingVsWorst = Math.round((best.received - worst.received) * 100) / 100;

  // Adverse move: supplier currency STRENGTHENS by riskMovePct
  // (you get fewer CAD per EUR -> cost up -> profit down).
  const adverseRate = ecbRateToday * (1 + riskMovePct / 100);
  const profitToday = revenue - trueCostToday;
  const profitAdverse = revenue - computeTrueCost(invoiceAmount, adverseRate);
  // Fixture semantics (dev2_CONTEXT SAMPLE): the at-risk figure is the
  // PROFIT IN THE ADVERSE SCENARIO (e.g. -$2,208), not the delta vs today.
  const marginAtRisk = Math.round(profitAdverse * 100) / 100;

  return {
    invoice_amount: invoiceAmount,
    revenue,
    ecb_rate_today: ecbRateToday,
    true_cost_today: Math.round(trueCostToday * 100) / 100,
    margin_today: Math.round(marginToday * 10) / 10,
    best_provider: best,
    worst_provider: worst,
    saving_vs_worst: savingVsWorst,
    margin_at_risk_minus5pct: marginAtRisk,
    providers: ranked,
  };
}
