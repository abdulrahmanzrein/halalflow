# Flows Backbone Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the localStorage `Invoice` and the never-written `scenarios` row with a single persisted `flow` that has a real `direction` column, bringing the dead natural hedge detector to life.

**Architecture:** One `flows` table with owner-only RLS. A `FlowStore` interface with a Supabase-backed adapter and a localStorage adapter; a single `useFlows()` hook is the only place that branches on auth state. Natural hedge detection moves client-side because `detectNaturalHedges` is already pure.

**Tech Stack:** Next.js 16.3.4 (App Router), React 19, TypeScript, Supabase (`@supabase/ssr`), Vitest 5.

**Design spec:** `docs/superpowers/specs/2026-09-11-flows-backbone-design.md`

## Global Constraints

- All file paths are relative to the repo root. The app lives in `fxhedge/`; run all `npm` commands from `fxhedge/`.
- The shell is **PowerShell**. Chain commands with `;` — `&&` is a syntax error.
- Next.js 16 route handlers receive dynamic `params` as a **Promise**: `{ params }: { params: Promise<{ id: string }> }`, and you must `await params`.
- Vitest runs with `environment: "node"`. Do **not** add jsdom or React Testing Library. Anything needing `Storage` takes it as an argument.
- Never use `SUPABASE_SERVICE_ROLE_KEY` in application code. Row-level security via `auth.uid()` is the only authorization mechanism. The service-role key appears solely in `fxhedge/scripts/test-supabase.mts`.
- Product copy rules, enforced everywhere: never predict exchange-rate direction, never move money, never claim to be a fatwa or financial advice.
- Verification commands: `npm test`, `npx tsc --noEmit`, `npm run build`.
- Commit after every task.

## File Structure

**Create:**
- `fxhedge/types/flow.ts` — `FlowDirection`, `Flow`, `FlowInput`. The contract every other new file imports.
- `fxhedge/lib/flows/flow.ts` — pure helpers: validation, date helpers, `toPair`, `flowToCurrencyFlow`, `pickCurrentFlow`, `sampleFlow`.
- `fxhedge/lib/flows/store.ts` — the `FlowStore` interface both adapters implement.
- `fxhedge/lib/flows/local-store.ts` — localStorage adapter + legacy-key migration.
- `fxhedge/lib/flows/api-store.ts` — `fetch` adapter over `/api/flows`.
- `fxhedge/hooks/use-flows.ts` — the only file that branches on auth state.
- `fxhedge/app/api/flows/route.ts` — `GET` list, `POST` create.
- `fxhedge/app/api/flows/[id]/route.ts` — `DELETE` one.
- `fxhedge/supabase/migrations/2026-09-11-flows.sql` — the migration to run in the Supabase SQL editor.
- Tests: `fxhedge/lib/__tests__/flow.test.ts`, `fxhedge/lib/__tests__/local-store.test.ts`, `fxhedge/app/api/flows/__tests__/route.test.ts`.

**Modify:**
- `fxhedge/lib/natural-hedge.ts` — import `FlowDirection` from `types/flow` instead of declaring it; re-export for compatibility.
- `fxhedge/types/index.ts` — delete the `Scenario` interface.
- `fxhedge/vitest.config.ts` — extend `include` to pick up route tests.
- `fxhedge/supabase/schema.sql` — `flows` replaces `scenarios`.
- `fxhedge/scripts/test-supabase.mts` — check `flows`, not `scenarios`.
- `fxhedge/hooks/use-app-data.ts` — read from `useFlows`.
- `fxhedge/app/(auth)/onboarding/page.tsx` — seed via `addFlow`.
- `fxhedge/app/(app)/transfer/page.tsx` — direction toggle, `useFlows`.
- `fxhedge/components/natural-hedge-card.tsx` — take `flows` as a prop, detect client-side.
- `fxhedge/app/(app)/breakeven/page.tsx` — use the card, delete the inline duplicate.

**Delete:**
- `fxhedge/hooks/use-invoice.ts`
- `fxhedge/app/api/scenarios/route.ts`
- `fxhedge/app/api/natural-hedge/route.ts`

---

### Task 1: Flow contract and pure helpers

**Files:**
- Create: `fxhedge/types/flow.ts`
- Create: `fxhedge/lib/flows/flow.ts`
- Test: `fxhedge/lib/__tests__/flow.test.ts`
- Modify: `fxhedge/lib/natural-hedge.ts:8`

**Interfaces:**
- Consumes: `MOCK_PROFILE` from `fxhedge/lib/fixtures.ts`; `CurrencyFlow` from `fxhedge/lib/natural-hedge.ts`.
- Produces: `Flow`, `FlowInput`, `FlowDirection` (from `@/types/flow`); and from `@/lib/flows/flow`: `todayIsoDate(): string`, `isoDaysAgo(n: number): string`, `addDaysIso(iso: string, n: number): string`, `isValidIsoDate(value: unknown): value is string`, `daysUntilDue(flow: Pick<Flow, "due_on">, today?: string): number`, `toPair(flow: Pick<Flow, "currency" | "home_currency">): string`, `flowToCurrencyFlow(flow: Flow): CurrencyFlow`, `parseFlowInput(body: unknown): FlowInput | null`, `pickCurrentFlow(flows: Flow[], selectedId: string | null): Flow | null`, `sampleFlow(): Flow`, `SAMPLE_FLOW_ID: string`, `CURRENCIES: readonly string[]`.

- [ ] **Step 1: Create the type contract**

Create `fxhedge/types/flow.ts`:

```ts
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
```

- [ ] **Step 2: Write the failing test**

Create `fxhedge/lib/__tests__/flow.test.ts`:

```ts
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
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd fxhedge; npx vitest run lib/__tests__/flow.test.ts`
Expected: FAIL — `Failed to resolve import "../flows/flow"`.

- [ ] **Step 4: Write the implementation**

Create `fxhedge/lib/flows/flow.ts`:

```ts
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
    // Issued 21 days ago (the drift baseline) and due 21 days from today
    // (the forward exposure window) — the two are independent now that the
    // due date is stored rather than counted down from a stale number.
    invoiced_on: isoDaysAgo(MOCK_PROFILE.days_until_due),
    due_on: addDaysIso(todayIsoDate(), MOCK_PROFILE.days_until_due),
    created_at: new Date().toISOString(),
  };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd fxhedge; npx vitest run lib/__tests__/flow.test.ts`
Expected: PASS, all tests in the file.

- [ ] **Step 6: Remove the duplicate FlowDirection declaration**

In `fxhedge/lib/natural-hedge.ts`, replace line 8:

```ts
export type FlowDirection = "outgoing" | "incoming";
```

with an import from the canonical location plus a re-export, so existing importers keep working. Add the import at the top of the file (after the leading docblock) and the re-export in place of line 8:

