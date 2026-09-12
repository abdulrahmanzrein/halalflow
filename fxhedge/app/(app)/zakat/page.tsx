"use client";

import { useEffect, useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import type { ZakatHolding, ZakatResult, MadhhabMethod } from "@/types/zakat";
import { computeZakat, NISAB_GOLD_GRAMS } from "@/lib/zakat";
import { useAppData } from "@/hooks/use-app-data";

const STORAGE_KEY = "halalflow:zakat";

/** Sample rows so the page opens with something to look at, in the user's own currencies. */
function initialHoldings(home: string, foreign: string): ZakatHolding[] {
  return [
    { id: "h1", kind: "cash_home",    label: "Operating account", amount: 18500, currency: home },
    { id: "h2", kind: "receivable",   label: "Customer invoice",  amount: 12000, currency: foreign, due_days: 20 },
    { id: "h3", kind: "inventory",    label: "Resale stock",      amount: 6000,  currency: home },
    { id: "h4", kind: "liability",    label: "Supplier loan",     amount: 9000,  currency: home },
  ];
}

const KINDS: { value: ZakatHolding["kind"]; label: string; color: string }[] = [
  { value: "cash_home",    label: "Cash (home)",         color: "#3DD68C" },
  { value: "cash_foreign", label: "Cash (foreign)",      color: "#22C55E" },
  { value: "receivable",   label: "Receivable",          color: "#818cf8" },
  { value: "inventory",    label: "Inventory",           color: "#F59E0B" },
  { value: "liability",    label: "Liability (you owe)", color: "#f87171" },
];
const KMAP: Record<string, typeof KINDS[number]> = Object.fromEntries(KINDS.map((k) => [k.value, k]));
const CURRENCIES = ["CAD", "USD", "EUR", "GBP", "AED", "TRY"];
const ACCENT = "#3DD68C";

const METHOD_LABEL: Record<MadhhabMethod, string> = {
  aaoifi: "AAOIFI, Standard No. 35",
  hanafi: "Hanafi view",
};

const money = (n: number, currency: string, dp = 0) =>
  new Intl.NumberFormat("en-CA", { style: "currency", currency, maximumFractionDigits: dp }).format(n);
const hexA = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

function useAnimatedNumber(value: number, run: number, dur = 900) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setV(value);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const from = 0;
    const tick = (now: number) => {
      const p = Math.min((now - t0) / dur, 1);
      setV(from + (value - from) * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, run, dur]);
  return v;
}

