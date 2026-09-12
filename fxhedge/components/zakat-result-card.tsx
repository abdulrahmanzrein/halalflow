import type { ZakatResult } from "@/types/zakat";

const METHOD_LABEL: Record<ZakatResult["method"], string> = {
  aaoifi: "AAOIFI view (Standard No. 9)",
  hanafi: "Hanafi view",
};

function money(n: number, cur: string) {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: cur,
    maximumFractionDigits: 2,
  }).format(n);
}

export function ZakatResultCard({ result, home }: { result: ZakatResult; home: string }) {
  return (
    <section
      aria-label="Zakat result"
      className="zakat-summary flex flex-col gap-4 rounded-lg border border-border bg-surface p-6"
    >
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-text-muted">
            Zakat due ({METHOD_LABEL[result.method]})
          </p>
          <p className="text-3xl font-bold text-primary [font-feature-settings:'tnum'_1,'lnum'_1]">
            {money(result.zakat_due, home)}
          </p>
          <p className="mt-1 text-sm text-text-muted">
            {result.nisab_met
              ? `2.5% of your zakatable pool. Nisab met (threshold ${money(result.nisab_threshold, home)})`
              : `Below the nisab threshold (${money(result.nisab_threshold, home)}). Nothing due this year`}
          </p>
        </div>
        <div className="text-right text-xs text-text-faint">
          <p>Rates as of {result.rate_date}</p>
          <p>Live ECB reference via Frankfurter / BoC</p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-divider text-left text-xs uppercase text-text-muted">
              <th className="py-2 pr-2">Holding</th>
              <th className="py-2 pr-2">Type</th>
              <th className="py-2 pr-2 text-right">Original</th>
              <th className="py-2 pr-2 text-right">Rate used</th>
              <th className="py-2 text-right">Value ({home})</th>
            </tr>
          </thead>
          <tbody>
            {result.holdings.map((h) => (
              <tr
                key={h.id}
                className={`border-b border-divider ${h.zakatable ? "" : "opacity-55"}`}
              >
                <td className="py-2 pr-2 font-medium">{h.label || "n/a"}</td>
                <td className="py-2 pr-2 text-xs">{h.kind.replace("_", " ")}</td>
                <td className="py-2 pr-2 text-right [font-feature-settings:'tnum'_1,'lnum'_1]">
                  {h.currency === home ? "" : `${h.currency} `}
                  {h.amount.toLocaleString()}
                </td>
                <td className="py-2 pr-2 text-right text-xs text-text-muted [font-feature-settings:'tnum'_1,'lnum'_1]">
                  {h.rate_source === "home currency" ? "home" : `1 ${h.currency} = ${h.rate_used} ${home}`}
                  {h.rate_source && h.rate_source !== "home currency" && (
                    <span className="ml-1 rounded-full bg-primary-highlight px-1.5 py-0.5 text-[10px] uppercase text-primary">
                      live
                    </span>
                  )}
                </td>
                <td className="py-2 text-right [font-feature-settings:'tnum'_1,'lnum'_1]">
                  {money(h.value_home, home)}
                  {!h.zakatable && h.excluded_reason && (
                    <span className="block text-xs font-normal text-warning">{h.excluded_reason}</span>
                  )}
                </td>
              </tr>
            ))}
            <tr className="font-semibold">
              <td className="py-2" colSpan={4}>
                Zakatable pool
              </td>
              <td className="py-2 text-right [font-feature-settings:'tnum'_1,'lnum'_1]">
                {money(result.zakatable_total, home)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <p className="rounded-md bg-surface-2 p-3 text-xs text-text-muted">
        This is general education, not a fatwa. Scholars legitimately differ on
        receivables timing (AAOIFI Standard No. 9 vs the Hanafi view). This tool
        shows both. Confirm the numbers with a qualified scholar before paying.
      </p>
    </section>
  );
}
