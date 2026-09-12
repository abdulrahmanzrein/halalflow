/**
 * lib/breakeven.ts — THE dashboard number: at what rate do we lose money,
 * and how much room do we have left today?
 * Pure: no React/Next imports (architecture.md invariant 5).
 * Verdicts cite historical magnitudes only — never a direction prediction.
 */
export interface BreakEvenInput {
  invoiceAmount: number;
  revenue: number;
  todayRate: number;
  worst5pctMove: number;
  worstOnRecord: number;
}

export interface BreakEvenResult {
  break_even_rate: number;
  cushion_pct: number;
  cushion_abs: number;
  verdict: "comfortable" | "watch" | "danger";
  verdict_reason: string;
  history_5pct: number;
  history_worst: number;
}

export function computeBreakEven(input: BreakEvenInput): BreakEvenResult {
  const { invoiceAmount, revenue, todayRate, worst5pctMove, worstOnRecord } = input;
  if (!(invoiceAmount > 0)) throw new Error("invoice amount must be > 0");
  if (!(revenue > 0)) throw new Error("revenue must be > 0");

  const break_even_rate = revenue / invoiceAmount;
  // For importer flows quoted as FROM/TO (e.g. EUR/CAD), a move "against"
  // the buyer is a higher rate (it costs more TO-currency per FROM unit).
  // Room is therefore the upside distance from today's rate to break-even.
  const cushion_pct = ((break_even_rate - todayRate) / todayRate) * 100;
  const cushion_abs = break_even_rate - todayRate;

  let verdict: BreakEvenResult["verdict"];
  let verdict_reason: string;
  if (cushion_pct <= 0) {
    verdict = "danger";
    verdict_reason = `At today's rate this deal already loses money before the market moves at all. There is no cushion left, and history shows windows moving ${worst5pctMove.toFixed(1)}%+ (worst on record ${worstOnRecord.toFixed(1)}%). Repricing the sale or paying now is worth a serious look.`;
  } else if (cushion_pct > 2 * worst5pctMove) {
    verdict = "comfortable";
    verdict_reason = `Your rate can move ${cushion_pct.toFixed(1)}% against you before you lose money. History says only 5% of similar windows move more than ${worst5pctMove.toFixed(1)}%. Your cushion covers that twice over.`;
  } else if (cushion_pct > worst5pctMove) {
    verdict = "watch";
    verdict_reason = `Your cushion is ${cushion_pct.toFixed(1)}%. History says 5% of similar windows move ${worst5pctMove.toFixed(1)}%+, so a bad week eats most of it. Worth checking weekly.`;
  } else {
    verdict = "danger";
    verdict_reason = `Only ${cushion_pct.toFixed(1)}% of cushion remains and history shows windows moving ${worst5pctMove.toFixed(1)}%+ (worst on record ${worstOnRecord.toFixed(1)}%). You are inside the danger zone. Consider acting now.`;
  }

  return {
    break_even_rate: Math.round(break_even_rate * 10000) / 10000,
    cushion_pct: Math.round(cushion_pct * 10) / 10,
    cushion_abs: Math.round(cushion_abs * 10000) / 10000,
    verdict,
    verdict_reason,
    history_5pct: worst5pctMove,
    history_worst: worstOnRecord,
  };
}
