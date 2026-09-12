/**
 * lib/natural-hedge.ts — finds opposite-direction flows in the same currency
 * and suggests netting them instead of converting twice.
 * "Natural hedging" is one of the three Sharia-compliant structures (PRD FR-5)
 * and the cheapest: no contract, no conversion, no fee.
 * Pure: no React/Next imports. Suggestions only — we never execute anything.
 */
import type { FlowDirection } from "@/types/flow";

export type { FlowDirection };

export interface CurrencyFlow {
  id: string;
  currency: string;
  amount: number;
  direction: FlowDirection;
  label: string;
}

export interface HedgeMatch {
  currency: string;
  netted_amount: number;
  outgoing_ids: string[];
  incoming_ids: string[];
  suggestion: string;
}

export interface NaturalHedgeResult {
  matches: HedgeMatch[];
  unmatched: CurrencyFlow[];
  summary: string;
  disclaimer: string;
}

export const NATURAL_HEDGE_DISCLAIMER =
  "Netting flows avoids conversion but is still a settlement decision. Confirm the arrangement with your scholar and keep both invoices documented.";

export function detectNaturalHedges(flows: CurrencyFlow[]): NaturalHedgeResult {
  const usable = flows.filter((f) => f.amount > 0);
  const matches: HedgeMatch[] = [];
  const used = new Set<string>();

  const byCurrency = new Map<string, CurrencyFlow[]>();
  for (const f of usable) {
    const list = byCurrency.get(f.currency) ?? [];
    list.push(f);
    byCurrency.set(f.currency, list);
  }

  for (const [currency, list] of byCurrency) {
    const outgoing = list.filter((f) => f.direction === "outgoing");
    const incoming = list.filter((f) => f.direction === "incoming");
    if (outgoing.length === 0 || incoming.length === 0) continue;

    const outTotal = outgoing.reduce((s, f) => s + f.amount, 0);
    const inTotal = incoming.reduce((s, f) => s + f.amount, 0);
    const netted = Math.min(outTotal, inTotal);

    for (const f of outgoing) used.add(f.id);
    for (const f of incoming) used.add(f.id);

    matches.push({
      currency,
      netted_amount: Math.round(netted * 100) / 100,
      outgoing_ids: outgoing.map((f) => f.id),
      incoming_ids: incoming.map((f) => f.id),
      suggestion:
        netted >= Math.max(outTotal, inTotal)
          ? `Your ${currency} flows fully cover each other (${netted.toLocaleString()} ${currency}). Settle them against each other and skip the FX conversion entirely.`
          : `Net ${netted.toLocaleString()} ${currency} of these flows against each other before converting the remainder. You avoid paying the spread and fees on that amount twice.`,
    });
  }

  const unmatched = usable.filter((f) => !used.has(f.id));
  const remainingByCurrency = new Map<string, number>();
  for (const f of unmatched) {
    if (f.direction !== "outgoing") continue;
    remainingByCurrency.set(f.currency, (remainingByCurrency.get(f.currency) ?? 0) + f.amount);
  }
  const remainingTotal = [...remainingByCurrency.values()].reduce((s, n) => s + n, 0);
  const remainingDetail = [...remainingByCurrency]
    .map(([cur, amt]) => `${amt.toLocaleString()} ${cur}`)
    .join(" + ");

  const summary =
    matches.length === 0
      ? remainingTotal > 0
        ? `No natural hedge found. ${remainingDetail || `${remainingTotal.toLocaleString()}`} of foreign-currency payments still need a conversion decision.`
        : "No foreign-currency exposure to hedge right now."
      : unmatched.length === 0
        ? `Good news: your ${currencyList(matches)} flows net fully against each other. You may not need to convert anything.`
        : `You can naturally hedge ${matchesSummary(matches)}, but ${remainingDetail} (${remainingTotal.toLocaleString()} total) still needs attention.`;

  return { matches, unmatched, summary, disclaimer: NATURAL_HEDGE_DISCLAIMER };
}

function matchesSummary(matches: HedgeMatch[]): string {
  return matches.map((m) => `${m.netted_amount.toLocaleString()} ${m.currency}`).join(" + ");
}

function currencyList(matches: HedgeMatch[]): string {
  return matches.map((m) => m.currency).join(" and ");
}
