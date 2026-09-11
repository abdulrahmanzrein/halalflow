# Guest Demo — Design

**Date:** 2026-09-11
**Status:** Approved (deferred scope from spec 1)
**Scope:** Spec 2 of 3 in the "complete the app" sequence.

**Prerequisite:** Spec 1 (flows backbone) is implemented. Spec 3 (complete-app surfaces) may run before or after this one; they do not share files except `AppShell` and `middleware.ts`.

## Problem

The landing page's "See live demo" button goes to `/dashboard`. Middleware then redirects anyone without a session to `/login`. Judges and first-time visitors cannot click through the product.

`/ask` and `/breakeven` are already public. Spec 1's local `FlowStore` already works signed-out. The only thing blocking a demo is the gate on `/dashboard`, `/transfer`, `/risk`, and `/zakat`.

## Goal

A visitor can open every app screen without an account, see a persistent "this is a demo" banner, and keep any invoices they typed if they later create an account.

## Non-Goals

- Changing the cost engine, chat context, or `.env.example` (spec 3).
- A shared React context to dedupe `useAppData` fetches.
- Syncing an existing (non-empty) account with leftover guest data — if the account already has flows, guest data stays on the device and is not uploaded.

## Success Criteria

- Logged-out visit to `/dashboard`, `/transfer`, `/risk`, `/breakeven`, `/zakat`, `/ask` renders the app shell with sample or locally-saved flows. No redirect to `/login`.
- A banner is visible on those pages until the visitor signs in.
- Sidebar shows "Create account" instead of "Sign out" for guests.
- Logging a EUR payable as a guest, then signing up, makes that payable appear on the signed-in `/transfer` list (it was uploaded because the new account had zero flows).
- Signing into an account that already has flows does **not** upload the device's guest sample on top of them.
- `/onboarding` still requires a session (new signups land there).
- `npm test`, `npx tsc --noEmit`, and `npm run build` all pass.

## Architecture

### Middleware

`PROTECTED_PREFIXES` currently lists the five gated app routes. After this spec it lists only `/onboarding`. Logged-out visitors can use the product; they cannot complete onboarding without an account.

Auth-route behaviour is unchanged: a signed-in user hitting `/login` or `/signup` is sent to `/dashboard`; `/onboarding` stays reachable so new users can finish their profile.

### Banner and chrome

`AppShell` is the only UI that learns `mode` from `useFlows()`. When `mode === "guest"`:

- A `role="status"` banner sits under the market ticker: demo copy + link to `/signup`.
- The sidebar footer replaces the sign-out form with a "Create account" link.

When `mode === "account"` the shell is unchanged.

### Guest → account migration

`lib/flows/migrate.ts` is a pure async function over two `FlowStore`s:

```ts
migrateGuestFlows(local: FlowStore, remote: FlowStore): Promise<{ uploaded: number }>
```

Rules:

1. If `remote.list()` is non-empty, return `{ uploaded: 0 }`. The account already has data; do not duplicate the sample on top of it.
2. Otherwise upload every local flow whose `id` is not `SAMPLE_FLOW_ID`, as a `FlowInput` (id and `created_at` are assigned by the server).
3. A failed `create` aborts and throws — `useFlows` catches it and the next load retries, because the account is still empty.
4. Do not delete the local copy. The next signed-in session reads the API store, so the local list is simply unused.

`useFlows` calls this once when `mode` becomes `"account"`, before the first remote `list()` is stored in React state. The hook then `list()`s the API store so the UI shows the uploaded rows.

## Testing

Vitest stays `environment: "node"`. `migrateGuestFlows` is tested against in-memory `FlowStore` fakes. Middleware and AppShell have no component-test harness; they are verified by `tsc` + a logged-out click-through.
