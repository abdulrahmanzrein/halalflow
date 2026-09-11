// types/flow.ts — a flow is an amount of foreign currency moving in or out on a
// date. A supplier payable and a customer receivable are the same shape with
// opposite `direction`; that is what makes natural hedge detection possible.

export type FlowDirection = "outgoing" | "incoming";

export interface Flow {
  id: string;
  direction: FlowDirection;
  label: string;
  amount: number;
  /** The foreign leg, e.g. "EUR". */
  currency: string;
  /** The business's own currency, e.g. "CAD". */
  home_currency: string;
  /** ISO date the invoice was issued, "2026-09-11". */
  invoiced_on: string;
  /**
   * ISO date the money is due to move. Stored as a date, not a countdown:
   * a stored "days until due" silently goes stale as time passes.
   * Use `daysUntilDue(flow)` for the remaining window.
   */
  due_on: string;
  /** ISO timestamp. */
  created_at: string;
}

export type FlowInput = Omit<Flow, "id" | "created_at">;
