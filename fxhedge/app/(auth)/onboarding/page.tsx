"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useFlows } from "@/hooks/use-flows";
import { todayIsoDate, addDaysIso } from "@/lib/flows/flow";

const CURRENCIES = ["USD", "CAD", "EUR", "GBP", "AUD", "SGD", "AED", "SAR"];
const BUSINESS_TYPES = [
  "Halal grocery importer",
  "Clothing & textiles importer",
  "Electronics importer",
  "Food & beverage distributor",
  "Wholesale trader",
  "Other",
];

export default function OnboardingPage() {
  const router = useRouter();
  const { addFlow } = useFlows();

  const [businessName, setBusinessName] = useState("");
  const [businessType, setBusinessType] = useState("");
  const [homeCurrency, setHomeCurrency] = useState("CAD");
  const [supplierCurrency, setSupplierCurrency] = useState("EUR");
  const [invoiceAmount, setInvoiceAmount] = useState("");
  const [targetMargin, setTargetMargin] = useState("");
  const [daysUntilDue, setDaysUntilDue] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sameCurrency = homeCurrency === supplierCurrency;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (sameCurrency) return;
    setLoading(true);
    setError(null);

    const amount = Number(invoiceAmount);
    const days = Number(daysUntilDue);

    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          business_name: businessName,
          business_type: businessType,
          home_currency: homeCurrency,
          supplier_currency: supplierCurrency,
          invoice_amount: amount,
          target_margin: Number(targetMargin),
          days_until_due: days,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Could not save your profile.");
      }

      // Seed the working flow so the dashboard reflects these answers at once.
      await addFlow({
        direction: "outgoing",
        label: businessName.trim() ? `${businessName.trim()} invoice` : "First invoice",
        amount,
        currency: supplierCurrency,
        home_currency: homeCurrency,
        invoiced_on: todayIsoDate(),
        due_on: addDaysIso(todayIsoDate(), Math.round(days)),
      });

      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  return (
    <main className="min-h-full flex flex-col items-center justify-center bg-[var(--color-surface)] px-4 py-16">
      <Link href="/" className="font-serif text-2xl font-semibold text-[var(--color-fg)] mb-8">
        HalalFlow
      </Link>
      <div className="w-full max-w-md rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-8">
        <h1 className="text-xl font-semibold text-[var(--color-fg)] mb-1">Tell us about your business</h1>
        <p className="text-sm text-[var(--color-muted-fg)] mb-6">
          Step 2 of 2. This sets up your dashboard. You can change any of it later.
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Field label="Business name">
            <input
              id="onboarding-biz-name"
              type="text"
              required
              autoComplete="organization"
              placeholder="Aisha's Halal Imports"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              className={inputCls}
            />
          </Field>

          <Field label="Business type">
            <select
              id="onboarding-biz-type"
              required
              value={businessType}
              onChange={(e) => setBusinessType(e.target.value)}
              className={inputCls}
            >
              <option value="">Select a type…</option>
              {BUSINESS_TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="You get paid in">
              <select
                id="onboarding-home-currency"
                required
                value={homeCurrency}
                onChange={(e) => setHomeCurrency(e.target.value)}
                className={inputCls}
              >
                {CURRENCIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="You pay suppliers in">
              <select
                id="onboarding-supplier-currency"
                required
                value={supplierCurrency}
                onChange={(e) => setSupplierCurrency(e.target.value)}
                className={inputCls}
              >
                {CURRENCIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </Field>
          </div>

          {sameCurrency && (
            <p className="text-xs" style={{ color: "var(--color-negative)" }}>
              Pick two different currencies. There is no FX risk if they match.
            </p>
          )}

          <Field label={`Typical invoice amount (${supplierCurrency})`}>
            <input
              id="onboarding-invoice"
              type="number"
              required
              min={1}
              placeholder="12000"
              value={invoiceAmount}
              onChange={(e) => setInvoiceAmount(e.target.value)}
              className={inputCls}
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Target margin (%)">
              <input
                id="onboarding-margin"
                type="number"
                required
                min={0}
                max={100}
                placeholder="10"
                value={targetMargin}
                onChange={(e) => setTargetMargin(e.target.value)}
                className={inputCls}
              />
            </Field>
            <Field label="Days until due">
              <input
                id="onboarding-days"
                type="number"
                required
                min={0}
                max={365}
                placeholder="21"
                value={daysUntilDue}
                onChange={(e) => setDaysUntilDue(e.target.value)}
                className={inputCls}
              />
            </Field>
          </div>

          {error && (
            <p role="alert" className="text-xs" style={{ color: "var(--color-negative)" }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || sameCurrency}
            className="mt-2 w-full rounded-md bg-[var(--color-primary)] py-2.5 text-sm font-semibold text-white hover:opacity-90 transition-[opacity,scale] duration-150 active:scale-[0.96] disabled:opacity-60"
          >
            {loading ? "Saving…" : "Go to dashboard →"}
          </button>
        </form>
      </div>
    </main>
  );
}

const inputCls =
  "w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-fg)] placeholder:text-[var(--color-muted-fg)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]";

function Field({ label, children }: { label: string; children: React.ReactElement<{ id?: string }> }) {
  const id = children.props.id;
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-medium text-[var(--color-muted-fg)] mb-1">{label}</label>
      {children}
    </div>
  );
}
