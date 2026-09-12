import Link from "next/link";
import { AuthForm } from "@/components/auth-form";

export default function SignUpPage() {
  return (
    <main className="min-h-full flex flex-col items-center justify-center bg-[var(--color-surface)] px-4 py-16">
      <Link href="/" className="font-serif text-2xl font-semibold text-[var(--color-fg)] mb-8">
        HalalFlow
      </Link>
      <div className="w-full max-w-sm rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-8">
        <h1 className="text-xl font-semibold text-[var(--color-fg)] mb-1">Create your account</h1>
        <p className="text-sm text-[var(--color-muted-fg)] mb-6">Step 1 of 2. Your details.</p>
        <AuthForm defaultTab="signup" />
      </div>
      <p className="mt-4 text-sm text-[var(--color-muted-fg)]">
        Already have an account?{" "}
        <Link href="/login" className="text-[var(--color-primary)] hover:underline">Sign in</Link>
      </p>
    </main>
  );
}