function newId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `h_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/* ================================================================== */

export default function ZakatPage() {
  const d = useAppData();
  const home = d.toCurrency;

  const [holdings, setHoldings] = useState<ZakatHolding[]>([]);
  const [goldPrice, setGoldPrice] = useState("");
  const [method, setMethod] = useState<MadhhabMethod>("aaoifi");
  const [view, setView] = useState<"input" | "result">("input");
  const [runId, setRunId] = useState(0);
  const [hydrated, setHydrated] = useState(false);

  const [rates, setRates] = useState<Record<string, number> | null>(null);
  const [rateDate, setRateDate] = useState<string | null>(null);
  const [ratesError, setRatesError] = useState(false);

  // Restore a previous session; otherwise seed from the user's own currencies.
  useEffect(() => {
    if (d.loading || hydrated) return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as { holdings?: ZakatHolding[]; goldPrice?: string };
        if (saved.holdings?.length) setHoldings(saved.holdings);
        else setHoldings(initialHoldings(home, d.fromCurrency));
        if (saved.goldPrice) setGoldPrice(saved.goldPrice);
      } else {
        setHoldings(initialHoldings(home, d.fromCurrency));
      }
    } catch {
      setHoldings(initialHoldings(home, d.fromCurrency));
    }
    setHydrated(true);
  }, [d.loading, d.fromCurrency, home, hydrated]);

  // Persist so a half-finished return isn't lost on reload.
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ holdings, goldPrice }));
    } catch {
      // storage full or blocked — the calculator still works in-memory
    }
  }, [holdings, goldPrice, hydrated]);

  // Zakat is due on today's VALUE, so foreign holdings need live rates.
  const foreign = useMemo(
    () => [...new Set(holdings.map((h) => h.currency).filter((c) => c !== home))].sort(),
    [holdings, home],
  );
  const foreignKey = foreign.join(",");

  useEffect(() => {
    if (!hydrated) return;
    let alive = true;
    fetch(`/api/zakat/rates?home=${home}&currencies=${foreignKey}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("rates"))))
      .then((data: { rates: Record<string, number>; rate_date: string }) => {
        if (!alive) return;
        setRates(data.rates);
        setRateDate(data.rate_date);
        setRatesError(false);
      })
      .catch(() => { if (alive) setRatesError(true); });
    return () => { alive = false; };
  }, [foreignKey, home, hydrated]);

  const gold = Number(goldPrice);
  const goldValid = Number.isFinite(gold) && gold > 0;
  const missingRates = foreign.filter((c) => !rates?.[c]);
  const canCompute = goldValid && rates !== null && missingRates.length === 0;

  const result = useMemo(() => {
    if (!canCompute || !rates) return null;
    try {
      return computeZakat(holdings, method, rates, gold, home);
    } catch {
      return null;
    }
  }, [holdings, method, rates, gold, home, canCompute]);

  const update = (id: string, patch: Partial<ZakatHolding>) =>
    setHoldings((hs) => hs.map((h) => (h.id === id ? { ...h, ...patch } : h)));
  const remove = (id: string) =>
    setHoldings((hs) => hs.filter((h) => h.id !== id));
  const addRow = () =>
    setHoldings((hs) => [
      ...hs,
      { id: newId(), kind: "cash_home", label: "", amount: 0, currency: home },
    ]);

  const showResult = () => { setRunId((n) => n + 1); setView("result"); };
  const showInput  = () => setView("input");

  return (
    <div className="flex flex-col gap-4 lg:h-[calc(100dvh-4.75rem)]">

      {/* Header + method toggle */}
      <header className="flex flex-wrap items-end justify-between gap-4 shrink-0">
        <div>
          {view === "result" && (
            <button
              onClick={showInput}
              className="mb-2.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-1.5 text-[12.5px] font-semibold text-[var(--color-muted-fg)] hover:bg-[var(--color-muted)] hover:text-[var(--color-fg)] transition-colors"
            >
              ← Edit holdings
            </button>
          )}
          <p className="text-xs font-semibold" style={{ color: ACCENT }}>Zakat calculator</p>
          <h1 className="font-serif text-3xl md:text-4xl font-normal text-[var(--color-fg)] mt-1.5">
            What you owe this year.
          </h1>
          <p className="text-[13.5px] text-[var(--color-muted-fg)] mt-2 max-w-[54ch]">
            {view === "input"
              ? "Add each holding and choose its type, then calculate."
              : "2.5% of your zakatable pool, valued at live reference rates."}
          </p>
        </div>
        <div className="inline-flex gap-1 p-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)]">
          {(["aaoifi", "hanafi"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMethod(m)}
              className="rounded-lg px-4 py-2 text-[13px] font-semibold transition-colors"
              style={method === m
                ? { color: ACCENT, background: hexA(ACCENT, 0.12) }
                : { color: "var(--color-muted-fg)", background: "transparent" }}
            >
              {METHOD_LABEL[m]}
            </button>
          ))}
        </div>
      </header>

      {/* Two-view stage: input <-> result crossfade */}
      <div className="relative flex-1 min-h-0">

        {/* STEP 1 — input */}
        <View active={view === "input"} from="left">
          <div className="mx-auto w-full max-w-[960px] h-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] flex flex-col min-h-0 overflow-hidden">
            <div className="p-6 pb-4 shrink-0">
              <h2 className="font-serif text-xl font-normal text-[var(--color-fg)]">Your holdings</h2>
              <p className="text-sm text-[var(--color-muted-fg)] mt-1.5">
                Cash, receivables and resale stock count; what you owe is deducted.
              </p>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto px-6 pb-4 flex flex-col gap-3.5">
              {holdings.map((h) => {
                const k = KMAP[h.kind];
                const curList = [home, ...CURRENCIES.filter((c) => c !== home)];
                const isReceivable = h.kind === "receivable";
                return (
                  <div
                    key={h.id}
                    className="group relative rounded-xl border border-[var(--color-border)] bg-[var(--color-muted)] p-5 pl-6 focus-within:border-[var(--color-primary)] transition-colors"
                  >
                    {/* Colored kind indicator */}
                    <span className="absolute left-0 inset-y-3 w-[3px] rounded-r" style={{ background: k.color }} />

                    {/* Row 1: Label (big, primary) + trash */}
                    <div className="flex items-center gap-3">
                      <input
                        aria-label="Label"
                        placeholder="e.g. EUR customer invoice"
                        className="flex-1 min-w-0 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2.5 text-sm text-[var(--color-fg)] outline-none focus:border-[var(--color-primary)] transition-colors"
                        value={h.label}
                        onChange={(e) => update(h.id, { label: e.target.value })}
                      />
                      <button
                        aria-label="Remove holding"
                        onClick={() => remove(h.id)}
                        className="shrink-0 flex items-center justify-center h-9 w-9 rounded-lg text-[var(--color-muted-fg)] hover:text-[#f87171] hover:bg-[var(--color-card)] opacity-0 group-hover:opacity-100 focus:opacity-100 transition-[opacity,color,background-color] duration-200"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>

                    {/* Row 2: Type + Currency + Amount (labeled fields, evenly spaced) */}
                    <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,0.8fr)_minmax(0,1fr)] gap-4 mt-4">
                      <FieldLabel label="Type" dot={k.color}>
                        <select
                          aria-label="Type"
                          className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2 text-sm text-[var(--color-fg)] outline-none focus:border-[var(--color-primary)] transition-colors"
                          value={h.kind}
                          onChange={(e) => update(h.id, { kind: e.target.value as ZakatHolding["kind"] })}
                        >
                          {KINDS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      </FieldLabel>

                      <FieldLabel label="Currency">
                        <select
                          aria-label="Currency"
                          className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2 text-sm text-[var(--color-fg)] outline-none focus:border-[var(--color-primary)] transition-colors"
                          value={h.currency}
                          onChange={(e) => update(h.id, { currency: e.target.value })}
                        >
                          {curList.map((c) => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </FieldLabel>

                      <FieldLabel label={`Amount (${h.currency})`}>
                        <input
                          aria-label="Amount"
                          type="number"
                          min={0}
                          placeholder="0"
                          className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2 text-sm text-right tabular text-[var(--color-fg)] outline-none focus:border-[var(--color-primary)] transition-colors"
                          value={h.amount || ""}
                          onChange={(e) => update(h.id, { amount: Number(e.target.value) || 0 })}
                        />
                      </FieldLabel>
                    </div>

                    {/* Row 3 (receivables only): due + doubtful */}
                    {isReceivable && (
                      <div className="flex items-center gap-5 mt-4 pt-4 border-t border-[var(--color-border)] text-sm text-[var(--color-muted-fg)]">
                        <label className="flex items-center gap-2">
                          <span>Due in</span>
                          <input
                            aria-label="Days until due"
                            type="number"
                            min={0}
                            className="w-16 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] px-2 py-1.5 text-sm text-center tabular text-[var(--color-fg)] outline-none focus:border-[var(--color-primary)] transition-colors"
                            value={h.due_days ?? 0}
                            onChange={(e) => update(h.id, { due_days: Number(e.target.value) || 0 })}
                          />
                          <span>days</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded accent-[var(--color-primary)]"
                            checked={!!h.doubtful}
                            onChange={(e) => update(h.id, { doubtful: e.target.checked })}
                          />
                          <span>Seriously doubtful collection</span>
                        </label>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="px-6 pb-4 shrink-0">
              <button
                onClick={addRow}
                className="w-full rounded-xl border border-dashed border-[var(--color-border)] py-3 text-sm font-semibold transition-colors hover:border-[color:var(--fw)]"
                style={{ color: ACCENT, ["--fw" as string]: hexA(ACCENT, 0.4) } as React.CSSProperties}
              >
                + Add holding
              </button>
            </div>

            {/* Nisab needs a gold price, and no keyless feed publishes one — so it is asked for, and labelled as such. */}
            <div className="px-6 pb-4 shrink-0">
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-muted)] p-4">
                <FieldLabel label={`Gold price per gram (${home}), you enter this`}>
                  <input
                    aria-label={`Gold price per gram in ${home}`}
                    type="number"
                    min={0}
                    step="0.01"
                    placeholder="e.g. 105.40"
                    className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2 text-sm text-right tabular text-[var(--color-fg)] outline-none focus:border-[var(--color-primary)] transition-colors"
                    value={goldPrice}
                    onChange={(e) => setGoldPrice(e.target.value)}
                  />
                </FieldLabel>
                <p className="mt-2 text-[11.5px] leading-relaxed text-[var(--color-muted-fg)]">
                  Nisab is the value of {NISAB_GOLD_GRAMS}g of gold. Below it, no zakat is due.
                  Check today&apos;s price with your local dealer.
                  {goldValid && (
                    <> Yours works out to{" "}
                      <span className="tabular font-semibold text-[var(--color-fg)]">
                        {money(NISAB_GOLD_GRAMS * gold, home)}
                      </span>.
                    </>
                  )}
                </p>
              </div>

              {ratesError && (
                <p className="mt-3 text-xs" style={{ color: "var(--color-negative)" }}>
                  Could not load today&apos;s exchange rates. Foreign holdings cannot be valued until
                  they load. Check your connection and refresh.
                </p>
              )}
              {!ratesError && missingRates.length > 0 && rates !== null && (
                <p className="mt-3 text-xs" style={{ color: "var(--color-negative)" }}>
                  No rate available for {missingRates.join(", ")}. Remove those holdings or pick a
                  different currency.
                </p>
              )}
            </div>

            <div className="flex items-center justify-between gap-4 px-6 py-4 border-t border-[var(--color-border)] shrink-0">
              <span className="text-sm text-[var(--color-muted-fg)] tabular">
                {holdings.length} holding{holdings.length === 1 ? "" : "s"}
                {rateDate && !ratesError && (
                  <span className="text-[var(--color-dim)]">, rates {rateDate}</span>
                )}
              </span>
              <button
                onClick={showResult}
                disabled={!canCompute}
                title={!goldValid ? "Enter a gold price to set the nisab threshold" : undefined}
                className="inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold transition-[opacity,scale] duration-200 active:scale-[0.96] hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: `linear-gradient(135deg,#16A34A,${ACCENT})`, color: "#04120a" }}
              >
                {goldValid ? "Calculate zakat →" : "Enter gold price first"}
              </button>
            </div>
          </div>
        </View>

        {/* STEP 2 — result */}
        <View active={view === "result"} from="right">
          <div className="mx-auto w-full max-w-[720px] h-full">
            {result && <ZakatDue result={result} runId={runId} home={home} />}
          </div>
        </View>
      </div>
    </div>
  );
}

/* Labeled form field wrapper */
function FieldLabel({
  label, dot, children,
}: { label: string; dot?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 min-w-0">
      <span className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-[var(--color-muted-fg)]">
        {dot && <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: dot }} />}
        {label}
      </span>
      {children}
    </label>
  );
}

/* Crossfade + slide wrapper */
function View({
  active, from, children,
}: { active: boolean; from: "left" | "right"; children: React.ReactNode }) {
  const hiddenTransform = from === "left" ? "translateX(-26px)" : "translateX(26px)";
  return (
    <div
      className="absolute inset-0 flex flex-col min-h-0"
      style={{
        opacity: active ? 1 : 0,
        transform: active ? "none" : hiddenTransform,
        pointerEvents: active ? "auto" : "none",
        transition: "opacity 0.5s ease, transform 0.55s cubic-bezier(0.22, 0.61, 0.36, 1)",
      }}
    >
      {children}
    </div>
  );
}

/* ------------------ Zakat due panel ------------------ */
function ZakatDue({
  result, runId, home,
}: { result: ZakatResult; runId: number; home: string }) {
  const due = useAnimatedNumber(result.zakat_due, runId);
  const pool = useAnimatedNumber(result.zakatable_total, runId);

  const cats = useMemo(() => {
    const c = { Cash: 0, Receivables: 0, Inventory: 0, Liabilities: 0 };
    result.holdings.forEach((r) => {
      if (r.kind === "cash_home" || r.kind === "cash_foreign") c.Cash += r.value_home;
      else if (r.kind === "receivable") { if (r.zakatable) c.Receivables += r.value_home; }
      else if (r.kind === "inventory") c.Inventory += r.value_home;
      else if (r.kind === "liability") c.Liabilities += r.value_home;
    });
    return c;
  }, [result]);

  const catDefs: [keyof typeof cats, string][] = [
    ["Cash",         "#3DD68C"],
    ["Receivables",  "#818cf8"],
    ["Inventory",    "#F59E0B"],
    ["Liabilities",  "#f87171"],
  ];
  const maxc = Math.max(...Object.values(cats), 1);

  return (
    <section className="relative overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-5 flex flex-col min-h-0">
      <span
        className="pointer-events-none absolute -right-10 -top-10 h-44 w-44 rounded-full"
        style={{ background: `radial-gradient(circle, ${hexA(ACCENT, 0.14)}, transparent 70%)` }}
      />
      <p className="text-xs text-[var(--color-muted-fg)] relative">
        Zakat due, {METHOD_LABEL[result.method]}
      </p>
      <p
        className="relative text-4xl font-semibold tabular leading-none mt-2"
        style={{ color: ACCENT }}
      >
        {money(due, home, 2)}
      </p>
      <span
        className="mt-3.5 inline-flex w-fit items-center gap-2 rounded-full px-3 py-1.5 text-[12.5px] font-semibold"
        style={result.nisab_met
          ? { color: ACCENT, background: hexA(ACCENT, 0.12) }
          : { color: "var(--color-muted-fg)", background: "var(--color-muted)" }}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-current" />
        {result.nisab_met ? "Nisab met" : "Below nisab"}
      </span>
      <p className="text-xs text-[var(--color-muted-fg)] mt-2.5">
        {result.nisab_met
          ? `2.5% of your zakatable pool. Threshold ${money(result.nisab_threshold, home)}.`
          : `Pool is under the nisab threshold (${money(result.nisab_threshold, home)}). Nothing due this year.`}
      </p>

      <div className="mt-4 pt-4 border-t border-[var(--color-border)] flex flex-col gap-3 min-h-0 overflow-y-auto">
        {catDefs.map(([name, color]) => {
          const val = cats[name];
          const neg = name === "Liabilities";
          return (
            <div key={name} className="flex flex-col gap-1.5">
              <div className="flex justify-between text-[12.5px] text-[var(--color-fg)]">
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full" style={{ background: color }} />
                  {name}
                </span>
                <span className="tabular" style={{ color: neg && val > 0 ? "#f87171" : undefined }}>
                  {neg && val > 0 ? "−" : ""}{money(val, home)}
                </span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,.05)" }}>
                <div
                  key={runId}
                  className="h-full rounded-full"
                  style={{
                    width: `${(val / maxc) * 100}%`,
                    background: color,
                    animation: "zk-bar 0.9s cubic-bezier(0.16, 1, 0.3, 1)",
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-auto pt-4 border-t border-[var(--color-border)] flex items-baseline justify-between text-[13px]">
        <span className="text-[var(--color-muted-fg)]">Zakatable pool</span>
        <span className="tabular font-semibold text-[17px] text-[var(--color-fg)]">{money(pool, home)}</span>
      </div>
      <p className="text-[11px] text-[var(--color-muted-fg)] opacity-60 mt-3 text-right">
        Rates as of {result.rate_date}, live ECB reference
      </p>

      <style jsx>{`@keyframes zk-bar { from { width: 0 } }`}</style>
    </section>
  );
}

