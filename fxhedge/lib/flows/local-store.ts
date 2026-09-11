/**
 * lib/flows/local-store.ts — the localStorage backend.
 * Takes its Storage as an argument rather than reaching for the global, so it
 * is testable under Vitest's node environment with no jsdom.
 */
import type { Flow, FlowInput } from "@/types/flow";
import type { FlowStore } from "./store";
import { sampleFlow, addDaysIso, isValidIsoDate } from "./flow";

export const KEY_FLOWS = "halalflow:flows";
export const KEY_CURRENT = "halalflow:current-flow-id";

const LEGACY_CURRENT = "hedged:current-invoice";
const LEGACY_RECENT = "hedged:recent-invoices";

interface LegacyInvoice {
  id: string;
  amount: number;
  from: string;
  to: string;
  days: number;
  invoicedOn?: string;
  label: string;
  savedAt: string;
}

function legacyToFlow(inv: LegacyInvoice): Flow {
  const days = Number.isFinite(inv.days) ? inv.days : 21;
  const savedAt = inv.savedAt ?? new Date().toISOString();
  const savedOn = savedAt.slice(0, 10);
  return {
    id: inv.id,
    direction: "outgoing", // the old model only ever stored payables
    label: inv.label || "Supplier invoice",
    amount: Number(inv.amount),
    currency: inv.from,
    home_currency: inv.to,
    // Both ends anchor on the day the old record was saved, because that is
    // the only date its `days` countdown was ever measured from. Anchoring
    // either end on today lets invoiced_on drift past due_on, a pairing
    // parseFlowInput rejects as impossible.
    invoiced_on: inv.invoicedOn ?? addDaysIso(savedOn, -days),
    due_on: addDaysIso(savedOn, days),
    created_at: savedAt,
  };
}

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `flow_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Anything that would make `sorted` or the UI throw is not a usable flow. */
function isUsableFlow(value: unknown): value is Flow {
  if (typeof value !== "object" || value === null) return false;
  const f = value as Record<string, unknown>;
  return (
    typeof f.id === "string" &&
    (f.direction === "outgoing" || f.direction === "incoming") &&
    typeof f.label === "string" &&
    Number.isFinite(f.amount) &&
    typeof f.currency === "string" &&
    typeof f.home_currency === "string" &&
    isValidIsoDate(f.invoiced_on) &&
    isValidIsoDate(f.due_on) &&
    typeof f.created_at === "string"
  );
}

/**
 * `ok` distinguishes "the user has a list, possibly empty" from "there is
 * nothing usable here" — without it, a deliberately emptied list would be
 * re-seeded with the sample on every read.
 */
function readParsed(storage: Storage): { ok: boolean; flows: Flow[] } {
  let raw: string | null;
  try {
    raw = storage.getItem(KEY_FLOWS);
  } catch {
    return { ok: false, flows: [] };
  }
  if (raw === null) return { ok: false, flows: [] };
  try {
    const parsed: unknown = JSON.parse(raw);
    // A stored array is authoritative even when empty, but each entry still
    // has to be usable: a parseable `[null]` would otherwise crash sorting.
    return Array.isArray(parsed)
      ? { ok: true, flows: parsed.filter(isUsableFlow) }
      : { ok: false, flows: [] };
  } catch {
    return { ok: false, flows: [] };
  }
}

/** Returns whether the data actually landed — callers must not assume it did. */
function write(storage: Storage, flows: Flow[]): boolean {
  try {
    storage.setItem(KEY_FLOWS, JSON.stringify(flows));
    return true;
  } catch {
    // Quota or private mode. The session still works from memory, but
    // nothing that depends on persistence may proceed.
    return false;
  }
}

/**
 * Reads invoices out of the pre-flows localStorage keys so a returning user
 * keeps their work. Non-destructive by design: the caller clears the old keys
 * only once the converted list is confirmed saved, because deleting them here
 * would destroy the user's only copy if that save then failed.
 */
export function readLegacyInvoices(storage: Storage): Flow[] {
  const out: Flow[] = [];
  const seen = new Set<string>();

  for (const key of [LEGACY_CURRENT, LEGACY_RECENT]) {
    try {
      const raw = storage.getItem(key);
      if (!raw) continue;
      const parsed: unknown = JSON.parse(raw);
      const list = (Array.isArray(parsed) ? parsed : [parsed]) as LegacyInvoice[];
      for (const inv of list) {
        if (!inv?.id || seen.has(inv.id)) continue;
        seen.add(inv.id);
        try {
          out.push(legacyToFlow(inv));
        } catch {
          // One ragged record must not cost the user the rest of the key.
        }
      }
    } catch {
      // Unreadable or unparseable key — skip it and try the other one.
    }
  }

  return out;
}

export function clearLegacyInvoices(storage: Storage): void {
  try {
    storage.removeItem(LEGACY_CURRENT);
    storage.removeItem(LEGACY_RECENT);
  } catch {
    // Blocked storage. The keys stay, but the new list is already saved
    // under KEY_FLOWS, so the next load reads that and never re-migrates.
  }
}

export function readCurrentId(storage: Storage): string | null {
  try {
    return storage.getItem(KEY_CURRENT);
  } catch {
    return null;
  }
}

export function writeCurrentId(storage: Storage, id: string): void {
  try {
    storage.setItem(KEY_CURRENT, id);
  } catch {
    // Non-fatal: selection falls back to the newest outgoing flow.
  }
}

export function createLocalStore(storage: Storage): FlowStore {
  /**
   * A readable list wins, even when empty — the user may have deleted
   * everything. Otherwise this is a fresh or corrupt device: migrate the old
   * keys if they exist, else seed the sample.
   */
  function ensure(): Flow[] {
    const { ok, flows } = readParsed(storage);
    if (ok) return flows;

    // Filter before trusting: a converted record that cannot survive a round
    // trip (a "9,000" amount becomes NaN, then null) would be silently
    // dropped on the next read — after the legacy keys were already cleared.
    const migrated = readLegacyInvoices(storage).filter(isUsableFlow);
    const seeded = migrated.length > 0 ? migrated : [sampleFlow()];
    // Drop the old keys only once the converted list is actually saved:
    // a failed write here would otherwise erase the user's only copy.
    if (write(storage, seeded) && migrated.length > 0) clearLegacyInvoices(storage);
    return seeded;
  }

  // Plain comparison, matching pickCurrentFlow: these are fixed-width ISO
  // timestamps, so locale collation would only add failure modes.
  function sorted(flows: Flow[]): Flow[] {
    return [...flows].sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0));
  }

  return {
    async list() {
      return sorted(ensure());
    },
    async create(input: FlowInput) {
      const flow: Flow = { ...input, id: newId(), created_at: new Date().toISOString() };
      write(storage, [flow, ...ensure()]);
      return flow;
    },
    async remove(id: string) {
      write(
        storage,
        ensure().filter((f) => f.id !== id),
      );
    },
  };
}
