# HalalFlow

HalalFlow helps import businesses see the true cost and risk of foreign-currency supplier payments, with an Islamic-finance-aware guidance layer.

## What Judges Should Know

- **Problem:** SMEs lose money on hidden FX spread and unclear risk before paying suppliers.
- **Solution:** One dashboard that explains effective rate, total cost, historical risk bands, and halal structure options.
- **Built for trust:** No rate predictions, no money movement, no fatwa claims.

## Core Capabilities

- **Live FX and history** using ECB reference data.
- **Provider comparison** showing amount received, transfer fee, and hidden markup.
- **Risk and breakeven engines** to estimate downside from historical windows.
- **Natural hedge detection** to net matching incoming/outgoing currency flows.
- **Assistant** for educational Islamic-finance guidance with clear disclaimers.
- **Business zakat calculator** for foreign holdings and receivables.

## Tech Stack

- Next.js 16 + React 19 + TypeScript
- Supabase (auth + app data)
- Tailwind CSS 4 + Recharts
- Vitest for deterministic engine tests

## Quick Start

```bash
git clone https://github.com/abdulrahmanzrein/fxhedge.git
cd fxhedge/fxhedge
npm install
cp .env.example .env.local
npm run dev
```

## Environment Variables

Set these in `.env.local` (and in Vercel for deployment):

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GROQ_API_KEY` (server-only, for assistant)
- `GROQ_MODEL` (optional)

## Run Checks

```bash
npm test
npx tsc --noEmit
npm run build
```

## Repo Layout

- `fxhedge/` — production Next.js application
- `fxhedge/app/api/` — API routes
- `fxhedge/lib/` — pricing, risk, breakeven, hedge, zakat, assistant logic
- `fxhedge/lib/__tests__/` — unit tests

## Disclaimer

HalalFlow is educational software, not financial advice and not a fatwa.