```ts
import type { FlowDirection } from "@/types/flow";

export type { FlowDirection };
```

- [ ] **Step 7: Verify the whole suite and types still pass**

Run: `cd fxhedge; npx vitest run; npx tsc --noEmit`
Expected: all test files PASS (including the untouched `natural-hedge.test.ts`), no TypeScript errors.

- [ ] **Step 8: Commit**

```bash
git add fxhedge/types/flow.ts fxhedge/lib/flows/flow.ts fxhedge/lib/__tests__/flow.test.ts fxhedge/lib/natural-hedge.ts
git commit -m "feat(flows): add the Flow contract and its pure helpers"
```

---

### Task 2: localStorage adapter with legacy migration

**Files:**
- Create: `fxhedge/lib/flows/store.ts`
- Create: `fxhedge/lib/flows/local-store.ts`
- Test: `fxhedge/lib/__tests__/local-store.test.ts`

**Interfaces:**
- Consumes: `Flow`, `FlowInput` from `@/types/flow`; `sampleFlow`, `addDaysIso`, `isValidIsoDate` from `@/lib/flows/flow`.
- Produces: `FlowStore` interface (`list(): Promise<Flow[]>`, `create(input: FlowInput): Promise<Flow>`, `remove(id: string): Promise<void>`); `createLocalStore(storage: Storage): FlowStore`; `readLegacyInvoices(storage: Storage): Flow[]` (non-destructive); `clearLegacyInvoices(storage: Storage): void`; `readCurrentId(storage: Storage): string | null`; `writeCurrentId(storage: Storage, id: string): void`; constants `KEY_FLOWS`, `KEY_CURRENT`.

**Why the migration is split into read and clear:** deleting the legacy keys inside the same call that returns the data means a failed write destroys the user's only copy. The store clears the old keys only after the new list is confirmed persisted.

- [ ] **Step 1: Define the store interface**

Create `fxhedge/lib/flows/store.ts`:

```ts
import type { Flow, FlowInput } from "@/types/flow";

/**
 * The one interface both backends implement. `hooks/use-flows.ts` is the only
 * place that decides which implementation is in play.
 */
export interface FlowStore {
  list(): Promise<Flow[]>;
  create(input: FlowInput): Promise<Flow>;
  remove(id: string): Promise<void>;
}
```

- [ ] **Step 2: Write the failing test**

Create `fxhedge/lib/__tests__/local-store.test.ts`:

```ts
import { describe, expect, it, beforeEach } from "vitest";
import {
  createLocalStore,
  readLegacyInvoices,
  clearLegacyInvoices,
  readCurrentId,
  writeCurrentId,
  KEY_FLOWS,
} from "../flows/local-store";

/** In-memory Storage so these tests need no DOM environment. */
function fakeStorage(seed: Record<string, string> = {}): Storage {
  const map = new Map<string, string>(Object.entries(seed));
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k: string) => map.get(k) ?? null,
    key: (i: number) => [...map.keys()][i] ?? null,
    removeItem: (k: string) => void map.delete(k),
    setItem: (k: string, v: string) => void map.set(k, v),
  } as Storage;
}

describe("createLocalStore", () => {
  let storage: Storage;

  beforeEach(() => {
    storage = fakeStorage();
  });

  it("seeds the sample flow on a fresh device", async () => {
    const store = createLocalStore(storage);
    const flows = await store.list();
    expect(flows).toHaveLength(1);
    expect(flows[0].direction).toBe("outgoing");
    expect(flows[0].currency).toBe("EUR");
  });

  it("creates a flow and returns it newest-first", async () => {
    const store = createLocalStore(storage);
    const created = await store.create({
      direction: "incoming",
      label: "German customer",
      amount: 5000,
      currency: "EUR",
      home_currency: "CAD",
      invoiced_on: "2026-09-01",
      due_on: "2026-10-01",
    });
    expect(created.id).toBeTruthy();
    expect(created.created_at).toBeTruthy();

    const flows = await store.list();
    expect(flows).toHaveLength(2);
    expect(flows[0].id).toBe(created.id);
  });

  it("removes a flow", async () => {
    const store = createLocalStore(storage);
    const created = await store.create({
      direction: "incoming",
      label: "German customer",
      amount: 5000,
      currency: "EUR",
      home_currency: "CAD",
      invoiced_on: "2026-09-01",
      due_on: "2026-10-01",
    });
    await store.remove(created.id);
    const flows = await store.list();
    expect(flows.find((f) => f.id === created.id)).toBeUndefined();
  });

  it("respects an explicitly emptied list instead of re-seeding", async () => {
    storage.setItem(KEY_FLOWS, JSON.stringify([]));
    const store = createLocalStore(storage);
    expect(await store.list()).toHaveLength(0);
  });

  it("survives corrupt JSON", async () => {
    storage.setItem(KEY_FLOWS, "{not json");
    const store = createLocalStore(storage);
    expect(await store.list()).toHaveLength(1); // falls back to the sample
  });

  it("drops malformed entries instead of crashing on them", async () => {
    // A parseable array whose entries are junk is the path that actually
    // throws — sorting calls created_at on every element.
    storage.setItem(
      KEY_FLOWS,
      JSON.stringify([
        null,
        { id: "no-dates" },
        {
          id: "good",
          direction: "outgoing",
          label: "Real",
          amount: 100,
          currency: "EUR",
          home_currency: "CAD",
          invoiced_on: "2026-09-01",
          due_on: "2026-09-22",
          created_at: "2026-09-01T00:00:00.000Z",
        },
      ]),
    );
    const flows = await createLocalStore(storage).list();
    expect(flows).toHaveLength(1);
    expect(flows[0].id).toBe("good");
  });
});

describe("legacy invoices", () => {
  const oldInvoice = {
    id: "old1",
    amount: 9000,
    from: "USD",
    to: "CAD",
    days: 30,
    invoicedOn: "2026-08-01",
    label: "Old invoice",
    savedAt: "2026-08-01T00:00:00.000Z",
  };

  it("converts old hedged: invoices into outgoing flows", () => {
    const storage = fakeStorage({
      "hedged:current-invoice": JSON.stringify(oldInvoice),
      "hedged:recent-invoices": JSON.stringify([
        {
          id: "old2",
          amount: 4000,
          from: "GBP",
          to: "CAD",
          days: 14,
          invoicedOn: "2026-07-01",
          label: "Older invoice",
          savedAt: "2026-07-01T00:00:00.000Z",
        },
      ]),
    });

    const flows = readLegacyInvoices(storage);
    expect(flows).toHaveLength(2);
    expect(flows.every((f) => f.direction === "outgoing")).toBe(true);
    expect(flows[0].currency).toBe("USD");
    expect(flows[0].home_currency).toBe("CAD");
    expect(flows[0].invoiced_on).toBe("2026-08-01");
    // 30 days counted from the day the old record was last saved.
    expect(flows[0].due_on).toBe("2026-08-31");
  });

  it("anchors both dates on savedAt when the old record has no invoice date", () => {
    // JSON.stringify drops undefined keys, so this is a record without the field.
    const noDate = { ...oldInvoice, invoicedOn: undefined };
    const storage = fakeStorage({ "hedged:current-invoice": JSON.stringify(noDate) });
    const [flow] = readLegacyInvoices(storage);
    // Anchoring one end on today would let invoiced_on drift past due_on,
    // which parseFlowInput rejects as impossible.
    expect(flow.invoiced_on).toBe("2026-07-02"); // savedAt - 30 days
    expect(flow.due_on).toBe("2026-08-31");      // savedAt + 30 days
  });

  it("de-duplicates an invoice present in both legacy keys", () => {
    const storage = fakeStorage({
      "hedged:current-invoice": JSON.stringify(oldInvoice),
      "hedged:recent-invoices": JSON.stringify([oldInvoice]),
    });
    expect(readLegacyInvoices(storage)).toHaveLength(1);
  });

  it("reads without destroying, and clears only when asked", () => {
    const storage = fakeStorage({ "hedged:current-invoice": JSON.stringify(oldInvoice) });
    expect(readLegacyInvoices(storage)).toHaveLength(1);
    expect(readLegacyInvoices(storage)).toHaveLength(1); // reading is not destructive
    clearLegacyInvoices(storage);
    expect(readLegacyInvoices(storage)).toHaveLength(0);
  });

  it("migrates through the store and actually persists the result", async () => {
    const storage = fakeStorage({ "hedged:current-invoice": JSON.stringify(oldInvoice) });
    const flows = await createLocalStore(storage).list();
    expect(flows).toHaveLength(1);
    expect(flows[0].label).toBe("Old invoice");
    // Assert identity, not count: sampleFlow() is also one element, so a
    // write that silently persisted nothing would pass a length check.
    const again = await createLocalStore(storage).list();
    expect(again[0].label).toBe("Old invoice");
    expect(storage.getItem("hedged:current-invoice")).toBeNull();
  });

  it("keeps the legacy data when the write fails, rather than losing it", async () => {
    const storage = fakeStorage({ "hedged:current-invoice": JSON.stringify(oldInvoice) });
    storage.setItem = () => {
      throw new Error("quota exceeded");
    };

    const flows = await createLocalStore(storage).list();
    expect(flows[0].label).toBe("Old invoice"); // still usable for this session
    // The only copy survives, so the next load can retry the migration.
    expect(storage.getItem("hedged:current-invoice")).not.toBeNull();
  });

  it("does not clear the legacy keys when a converted record is unusable", async () => {
    // A legacy amount stored as a formatted string becomes NaN, which
    // JSON round-trips to null and fails isUsableFlow on the next read.
    const storage = fakeStorage({
      "hedged:current-invoice": JSON.stringify({ ...oldInvoice, amount: "9,000" }),
    });
    await createLocalStore(storage).list();
    expect(storage.getItem("hedged:current-invoice")).not.toBeNull();
  });
});

describe("current id", () => {
  it("round-trips the selected flow id", () => {
    const storage = fakeStorage();
    expect(readCurrentId(storage)).toBeNull();
    writeCurrentId(storage, "abc");
    expect(readCurrentId(storage)).toBe("abc");
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd fxhedge; npx vitest run lib/__tests__/local-store.test.ts`
Expected: FAIL — `Failed to resolve import "../flows/local-store"`.

