import { describe, expect, it } from "vitest";
import {
  parseFlowInput,
  pickCurrentFlow,
  toPair,
  flowToCurrencyFlow,
  daysUntilDue,
  addDaysIso,
  isValidIsoDate,
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
    due_on: "2026-09-22",
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
  due_on: "2026-09-22",
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

  it("rejects impossible calendar dates that Date.parse silently rolls over", () => {
    // Date.parse("2026-02-31T00:00:00Z") happily yields March 3rd.
    expect(parseFlowInput({ ...valid, invoiced_on: "2026-02-31" })).toBeNull();
    expect(parseFlowInput({ ...valid, due_on: "2026-04-31" })).toBeNull();
    expect(parseFlowInput({ ...valid, due_on: "2026-13-01" })).toBeNull();
  });

  it("rejects a due date before the invoice date", () => {
    expect(parseFlowInput({ ...valid, due_on: "2026-08-31" })).toBeNull();
  });

  it("rejects a window longer than a year", () => {
    expect(parseFlowInput({ ...valid, due_on: "2027-10-01" })).toBeNull();
  });

  it("accepts a same-day due date", () => {
    expect(parseFlowInput({ ...valid, due_on: "2026-09-01" })).not.toBeNull();
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

describe("daysUntilDue", () => {
  it("counts forward from the given day", () => {
    expect(daysUntilDue(flow(), "2026-09-01")).toBe(21);
    expect(daysUntilDue(flow(), "2026-09-15")).toBe(7);
  });

  it("floors at zero once the due date has passed", () => {
    expect(daysUntilDue(flow(), "2026-10-01")).toBe(0);
  });

  it("does not go stale — the same flow shrinks as today advances", () => {
    const f = flow();
    expect(daysUntilDue(f, "2026-09-10")).toBeGreaterThan(daysUntilDue(f, "2026-09-20"));
  });
});

describe("addDaysIso / isValidIsoDate", () => {
  it("adds days across a month boundary", () => {
    expect(addDaysIso("2026-09-25", 10)).toBe("2026-10-05");
  });

  it("rejects impossible dates and accepts real ones", () => {
    expect(isValidIsoDate("2026-02-31")).toBe(false);
    expect(isValidIsoDate("2026-02-28")).toBe(true);
    expect(isValidIsoDate("nope")).toBe(false);
    expect(isValidIsoDate(20260228)).toBe(false);
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
