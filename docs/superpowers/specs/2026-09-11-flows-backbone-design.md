# Flows Backbone — Design

**Date:** 2026-09-11
**Status:** Approved
**Scope:** Spec 1 of 3 in the "complete the app" sequence.

## Problem

HalalFlow has two competing notions of "an invoice" that do not know about each other:

1. The localStorage `Invoice` in `hooks/use-invoice.ts`, which every page actually
   renders from. It never leaves the browser.
2. The Supabase `scenarios` row, which has a working `POST /api/scenarios` route
   that **no code path ever calls**.

The consequences are visible to anyone clicking through the app:

- Invoices never persist. Sign in on another device and your work is gone.
- `GET /api/natural-hedge` reads `scenarios`, so it always returns zero matches.
  The natural hedge detector — the most Islamically distinctive feature in the
  product, and the one with its own engine and test suite — is dead code.
- That route infers flow direction from `label.startsWith("[in]")`, a string
  convention with no column, no constraint, and no UI able to produce it.
- `components/natural-hedge-card.tsx` is orphaned; `app/(app)/breakeven/page.tsx`
  carries a near-duplicate inline copy of it.

## Goal

Unify both notions into a single **flow**: an amount of foreign currency moving
in or out on a date. A supplier payable and a customer receivable become the
same shape with opposite `direction`. This makes invoices persist, gives the
hedge detector real data, and removes the duplicated component — in one change.

## Non-Goals

Deferred to specs 2 and 3, and explicitly out of scope here:

- Guest demo mode: middleware changes, demo banner, guest→account migration on signup
- `.env.example`
- Chat widget's `MOCK_PROFILE` context
- Dashboard's inline cost math vs. the tested `buildCostBreakdown`

Spec 1 leaves the app fully working for signed-in users. The local store it
introduces is the foundation guest mode will later sit on.

## Success Criteria

- A signed-in user's flows survive logout, login, and a different device.
- Logging a EUR payable and a EUR receivable makes the hedge detector fire with
  a real netting suggestion.
- No string-convention direction anywhere in the codebase.
- Exactly one natural hedge UI implementation.
- `npm test`, `npx tsc --noEmit`, and `npm run build` all pass.

---

## Architecture

### Data model

One table replaces `scenarios`. Direction becomes a real constrained column.

```sql
create table public.flows (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  direction text not null check (direction in ('outgoing','incoming')),
  label text not null default 'Invoice',
  amount numeric not null check (amount > 0),
  currency text not null,           -- foreign leg, e.g. 'EUR'
  home_currency text not null,      -- e.g. 'CAD'
  invoiced_on date not null,
  -- A date, not a countdown: a stored "days until due" goes stale as time passes.
  due_on date not null check (due_on >= invoiced_on),
  created_at timestamptz default now()
);
```

Owner-only RLS mirrors the existing `profiles` policies (`auth.uid() = user_id`
for select, insert, update, delete). The service-role key stays unused by
application code.

`scenarios` is dropped. No code path has ever written to it, so there is no data
to migrate.

`due_on` is a date rather than a `days_until_due` countdown because a stored
countdown silently goes stale: enter a 21-day invoice, return a week later, and
the app would still believe 21 days remain. The remaining window is derived by
`daysUntilDue(flow)`.

**Deliberately not stored:**

- `revenue` and `target_margin` — `app/(app)/breakeven/page.tsx` already derives
  revenue as `amount × pricingRate × (1 + profile.target_margin / 100)`. Storing
  it would create two sources of truth for one number.
- `pair` — derived as `` `${currency}-${home_currency}` `` so it can never
  disagree with its parts.

### Types

The canonical `FlowDirection` moves to `types/flow.ts`. `lib/natural-hedge.ts`
currently declares its own copy and must import it instead, so there is one
definition.

```ts
// types/flow.ts
export type FlowDirection = "outgoing" | "incoming";

export interface Flow {
  id: string;
  direction: FlowDirection;
  label: string;
  amount: number;
  currency: string;       // foreign leg, "EUR"
  home_currency: string;  // "CAD"
  invoiced_on: string;    // ISO date the invoice was issued, "2026-09-11"
  due_on: string;         // ISO date the money is due; use daysUntilDue(flow)
  created_at: string;     // ISO timestamp
}

export type FlowInput = Omit<Flow, "id" | "created_at">;
```

### Data layer

One interface, two implementations, one hook that chooses.

```ts
// lib/flows/store.ts
export interface FlowStore {
  list(): Promise<Flow[]>;
  create(input: FlowInput): Promise<Flow>;
  remove(id: string): Promise<void>;
}
```

- `lib/flows/local-store.ts` — localStorage implementation, under the keys
  `halalflow:flows` and `halalflow:current-flow-id`. Seeds Aisha's sample flow on
  first run. Migrates the legacy `hedged:current-invoice` and
  `hedged:recent-invoices` keys so nothing already saved is lost. Takes its
  `Storage` as a constructor argument rather than reaching for the global, which
  makes it testable with an in-memory fake and **no jsdom dependency**.