- [ ] **Step 4: Write the implementation**

Create `fxhedge/lib/flows/local-store.ts`:

```ts
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
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd fxhedge; npx vitest run lib/__tests__/local-store.test.ts`
Expected: PASS, all tests in the file.

- [ ] **Step 6: Commit**

```bash
git add fxhedge/lib/flows/store.ts fxhedge/lib/flows/local-store.ts fxhedge/lib/__tests__/local-store.test.ts
git commit -m "feat(flows): add the localStorage store with legacy invoice migration"
```

---

### Task 3: `/api/flows` route handlers

**Files:**
- Create: `fxhedge/app/api/flows/route.ts`
- Create: `fxhedge/app/api/flows/[id]/route.ts`
- Test: `fxhedge/app/api/flows/__tests__/route.test.ts`
- Modify: `fxhedge/vitest.config.ts:15`

**Interfaces:**
- Consumes: `createClient` from `@/lib/supabase/server`; `parseFlowInput` from `@/lib/flows/flow`; `Flow` from `@/types/flow`.
- Produces: `GET`/`POST` exports in `app/api/flows/route.ts` and a `DELETE` export in `app/api/flows/[id]/route.ts`. Response contract: `GET` → `Flow[]`; `POST` → `Flow` with status 201; `DELETE` → `{ ok: true }`; errors → `{ ok: false, error: string }` with 400, 401 or 500.

- [ ] **Step 1: Let Vitest see route tests**

In `fxhedge/vitest.config.ts`, replace line 15:

```ts
    include: ["lib/__tests__/**/*.test.ts"],
```

with:

```ts
    include: ["lib/__tests__/**/*.test.ts", "app/**/__tests__/**/*.test.ts"],
```

- [ ] **Step 2: Write the failing test**

