# Guest Demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a logged-out visitor click "See live demo" and use every app screen, then keep the invoices they typed if they create an account.

**Architecture:** Middleware stops gating the product screens (only `/onboarding` still requires a session). `AppShell` reads `useFlows().mode` and shows a demo banner plus a "Create account" link. `migrateGuestFlows` copies local flows onto an empty account on first sign-in.

**Tech Stack:** Next.js 16.3.4 (App Router), React 19, TypeScript, Vitest 5.

**Design spec:** `docs/superpowers/specs/2026-09-11-guest-demo-design.md`

**Prerequisite:** Spec 1 (`docs/superpowers/plans/2026-09-11-flows-backbone.md`) is fully implemented — `useFlows()`, `FlowStore`, `SAMPLE_FLOW_ID`, and `createLocalStore` / `createApiStore` all exist. Spec 3 (complete-app surfaces) does not have to be done first.

## Global Constraints

- All file paths are relative to the repo root. The app lives in `fxhedge/`; run all `npm` commands from `fxhedge/`.
- The shell is **PowerShell**. Chain commands with `;` — `&&` is a syntax error.
- Vitest runs with `environment: "node"`. Do not add jsdom or React Testing Library.
- Never use `SUPABASE_SERVICE_ROLE_KEY` in application code.
- Product copy rules: never predict exchange-rate direction, never move money, never claim to be a fatwa or financial advice.
- Verification commands: `npm test`, `npx tsc --noEmit`, `npm run build`.
- Commit after every task.

## File Structure

**Create:**
- `fxhedge/lib/flows/migrate.ts` — `migrateGuestFlows`.
- `fxhedge/lib/__tests__/migrate.test.ts`

**Modify:**
- `fxhedge/hooks/use-flows.ts` — run migration when `mode` becomes `"account"`.
- `fxhedge/middleware.ts` — gate only `/onboarding`.
- `fxhedge/components/app-shell.tsx` — demo banner + guest footer.
- `fxhedge/app/(marketing)/page.tsx` — only if the "See live demo" href is not already `/dashboard`.

---

### Task 1: `migrateGuestFlows`

**Files:**
- Create: `fxhedge/lib/flows/migrate.ts`
- Test: `fxhedge/lib/__tests__/migrate.test.ts`

**Interfaces:**
- Consumes: `FlowStore` from `@/lib/flows/store`; `SAMPLE_FLOW_ID` from `@/lib/flows/flow`; `FlowInput` from `@/types/flow`.
- Produces: `migrateGuestFlows(local: FlowStore, remote: FlowStore): Promise<{ uploaded: number }>`.

- [ ] **Step 1: Write the failing test**

Create `fxhedge/lib/__tests__/migrate.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { migrateGuestFlows } from "../flows/migrate";
import { SAMPLE_FLOW_ID } from "../flows/flow";
import type { Flow, FlowInput } from "@/types/flow";
import type { FlowStore } from "../flows/store";

function flow(over: Partial<Flow> = {}): Flow {
  return {
    id: "local-1",
    direction: "outgoing",
    label: "Guest payable",
    amount: 9000,
    currency: "USD",
    home_currency: "CAD",
    invoiced_on: "2026-09-01",
    due_on: "2026-09-22",
    created_at: "2026-09-01T00:00:00.000Z",
    ...over,
  };
}

function memoryStore(seed: Flow[] = []): FlowStore & { rows: Flow[] } {
  const rows = [...seed];
  return {
    get rows() {
      return rows;
    },
    async list() {
      return [...rows];
    },
    async create(input: FlowInput) {
      const created: Flow = {
        ...input,
        id: `remote-${rows.length + 1}`,
        created_at: "2026-09-11T00:00:00.000Z",
      };
      rows.unshift(created);
      return created;
    },
    async remove(id: string) {
      const i = rows.findIndex((f) => f.id === id);
      if (i >= 0) rows.splice(i, 1);
    },
  };
}

describe("migrateGuestFlows", () => {
  it("uploads real guest flows onto an empty account and skips the sample", async () => {
    const local = memoryStore([
      flow({ id: SAMPLE_FLOW_ID, label: "Aisha sample" }),
      flow({ id: "typed", label: "Turkish supplier", amount: 5000, currency: "EUR" }),
    ]);
    const remote = memoryStore();

    const result = await migrateGuestFlows(local, remote);

    expect(result.uploaded).toBe(1);
    expect(remote.rows).toHaveLength(1);
    expect(remote.rows[0].label).toBe("Turkish supplier");
    expect(remote.rows[0].id).toBe("remote-1"); // server assigned, not "typed"
    expect(local.rows).toHaveLength(2); // local copy is not deleted
  });

  it("does not upload onto an account that already has flows", async () => {
    const local = memoryStore([flow()]);
    const remote = memoryStore([flow({ id: "existing", label: "Already there" })]);

    const result = await migrateGuestFlows(local, remote);

    expect(result.uploaded).toBe(0);
    expect(remote.rows).toHaveLength(1);
    expect(remote.rows[0].id).toBe("existing");
  });

  it("uploads nothing when the guest only has the sample", async () => {
    const local = memoryStore([flow({ id: SAMPLE_FLOW_ID })]);
    const remote = memoryStore();
    expect(await migrateGuestFlows(local, remote)).toEqual({ uploaded: 0 });
    expect(remote.rows).toHaveLength(0);
  });

  it("stops on the first failed create so the next load can retry", async () => {
    const local = memoryStore([
      flow({ id: "a", label: "First" }),
      flow({ id: "b", label: "Second" }),
    ]);
    const remote: FlowStore = {
      list: async () => [],
      create: async () => {
        throw new Error("network");
      },
      remove: async () => {},
    };

    await expect(migrateGuestFlows(local, remote)).rejects.toThrow("network");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd fxhedge; npx vitest run lib/__tests__/migrate.test.ts`
