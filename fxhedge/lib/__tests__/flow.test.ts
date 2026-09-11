import { describe, expect, it } from "vitest";
import {
  parseFlowInput,
  pickCurrentFlow,
  toPair,
  flowToCurrencyFlow,
} from "../flows/flow";
import type { Flow } from "@/types/flow";

function flow(over: Partial<Flow> = {}): Flow {
  return {
    id: "f1",
    direction: "outgoing",
    label: "Supplier invoice",
    amount: 12000,
    currency: "EUR",
    home_currency: "CAD",
    invoiced_on: "2026-09-01",
    days_until_due: 21,
    created_at: "2026-09-01T00:00:00.000Z",
    ...over,
  };
}

const valid = {
  direction: "outgoing",
  label: "Turkish supplier",
  amount: 12000,
  currency: "eur",
  home_currency: "cad",
  invoiced_on: "2026-09-01",
  days_until_due: 21,
};

describe("parseFlowInput", () => {
  it("accepts a valid flow and upper-cases currencies", () => {
    const r = parseFlowInput(valid);
    expect(r).not.toBeNull();
    expect(r!.currency).toBe("EUR");
    expect(r!.home_currency).toBe("CAD");
    expect(r!.amount).toBe(12000);
    expect(r!.direction).toBe("outgoing");
  });

  it("defaults the label per direction when blank", () => {
    expect(parseFlowInput({ ...valid, label: "  " })!.label).toBe("Supplier invoice");
    expect(
      parseFlowInput({ ...valid, direction: "incoming", label: "" })!.label,
    ).toBe("Customer receivable");
  });

  it("rejects a bad direction", () => {
    expect(parseFlowInput({ ...valid, direction: "sideways" })).toBeNull();
  });

  it("rejects a non-positive amount", () => {
    expect(parseFlowInput({ ...valid, amount: 0 })).toBeNull();
    expect(parseFlowInput({ ...valid, amount: -5 })).toBeNull();
  });

  it("rejects identical currencies", () => {
    expect(parseFlowInput({ ...valid, home_currency: "EUR" })).toBeNull();
  });

  it("rejects a malformed date", () => {
    expect(parseFlowInput({ ...valid, invoiced_on: "01-09-2026" })).toBeNull();
  });

  it("rejects an out-of-range due window", () => {
    expect(parseFlowInput({ ...valid, days_until_due: 400 })).toBeNull();
    expect(parseFlowInput({ ...valid, days_until_due: -1 })).toBeNull();
  });

  it("rejects non-objects", () => {
    expect(parseFlowInput(null)).toBeNull();
    expect(parseFlowInput("nope")).toBeNull();
  });
});

describe("pickCurrentFlow", () => {
  it("returns null when there is no outgoing flow", () => {
    expect(pickCurrentFlow([flow({ direction: "incoming" })], null)).toBeNull();
  });

  it("prefers the selected id", () => {
    const a = flow({ id: "a", created_at: "2026-09-01T00:00:00.000Z" });
    const b = flow({ id: "b", created_at: "2026-09-05T00:00:00.000Z" });
    expect(pickCurrentFlow([a, b], "a")!.id).toBe("a");
  });

  it("falls back to the newest outgoing flow", () => {
    const a = flow({ id: "a", created_at: "2026-09-01T00:00:00.000Z" });
    const b = flow({ id: "b", created_at: "2026-09-05T00:00:00.000Z" });
    expect(pickCurrentFlow([a, b], null)!.id).toBe("b");
  });

  it("never returns an incoming flow, even when selected", () => {
    const out = flow({ id: "out" });
    const inc = flow({ id: "inc", direction: "incoming" });
    expect(pickCurrentFlow([out, inc], "inc")!.id).toBe("out");
  });
});

describe("toPair / flowToCurrencyFlow", () => {
  it("derives the pair from its parts", () => {
    expect(toPair(flow())).toBe("EUR-CAD");
  });

  it("maps a flow onto the hedge engine's shape", () => {
    expect(flowToCurrencyFlow(flow())).toEqual({
      id: "f1",
      currency: "EUR",
      amount: 12000,
      direction: "outgoing",
      label: "Supplier invoice",
    });
  });
});