Create `fxhedge/app/api/flows/__tests__/route.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from "vitest";

const getUser = vi.fn();
const from = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser }, from }),
}));

import { GET, POST } from "../route";
import { DELETE } from "../[id]/route";

/**
 * Supabase query builders are chainable and awaitable. A `then` on the chain
 * makes `await supabase.from(...).select(...).eq(...)` resolve to `result`.
 */
function chain(result: { data: unknown; error: unknown }) {
  const c: Record<string, unknown> = {};
  for (const m of ["select", "eq", "order", "insert", "delete"]) {
    c[m] = vi.fn(() => c);
  }
  c.single = vi.fn(async () => result);
  c.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve);
  return c;
}

const signedIn = { data: { user: { id: "user-1" } } };
const signedOut = { data: { user: null } };

const validBody = {
  direction: "outgoing",
  label: "Turkish supplier",
  amount: 12000,
  currency: "EUR",
  home_currency: "CAD",
  invoiced_on: "2026-09-01",
  due_on: "2026-09-22",
};

function post(body: unknown) {
  return new Request("http://localhost/api/flows", {
    method: "POST",
    body: JSON.stringify(body),
  }) as unknown as Parameters<typeof POST>[0];
}

beforeEach(() => {
  getUser.mockReset();
  from.mockReset();
});

describe("GET /api/flows", () => {
  it("401s when signed out", async () => {
    getUser.mockResolvedValue(signedOut);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns the user's flows", async () => {
    getUser.mockResolvedValue(signedIn);
    const rows = [{ id: "f1", direction: "outgoing" }];
    from.mockReturnValue(chain({ data: rows, error: null }));

    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(rows);
    expect(from).toHaveBeenCalledWith("flows");
  });

  it("500s when the query fails", async () => {
    getUser.mockResolvedValue(signedIn);
    from.mockReturnValue(chain({ data: null, error: { message: "boom" } }));
    const res = await GET();
    expect(res.status).toBe(500);
  });
});

describe("POST /api/flows", () => {
  it("400s on invalid input before touching the database", async () => {
    const res = await POST(post({ ...validBody, amount: -1 }));
    expect(res.status).toBe(400);
    expect(from).not.toHaveBeenCalled();
  });

  it("400s on a malformed body", async () => {
    const bad = new Request("http://localhost/api/flows", {
      method: "POST",
      body: "{not json",
    }) as unknown as Parameters<typeof POST>[0];
    expect((await POST(bad)).status).toBe(400);
  });

  it("401s when signed out", async () => {
    getUser.mockResolvedValue(signedOut);
    expect((await POST(post(validBody))).status).toBe(401);
  });

  it("creates the flow scoped to the user", async () => {
    getUser.mockResolvedValue(signedIn);
    const created = { id: "f9", ...validBody };
    const c = chain({ data: created, error: null });
    from.mockReturnValue(c);

    const res = await POST(post(validBody));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual(created);
    expect(c.insert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: "user-1", direction: "outgoing" }),
    );
  });
});

describe("DELETE /api/flows/[id]", () => {
  const ctx = { params: Promise.resolve({ id: "f1" }) };

  it("401s when signed out", async () => {
    getUser.mockResolvedValue(signedOut);
    const res = await DELETE(new Request("http://localhost") as never, ctx);
    expect(res.status).toBe(401);
  });

  it("deletes only the caller's row", async () => {
    getUser.mockResolvedValue(signedIn);
    const c = chain({ data: null, error: null });
    from.mockReturnValue(c);

    const res = await DELETE(new Request("http://localhost") as never, ctx);
    expect(res.status).toBe(200);
    expect(c.eq).toHaveBeenCalledWith("id", "f1");
    expect(c.eq).toHaveBeenCalledWith("user_id", "user-1");
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd fxhedge; npx vitest run app/api/flows/__tests__/route.test.ts`
Expected: FAIL — `Failed to resolve import "../route"`.

- [ ] **Step 4: Write the list and create handlers**

Create `fxhedge/app/api/flows/route.ts`:

```ts
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseFlowInput } from "@/lib/flows/flow";
import type { Flow } from "@/types/flow";

/**
 * GET  /api/flows — list the signed-in user's flows, newest first.
 * POST /api/flows — create one. RLS (auth.uid()) enforces ownership;
 * the service-role key is never used here.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("flows")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json(data as Flow[]);
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = parseFlowInput(body);
  if (!parsed) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Invalid flow: need direction 'outgoing' or 'incoming', amount>0, distinct 3-letter currency and home_currency, invoiced_on and due_on as real YYYY-MM-DD dates, and due_on within a year of invoiced_on",
      },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("flows")
    .insert({ ...parsed, user_id: user.id })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json(data as Flow, { status: 201 });
}
```

- [ ] **Step 5: Write the delete handler**

Create `fxhedge/app/api/flows/[id]/route.ts`:

```ts
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * DELETE /api/flows/[id] — remove one of the caller's flows.
 * The explicit user_id filter is belt-and-braces on top of RLS.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { error } = await supabase.from("flows").delete().eq("id", id).eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `cd fxhedge; npx vitest run app/api/flows/__tests__/route.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 7: Commit**

```bash
git add fxhedge/app/api/flows fxhedge/vitest.config.ts
git commit -m "feat(flows): add the /api/flows route handlers with tests"
```

---

### Task 4: Database migration and removal of scenarios

**Files:**
- Create: `fxhedge/supabase/migrations/2026-09-11-flows.sql`
- Modify: `fxhedge/supabase/schema.sql:18-49`
- Modify: `fxhedge/scripts/test-supabase.mts:44-45`
- Modify: `fxhedge/types/index.ts:17-27`
- Delete: `fxhedge/app/api/scenarios/route.ts`
- Delete: `fxhedge/app/api/natural-hedge/route.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks at runtime; the `flows` table must match the column names in `types/flow.ts` from Task 1.
- Produces: the `public.flows` table that Task 3's handlers query. No TypeScript exports.

**Note:** `app/(app)/breakeven/page.tsx` still fetches `/api/natural-hedge` at this point. Its `.catch(() => {})` swallows the resulting 404, so the hedge section stays hidden exactly as it is today. Task 8 removes the fetch.

- [ ] **Step 1: Write the migration**

Create `fxhedge/supabase/migrations/2026-09-11-flows.sql`:

```sql
-- 2026-09-11 — replace `scenarios` with `flows`.
-- Run in: supabase.com/dashboard -> SQL Editor -> New query -> paste -> Run
-- Safe to drop `scenarios`: no application code has ever written to it.

create table public.flows (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  direction text not null check (direction in ('outgoing','incoming')),
  label text not null default 'Supplier invoice',
  amount numeric not null check (amount > 0),
  currency text not null,
  home_currency text not null,
  invoiced_on date not null,
  -- A date, not a countdown: a stored "days until due" goes stale.
  due_on date not null check (due_on >= invoiced_on),
  created_at timestamptz default now()
);

create index flows_user_created_idx on public.flows (user_id, created_at desc);

alter table public.flows enable row level security;

create policy "flows visible to owner"
  on public.flows for select using (auth.uid() = user_id);
create policy "flows insert by owner"
  on public.flows for insert with check (auth.uid() = user_id);
create policy "flows updateable by owner"
  on public.flows for update using (auth.uid() = user_id);
create policy "flows delete by owner"
  on public.flows for delete using (auth.uid() = user_id);

