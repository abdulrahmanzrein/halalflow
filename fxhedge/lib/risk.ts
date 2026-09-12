/**
 * lib/risk.ts — evidence-based decision engine (PRD FR-4 / Screen 7).
 *
 * Combines real historical move distributions (Frankfurter, via lib/fx)
 * with the current invoice-day→today drift to produce a pay-now-vs-wait
 * verdict. Magnitudes only, NEVER direction prediction (challenge rule,
 * architecture.md invariant 2).
 *
 * Pure functions — no React/Next imports.
 */

import type { RiskResult } from "@/types";

/** % drift from invoice-day rate to today's rate (positive = rate rose). */
export function computeDrift(invoiceDayRate: number, todayRate: number): number {
  if (!Number.isFinite(invoiceDayRate) || invoiceDayRate <= 0) return 0;
  return ((todayRate - invoiceDayRate) / invoiceDayRate) * 100;
}

export interface RiskDecision {
  decision: "pay_now" | "wait" | "marginal";
  decision_reason: string;
}

export interface DecisionInput {
  /** + means the supplier currency ROSE since invoice (waiting cost you). */
  driftTodayPct: number;
  /** 5th-percentile |move| over the historical window (%). */
  worst5pctMove: number;
  /** Largest |move| on record over the window (%). */
  worstOnRecord: number;
  /** Number of historical windows behind the stats (0 -> no data). */
  histWindows: number;
}

/**
 * Verdict from evidence, phrased as history + current drift.
 * - drift strongly against (> 2%) -> pay_now (lock in what's left)
 * - drift in your favor (> 1%) and calm history (worst 5% < 1.5%) -> wait
 * - otherwise marginal (tiny drift but history shows real tail risk)
 */
export function decidePayNowOrWait(input: DecisionInput): RiskDecision {
  const { driftTodayPct, worst5pctMove, worstOnRecord, histWindows } = input;

  if (histWindows === 0) {
    return {
      decision: "marginal",
      decision_reason:
        "Not enough historical data to advise either way. Treat both options as open.",
    };
  }

  if (driftTodayPct > 2) {
    return {
      decision: "pay_now",
      decision_reason: `The rate has already moved ${driftTodayPct.toFixed(1)}% against you since the invoice was priced. Waiting has historically cost importers up to ${worstOnRecord.toFixed(1)}% over this window. Locking in now protects what margin remains.`,
    };
  }

  if (driftTodayPct < -1 && worst5pctMove < 1.5) {
    return {
      decision: "wait",
      decision_reason: `The move is currently ${Math.abs(driftTodayPct).toFixed(1)}% in your favor and history shows 21-day windows this calm rarely swing worse than ${worst5pctMove.toFixed(1)}% (worst on record ${worstOnRecord.toFixed(1)}%).`,
    };
  }

  return {
    decision: "marginal",
    decision_reason: `Drift is small (${driftTodayPct.toFixed(1)}%) but history shows 5% of similar windows moved ${worst5pctMove.toFixed(1)}%+ against importers. The tail risk is real, so decide with your margin floor in mind.`,
  };
}

export interface RiskInput {
  pair: string;
  invoiceDayRate: number;
  todayRate: number;
  /** Forward-looking window in days the stats were computed over (e.g. 21). */
  windowDays: number;
  series: { date: string; rate: number }[];
}

/** Assemble the RiskResult contract shape from a real historical series. */
export function buildRiskResult(input: RiskInput): RiskResult {
  const { pair, invoiceDayRate, todayRate, windowDays, series } = input;
  const driftTodayPct = computeDrift(invoiceDayRate, todayRate);

  // Forward-looking moves between consecutive window boundaries.
  const moves: number[] = [];
  for (let i = 0; i + windowDays < series.length; i += windowDays) {
    const start = series[i];
    const end = series[i + windowDays];
    if (start.rate <= 0) continue;
    moves.push(((end.rate - start.rate) / start.rate) * 100);
  }
  const byAbs = [...moves].sort((a, b) => Math.abs(b) - Math.abs(a));
  const worst5pctMove =
    byAbs.length > 0 ? byAbs[Math.max(0, Math.floor(byAbs.length * 0.05) - 1)] : 0;
  const worstOnRecord = byAbs.length > 0 ? byAbs[0] : 0;

  const { decision, decision_reason } = decidePayNowOrWait({
    driftTodayPct,
    worst5pctMove: Math.abs(worst5pctMove),
    worstOnRecord: Math.abs(worstOnRecord),
    histWindows: moves.length,
  });

  return {
    pair,
    hist_windows: moves.length,
    worst_5pct_move: Math.round(Math.abs(worst5pctMove) * 10) / 10,
    worst_on_record: Math.round(Math.abs(worstOnRecord) * 10) / 10,
    drift_today_pct: Math.round(driftTodayPct * 10) / 10,
    decision,
    decision_reason,
  };
}
