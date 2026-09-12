"use client";
import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useFlows } from "@/hooks/use-flows";
import { todayIsoDate, addDaysIso, daysUntilDue, CURRENCIES } from "@/lib/flows/flow";
import type { Flow, FlowDirection } from "@/types/flow";
import { currencySymbol } from "@/lib/fixtures";
import { usePageFade } from "@/components/page-fade";
import { ArrowRight, Clock, Trash2, FileText, Upload, Sparkles } from "lucide-react";

declare global { interface Window { pdfjsLib: any } }
const PDFJS_CDN     = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
const PDFJS_WORKER  = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

function ensurePdfJs(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("SSR"));
  if (window.pdfjsLib) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = PDFJS_CDN; s.async = true;
    s.onload = () => {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
      resolve();
    };
    s.onerror = () => reject(new Error("pdf.js failed to load"));
    document.head.appendChild(s);
  });
}

function parseInvoice(text: string): { amount?: number; currency?: string; label?: string } {
  const currencyMap: Record<string, string> = { "€": "EUR", "$": "USD", "£": "GBP" };
  // ISO currency codes
  const isoMatch = text.match(/\b(EUR|USD|GBP|CAD|AUD|SGD)\b/i);
  let currency = isoMatch ? isoMatch[1].toUpperCase() : undefined;

  // Amount adjacent to a currency symbol or code, e.g. "€12,000.00" or "USD 12500"
  const amountRe = /(?:€|\$|£|EUR|USD|GBP|CAD|AUD|SGD)\s*([\d]{1,3}(?:[,\s\.]\d{3})*(?:\.\d{1,2})?)|([\d]{1,3}(?:[,\s\.]\d{3})*(?:\.\d{1,2})?)\s*(?:€|\$|£|EUR|USD|GBP|CAD|AUD|SGD)/i;
  const amountMatch = text.match(amountRe);
  const rawAmount = amountMatch ? (amountMatch[1] || amountMatch[2]) : undefined;
  const amount = rawAmount ? Math.round(parseFloat(rawAmount.replace(/[,\s]/g, ""))) : undefined;

  // If no currency yet but we spotted a symbol on the way, pick from map
  if (!currency) {
    for (const sym of ["€", "$", "£"]) {
      if (text.includes(sym)) { currency = currencyMap[sym]; break; }
    }
  }

  // Label: try "Invoice", "Bill to", "From:" style prefixes
  const supplierMatch =
    text.match(/(?:Invoice(?:\s*#|:)?\s*)([A-Za-z0-9\- ]{3,40})/i) ||
    text.match(/(?:Supplier|Vendor|Bill\s*to|From):\s*([^\n]{3,40})/i);
  const label = supplierMatch ? supplierMatch[1].trim() : undefined;

  return { amount, currency, label };
}

function fmtWhen(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-CA", { month: "short", day: "numeric" });
}

export default function TransferPage() {
  const router = useRouter();
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

  // PDF drop / extract
  const [dragActive, setDragActive] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [extracted, setExtracted]   = useState<{ file: string; found: string[] } | null>(null);
  const [extractError, setExtractError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setExtractError(null);
    setExtracted(null);
    if (file.type !== "application/pdf") {
      setExtractError("Please drop a PDF file.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setExtractError("PDF too large (max 10 MB).");
      return;
    }
    setExtracting(true);
    try {
      await ensurePdfJs();
      const buf = await file.arrayBuffer();
      const pdf = await window.pdfjsLib.getDocument({ data: buf }).promise;
      let text = "";
      const pages = Math.min(pdf.numPages, 3);
      for (let i = 1; i <= pages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        text += content.items.map((it: any) => it.str).join(" ") + " ";
      }
      const parsed = parseInvoice(text);
      const found: string[] = [];
      if (parsed.amount)   { setAmount(parsed.amount);         found.push("amount"); }
      if (parsed.currency && (CURRENCIES as readonly string[]).includes(parsed.currency)) {
        setFrom(parsed.currency);                              found.push("currency");
      }
      if (parsed.label)    { setLabel(parsed.label.slice(0, 60)); found.push("label"); }
      if (found.length === 0) {
        setExtractError("Couldn't detect invoice details. Please enter manually.");
      } else {
        setExtracted({ file: file.name, found });
      }
    } catch (e) {
      setExtractError(e instanceof Error ? e.message : "Extraction failed.");
    } finally {
      setExtracting(false);
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }
  function onDragOver(e: React.DragEvent) { e.preventDefault(); setDragActive(true); }
  function onDragLeave(e: React.DragEvent) { e.preventDefault(); setDragActive(false); }

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

  return (
    <div className="flex flex-col gap-6 lg:h-[calc(100dvh-4.75rem)]">
      {/* Header */}
      <div style={fade(0)}>
        <div
          className="text-xs font-medium uppercase tracking-wider"
          style={{ color: "var(--color-primary)" }}
        >
          New transfer
        </div>
        <h1 className="font-serif text-3xl md:text-4xl font-normal text-[var(--color-fg)] mt-2">
          What&apos;s your next payment?
        </h1>
        <p className="text-[var(--color-muted-fg)] mt-2 max-w-2xl">
          Enter an upcoming supplier invoice. We&apos;ll break down providers, rates, and hedging options on the dashboard.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-5 flex-1 min-h-0">

        {/* Form */}
        <form
          onSubmit={submit}
          className="lg:col-span-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-6 flex flex-col gap-4 min-h-0 overflow-y-auto"
          style={fade(1)}
        >
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

          {/* PDF drop zone */}
          <div
            onDrop={onDrop}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onClick={() => fileInputRef.current?.click()}
            className="relative rounded-xl border-2 border-dashed px-6 py-8 cursor-pointer transition-[border-color,background-color]"
            style={{
              borderColor: dragActive
                ? "var(--color-primary)"
                : extracted
                ? "rgba(34,197,94,0.5)"
                : extractError
                ? "rgba(248,113,113,0.5)"
                : "var(--color-border)",
              background: dragActive
                ? "rgba(34,197,94,0.08)"
                : extracted
                ? "rgba(34,197,94,0.05)"
                : "transparent",
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
            />
            <div className="flex flex-col items-center text-center gap-3">
              <div
                className="h-14 w-14 rounded-2xl flex items-center justify-center shrink-0"
                style={{
                  background: extracted ? "rgba(34,197,94,0.15)" : "var(--color-muted)",
                  color: extracted ? "#16A34A" : "var(--color-muted-fg)",
                }}
              >
                {extracting ? (
                  <div className="h-6 w-6 rounded-full border-2 border-current border-t-transparent animate-spin" />
                ) : extracted ? (
                  <Sparkles size={24} />
                ) : (
                  <Upload size={24} />
                )}
              </div>
              <div className="min-w-0">
                {extracting ? (
                  <>
                    <p className="text-base font-semibold text-[var(--color-fg)]">Extracting invoice details…</p>
                    <p className="text-xs text-[var(--color-muted-fg)] mt-1">Reading PDF and looking for amount, currency, supplier</p>
                  </>
                ) : extracted ? (
                  <>
                    <p className="text-base font-semibold text-[var(--color-fg)] truncate flex items-center justify-center gap-1.5">
                      <FileText size={15} className="shrink-0" />
                      {extracted.file}
                    </p>
                    <p className="text-xs mt-1" style={{ color: "#16A34A" }}>
                      Filled in {extracted.found.join(", ")}. Review below then submit.
                    </p>
                  </>
                ) : extractError ? (
                  <>
                    <p className="text-base font-semibold text-[var(--color-fg)]">Drop an invoice PDF to auto fill</p>
                    <p className="text-xs mt-1" style={{ color: "#f87171" }}>{extractError}</p>
                  </>
                ) : (
                  <>
                    <p className="text-base font-semibold text-[var(--color-fg)]">Drop an invoice PDF to auto fill</p>
                    <p className="text-xs text-[var(--color-muted-fg)] mt-1">
                      Or click to browse. We extract amount + currency locally, nothing uploaded.
                    </p>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="From currency" htmlFor="from-cur">
              <select
                id="from-cur"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className={inputCls}
              >
                {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="To currency" htmlFor="to-cur">
              <select
                id="to-cur"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className={inputCls}
              >
                {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </Field>
          </div>

          <Field
            label={`${incoming ? "Amount expected" : "Invoice amount"} (${currencySymbol(from)}${from})`}
            htmlFor="inv-amt"
          >
            <input
              id="inv-amt"
              type="number"
              min={1}
              required
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              className={inputCls + " tabular"}
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Invoice date" htmlFor="inv-date">
              <input
                id="inv-date"
                type="date"
                required
                max={todayIsoDate()}
                value={invoicedOn}
                onChange={(e) => setInvoicedOn(e.target.value)}
                className={inputCls + " tabular"}
              />
            </Field>
            <Field label={incoming ? "Days until paid" : "Days until due"} htmlFor="inv-days">
              <input
                id="inv-days"
                type="number"
                min={0}
                max={365}
                required
                value={days}
                onChange={(e) => setDays(Number(e.target.value))}
                className={inputCls + " tabular"}
              />
            </Field>
          </div>

          <p className="-mt-1 text-[11px] leading-relaxed text-[var(--color-muted-fg)]">
            {incoming
              ? "The invoice date sets what the rate is compared against. Days until paid sets when this money lands, which is what lets it offset a payment in the same currency."
              : "The invoice date sets what the rate is compared against. Days until due sets how long you are still exposed."}
          </p>

          <Field label="Label (optional)" htmlFor="inv-label">
            <input
              id="inv-label"
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Q3 supplier invoice"
              className={inputCls}
            />
          </Field>

          {from === to && (
            <p className="text-xs" style={{ color: "#f87171" }}>Pick two different currencies.</p>
          )}

          <button
            type="submit"
            disabled={from === to || amount <= 0}
            className="mt-1 flex items-center justify-center gap-2 rounded-lg py-3 text-sm font-semibold text-white transition-[opacity,scale] duration-150 active:scale-[0.96] hover:opacity-90 disabled:opacity-40 disabled:active:scale-100"
            style={{ background: "var(--color-primary)" }}
          >
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
        </form>

        {/* Recent invoices */}
        <div
          className="lg:col-span-2 rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-6 flex flex-col min-h-0"
          style={fade(2)}
        >
          <div className="flex items-center justify-between mb-4 shrink-0">
            <div className="flex items-center gap-2">
              <Clock size={14} style={{ color: "var(--color-muted-fg)" }} />
              <span className="text-xs font-medium uppercase tracking-wider text-[var(--color-muted-fg)]">
                Your flows
              </span>
            </div>
            {ready && flows.length > 0 && (
              <span className="text-xs text-[var(--color-muted-fg)] tabular">{flows.length} saved</span>
            )}
          </div>

          {!ready ? (
            <ul className="space-y-2 flex-1 min-h-0 overflow-y-auto">
              {[0, 1, 2].map((i) => (
                <li key={i} className="animate-pulse h-16 rounded-xl bg-[var(--color-muted)]" />
              ))}
            </ul>
          ) : flows.length === 0 ? (
            <div className="flex-1 min-h-0 flex flex-col items-center justify-center text-center">
              <p className="text-sm text-[var(--color-muted-fg)]">No flows yet. Add a supplier invoice or a customer payment above.</p>
            </div>
          ) : (
            <ul className="flex-1 min-h-0 overflow-y-auto -mr-2 pr-2 space-y-1.5">
              {flows.map((inv) => (
                <li key={inv.id}>
                  <div className="group flex items-stretch rounded-lg border border-[var(--color-border)] hover:border-[var(--color-primary)] transition-colors">
                    <button
                      type="button"
                      onClick={() => pickRecent(inv)}
                      disabled={inv.direction === "incoming"}
                      className="flex-1 min-w-0 text-left px-3 py-2.5 rounded-l-lg active:scale-[0.99] transition-transform duration-150 disabled:cursor-default disabled:active:scale-100"
                    >
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
                    </button>
                    <button
                      type="button"
                      onClick={() => removeFlow(inv.id)}
                      className="opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity w-9 flex items-center justify-center border-l border-[var(--color-border)] hover:bg-[var(--color-muted)] rounded-r-lg"
                      aria-label={`Remove ${inv.label}`}
                    >
                      <Trash2 size={13} style={{ color: "var(--color-muted-fg)" }} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

const inputCls =
  "w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-sm text-[var(--color-fg)] placeholder:text-[var(--color-muted-fg)] focus:outline-none focus:border-[var(--color-primary)] transition-colors";

function Field({
  label, htmlFor, children,
}: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="block text-xs font-medium text-[var(--color-muted-fg)] mb-1.5">
        {label}
      </label>
      {children}
    </div>
  );
}