drop table if exists public.scenarios;
```

- [ ] **Step 2: Run the migration against Supabase**

Open the Supabase dashboard → SQL Editor → New query, paste the contents of `fxhedge/supabase/migrations/2026-09-11-flows.sql`, and Run.
Expected: "Success. No rows returned."

- [ ] **Step 3: Update the canonical schema file**

In `fxhedge/supabase/schema.sql`, delete lines 18-29 (the `create table public.scenarios` block) and lines 42-49 (the four `scenarios` policies), and delete `public.scenarios` from the `alter table ... enable row level security` on line 33. In their place, add the `flows` table, index and policies exactly as written in Step 1 (without the trailing `drop table` line, which belongs only to the migration).

- [ ] **Step 4: Point the integration script at the new table**

In `fxhedge/scripts/test-supabase.mts`, replace lines 44-45:

```ts
const scenarios = await admin.from("scenarios").select("id").limit(1);
check("schema: scenarios table reachable", !scenarios.error, scenarios.error?.message);
```

with:

```ts
const flows = await admin.from("flows").select("id").limit(1);
check("schema: flows table reachable", !flows.error, flows.error?.message);
```

- [ ] **Step 5: Delete the dead routes and the Scenario type**

```bash
git rm fxhedge/app/api/scenarios/route.ts fxhedge/app/api/natural-hedge/route.ts
```

Then in `fxhedge/types/index.ts`, delete the whole `Scenario` interface (lines 17-27):

```ts
export interface Scenario {
  id: string;
  user_id: string;
  label: string;
  amount: number;
  pair: string;                 // "EUR-CAD"
  revenue: number;
  days_ago: number;
  target_margin: number;
  saved_at: string;
}
```

- [ ] **Step 6: Verify nothing references the removed symbols**

Run: `cd fxhedge; npx tsc --noEmit; npx vitest run`
Expected: no TypeScript errors, all tests PASS.

- [ ] **Step 7: Commit**

```bash
git add fxhedge/supabase fxhedge/scripts/test-supabase.mts fxhedge/types/index.ts
git commit -m "feat(flows): migrate the database from scenarios to flows"
```

---

### Task 5: API store and the `useFlows` hook

**Files:**
- Create: `fxhedge/lib/flows/api-store.ts`
- Create: `fxhedge/hooks/use-flows.ts`

**Interfaces:**
- Consumes: `FlowStore` from `@/lib/flows/store`; `createLocalStore`, `readCurrentId`, `writeCurrentId` from `@/lib/flows/local-store`; `pickCurrentFlow`, `sampleFlow` from `@/lib/flows/flow`; `useUser` from `@/hooks/use-user` (returns `{ loading, signedIn, email, name, profile }`).
- Produces: `createApiStore(): FlowStore`; `useFlows(): UseFlowsResult` where

```ts
interface UseFlowsResult {
  flows: Flow[];            // newest first
  current: Flow;            // always an outgoing flow; the sample when none exist
  ready: boolean;
  mode: "guest" | "account";
  addFlow(input: FlowInput): Promise<Flow>;
  selectFlow(id: string): void;
  removeFlow(id: string): Promise<void>;
}
```

- [ ] **Step 1: Write the API store**

Create `fxhedge/lib/flows/api-store.ts`:

```ts
/** lib/flows/api-store.ts — the Supabase-backed store, reached over /api/flows. */
import type { Flow, FlowInput } from "@/types/flow";
import type { FlowStore } from "./store";

async function failure(res: Response): Promise<never> {
  const body = (await res.json().catch(() => null)) as { error?: string } | null;
  throw new Error(body?.error ?? `Request failed (${res.status})`);
}

export function createApiStore(): FlowStore {
  return {
    async list() {
      const res = await fetch("/api/flows");
      if (!res.ok) return failure(res);
      return (await res.json()) as Flow[];
    },
    async create(input: FlowInput) {
      const res = await fetch("/api/flows", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) return failure(res);
      return (await res.json()) as Flow;
    },
    async remove(id: string) {
      const res = await fetch(`/api/flows/${id}`, { method: "DELETE" });
      if (!res.ok) await failure(res);
    },
  };
}
```

- [ ] **Step 2: Write the hook**

Create `fxhedge/hooks/use-flows.ts`:

```ts
"use client";
/**
 * hooks/use-flows.ts — the ONLY place that decides which FlowStore is in play.
 * Signed in: Supabase over /api/flows. Signed out: localStorage.
 * Pages call this hook and never learn which backend answered.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Flow, FlowInput } from "@/types/flow";
import type { FlowStore } from "@/lib/flows/store";
import { createLocalStore, readCurrentId, writeCurrentId } from "@/lib/flows/local-store";
import { createApiStore } from "@/lib/flows/api-store";
import { pickCurrentFlow, sampleFlow } from "@/lib/flows/flow";
import { useUser } from "./use-user";

export interface UseFlowsResult {
  flows: Flow[];
  current: Flow;
  ready: boolean;
  mode: "guest" | "account";
  addFlow(input: FlowInput): Promise<Flow>;
  selectFlow(id: string): void;
  removeFlow(id: string): Promise<void>;
}

/** Selection is a UI preference, so it lives on the device in both modes. */
function deviceStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function useFlows(): UseFlowsResult {
  const user = useUser();
  const mode: "guest" | "account" = user.signedIn ? "account" : "guest";

  const [flows, setFlows] = useState<Flow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  // Stable across renders so `current` never changes identity for no reason.
  const sampleRef = useRef<Flow>(sampleFlow());

  const store: FlowStore | null = useMemo(() => {
    if (user.loading) return null;
    if (user.signedIn) return createApiStore();
    const storage = deviceStorage();
    return storage ? createLocalStore(storage) : null;
  }, [user.loading, user.signedIn]);

  useEffect(() => {
    if (!store) return;
    let alive = true;

    const storage = deviceStorage();
    if (storage) setSelectedId(readCurrentId(storage));

    store
      .list()
      .then((list) => {
        if (alive) setFlows(list);
      })
      .catch(() => {
        if (alive) setFlows([]);
      })
      .finally(() => {
        if (alive) setReady(true);
      });

    return () => {
      alive = false;
    };
  }, [store]);

  const addFlow = useCallback(
    async (input: FlowInput) => {
      if (!store) throw new Error("Flows are not ready yet");
      const created = await store.create(input);
      setFlows((prev) => [created, ...prev]);
      // Only a payable can be the analyzed flow; a receivable just feeds the hedge detector.
      if (created.direction === "outgoing") {
        setSelectedId(created.id);
        const storage = deviceStorage();
        if (storage) writeCurrentId(storage, created.id);
      }
      return created;
    },
    [store],
  );

  const selectFlow = useCallback(
    (id: string) => {
      const target = flows.find((f) => f.id === id);
      if (!target || target.direction !== "outgoing") return;
      setSelectedId(id);
      const storage = deviceStorage();
      if (storage) writeCurrentId(storage, id);
    },
    [flows],
  );

  const removeFlow = useCallback(
    async (id: string) => {
      if (!store) return;
      await store.remove(id);
      setFlows((prev) => prev.filter((f) => f.id !== id));
      if (selectedId === id) setSelectedId(null);
    },
    [store, selectedId],
  );

  const current = pickCurrentFlow(flows, selectedId) ?? sampleRef.current;

  return { flows, current, ready, mode, addFlow, selectFlow, removeFlow };
}
```

- [ ] **Step 3: Verify types compile**

Run: `cd fxhedge; npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add fxhedge/lib/flows/api-store.ts fxhedge/hooks/use-flows.ts
git commit -m "feat(flows): add the API store and the useFlows hook"
```

---

### Task 6: Move `useAppData` and onboarding onto flows

**Files:**
- Modify: `fxhedge/hooks/use-app-data.ts:4`, `:90`, `:108-114`, `:179`
- Modify: `fxhedge/app/(auth)/onboarding/page.tsx:5`, `:19`, `:62-72`

**Interfaces:**
- Consumes: `useFlows` from `@/hooks/use-flows`; `todayIsoDate` from `@/lib/flows/flow`.
- Produces: no new exports. `AppData`'s shape is unchanged, so `risk`, `zakat`, `sharia`, `ask`, `dashboard` and `breakeven` keep working untouched.

- [ ] **Step 1: Swap the hook in `use-app-data.ts`**

Replace line 4:

```ts
import { useInvoice } from "./use-invoice";
```

with:

```ts
import { useFlows } from "./use-flows";
```

- [ ] **Step 2: Read the current flow instead of the current invoice**

Replace line 90:

```ts
  const { current, ready } = useInvoice();
