# Complete-App Surfaces Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every signed-in surface read the same live deal — tested cost math, the current invoice in the assistant, and a bootable env file.

**Architecture:** `impliedRevenue` + `buildCostBreakdown` become the only cost path inside `useAppData`. A 10-line `dealContextFromSnapshot` helper is the only object posted to `/api/ask`.

**Tech Stack:** Next.js 16.3.4 (App Router), React 19, TypeScript, Vitest 5.

**Design spec:** `docs/superpowers/specs/2026-09-11-complete-app-surfaces-design.md`

**Prerequisite:** Spec 1 (`docs/superpowers/plans/2026-09-11-flows-backbone.md`) is fully implemented. `hooks/use-flows.ts` exists and `hooks/use-invoice.ts` does not. If `useAppData` still imports `useInvoice`, stop and finish that plan first.

## Global Constraints

- All file paths are relative to the repo root. The app lives in `fxhedge/`; run all `npm` commands from `fxhedge/`.
- The shell is **PowerShell**. Chain commands with `;` — `&&` is a syntax error.
- Vitest runs with `environment: "node"`. Do not add jsdom or React Testing Library.
- Never use `SUPABASE_SERVICE_ROLE_KEY` in application code.
- Product copy rules: never predict exchange-rate direction, never move money, never claim to be a fatwa or financial advice.
- `MOCK_PROFILE` / `SAMPLE` may seed fallbacks inside `useAppData` and `lib/flows/flow.ts`. No page may read them for user-facing figures.
- Verification commands: `npm test`, `npx tsc --noEmit`, `npm run build`.
- Commit after every task.

## File Structure

**Create:**
- `fxhedge/lib/assistant/deal-context.ts` — pure snapshot → `/api/ask` body.
- `fxhedge/lib/__tests__/deal-context.test.ts`
- `fxhedge/.env.example`

**Modify:**
- `fxhedge/lib/cost.ts` — add `impliedRevenue`.
- `fxhedge/lib/__tests__/cost.test.ts` — cover it.
- `fxhedge/hooks/use-app-data.ts` — call `impliedRevenue` + `buildCostBreakdown`; expose `revenue` and `marginToday`.
- `fxhedge/app/(app)/dashboard/page.tsx` — live home-currency symbol; show `marginToday`.
- `fxhedge/components/chat-widget.tsx` — live deal context.
- `fxhedge/app/(app)/ask/page.tsx` — use the shared helper.
- `fxhedge/README.md` — point at `.env.example`.

---

### Task 1: `impliedRevenue` and `useAppData` call the cost engine

**Files:**
- Modify: `fxhedge/lib/cost.ts`
- Modify: `fxhedge/lib/__tests__/cost.test.ts`
- Modify: `fxhedge/hooks/use-app-data.ts`
- Test: `fxhedge/lib/__tests__/cost.test.ts`

**Interfaces:**
- Consumes: `buildCostBreakdown` (already exported from `@/lib/cost`); `useFlows` from `@/hooks/use-flows`; `useUser` from `@/hooks/use-user`; `MOCK_PROFILE` from `@/lib/fixtures`.
- Produces: `impliedRevenue(invoiceAmount: number, invoiceDayRate: number, targetMarginPct: number): number`. Extends `AppData` with `revenue: number` and `marginToday: number`. `marginAtRiskMinus5pct` is now the engine's adverse-scenario profit, not extra cost.

- [ ] **Step 1: Write the failing test**

Append this block to `fxhedge/lib/__tests__/cost.test.ts`, after the existing `describe("computeMargin")` block and before `describe("buildCostBreakdown")`. Add `impliedRevenue` to the import on line 2:

```ts
import { computeTrueCost, computeMargin, buildCostBreakdown, impliedRevenue } from "../cost";
```

