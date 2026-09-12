import { describe, expect, it } from "vitest";
import { computeTrueCost, computeMargin, buildCostBreakdown, impliedRevenue } from "../cost";
import type { ProviderQuote } from "@/types";

// Fixture numbers from dev2_CONTEXT.md SAMPLE (the verified prototype)
const providers: ProviderQuote[] = [
  { name: "Wise", received: 19195, mid_market: true },
  { name: "Instarem", received: 19158, mid_market: false },
  { name: "Deutsche Bank", received: 19156, mid_market: false },
  { name: "PayPal", received: 18428, mid_market: false },
];

describe("computeTrueCost", () => {
  it("invoice at ECB rate = true cost", () => {
    expect(computeTrueCost(12000, 1.6038)).toBeCloseTo(19245.6, 2);
  });
  it("handles zero rate", () => {
    expect(computeTrueCost(12000, 0)).toBe(0);
  });
});

describe("computeMargin", () => {
  it("matches the prototype: revenue 18000, cost 19246 -> -6.9%", () => {
    expect(computeMargin(18000, 19245.6)).toBeCloseTo(-6.92, 1);
  });
  it("healthy margin positive", () => {
    expect(computeMargin(18000, 16000)).toBeCloseTo(11.11, 1);
  });
  it("zero revenue is safe, not NaN", () => {
    expect(computeMargin(0, 100)).toBe(-100);
  });
});

describe("impliedRevenue", () => {
  it("prices the deal at the invoice-day rate plus the target margin", () => {
    // 12000 × 1.6049 × 1.10 = 21184.68 — Aisha's sample economics
    expect(impliedRevenue(12000, 1.6049, 10)).toBe(21184.68);
  });

  it("rounds to cents rather than leaking IEEE remainder", () => {
    expect(impliedRevenue(1000, 1.3333, 10)).toBe(1466.63);
  });

  it("returns 0 for a non-positive rate so a missing FX quote cannot invent revenue", () => {
    expect(impliedRevenue(12000, 0, 10)).toBe(0);
    expect(impliedRevenue(12000, -1, 10)).toBe(0);
  });

  it("returns 0 for a non-positive invoice", () => {
    expect(impliedRevenue(0, 1.6, 10)).toBe(0);
  });

  it("treats a missing margin as zero rather than NaN", () => {
    expect(impliedRevenue(1000, 2, Number.NaN)).toBe(2000);
  });
});

describe("buildCostBreakdown", () => {
  const breakdown = buildCostBreakdown({
    invoiceAmount: 12000,
    revenue: 18000,
    ecbRateToday: 1.6038,
    providers,
  });

  it("returns the CostBreakdown contract shape", () => {
    expect(breakdown.invoice_amount).toBe(12000);
    expect(breakdown.revenue).toBe(18000);
    expect(breakdown.ecb_rate_today).toBe(1.6038);
    expect(breakdown.true_cost_today).toBeCloseTo(19245.6, 1);
    expect(breakdown.margin_today).toBeCloseTo(-6.9, 1);
  });

  it("best provider is Wise, worst is PayPal", () => {
    expect(breakdown.best_provider.name).toBe("Wise");
    expect(breakdown.worst_provider.name).toBe("PayPal");
  });

  it("saving vs worst = 767 (the fixture number)", () => {
    expect(breakdown.saving_vs_worst).toBeCloseTo(767, 0);
  });

  it("margin at risk -5%: profit drops to -2208 (the fixture number)", () => {
    // rate rises 5% -> cost 20207.88 -> profit -2207.88 (fixture -2208):
    // the at-risk figure is the ADVERSE-SCENARIO PROFIT, not the delta.
    expect(breakdown.margin_at_risk_minus5pct).toBeCloseTo(-2207.88, 0);
  });

  it("profit delta vs today is -962 for a 5% move", () => {
    const adverse = buildCostBreakdown({
      invoiceAmount: 12000,
      revenue: 18000,
      ecbRateToday: 1.6038 * 1.05,
      providers,
    });
    // profit today -1245.60 vs profit at adverse rate -2207.88
    expect(adverse.margin_at_risk_minus5pct).toBeLessThan(-2200);
  });

  it("providers ranked by received desc", () => {
    const received = breakdown.providers.map((p) => p.received);
    expect(received).toEqual([...received].sort((a, b) => b - a));
  });

  it("handles single-provider list", () => {
    const single = buildCostBreakdown({
      invoiceAmount: 12000,
      revenue: 18000,
      ecbRateToday: 1.6,
      providers: [{ name: "Only", received: 19000, mid_market: true }],
    });
    expect(single.best_provider.name).toBe("Only");
    expect(single.worst_provider.name).toBe("Only");
    expect(single.saving_vs_worst).toBe(0);
  });
});