```

with:

```ts
  const { current, ready } = useFlows();
```

- [ ] **Step 3: Map the renamed fields**

Replace lines 108-114:

```ts
    const inv   = current.amount;
    const from  = current.from;
    const to    = current.to;
    const days  = current.days;
    const label = current.label;
    // Drift is measured from the issue date; the risk window looks forward to the due date.
    const since = daysSince(current.invoicedOn);
```

with:

```ts
    const inv   = current.amount;
    const from  = current.currency;
    const to    = current.home_currency;
    // Derived, not stored, so the window shrinks as the due date approaches.
    const days  = daysUntilDue(current);
    const label = current.label;
    // Drift is measured from the issue date; the risk window looks forward to the due date.
    const since = daysSince(current.invoiced_on);
```

Add the helper to the imports at the top of `fxhedge/hooks/use-app-data.ts`:

```ts
import { daysUntilDue } from "@/lib/flows/flow";
```

- [ ] **Step 4: Update the effect dependencies**

Replace line 179:

```ts
  }, [ready, current.amount, current.from, current.to, current.days, current.invoicedOn, current.label]);
```

with:

```ts
  }, [ready, current.amount, current.currency, current.home_currency, current.due_on, current.invoiced_on, current.label]);
```

- [ ] **Step 5: Update onboarding's import**

In `fxhedge/app/(auth)/onboarding/page.tsx`, replace line 5:

```ts
import { useInvoice, todayIsoDate } from "@/hooks/use-invoice";
```

with:

```ts
import { useFlows } from "@/hooks/use-flows";
import { todayIsoDate, addDaysIso } from "@/lib/flows/flow";
```

- [ ] **Step 6: Seed the first flow through the store**

Replace line 19:

```ts
  const { setCurrent } = useInvoice();
```

with:

```ts
  const { addFlow } = useFlows();
```

Then replace lines 62-72:

```ts
      // Seed the working invoice so the dashboard reflects these answers at once.
      setCurrent({
        id: "onboarding",
        amount,
        from: supplierCurrency,
        to: homeCurrency,
        days: Math.round(days),
        invoicedOn: todayIsoDate(),
        label: businessName.trim() ? `${businessName.trim()} invoice` : "First invoice",
        savedAt: new Date().toISOString(),
      });
```

with:

```ts
      // Seed the working flow so the dashboard reflects these answers at once.
      await addFlow({
        direction: "outgoing",
        label: businessName.trim() ? `${businessName.trim()} invoice` : "First invoice",
        amount,
        currency: supplierCurrency,
        home_currency: homeCurrency,
        invoiced_on: todayIsoDate(),
        due_on: addDaysIso(todayIsoDate(), Math.round(days)),
      });
```

- [ ] **Step 7: Verify**

Run: `cd fxhedge; npx tsc --noEmit; npx vitest run`
Expected: no TypeScript errors, all tests PASS. `use-invoice.ts` still exists and still compiles; Task 7 deletes it.

- [ ] **Step 8: Commit**

```bash
git add fxhedge/hooks/use-app-data.ts "fxhedge/app/(auth)/onboarding/page.tsx"
git commit -m "refactor(flows): read the dashboard and onboarding from useFlows"
```

---

### Task 7: Transfer page direction toggle

**Files:**
- Modify: `fxhedge/app/(app)/transfer/page.tsx:4`, `:9`, `:70-78`, `:139-155`, `:284`, `:308-319`, `:384-411`
- Delete: `fxhedge/hooks/use-invoice.ts`

**Interfaces:**
- Consumes: `useFlows` from `@/hooks/use-flows`; `todayIsoDate`, `CURRENCIES` from `@/lib/flows/flow`; `Flow`, `FlowDirection` from `@/types/flow`.
- Produces: no new exports. This is the UI that finally makes incoming flows creatable, which is what brings the hedge detector to life.

- [ ] **Step 1: Update the imports**

Replace line 4:

```ts
import { useInvoice, todayIsoDate, type Invoice } from "@/hooks/use-invoice";
```

with:

```ts
import { useFlows } from "@/hooks/use-flows";
import { todayIsoDate, addDaysIso, daysUntilDue, CURRENCIES } from "@/lib/flows/flow";
import type { Flow, FlowDirection } from "@/types/flow";
```

Then delete line 9, which now duplicates the shared constant:

```ts
const CURRENCIES = ["EUR", "USD", "GBP", "CAD", "AUD", "SGD"];
```

- [ ] **Step 2: Swap the hook and add direction state**

Replace lines 70-78:

```ts
  const { recent, setCurrent, removeRecent, ready } = useInvoice();
  const { fade } = usePageFade();

  const [from,   setFrom]   = useState("EUR");
  const [to,     setTo]     = useState("CAD");
  const [amount, setAmount] = useState(12000);
  const [days,   setDays]   = useState(21);
  const [label,  setLabel]  = useState("");
  const [invoicedOn, setInvoicedOn] = useState(todayIsoDate);
```

with:

```ts
  const { flows, addFlow, selectFlow, removeFlow, ready } = useFlows();
  const { fade } = usePageFade();

  const [direction, setDirection] = useState<FlowDirection>("outgoing");
  const [from,   setFrom]   = useState("EUR");
  const [to,     setTo]     = useState("CAD");
  const [amount, setAmount] = useState(12000);
  const [days,   setDays]   = useState(21);
  const [label,  setLabel]  = useState("");
  const [invoicedOn, setInvoicedOn] = useState(todayIsoDate);
  const [saved, setSaved] = useState<Flow | null>(null);

  const incoming = direction === "incoming";
```

- [ ] **Step 3: Rewrite submit and recent-flow selection**

Replace lines 139-155:

```ts
  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (from === to || amount <= 0) return;
    const inv: Invoice = {
      id:     newId(),
      amount, from, to, days,
      invoicedOn: invoicedOn || todayIsoDate(),
      label:  label.trim() || `${from}→${to} invoice`,
      savedAt: new Date().toISOString(),
    };
    setCurrent(inv);
    router.push("/dashboard");
  }

  function pickRecent(inv: Invoice) {
    setCurrent(inv);
    router.push("/dashboard");
  }
