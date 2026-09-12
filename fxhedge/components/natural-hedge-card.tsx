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
