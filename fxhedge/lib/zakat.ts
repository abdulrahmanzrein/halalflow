/**
 * lib/zakat.ts — pure business-zakat computation (2.5% of zakatable assets).
 * Educational only — never a fatwa; output always surfaces the scholarly
 * method difference and directs the user to a qualified scholar.
 * Pure: no React/Next imports (architecture.md invariant 5).
 */
import type {
  MadhhabMethod,
  ValuedHolding,
  ZakatHolding,
  ZakatResult,
} from "@/types/zakat";

export const ZAKAT_RATE = 0.025;
/** Nisab threshold = value of 87.48g of gold (AAOIFI Sharia Standard No. 57, Gold). */
export const NISAB_GOLD_GRAMS = 87.48;

const HOME_RATE_SOURCE = "home currency";

/**
 * Rules per method (sourced: AAOIFI Sharia Standard No. 35 on zakah;
 * Hanafi fiqh summaries — surfaced as a documented difference, not a verdict):
 * - Both: zakatable pool = cash + receivables (collectible) + inventory (resale
 *   value) − current liabilities.
 * - Both: seriously doubtful debts are excluded until actually recovered.
 * - AAOIFI view: receivables are excluded until their due date.
 * - Hanafi view: receivables owed to the business are included regardless of
 *   due date.
 */
function methodRules(
  h: ZakatHolding,
  method: MadhhabMethod,
): { zakatable: boolean; reason?: string } {
  if (h.kind === "liability") return { zakatable: true }; // subtracted, not added
  if (h.kind === "receivable") {
    if (h.doubtful) {
      return {
        zakatable: false,
        reason:
          "Doubtful debt. Excluded under both methods. If you recover it later, include it in that year's pool.",
      };
    }
    if (method === "aaoifi" && (h.due_days ?? 0) > 0) {
      return {
        zakatable: false,
        reason:
          "Not yet due. The AAOIFI view excludes receivables before their due date (the Hanafi view includes them). Confirm with your scholar.",
      };
    }
    return { zakatable: true };
  }
  return { zakatable: true };
}

export function computeZakat(
  holdings: ZakatHolding[],
  method: MadhhabMethod,
  rates: Record<string, number>, // currency -> value of 1 unit in home currency
  goldPricePerGramHome: number, // user-entered, labeled "user-entered"
  homeCurrency: string,
): ZakatResult {
  const valued: ValuedHolding[] = holdings.map((h) => {
    if (h.currency === homeCurrency) {
      const rules = methodRules(h, method);
      return {
        ...h,
        value_home: h.amount,
        rate_used: 1,
        rate_source: HOME_RATE_SOURCE,
        zakatable: rules.zakatable,
        excluded_reason: rules.reason,
      };
    }
    const rate = rates[h.currency];
    if (typeof rate !== "number" || rate <= 0) {
      throw new Error(
        `Missing rate for ${h.currency} — fetch it via /api/zakat/rates first`,
      );
    }
    const rules = methodRules(h, method);
    return {
      ...h,
      value_home: h.amount * rate,
      rate_used: rate,
      rate_source: "ECB / Frankfurter",
      zakatable: rules.zakatable,
      excluded_reason: rules.reason,
    };
  });

  const zakatable_total = valued.reduce((sum, h) => {
    if (!h.zakatable) return sum;
    return h.kind === "liability" ? sum - Math.abs(h.value_home) : sum + h.value_home;
  }, 0);

  const nisab_threshold = NISAB_GOLD_GRAMS * goldPricePerGramHome;
  const nisab_met = zakatable_total > 0 && zakatable_total >= nisab_threshold;

  return {
    method,
    zakatable_total: Math.round(zakatable_total * 100) / 100,
    nisab_threshold: Math.round(nisab_threshold * 100) / 100,
    nisab_met,
    zakat_due: nisab_met ? Math.round(zakatable_total * ZAKAT_RATE * 100) / 100 : 0,
    holdings: valued,
    computed_at: new Date().toISOString(),
    rate_date: new Date().toISOString().slice(0, 10),
  };
}
