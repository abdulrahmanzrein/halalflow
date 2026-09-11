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

export function addDaysIso(iso: string, n: number): string {
  const t = Date.parse(`${iso}T00:00:00Z`);
  if (Number.isNaN(t)) return iso;
  return new Date(t + n * 86_400_000).toISOString().slice(0, 10);
}

/**
 * `Date.parse` alone is not a date validator: it silently rolls "2026-02-31"
 * forward to March 3rd. Round-tripping the parsed value back to a string is
 * what actually rejects impossible calendar dates.
 */
export function isValidIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const t = Date.parse(`${value}T00:00:00Z`);
  if (Number.isNaN(t)) return false;
  return new Date(t).toISOString().slice(0, 10) === value;
}

/** Days from `today` until the flow is due, floored at 0. */
export function daysUntilDue(
  flow: Pick<Flow, "due_on">,
  today: string = todayIsoDate(),
): number {
  const due = Date.parse(`${flow.due_on}T00:00:00Z`);
  const now = Date.parse(`${today}T00:00:00Z`);
  if (Number.isNaN(due) || Number.isNaN(now)) return 0;
  return Math.max(0, Math.round((due - now) / 86_400_000));
}

export function toPair(flow: Pick<Flow, "currency" | "home_currency">): string {
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

  if (!isValidIsoDate(b.invoiced_on)) return null;
  if (!isValidIsoDate(b.due_on)) return null;
  const invoicedOn = b.invoiced_on;
  const dueOn = b.due_on;

  // A due date before the invoice date is always a mistake, and a window
  // beyond a year is outside what the historical engines model.
  const span = daysUntilDue({ due_on: dueOn }, invoicedOn);
  if (Date.parse(`${dueOn}T00:00:00Z`) < Date.parse(`${invoicedOn}T00:00:00Z`)) return null;
  if (span > 365) return null;

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
    due_on: dueOn,
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
  // Plain comparison, not `localeCompare`: these are fixed-width machine
  // timestamps, so collation rules buy nothing and only add failure modes.
  return [...outgoing].sort((a, b) =>
    a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0,
  )[0];
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
    // Issued 21 days ago (the drift baseline) and due 21 days from today
    // (the forward exposure window) — the two are independent now that the
    // due date is stored rather than counted down from a stale number.
    invoiced_on: isoDaysAgo(MOCK_PROFILE.days_until_due),
    due_on: addDaysIso(todayIsoDate(), MOCK_PROFILE.days_until_due),
    created_at: new Date().toISOString(),
  };
}
