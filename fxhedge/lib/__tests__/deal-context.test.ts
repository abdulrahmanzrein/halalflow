import { describe, expect, it } from "vitest";
import { dealContextFromSnapshot } from "../assistant/deal-context";

describe("dealContextFromSnapshot", () => {
  it("builds the /api/ask body from the live invoice", () => {
    expect(
      dealContextFromSnapshot({
        fromCurrency: "GBP",
        toCurrency: "USD",
        invoiceAmount: 8000,
        marginAtRiskMinus5pct: -1500,
      }),
    ).toEqual({
      pair: "GBP-USD",
      amount: 8000,
      margin_at_risk: -1500,
    });
  });

  it("does not fall back to Aisha's sample pair", () => {
    const ctx = dealContextFromSnapshot({
      fromCurrency: "EUR",
      toCurrency: "CAD",
      invoiceAmount: 1,
      marginAtRiskMinus5pct: 0,
    });
    expect(ctx.pair).toBe("EUR-CAD");
    expect(ctx.amount).toBe(1);
  });
});
