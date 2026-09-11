/**
 * lib/flows/local-store.ts — the localStorage backend.
 * Takes its Storage as an argument rather than reaching for the global, so it
 * is testable under Vitest's node environment with no jsdom.
 */
import type { Flow, FlowInput } from "@/types/flow";
import type { FlowStore } from "./store";
import { sampleFlow, isoDaysAgo, addDaysIso } from "./flow";

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
  return {
    id: inv.id,
    direction: "outgoing", // the old model only ever stored payables
    label: inv.label || "Supplier invoice",
    amount: Number(inv.amount),
    currency: inv.from,
    home_currency: inv.to,
    invoiced_on: inv.invoicedOn ?? isoDaysAgo(days),
    // The old model stored a countdown from whenever it was last saved, so
    // that save date is the only honest anchor for the real due date.
    due_on: addDaysIso(savedAt.slice(0, 10), days),
    created_at: savedAt,
  };
}

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `flow_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * `ok` distinguishes "the user has a list, possibly empty" from "there is
 * nothing usable here" — without it, a deliberately emptied list would be
 * re-seeded with the sample on every read.
 */
function readParsed(storage: Storage): { ok: boolean; flows: Flow[] } {
  const raw = storage.getItem(KEY_FLOWS);
  if (raw === null) return { ok: false, flows: [] };
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? { ok: true, flows: parsed as Flow[] } : { ok: false, flows: [] };
  } catch {
    return { ok: false, flows: [] };
  }
}

function write(storage: Storage, flows: Flow[]): void {
  try {
    storage.setItem(KEY_FLOWS, JSON.stringify(flows));
  } catch {
    // Quota or private mode — the app still works for this session.
  }
}

/**
 * Pulls invoices out of the pre-flows localStorage keys and deletes them, so a
 * returning user keeps their work. Idempotent: the keys are gone afterwards.
 */
export function migrateLegacy(storage: Storage): Flow[] {
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
        out.push(legacyToFlow(inv));
      }
    } catch {
      // Corrupt legacy data — drop it rather than block the migration.
    }
  }

  storage.removeItem(LEGACY_CURRENT);
  storage.removeItem(LEGACY_RECENT);
  return out;
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

    const migrated = migrateLegacy(storage);
    const seeded = migrated.length > 0 ? migrated : [sampleFlow()];
    write(storage, seeded);
    return seeded;
  }

  function sorted(flows: Flow[]): Flow[] {
    return [...flows].sort((a, b) => b.created_at.localeCompare(a.created_at));
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