```ts
describe("impliedRevenue", () => {
  it("prices the deal at the invoice-day rate plus the target margin", () => {
    // 12000 × 1.6049 × 1.10 = 21184.68 — Aisha's sample economics
    expect(impliedRevenue(12000, 1.6049, 10)).toBe(21184.68);
  });

  it("rounds to cents rather than leaking IEEE remainder", () => {
    expect(impliedRevenue(1000, 1.3333, 10)).toBe(1466.63);
  });

  it("returns 0 for a non-positive rate so a missing FX quote cannot invent revenue", () => {
    expect(impliedRevenue(12000, 0, 10)).toBe(0);
    expect(impliedRevenue(12000, -1, 10)).toBe(0);
  });

  it("returns 0 for a non-positive invoice", () => {
    expect(impliedRevenue(0, 1.6, 10)).toBe(0);
  });

  it("treats a missing margin as zero rather than NaN", () => {
    expect(impliedRevenue(1000, 2, Number.NaN)).toBe(2000);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd fxhedge; npx vitest run lib/__tests__/cost.test.ts`
Expected: FAIL — `impliedRevenue is not exported` (or a compile error on the import).

- [ ] **Step 3: Add `impliedRevenue` to the cost engine**

Append this function to `fxhedge/lib/cost.ts`, immediately after `computeMargin`:

```ts
/**
 * What the importer quoted their customer: invoice at the invoice-day
 * reference rate, plus the target margin from their profile.
 * Rounded to cents so the dashboard and the breakeven engine see one number.
 */
export function impliedRevenue(
  invoiceAmount: number,
  invoiceDayRate: number,
  targetMarginPct: number,
): number {
  if (!Number.isFinite(invoiceAmount) || invoiceAmount <= 0) return 0;
  if (!Number.isFinite(invoiceDayRate) || invoiceDayRate <= 0) return 0;
  const margin = Number.isFinite(targetMarginPct) ? targetMarginPct : 0;
  return Math.round(invoiceAmount * invoiceDayRate * (1 + margin / 100) * 100) / 100;
}
```

- [ ] **Step 4: Run the cost tests to verify they pass**

Run: `cd fxhedge; npx vitest run lib/__tests__/cost.test.ts`
Expected: PASS, including the new `impliedRevenue` cases and the existing `buildCostBreakdown` suite.

- [ ] **Step 5: Extend the `AppData` contract**

In `fxhedge/hooks/use-app-data.ts`, add two fields to the `AppData` interface, immediately after `trueCostToday`:

```ts
  trueCostToday: number;
  /** Customer quote implied by invoice-day rate × (1 + target margin). */
  revenue: number;
  /** (revenue âˆ’ true cost) / revenue × 100. */
  marginToday: number;
```

- [ ] **Step 6: Point `useAppData` at the engine**

In `fxhedge/hooks/use-app-data.ts`, add these imports next to the existing ones:

```ts
import { useUser } from "./use-user";
import { buildCostBreakdown, impliedRevenue } from "@/lib/cost";
```

Inside `useAppData`, after `const { current, ready } = useFlows();`, read the profile margin:

```ts
  const user = useUser();
  const targetMargin = user.profile?.target_margin ?? MOCK_PROFILE.target_margin;
```

In `buildFallback`, add the two new fields next to `trueCostToday`. Use Aisha's fixture economics so a failed fetch still paints a coherent card:

```ts
    trueCostToday: Math.round(inv.amount * SAMPLE.ecbRateToday),
    revenue: impliedRevenue(inv.amount, SAMPLE.ecbRateInvoiceDay, MOCK_PROFILE.target_margin),
    marginToday: SAMPLE.marginToday,
```

`SAMPLE` already has `marginToday: -6.9`.

Replace the inline cost math inside `load()` (the lines that currently compute `trueCostToday`, `best`, `worst`, `saving`, and `margin5pct`) with:

```ts
        const invoiceDayRate = fx.rate_invoice_day > 0 ? fx.rate_invoice_day : fx.rate;
        const revenue = impliedRevenue(inv, invoiceDayRate, targetMargin);
        const cost = buildCostBreakdown({
          invoiceAmount: inv,
          revenue,
          ecbRateToday: fx.rate,
          providers,
        });
```

Then in the `setData({...})` call, replace the cost-related fields:

```ts
          trueCostToday: cost.true_cost_today,
          revenue: cost.revenue,
          marginToday: cost.margin_today,
          providers: cost.providers,
          bestProvider: cost.best_provider,
          worstProvider: cost.worst_provider,
          savingVsWorst: cost.saving_vs_worst,
          marginAtRiskMinus5pct: cost.margin_at_risk_minus5pct,
```

Keep the FX, risk, and `rateHistory` fields exactly as they are.

Add `targetMargin` to the effect dependency array.

Wrap the `buildCostBreakdown` call so an empty provider list (the engine throws) falls through to `buildFallback`:

```ts
        if (providers.length === 0) throw new Error("no providers");
```

Place that check immediately before the `buildCostBreakdown` call. The existing `catch` already calls `buildFallback`.

- [ ] **Step 7: Verify types and the suite**

Run: `cd fxhedge; npx tsc --noEmit; npx vitest run`
Expected: no TypeScript errors. All tests PASS. `AppData` is now missing `revenue`/`marginToday` on any leftover object literals — fix those in this task if `tsc` names them.

- [ ] **Step 8: Commit**

```bash
git add fxhedge/lib/cost.ts fxhedge/lib/__tests__/cost.test.ts fxhedge/hooks/use-app-data.ts
git commit -m "feat(cost): drive the dashboard from the tested cost engine"
```

---

### Task 2: Dashboard reads the live home currency and margin

**Files:**
- Modify: `fxhedge/app/(app)/dashboard/page.tsx:6`, `:144`, `:180-205`

**Interfaces:**
- Consumes: `AppData.revenue`, `AppData.marginToday`, `AppData.toCurrency` from Task 1.
- Produces: no new exports.

- [ ] **Step 1: Drop the `MOCK_PROFILE` import used for money**

In `fxhedge/app/(app)/dashboard/page.tsx`, replace line 6:

```ts
import { MOCK_PROFILE, currencySymbol } from "@/lib/fixtures";
```

with:

```ts
import { currencySymbol } from "@/lib/fixtures";
```

- [ ] **Step 2: Format money in the user's home currency**

Replace line 144:

```ts
  const sym = currencySymbol(MOCK_PROFILE.home_currency);
```

with:

```ts
  const sym = currencySymbol(d.toCurrency);
```

- [ ] **Step 3: Show the engine's margin on the cost table**

In the `breakdown` array (the block starting at "Cost breakdown rows"), add two rows after "True mid market cost" and before the best-provider row:

```ts
    { label: "Implied customer quote", note: "invoice-day rate × (1 + target margin)", value: money(d.revenue) },
    {
      label: "Margin today",
      note: "(quote âˆ’ true cost) / quote",
      value: `${d.marginToday.toFixed(1)}%`,
      good: d.marginToday >= 0,
    },
```

Do not restyle the table. The existing `good` flag already turns a value green when present.

- [ ] **Step 4: Verify**

Run: `cd fxhedge; npx tsc --noEmit; npx vitest run`
Expected: no TypeScript errors (the unused `MOCK_PROFILE` import is gone), all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add "fxhedge/app/(app)/dashboard/page.tsx"
git commit -m "fix(dashboard): show the user's currency and the engine's margin"
```

---

### Task 3: One deal-context helper for every assistant call

**Files:**
- Create: `fxhedge/lib/assistant/deal-context.ts`
- Test: `fxhedge/lib/__tests__/deal-context.test.ts`
- Modify: `fxhedge/components/chat-widget.tsx:3`, `:145-161`
- Modify: `fxhedge/app/(app)/ask/page.tsx:43-51`

**Interfaces:**
- Consumes: `AppData` fields `fromCurrency`, `toCurrency`, `invoiceAmount`, `marginAtRiskMinus5pct`.
- Produces: `DealSnapshot` and `dealContextFromSnapshot(d: DealSnapshot): { pair: string; amount: number; margin_at_risk: number }`.

- [ ] **Step 1: Write the failing test**

Create `fxhedge/lib/__tests__/deal-context.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { dealContextFromSnapshot } from "../assistant/deal-context";

