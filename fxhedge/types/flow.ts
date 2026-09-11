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
  /** ISO date, "2026-09-11". */
  invoiced_on: string;
  days_until_due: number;
  /** ISO timestamp. */
  created_at: string;
}

export type FlowInput = Omit<Flow, "id" | "created_at">;
