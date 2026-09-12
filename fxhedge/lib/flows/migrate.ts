/**
 * lib/flows/migrate.ts — copy guest localStorage flows onto a brand-new account.
 * An account that already has rows is left alone: we never pile the demo
 * sample on top of a returning user's data.
 */
import type { FlowStore } from "./store";
import { SAMPLE_FLOW_ID } from "./flow";

export async function migrateGuestFlows(
  local: FlowStore,
  remote: FlowStore,
): Promise<{ uploaded: number }> {
  const existing = await remote.list();
  if (existing.length > 0) return { uploaded: 0 };

  const guests = (await local.list()).filter((f) => f.id !== SAMPLE_FLOW_ID);
  let uploaded = 0;
  for (const f of guests) {
    await remote.create({
      direction: f.direction,
      label: f.label,
      amount: f.amount,
      currency: f.currency,
      home_currency: f.home_currency,
      invoiced_on: f.invoiced_on,
      due_on: f.due_on,
    });
    uploaded += 1;
  }
  return { uploaded };
}
