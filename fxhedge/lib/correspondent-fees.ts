/**
 * lib/correspondent-fees.ts — the cost a bank wire carries that its quote
 * cannot show. Pure: no React imports.
 *
 * Figures are US dollars because correspondent fees are typically levied in
 * USD. They are deliberately not converted to the user's home currency.
 */

/** Deducted by each intermediary bank. Source: Airwallex. */
export const PER_HOP_USD = { min: 15, max: 50 } as const;

/** Charged by the receiving bank on arrival. Source: Airwallex. */
export const BENEFICIARY_USD = { min: 15, max: 25 } as const;

/** Intermediary banks a SWIFT wire typically passes through. Source: Paystand. */
export const HOPS = { min: 1, max: 3 } as const;

const SOURCE = "Airwallex; hop count per Paystand";

export interface CorrespondentEstimate {
  minUsd: number;
  maxUsd: number;
  hopsMin: number;
  hopsMax: number;
  source: string;
}

/**
 * Returns null for anything that is not a bank — money-transfer providers run
 * their own rails, so claiming correspondent fees for them would be false.
 */
export function estimateCorrespondentFees(
  providerType: string | undefined,
): CorrespondentEstimate | null {
  if (providerType !== "bank") return null;

  return {
    minUsd: HOPS.min * PER_HOP_USD.min + BENEFICIARY_USD.min,
    maxUsd: HOPS.max * PER_HOP_USD.max + BENEFICIARY_USD.max,
    hopsMin: HOPS.min,
    hopsMax: HOPS.max,
    source: SOURCE,
  };
}
