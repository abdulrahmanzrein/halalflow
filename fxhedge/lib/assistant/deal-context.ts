/**
 * lib/assistant/deal-context.ts — the one object posted to /api/ask.
 * Pure: no React, so the chat widget and /ask cannot drift apart.
 */
export interface DealSnapshot {
  fromCurrency: string;
  toCurrency: string;
  invoiceAmount: number;
  marginAtRiskMinus5pct: number;
}

export function dealContextFromSnapshot(d: DealSnapshot): {
  pair: string;
  amount: number;
  margin_at_risk: number;
} {
  return {
    pair: `${d.fromCurrency}-${d.toCurrency}`,
    amount: d.invoiceAmount,
    margin_at_risk: d.marginAtRiskMinus5pct,
  };
}
