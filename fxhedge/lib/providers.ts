import "server-only";

/**
 * lib/providers.ts — Wise Comparison API client (PRD FR-2/FR-3).
 *
 * GET /v4/comparisons?sourceCurrency=&targetCurrency=&sendAmount=
 * Unauthenticated, returns real provider rate/fee/markup/receivedAmount.
 * The API's receivedAmount already bakes in each provider's real
 * deductions — we present it as the supplier's real net.
 *
 * Contract: emits ProviderQuote[] (types/index.ts), ranked by received.
 */

const WISE_BASE = "https://api.wise.com/v4/comparisons";
export const PROVIDERS_REVALIDATE = 60 * 15; // 15 min

interface WiseQuote {
  rate?: number;
  fee?: number;
  receivedAmount?: number;
  isConsideredMidMarketRate?: boolean;
  markup?: number;
  dateCollected?: string;
}

interface WiseProvider {
  name?: string;
  alias?: string;
  type?: string;
  quotes?: WiseQuote[];
  logos?: { png?: string[]; svg?: string[] };
}

export interface NormalizedQuote {
  name: string;
  received: number;
  mid_market: boolean;
  transfer_fee?: number;
  markup_pct?: number;
  quoted_at?: string;
  provider_type?: "bank" | "moneyTransferProvider";
  logo?: string;
}

// ---------------------------------------------------------------------------
// Pure helpers (unit-tested)
// ---------------------------------------------------------------------------

/** Map raw Wise providers -> contract shapes, deduped by name (best quote kept). */
export function normalizeProviders(raw: WiseProvider[]): NormalizedQuote[] {
  const byName = new Map<string, NormalizedQuote>();
  for (const p of raw) {
    const name = typeof p.name === "string" ? p.name.trim() : "";
    if (!name) continue;
    let best: NormalizedQuote | null = null;
    for (const q of p.quotes ?? []) {
      const received = q.receivedAmount;
      if (typeof received !== "number" || received <= 0) continue;
      const candidate: NormalizedQuote = {
        name,
        received,
        mid_market: q.isConsideredMidMarketRate === true,
        transfer_fee: typeof q.fee === "number" ? q.fee : undefined,
        // Wise computes this against its own mid-market rate; it is the markup
        // that never appears on an invoice, so it is worth surfacing verbatim.
        markup_pct:
          typeof q.markup === "number" ? Math.round(q.markup * 100) / 100 : undefined,
        quoted_at: typeof q.dateCollected === "string" ? q.dateCollected : undefined,
        // The API tells us who is a bank; a hardcoded list would rot.
        provider_type:
          p.type === "bank" || p.type === "moneyTransferProvider" ? p.type : undefined,
        logo: p.logos?.png?.[0] ?? p.logos?.svg?.[0],
      };
      if (!best || candidate.received > best.received) best = candidate;
    }
    if (!best) continue;
    const existing = byName.get(name);
    if (!existing || best.received > existing.received) byName.set(name, best);
  }
  return [...byName.values()];
}

/** Sort by received amount descending. */
export function rankProviders(quotes: NormalizedQuote[]): NormalizedQuote[] {
  return [...quotes].sort((a, b) => b.received - a.received);
}

/** Best + worst + the dollar gap (real money left on the table, FR-3). */
export function pickBestAndWorst(ranked: NormalizedQuote[]): {
  best: NormalizedQuote | null;
  worst: NormalizedQuote | null;
  saving: number;
} {
  if (ranked.length === 0) return { best: null, worst: null, saving: 0 };
  const best = ranked[0];
  const worst = ranked[ranked.length - 1];
  return {
    best,
    worst: ranked.length > 1 ? worst : null,
    saving: Math.round((best.received - worst.received) * 100) / 100,
  };
}

// ---------------------------------------------------------------------------
// API client
// ---------------------------------------------------------------------------

/** Fetch live provider quotes, normalized + ranked (ProviderQuote[] contract). */
export async function fetchProviderQuotes(
  from: string,
  to: string,
  amount: number,
): Promise<NormalizedQuote[]> {
  const url = `${WISE_BASE}?sourceCurrency=${from}&targetCurrency=${to}&sendAmount=${amount}`;
  const res = await fetch(url, { next: { revalidate: PROVIDERS_REVALIDATE } });
  if (!res.ok) throw new Error(`Wise comparisons failed: ${res.status}`);
  const json = (await res.json()) as { providers?: WiseProvider[] };
  return rankProviders(normalizeProviders(json.providers ?? []));
}
