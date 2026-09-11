# Complete-App Surfaces — Design

**Date:** 2026-09-11
**Status:** Approved (deferred scope from spec 1)
**Scope:** Spec 3 of 3 in the "complete the app" sequence.

**Prerequisite:** Spec 1 (`docs/superpowers/specs/2026-09-11-flows-backbone-design.md`) is implemented. `useFlows()` exists, `use-invoice.ts` is gone, and the dashboard reads a `Flow`.

## Problem

Three surfaces still disagree with the engines and with each other:

1. `hooks/use-app-data.ts` recomputes cost inline (`invoice × rate`, extra-cost-at-5%) instead of calling the tested `buildCostBreakdown`. The two formulas disagree: the engine's `margin_at_risk_minus5pct` is **adverse-scenario profit** (fixture −$2,208); the hook currently stores **extra cost** (`−invoice × rate × 0.05`).
2. `components/chat-widget.tsx` posts Aisha's sample deal (`MOCK_PROFILE`) to `/api/ask`. `/ask` already posts the live invoice. The floating assistant answers about the wrong payment.
3. The dashboard formats money with `currencySymbol(MOCK_PROFILE.home_currency)`, so a GBP/USD user still sees `$`.
4. The README says `cp .env.example .env.local` and that file does not exist.

## Goal

One cost number, one deal context, and a copy-pasteable env file — so a signed-in user sees their own payment everywhere, and a new clone of the repo can boot.

## Non-Goals

- Guest demo mode, demo banner, guest→account migration — spec 2.
- Correspondent-bank fee warnings — already planned in `docs/superpowers/plans/2026-09-06-correspondent-fees.md`.
- A new `/api/cost` route. `buildCostBreakdown` is pure; calling it inside `useAppData` is enough.
- Changing the assistant prompt, LLM providers, or zakat engine.
- Privacy or terms pages. The product does not need them; the landing footer no longer links them.
- The `/sharia` page. It has been removed; Ask HalalFlow is the remaining guidance surface.

## Success Criteria

- `useAppData` is the only place that turns FX + providers into a `CostBreakdown`. Dashboard, risk, ask, and the chat widget all read those fields.
- The chat widget and `/ask` post the same `{ pair, amount, margin_at_risk }` object, derived from `useAppData`.
- Dashboard money uses `d.toCurrency`, never `MOCK_PROFILE.home_currency`.
- `fxhedge/.env.example` lists every variable the app reads, with empty values and a one-line comment each.
- `npm test`, `npx tsc --noEmit`, and `npm run build` all pass.

## Architecture

### Cost

Add a pure helper next to the existing engine:

```ts
impliedRevenue(invoiceAmount, invoiceDayRate, targetMarginPct): number
```

Formula (already used on `/breakeven`): `invoice × invoice-day rate × (1 + targetMargin / 100)`, rounded to cents.

`useAppData` then:

1. Loads FX + providers as today.
2. Reads `target_margin` from `useUser().profile`, falling back to `MOCK_PROFILE.target_margin` (10) when the profile has not loaded — guests and a mid-fetch dashboard must still render.
3. Calls `impliedRevenue` then `buildCostBreakdown`.
4. Copies `true_cost_today`, `best_provider`, `worst_provider`, `saving_vs_worst`, `margin_at_risk_minus5pct`, plus new fields `revenue` and `marginToday`, onto `AppData`.

**Semantic change, deliberate:** `marginAtRiskMinus5pct` becomes the engine's adverse-scenario profit. Nothing in the UI currently prints this number as "extra cost"; `/ask` passes it to the LLM as `margin_at_risk`. Aligning on the tested meaning is the point of this spec.

If `buildCostBreakdown` would throw (empty provider list), keep today's `FALLBACK_PROVIDERS` path so the dashboard never blanks.

### Deal context

A 10-line pure helper, no React:

```ts
dealContextFromSnapshot({ fromCurrency, toCurrency, invoiceAmount, marginAtRiskMinus5pct })
  → { pair, amount, margin_at_risk }
```

The chat widget and `/ask` each call `useAppData()` and this helper. Duplicate FX fetches are acceptable: those routes already cache 15–30 minutes, and a DealContext provider is spec-2-or-later work.

### Env file

`fxhedge/.env.example` — never committed with real keys. Comments name the consumer (middleware, assistant, scripts).

## Testing

Vitest stays `environment: "node"`. No jsdom, no React Testing Library.

| Target | Coverage |
|---|---|
| `impliedRevenue` | Aisha's numbers, zero/negative rate, rounding to cents |
| `dealContextFromSnapshot` | pair assembly, passthrough of amount and margin |
| Existing `buildCostBreakdown` / `askAssistant` suites | must stay green |

Hook and page changes are verified by `tsc`, `npm run build`, and a signed-in click-through.