The local store is exercised in spec 1, not just spec 2: `/breakeven` and `/ask`
are already reachable logged-out today. Spec 2 only widens which routes guests
may reach and adds the demo banner.
- `lib/flows/api-store.ts` — `fetch`-based implementation over `/api/flows`.
- `lib/flows/flow.ts` — pure helpers: `parseFlowInput` (validation),
  `toPair(flow)`, `flowToCurrencyFlow(flow)` for the hedge engine.

`hooks/use-flows.ts` is the **only** file that branches on auth state:

```ts
interface UseFlowsResult {
  flows: Flow[];                 // newest first
  current: Flow;                 // the flow being analyzed
  ready: boolean;
  mode: "guest" | "account";
  addFlow(input: FlowInput): Promise<Flow>;
  selectFlow(id: string): void;
  removeFlow(id: string): Promise<void>;
}
```

`mode` is derived from the existing `useUser()` hook (which already calls
`GET /api/auth/me`): a resolved user means `"account"` and the API store,
otherwise `"guest"` and the local store.

**Which flow is `current`.** The dashboard, risk, and breakeven pages all analyze
a *payment*, so `current` is always an **outgoing** flow — a receivable has no
margin, no breakeven, and no provider comparison. The rule is: the explicitly
selected flow if its id is stored under `halalflow:current-flow-id` and it is
outgoing, otherwise the most recently created outgoing flow, otherwise the
seeded sample. Incoming flows are never selectable as `current`; they exist to
feed the hedge detector. `selectFlow(id)` ignores ids that resolve to an
incoming flow.

`hooks/use-invoice.ts` is deleted. `hooks/use-app-data.ts` reads `current` from
`useFlows`; the field mapping is mechanical:

| Old `Invoice` | New `Flow`       |
|---------------|------------------|
| `from`        | `currency`       |
| `to`          | `home_currency`  |
| `days`        | derived via `daysUntilDue(flow)` from `due_on` |
| `invoicedOn`  | `invoiced_on`    |
| `savedAt`     | `created_at`     |

### API surface

- `GET /api/flows` — list the signed-in user's flows, newest first
- `POST /api/flows` — create one
- `DELETE /api/flows/[id]` — delete one

All RLS-enforced, following the validation style already established in
`app/api/scenarios/route.ts` (explicit `parseFlowInput`, 400 with a message
naming the constraints, 401 when unauthenticated).

`app/api/scenarios/route.ts` and `app/api/natural-hedge/route.ts` are both
deleted.

### Why hedge detection moves client-side

`lib/natural-hedge.ts` is already pure — no `server-only` import, no I/O. Running
`detectNaturalHedges` in the component removes a network round trip, deletes a
route, and works identically for guests in spec 2 without further change.

## Feature wiring

### Transfer page

Gains a direction toggle: **"Money going out"** (supplier invoice) vs **"Money
coming in"** (customer receivable). This is the one UI addition that brings the
hedge detector to life.

Choosing "coming in" relabels the date field from "days until due" to "days
until paid" and drops the margin framing, which is meaningless on a receivable.
The recent-flows list shows direction so the two kinds are distinguishable at a
glance.

Submitting an **outgoing** flow keeps today's behaviour: it becomes `current` and
routes to `/dashboard`. Submitting an **incoming** flow cannot become `current`
(see "Which flow is `current`"), so it stays on the transfer page with a
confirmation that links to `/breakeven`, where its hedging effect is visible.

### Natural hedge

`components/natural-hedge-card.tsx` becomes the single implementation: it accepts
`flows: Flow[]` as a prop and calls `detectNaturalHedges` directly. The ~30-line
inline duplicate in `app/(app)/breakeven/page.tsx` is deleted in favour of it.

**Behavioural change:** today the section renders nothing when there are no
matches, which is a dead end. It will instead explain what a natural hedge is and
prompt the user to log a receivable, so the feature explains itself with no data.
The existing `NATURAL_HEDGE_DISCLAIMER` stays on every rendered state.

## Testing

Route tests require extending `vitest.config.ts`, whose `include` is currently
`["lib/__tests__/**/*.test.ts"]`, to also match `app/**/__tests__/**/*.test.ts`.
`environment: "node"` stays as-is.

| Target | Coverage |
|---|---|
| `lib/flows/flow.ts` | `parseFlowInput` accept/reject, `toPair`, `flowToCurrencyFlow` |
| `lib/flows/local-store.ts` | CRUD against an in-memory `Storage` fake, sample seeding, idempotent legacy-key migration |
| `lib/flows/flow.ts` | `pickCurrentFlow` — prefers the stored id, falls back to newest outgoing, never returns an incoming flow |
| `app/api/flows` | 401 unauthenticated, 400 invalid input, 201 created, owner-scoped delete |
| `lib/natural-hedge.ts` | Existing suite must still pass after the type-import change |

Route tests mock `@/lib/supabase/server` with `vi.mock`, since `createClient()`
calls `next/headers` `cookies()` which is unavailable outside a request scope.

## Risks

- **Deleting `hooks/use-invoice.ts` touches every page.** `useAppData`,
  `transfer`, `breakeven`, and `dashboard` all consume it. The field mapping is
  mechanical but must be done in one commit to keep the build green.
- **Dropping `scenarios` is irreversible.** Safe because nothing writes to it,
  but the migration should be run against a dev project first.
- **Legacy localStorage migration** must be idempotent — running it twice should
  not duplicate flows.