```

with:

```ts
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (from === to || amount <= 0) return;

    const created = await addFlow({
      direction,
      label: label.trim() || (incoming ? `${from} receivable` : `${from}→${to} invoice`),
      amount,
      currency: from,
      home_currency: to,
      invoiced_on: invoicedOn || todayIsoDate(),
      due_on: addDaysIso(todayIsoDate(), days),
    });

    // Only a payable can be analyzed on the dashboard. A receivable exists to
    // offset one, so we stay here and point at the page where that shows up.
    if (created.direction === "outgoing") {
      router.push("/dashboard");
      return;
    }
    setSaved(created);
    setLabel("");
  }

  function pickRecent(flow: Flow) {
    if (flow.direction !== "outgoing") return;
    selectFlow(flow.id);
    router.push("/dashboard");
  }
```

`newId` is no longer referenced here — the store assigns ids. Delete the `newId` function (lines 63-66) along with its usage.

- [ ] **Step 4: Add the direction toggle above the PDF drop zone**

Immediately after the opening `<form ...>` tag (before the `{/* PDF drop zone */}` comment), insert:

```tsx
          {/* Direction — the one control that makes natural hedging possible */}
          <div>
            <span className="block text-xs font-medium text-[var(--color-muted-fg)] mb-1.5">
              What kind of payment is this?
            </span>
            <div role="radiogroup" aria-label="Flow direction" className="grid grid-cols-2 gap-2">
              {([
                { value: "outgoing", title: "Money going out", hint: "A supplier invoice you owe" },
                { value: "incoming", title: "Money coming in", hint: "A customer payment you expect" },
              ] as const).map((opt) => {
                const active = direction === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => { setDirection(opt.value); setSaved(null); }}
                    className="rounded-xl border px-3 py-2.5 text-left transition-colors"
                    style={{
                      borderColor: active ? "var(--color-primary)" : "var(--color-border)",
                      background: active ? "rgba(34,197,94,0.06)" : "transparent",
                    }}
                  >
                    <span className="block text-sm font-semibold text-[var(--color-fg)]">{opt.title}</span>
                    <span className="block text-[11px] text-[var(--color-muted-fg)]">{opt.hint}</span>
                  </button>
                );
              })}
            </div>
          </div>
```

- [ ] **Step 5: Relabel the amount and date fields per direction**

Replace line 284:

```tsx
          <Field label={`Invoice amount (${currencySymbol(from)}${from})`} htmlFor="inv-amt">
```

with:

```tsx
          <Field
            label={`${incoming ? "Amount expected" : "Invoice amount"} (${currencySymbol(from)}${from})`}
            htmlFor="inv-amt"
          >
```

Then replace the `Field` label on line 308 and the helper text on lines 322-325. The `days` field label becomes:

```tsx
            <Field label={incoming ? "Days until paid" : "Days until due"} htmlFor="inv-days">
```

and the helper paragraph becomes:

```tsx
          <p className="-mt-1 text-[11px] leading-relaxed text-[var(--color-muted-fg)]">
            {incoming
              ? "The invoice date sets what the rate is compared against. Days until paid sets when this money lands, which is what lets it offset a payment in the same currency."
              : "The invoice date sets what the rate is compared against. Days until due sets how long you are still exposed."}
          </p>
```

- [ ] **Step 6: Update the submit button and add the receivable confirmation**

Replace the submit button's label (line 348) so it reads correctly in both modes, and add a confirmation after it:

```tsx
            {incoming ? "Save this receivable" : "Analyze on dashboard"} <ArrowRight size={16} />
          </button>

          {saved && (
            <p className="text-xs text-[var(--color-muted-fg)]">
              Saved {currencySymbol(saved.currency)}{saved.amount.toLocaleString()} {saved.currency} coming in.{" "}
              <Link href="/breakeven" className="underline hover:text-[var(--color-fg)]">
                See whether it offsets a payment
              </Link>
              .
            </p>
          )}
```

Add `import Link from "next/link";` to the imports at the top of the file.

- [ ] **Step 7: Show direction in the recent list**

The list currently maps `recent`. Replace `recent` with `flows` throughout the "Recent invoices" panel (lines 364, 375, 384), rename the heading from "Recent invoices" to "Your flows", and replace the row body (lines 391-410) so it reads from the new field names and shows direction:

```tsx
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-[var(--color-fg)] truncate">
                          {inv.label}
                        </span>
                        <span className="font-money tabular text-sm text-[var(--color-fg)] shrink-0">
                          {currencySymbol(inv.currency)}{inv.amount.toLocaleString()}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 text-[11px] text-[var(--color-muted-fg)]">
                        <span
                          className="tabular rounded px-1 py-px font-semibold"
                          style={{ background: "var(--color-muted)" }}
                        >
                          {inv.direction === "incoming"
                            ? `${inv.currency} in`
                            : `${inv.currency}→${inv.home_currency}`}
                        </span>
                        <span className="tabular">{daysUntilDue(inv)}d left</span>
                        <span aria-hidden="true">·</span>
                        <span>{fmtWhen(inv.created_at)}</span>
                      </div>
```

Change the remove handler on line 414 from `removeRecent(inv.id)` to `removeFlow(inv.id)`, and the empty-state copy (lines 377-380) to "No flows yet. Add a supplier invoice or a customer payment above."

Because incoming flows are not selectable, wrap the row's select button so it only acts on payables: the `pickRecent` guard added in Step 3 already handles this, but add `disabled={inv.direction === "incoming"}` to that button so it is not presented as clickable.

- [ ] **Step 8: Delete the superseded hook**

```bash
git rm fxhedge/hooks/use-invoice.ts
```

- [ ] **Step 9: Verify**

Run: `cd fxhedge; npx tsc --noEmit; npx vitest run; npm run build`
Expected: no TypeScript errors, all tests PASS, build succeeds.

- [ ] **Step 10: Manually confirm the feature works**

Run `npm run dev`, sign in, then:
1. Add an outgoing EUR 12,000 invoice → lands on `/dashboard` showing it.
2. Return to `/transfer`, add an **incoming** EUR 5,000 receivable → stays on the page with the confirmation link.
3. Reload `/transfer` → both flows are still listed (they came from Supabase, not localStorage).

- [ ] **Step 11: Commit**

```bash
git add "fxhedge/app/(app)/transfer/page.tsx"
git commit -m "feat(transfer): log money coming in as well as going out"
```

---

### Task 8: One natural hedge implementation

**Files:**
- Modify: `fxhedge/components/natural-hedge-card.tsx` (full rewrite)
- Modify: `fxhedge/app/(app)/breakeven/page.tsx:1-4`, `:20-30`, `:55-73`, `:172-201`

**Interfaces:**
- Consumes: `Flow` from `@/types/flow`; `detectNaturalHedges` from `@/lib/natural-hedge`; `flowToCurrencyFlow` from `@/lib/flows/flow`; `useFlows` from `@/hooks/use-flows`.
- Produces: `NaturalHedgeCard({ flows }: { flows: Flow[] })` — a client component that runs detection locally and always renders something, including an explanatory empty state.

- [ ] **Step 1: Rewrite the card to take flows as a prop**

Replace the entire contents of `fxhedge/components/natural-hedge-card.tsx`:

```tsx
"use client";
/**
 * Natural hedging: settle a payable against a receivable in the same currency
 * instead of converting twice. No contract, no fee, no riba — which is why it
 * is the first structure HalalFlow suggests. Detection is pure and runs here,
 * so it works identically whether the flows came from Supabase or the device.
 */
