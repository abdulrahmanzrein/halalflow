import { describe, expect, it } from "vitest";
import {
  estimateCorrespondentFees,
  PER_HOP_USD,
  BENEFICIARY_USD,
  HOPS,
} from "../correspondent-fees";

describe("estimateCorrespondentFees", () => {
  it("returns null for money-transfer providers", () => {
    expect(estimateCorrespondentFees("moneyTransferProvider")).toBeNull();
  });

  it("returns null when the type is missing", () => {
    expect(estimateCorrespondentFees(undefined)).toBeNull();
  });

  it("returns the sourced range for banks", () => {
    const e = estimateCorrespondentFees("bank")!;
    expect(e.minUsd).toBe(HOPS.min * PER_HOP_USD.min + BENEFICIARY_USD.min);
    expect(e.maxUsd).toBe(HOPS.max * PER_HOP_USD.max + BENEFICIARY_USD.max);
    expect(e.minUsd).toBe(30);
    expect(e.maxUsd).toBe(175);
    expect(e.hopsMin).toBe(1);
    expect(e.hopsMax).toBe(3);
    expect(e.source).toMatch(/Airwallex/);
  });

  it("never returns an inverted or zero range", () => {
    const e = estimateCorrespondentFees("bank")!;
    expect(e.minUsd).toBeGreaterThan(0);
    expect(e.maxUsd).toBeGreaterThan(e.minUsd);
  });
});