Expected: FAIL — `Failed to resolve import "../flows/migrate"`.

- [ ] **Step 3: Write the implementation**

Create `fxhedge/lib/flows/migrate.ts`:

```ts
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd fxhedge; npx vitest run lib/__tests__/migrate.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add fxhedge/lib/flows/migrate.ts fxhedge/lib/__tests__/migrate.test.ts
git commit -m "feat(flows): migrate guest invoices onto an empty account"
```

---

### Task 2: `useFlows` runs the migration on sign-in

**Files:**
- Modify: `fxhedge/hooks/use-flows.ts`

**Interfaces:**
- Consumes: `migrateGuestFlows` from `@/lib/flows/migrate`; `createLocalStore` and `createApiStore` (already imported).
- Produces: no new exports. After a guest signs up, `flows` in React state is the remote list (including uploaded rows).

- [ ] **Step 1: Call migrate before the first remote list is stored**

In `fxhedge/hooks/use-flows.ts`, add the import:

```ts
import { migrateGuestFlows } from "@/lib/flows/migrate";
```

Inside the `useEffect` that currently does `store.list().then(setFlows)`, replace the load with a version that migrates when the API store is in play. The local store is still needed as the source, even in account mode:

```ts
  useEffect(() => {
    if (!store) return;
    let alive = true;

    const storage = deviceStorage();
    if (storage) setSelectedId(readCurrentId(storage));

    async function load() {
      try {
        if (user.signedIn && storage) {
          await migrateGuestFlows(createLocalStore(storage), store);
        }
        const list = await store.list();
        if (alive) setFlows(list);
      } catch {
        if (alive) setFlows([]);
      } finally {
        if (alive) setReady(true);
      }
    }

    load();

    return () => {
      alive = false;
    };
  }, [store, user.signedIn]);
```

Keep every other function in the hook (`addFlow`, `selectFlow`, `removeFlow`, `current`) unchanged.

A failed migration is swallowed by the `catch` and `flows` becomes `[]`. That is the same as today's failed-list behaviour. Because the account is still empty, the next page load retries.

- [ ] **Step 2: Verify types**

Run: `cd fxhedge; npx tsc --noEmit; npx vitest run`
Expected: no TypeScript errors, all tests PASS (the new migrate tests plus the existing suite).

- [ ] **Step 3: Commit**

```bash
git add fxhedge/hooks/use-flows.ts
git commit -m "feat(flows): upload guest invoices the first time an account is empty"
```

---

### Task 3: Middleware lets guests into the product

**Files:**
- Modify: `fxhedge/middleware.ts:4-10`, `:17`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: logged-out requests to `/dashboard`, `/transfer`, `/risk`, `/zakat`, `/ask`, `/breakeven` return 200 (via `NextResponse.next`). Logged-out `/onboarding` still redirects to `/login`.

- [ ] **Step 1: Shrink the protected list to onboarding**

Replace the `PROTECTED_PREFIXES` constant in `fxhedge/middleware.ts`:

```ts
const PROTECTED_PREFIXES = [
  "/dashboard",
  "/transfer",
  "/risk",
  "/zakat",
];
```

with:

```ts
// The product itself is usable signed-out (local FlowStore). Only onboarding
// needs an account, because it writes the Supabase profile.
const PROTECTED_PREFIXES = ["/onboarding"];
```

Do not change `AUTH_ROUTES`, the missing-env-var branch, or the signed-in `/login`→`/dashboard` redirect.

- [ ] **Step 2: Verify the file still type-checks**

Run: `cd fxhedge; npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add fxhedge/middleware.ts
git commit -m "feat(auth): let logged-out visitors open the product screens"
```

---

### Task 4: Demo banner and guest chrome

**Files:**
- Modify: `fxhedge/components/app-shell.tsx`

**Interfaces:**
- Consumes: `useFlows` from `@/hooks/use-flows` (`mode: "guest" | "account"`).
- Produces: no new exports. Guests see a `role="status"` banner and a "Create account" sidebar action; signed-in users see today's sign-out form.