import { useMemo } from "react";
import { detectNaturalHedges, NATURAL_HEDGE_DISCLAIMER } from "@/lib/natural-hedge";
import { flowToCurrencyFlow } from "@/lib/flows/flow";
import type { Flow } from "@/types/flow";

export function NaturalHedgeCard({ flows }: { flows: Flow[] }) {
  const result = useMemo(
    () => detectNaturalHedges(flows.map(flowToCurrencyFlow)),
    [flows],
  );

  const hasIncoming = flows.some((f) => f.direction === "incoming");

  return (
    <section
      aria-label="Natural hedge detector"
      className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-6"
    >
      <h2 className="font-semibold text-[var(--color-fg)] mb-1">Natural hedge detector</h2>

      {result.matches.length === 0 ? (
        <div className="text-sm text-[var(--color-muted-fg)] leading-relaxed">
          <p>
            If money comes in and goes out in the same currency, you can settle one
            against the other instead of converting twice — paying no spread and no
            fee on the overlap. It is the cheapest hedge there is, and it needs no
            contract.
          </p>
          <p className="mt-2">
            {hasIncoming
              ? "None of your flows currently overlap in the same currency."
              : "Log a customer payment on the New transfer page and this will show you how much of your supplier invoice it covers."}
          </p>
        </div>
      ) : (
        <>
          <p className="text-sm text-[var(--color-muted-fg)] mb-4">{result.summary}</p>
          <div className="space-y-3">
            {result.matches.map((m) => (
              <div key={m.currency} className="rounded-xl border border-[var(--color-border)] p-4">
                <p className="font-semibold text-[var(--color-fg)] text-sm">
                  <span className="font-money tabular">
                    {m.netted_amount.toLocaleString()} {m.currency}
                  </span>{" "}
                  offsets opposite flows
                </p>
                <p className="mt-1 text-xs text-[var(--color-muted-fg)]">{m.suggestion}</p>
              </div>
            ))}
          </div>

          {result.unmatched.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-medium text-[var(--color-muted-fg)] mb-2">Unmatched flows</p>
              <div className="space-y-1">
                {result.unmatched.map((u) => (
                  <p key={u.id} className="text-xs text-[var(--color-muted-fg)]">
                    {u.label}:{" "}
                    <span className="font-money tabular">
                      {u.amount.toLocaleString()} {u.currency}
                    </span>
                    . No offsetting flow found.
                  </p>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <p className="mt-4 text-xs text-[var(--color-muted-fg)] italic">
        {NATURAL_HEDGE_DISCLAIMER}
      </p>
    </section>
  );
}
```

- [ ] **Step 2: Delete the duplicate from the breakeven page**

In `fxhedge/app/(app)/breakeven/page.tsx`, delete the now-unused `HedgeMatch` and `HedgeData` interfaces (lines 20-30), the `hedge` state declaration (line 57), and the `/api/natural-hedge` fetch in the effect (lines 67-70):

```ts
    fetch("/api/natural-hedge")
      .then((r) => r.ok ? r.json() : null)
      .then((h) => h && setHedge(h))
      .catch(() => {});
```

Then replace the whole inline hedge block (lines 172-201, from `{/* Natural hedge detector */}` through its closing `)}`) with:

```tsx
      {/* Natural hedge detector */}
      <div style={fade(3)}>
        <NaturalHedgeCard flows={flows} />
      </div>
```

- [ ] **Step 3: Wire the flows into the page**

Add the imports at the top of `fxhedge/app/(app)/breakeven/page.tsx`:

```ts
import { NaturalHedgeCard } from "@/components/natural-hedge-card";
import { useFlows } from "@/hooks/use-flows";
```

and read the list alongside the existing hooks (next to `const d = useAppData();`):

```ts
  const { flows } = useFlows();
```

- [ ] **Step 4: Verify**

Run: `cd fxhedge; npx tsc --noEmit; npx vitest run; npm run build`
Expected: no TypeScript errors, all tests PASS, build succeeds.

- [ ] **Step 5: Manually confirm the detector fires**

With the EUR 12,000 payable and EUR 5,000 receivable from Task 7 saved, open `/breakeven`.
Expected: the card reports netting **5,000 EUR** and lists the remaining EUR 7,000 as unmatched. Delete the receivable on `/transfer` and the card falls back to the explanatory empty state rather than vanishing.

- [ ] **Step 6: Commit**

```bash
git add fxhedge/components/natural-hedge-card.tsx "fxhedge/app/(app)/breakeven/page.tsx"
git commit -m "feat(hedge): bring the natural hedge detector to life on real flows"
```

---

### Task 9: Full verification

**Files:**
- Modify: none unless a check fails.

**Interfaces:**
- Consumes: everything built in Tasks 1-8.
- Produces: a green tree.

- [ ] **Step 1: Confirm no references to the removed symbols survive**

Run: `cd fxhedge; rg "use-invoice|useInvoice|api/scenarios|api/natural-hedge|\bScenario\b" --glob '!node_modules'`
Expected: no matches other than the word "Scenario" in the unrelated `aria-label` at `app/(app)/risk/page.tsx:379`.

- [ ] **Step 2: Run every check**

Run: `cd fxhedge; npx vitest run; npx tsc --noEmit; npm run build; npm run lint`
Expected: all tests PASS, no type errors, build succeeds, lint clean.

- [ ] **Step 3: Walk the whole app signed in**

Run `npm run dev` and visit `/dashboard`, `/transfer`, `/risk`, `/breakeven`, `/sharia`, `/zakat`, `/ask`.
Expected: every page renders with your own flow's numbers, no console errors, and no request to `/api/scenarios` or `/api/natural-hedge` in the network tab.

- [ ] **Step 4: Confirm persistence across devices**

Sign out, sign back in, and open `/transfer` in a private window after signing in there.
Expected: the same flows appear, because they now live in Supabase rather than localStorage.

- [ ] **Step 5: Commit any fixes**

```bash
git add -A
git commit -m "chore(flows): final verification fixes"
```
