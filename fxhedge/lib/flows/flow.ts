/**
 * lib/flows/flow.ts — pure helpers over the Flow contract.
 * No React, no Next, no I/O: every function here is unit-testable.
 */
import type { Flow, FlowInput } from "@/types/flow";
import type { CurrencyFlow } from "@/lib/natural-hedge";
import { MOCK_PROFILE } from "@/lib/fixtures";

export const CURRENCIES = ["EUR", "USD", "GBP", "CAD", "AUD", "SGD"] as const;

export const SAMPLE_FLOW_ID = "sample";

export function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function isoDaysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

export function toPair(flow: Flow): string {
  return `${flow.currency}-${flow.home_currency}`;
}

export function flowToCurrencyFlow(flow: Flow): CurrencyFlow {
  return {
    id: flow.id,
    currency: flow.currency,
    amount: flow.amount,
    direction: flow.direction,
    label: flow.label,
  };
}

/** Validates untrusted input (request bodies, form state) into a FlowInput. */
export function parseFlowInput(body: unknown): FlowInput | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as Record<string, unknown>;

  const direction = b.direction;
  if (direction !== "outgoing" && direction !== "incoming") return null;

  const amount = Number(b.amount);
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const currency = typeof b.currency === "string" ? b.currency.trim().toUpperCase() : "";
  const home = typeof b.home_currency === "string" ? b.home_currency.trim().toUpperCase() : "";
  if (!/^[A-Z]{3}$/.test(currency) || !/^[A-Z]{3}$/.test(home)) return null;
  if (currency === home) return null;

  const invoicedOn = typeof b.invoiced_on === "string" ? b.invoiced_on : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(invoicedOn)) return null;
  if (Number.isNaN(Date.parse(`${invoicedOn}T00:00:00Z`))) return null;

  const days = Number(b.days_until_due);
  if (!Number.isFinite(days) || days < 0 || days > 365) return null;

  const rawLabel = typeof b.label === "string" ? b.label.trim() : "";
  const label = rawLabel
    ? rawLabel.slice(0, 120)
    : direction === "incoming"
      ? "Customer receivable"
      : "Supplier invoice";

  return {
    direction,
    label,
    amount,
    currency,
    home_currency: home,
    invoiced_on: invoicedOn,
    days_until_due: Math.round(days),
  };
}

/**
 * The dashboard, risk and breakeven pages all analyze a *payment*, so the
 * current flow is always outgoing — a receivable has no margin, no breakeven
 * and no provider comparison. Incoming flows exist to feed the hedge detector.
 */
export function pickCurrentFlow(flows: Flow[], selectedId: string | null): Flow | null {
  const outgoing = flows.filter((f) => f.direction === "outgoing");
  if (outgoing.length === 0) return null;
  if (selectedId) {
    const found = outgoing.find((f) => f.id === selectedId);
    if (found) return found;
  }
  return [...outgoing].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
}

/** The built-in demo payable, used before a user has saved anything. */
export function sampleFlow(): Flow {
  return {
    id: SAMPLE_FLOW_ID,
    direction: "outgoing",
    label: `${MOCK_PROFILE.business_name.split(" ")[0]} sample`,
    amount: MOCK_PROFILE.invoice_amount,
    currency: MOCK_PROFILE.supplier_currency,
    home_currency: MOCK_PROFILE.home_currency,
    invoiced_on: isoDaysAgo(MOCK_PROFILE.days_until_due),
    days_until_due: MOCK_PROFILE.days_until_due,
    created_at: new Date().toISOString(),
  };
}