- [ ] **Step 1: Import the hook and Link (Link is already imported)**

At the top of `fxhedge/components/app-shell.tsx`, add:

```ts
import { useFlows } from "@/hooks/use-flows";
```

- [ ] **Step 2: Pass `mode` into the sidebar**

Change `Sidebar`'s props to accept `mode`:

```ts
function Sidebar({
  onNav,
  firstItemRef,
  mode,
}: {
  onNav?: () => void;
  firstItemRef?: React.Ref<HTMLAnchorElement>;
  mode: "guest" | "account";
}) {
```

Replace the sidebar footer (the `ThemeToggle` + `signOutAction` form) with:

```tsx
      <div className="mt-4 px-3 pt-3 border-t border-[var(--color-border)] flex items-center gap-2">
        <ThemeToggle />
        {mode === "account" ? (
          <form action={signOutAction} className="flex-1">
            <button
              type="submit"
              className="w-full flex items-center gap-3 rounded-md px-3 py-2 text-sm text-[var(--color-muted-fg)] hover:bg-[var(--color-muted)] hover:text-[var(--color-fg)] transition-[color,background-color,scale] duration-150 active:scale-[0.96]"
            >
              <LogOut size={16} />
              Sign out
            </button>
          </form>
        ) : (
          <Link
            href="/signup"
            onClick={onNav}
            className="flex-1 flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-[var(--color-primary)] hover:bg-[var(--color-muted)] transition-[color,background-color,scale] duration-150 active:scale-[0.96]"
          >
            Create account
          </Link>
        )}
      </div>
```

- [ ] **Step 3: Read `mode` in `AppShell` and show the banner**

Inside `AppShell`, after the existing `useState`/`useRef` declarations, add:

```ts
  const { mode } = useFlows();
```

Pass `mode` to both `<Sidebar />` instances:

```tsx
        <Sidebar />
```

becomes `<Sidebar mode={mode} />`, and the mobile one becomes `<Sidebar onNav={closeSidebar} firstItemRef={firstNavRef} mode={mode} />`.

Insert the banner immediately after `<MarketTicker />` and before `<main>`:

```tsx
        {mode === "guest" && (
          <div
            role="status"
            className="border-b px-6 py-2 text-center text-xs text-[var(--color-muted-fg)]"
            style={{ borderColor: "var(--color-border)", background: "var(--color-muted)" }}
          >
            You&apos;re exploring HalalFlow on this device.{" "}
            <Link href="/signup" className="font-medium text-[var(--color-primary)] hover:underline">
              Create a free account
            </Link>{" "}
            to keep your invoices after you close the browser.
          </div>
        )}
```

- [ ] **Step 4: Verify**

Run: `cd fxhedge; npx tsc --noEmit; npx vitest run; npm run build`
Expected: no type errors, all tests PASS, build succeeds.

- [ ] **Step 5: Commit**

```bash
git add fxhedge/components/app-shell.tsx
git commit -m "feat(demo): banner and create-account chrome for logged-out visitors"
```

---

### Task 5: Full verification

**Files:**
- Modify: none unless a check fails. Confirm `fxhedge/app/(marketing)/page.tsx` already links "See live demo" to `/dashboard` — do not change it if it does.

**Interfaces:**
- Consumes: Tasks 1–4.
- Produces: a green tree.

- [ ] **Step 1: Confirm the landing CTA already points at the now-public dashboard**

Run: `cd fxhedge; rg "See live demo" "app/(marketing)/page.tsx" -n -A 2`
Expected: the surrounding `href` is `"/dashboard"`. If it is not, change it to `href="/dashboard"` and include that file in the commit below.

- [ ] **Step 2: Run every check**

Run: `cd fxhedge; npx vitest run; npx tsc --noEmit; npm run build`
Expected: all tests PASS, no type errors, build succeeds.

- [ ] **Step 3: Click through logged out**

In a private window, `npm run dev`, then:
1. Landing → "See live demo" → `/dashboard` renders (sample EUR/CAD invoice, demo banner visible, sidebar says "Create account").
2. `/transfer` — log an outgoing USD 4,000 invoice → lands on `/dashboard` showing it.
3. `/breakeven`, `/risk`, `/zakat`, `/ask` — each renders, banner still there.
4. `/onboarding` → redirects to `/login`.

- [ ] **Step 4: Click through guest → account**

From the same private window:
1. Sidebar "Create account" → sign up → finish onboarding.
2. `/transfer` lists the USD 4,000 invoice from Step 3 (it was uploaded because the new account was empty).
3. Banner is gone; sidebar says "Sign out".

- [ ] **Step 5: Confirm a returning account is not polluted**

In a second private window, sign into an account that already has flows, after first loading `/dashboard` as a guest (which seeds the sample). Expected: the account's own flows are unchanged; the sample is not added.

- [ ] **Step 6: Commit any fixes**

```bash
git add -A
git commit -m "chore(demo): final verification fixes"
```