describe("dealContextFromSnapshot", () => {
  it("builds the /api/ask body from the live invoice", () => {
    expect(
      dealContextFromSnapshot({
        fromCurrency: "GBP",
        toCurrency: "USD",
        invoiceAmount: 8000,
        marginAtRiskMinus5pct: -1500,
      }),
    ).toEqual({
      pair: "GBP-USD",
      amount: 8000,
      margin_at_risk: -1500,
    });
  });

  it("does not fall back to Aisha's sample pair", () => {
    const ctx = dealContextFromSnapshot({
      fromCurrency: "EUR",
      toCurrency: "CAD",
      invoiceAmount: 1,
      marginAtRiskMinus5pct: 0,
    });
    expect(ctx.pair).toBe("EUR-CAD");
    expect(ctx.amount).toBe(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd fxhedge; npx vitest run lib/__tests__/deal-context.test.ts`
Expected: FAIL — `Failed to resolve import "../assistant/deal-context"`.

- [ ] **Step 3: Write the helper**

Create `fxhedge/lib/assistant/deal-context.ts`:

```ts
/**
 * lib/assistant/deal-context.ts — the one object posted to /api/ask.
 * Pure: no React, so the chat widget and /ask cannot drift apart.
 */
export interface DealSnapshot {
  fromCurrency: string;
  toCurrency: string;
  invoiceAmount: number;
  marginAtRiskMinus5pct: number;
}

export function dealContextFromSnapshot(d: DealSnapshot): {
  pair: string;
  amount: number;
  margin_at_risk: number;
} {
  return {
    pair: `${d.fromCurrency}-${d.toCurrency}`,
    amount: d.invoiceAmount,
    margin_at_risk: d.marginAtRiskMinus5pct,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd fxhedge; npx vitest run lib/__tests__/deal-context.test.ts`
Expected: PASS.

- [ ] **Step 5: Point the chat widget at the live invoice**

In `fxhedge/components/chat-widget.tsx`, replace line 3:

```ts
import { MOCK_PROFILE } from "@/lib/fixtures";
```

with:

```ts
import { useAppData } from "@/hooks/use-app-data";
import { dealContextFromSnapshot } from "@/lib/assistant/deal-context";
```

Inside `ChatWidget`, immediately after the existing `useState` declarations, add:

```ts
  const deal = useAppData();
```

Then replace the `JSON.stringify` body in `send()` (the object that currently hard-codes `MOCK_PROFILE`):

```ts
        body: JSON.stringify({
          question: q,
          ...dealContextFromSnapshot(deal),
        }),
```

- [ ] **Step 6: Point `/ask` at the same helper**

In `fxhedge/app/(app)/ask/page.tsx`, add:

```ts
import { dealContextFromSnapshot } from "@/lib/assistant/deal-context";
```

Replace the body of the `/api/ask` fetch:

```ts
        body: JSON.stringify({
          question: q,
          ...dealContextFromSnapshot(d),
        }),
```

- [ ] **Step 7: Verify**

Run: `cd fxhedge; npx tsc --noEmit; npx vitest run`
Expected: no TypeScript errors, all tests PASS. `rg MOCK_PROFILE fxhedge/components/chat-widget.tsx` returns nothing.

- [ ] **Step 8: Commit**

```bash
git add fxhedge/lib/assistant/deal-context.ts fxhedge/lib/__tests__/deal-context.test.ts fxhedge/components/chat-widget.tsx "fxhedge/app/(app)/ask/page.tsx"
git commit -m "fix(assistant): send the live invoice, not Aisha's sample"
```

---
### Task 4: `.env.example` so a fresh clone boots

**Files:**
- Create: `fxhedge/.env.example`
- Modify: `README.md` (repo root) — the "Quick Start" block currently says `cp .env.example .env.local` with no file to copy.

**Interfaces:**
- Consumes: every `process.env.*` the app actually reads (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `GROQ_API_KEY`, `GROQ_MODEL`, `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `GEMINI_API_KEY`, `GEMINI_MODEL`).
- Produces: no runtime exports.

- [ ] **Step 1: Write the example file**

Create `fxhedge/.env.example`:

```
# Copy this file to .env.local and fill in the values.
# Never commit .env.local.

# Supabase — required for auth, profiles, and persisted flows.
# Middleware redirects protected routes to /login if these two are missing.
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=

# Service-role key is used ONLY by scripts/test-supabase.mts.
# Leave blank unless you are running that script. Never import it from app code.
SUPABASE_SERVICE_ROLE_KEY=

# Assistant — at least one of these three keys. Groq is tried first, then Anthropic, then Gemini.
# If none are set, /api/ask returns 503 with the honest fallback copy.
GROQ_API_KEY=
GROQ_MODEL=

ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=

GEMINI_API_KEY=
GEMINI_MODEL=
```

- [ ] **Step 2: Confirm `.gitignore` already excludes `.env.local`**

Run: `cd fxhedge; rg "\.env" .gitignore`
Expected: a line matching `.env*.local` or `.env.local`. Do not change `.gitignore` unless that line is missing — if it is missing, add `.env*.local`.

- [ ] **Step 3: Fix the root README so the copy command works**

In the repo-root `README.md` Quick Start block, the `cp .env.example .env.local` line must run from `fxhedge/` (where the new file lives). If the README currently says `cd fxhedge/fxhedge`, replace the clone/start section with:

```markdown
```bash
git clone https://github.com/abdulrahmanzrein/fxhedge.git
cd fxhedge/fxhedge
npm install
cp .env.example .env.local
npm run dev
```
```

Keep the Environment Variables list that already follows; it now matches the file.

- [ ] **Step 4: Commit**

```bash
git add fxhedge/.env.example README.md
git commit -m "docs: add the .env.example the README already told people to copy"
```

---

### Task 5: Full verification

**Files:**
- Modify: none unless a check fails.

**Interfaces:**
- Consumes: Tasks 1–5.
- Produces: a green tree.

- [ ] **Step 1: Confirm the old leaky reads are gone**

Run: `cd fxhedge; rg "MOCK_PROFILE\.home_currency|MOCK_PROFILE\.invoice_amount|MOCK_PROFILE\.supplier_currency" --glob '!{lib/fixtures.ts,lib/flows/**,lib/__tests__/**,node_modules/**}'`
Expected: no matches in `components/chat-widget.tsx` or `app/(app)/dashboard/page.tsx`. Remaining matches inside `use-app-data.ts` fallbacks and `lib/flows/flow.ts` `sampleFlow()` are allowed.

- [ ] **Step 2: Run every check**

Run: `cd fxhedge; npx vitest run; npx tsc --noEmit; npm run build`
Expected: all tests PASS, no type errors, build succeeds.

- [ ] **Step 3: Click through signed in**

Run `npm run dev`, sign in, then:
1. `/dashboard` — money symbol matches the profile's home currency; cost table includes "Margin today".
2. Open the floating chat and ask "Is this invoice a problem?" — the reply may mention the live pair/amount, not €12,000 CAD if you onboarded with something else.
3. Footer from `/` → Privacy and Terms both render.

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "chore(surfaces): final verification fixes"
```
