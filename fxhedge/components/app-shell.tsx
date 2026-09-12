"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "@/components/theme-toggle";
import { signOutAction } from "@/app/(auth)/actions";
import {
  LayoutDashboard,
  ArrowLeftRight,
  TrendingUp,
  Moon,
  Target,
  MessageCircle,
  LogOut,
  Menu,
} from "lucide-react";
import { ChatWidget } from "@/components/chat-widget";
import { HalalFlowLogo } from "@/components/halalflow-logo";
import { MarketTicker } from "@/components/market-ticker";
import { useFlows } from "@/hooks/use-flows";
import { useState, useRef, useEffect, forwardRef } from "react";

const NAV_GROUPS = [
  {
    label: "Your payment",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/transfer", label: "New transfer", icon: ArrowLeftRight },
    ],
  },
  {
    label: "Before you pay",
    items: [
      { href: "/risk", label: "Risk explorer", icon: TrendingUp },
      { href: "/breakeven", label: "Breakeven & hedge", icon: Target },
    ],
  },
  {
    label: "Faith & finance",
    items: [
      { href: "/zakat", label: "Zakat calculator", icon: Moon },
      { href: "/ask", label: "Ask HalalFlow", icon: MessageCircle },
    ],
  },
];

const NavItem = forwardRef<
  HTMLAnchorElement,
  {
    href: string;
    label: string;
    icon: React.ComponentType<{ size?: number; className?: string }>;
    onClick?: () => void;
  }
>(function NavItem({ href, label, icon: Icon, onClick }, ref) {
  const pathname = usePathname();
  const active = pathname === href;
  return (
    <Link
      ref={ref}
      href={href}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-[color,background-color,border-color,scale] duration-150 active:scale-[0.96] ${
        active
          ? "bg-[var(--color-primary)] font-medium text-white"
          : "text-[var(--color-muted-fg)] hover:bg-[var(--color-muted)] hover:text-[var(--color-fg)]"
      }`}
    >
      <Icon size={16} />
      {label}
    </Link>
  );
});

function Sidebar({
  onNav,
  firstItemRef,
  mode,
}: {
  onNav?: () => void;
  firstItemRef?: React.Ref<HTMLAnchorElement>;
  mode: "guest" | "account";
}) {
  return (
    <div className="flex h-full flex-col py-4">
      <div className="px-4 mb-6">
        <Link href="/" className="inline-flex items-center gap-2 font-serif text-xl font-semibold text-[var(--color-fg)] hover:opacity-80 transition-opacity">
          <HalalFlowLogo size={24} withGlow={false} />
          HalalFlow
        </Link>
      </div>

      {/* Scrollable nav — group spacing via mt-5, not space-y on the container */}
      <div className="flex-1 min-h-0 overflow-y-auto px-2">
        {NAV_GROUPS.map((group, gi) => (
          <nav key={group.label} aria-label={group.label} className={gi > 0 ? "mt-5" : undefined}>
            <p
              aria-hidden="true"
              className="mb-1 px-3 text-xs uppercase tracking-widest text-[var(--color-muted-fg)]"
            >
              {group.label}
            </p>
            <div className="space-y-1">
              {group.items.map((item, i) => (
                <NavItem
                  key={item.href}
                  {...item}
                  onClick={onNav}
                  ref={gi === 0 && i === 0 ? firstItemRef : undefined}
                />
              ))}
            </div>
          </nav>
        ))}
      </div>

      {/* Sidebar footer — theme + sign out */}
      <div className="mt-4 px-3 pt-3 border-t border-[var(--color-border)] flex items-center gap-2">
        <ThemeToggle />
        {mode === "account" ? (
          <form action={signOutAction} className="flex-1">
            <button
              type="submit"
              className="w-full flex items-center gap-3 rounded-md px-3 py-2 text-sm text-[var(--color-muted-fg)] hover:bg-[var(--color-muted)] hover:text-[var(--color-fg)] transition-[color,background-color,scale] duration-150 active:scale-[0.96]"
            >
              <LogOut size={16} />
              Sign out
            </button>
          </form>
        ) : (
          <Link
            href="/signup"
            onClick={onNav}
            className="flex-1 flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-[var(--color-primary)] hover:bg-[var(--color-muted)] transition-[color,background-color,scale] duration-150 active:scale-[0.96]"
          >
            Create account
          </Link>
        )}
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const firstNavRef = useRef<HTMLAnchorElement>(null);
  const { mode } = useFlows();

  useEffect(() => {
    if (mobileOpen) firstNavRef.current?.focus();
  }, [mobileOpen]);

  useEffect(() => {
    if (!mobileOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") closeSidebar();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [mobileOpen]);

  function closeSidebar() {
    setMobileOpen(false);
    menuButtonRef.current?.focus();
  }

  return (
    <div className="flex h-full bg-[var(--color-surface)]">
      {/* Skip link */}
      <a
        href="#main-content"
        className="sr-only focus-visible:not-sr-only focus-visible:absolute focus-visible:z-50 focus-visible:left-4 focus-visible:top-4 focus-visible:rounded-md focus-visible:bg-[var(--color-card)] focus-visible:px-4 focus-visible:py-2 focus-visible:text-sm focus-visible:font-medium focus-visible:text-[var(--color-fg)] focus-visible:shadow-md focus-visible:outline-2 focus-visible:outline-[var(--color-primary)]"
      >
        Skip to content
      </a>

      {/* Desktop sidebar */}
      <aside className="hidden min-[920px]:flex w-[248px] shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-card)]">
        <Sidebar mode={mode} />
      </aside>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div className="min-[920px]:hidden fixed inset-0 z-40 flex">
          <div
            className="fixed inset-0 bg-black/40"
            onClick={closeSidebar}
            aria-hidden="true"
          />
          <aside
            id="mobile-sidebar"
            className="relative z-50 w-[248px] border-r border-[var(--color-border)] bg-[var(--color-card)]"
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
          >
            <Sidebar onNav={closeSidebar} firstItemRef={firstNavRef} mode={mode} />
          </aside>
        </div>
      )}

      {/* Main content */}
      <div
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore — React 19 types inert as boolean but HTML spec accepts ""
        inert={mobileOpen ? "" : undefined}
        className="flex min-w-0 flex-1 flex-col relative"
      >
        {/* Mobile-only floating menu button (only visible when sidebar hidden) */}
        <button
          ref={menuButtonRef}
          className="min-[920px]:hidden fixed top-4 left-4 z-20 flex h-9 w-9 items-center justify-center rounded-md border border-[var(--color-border)] bg-[var(--color-card)] hover:bg-[var(--color-muted)] transition-[background-color,scale] duration-150 active:scale-[0.96]"
          onClick={() => setMobileOpen(true)}
          aria-label="Open navigation"
          aria-expanded={mobileOpen}
          aria-controls="mobile-sidebar"
        >
          <Menu size={18} />
        </button>

        <MarketTicker />

        {mode === "guest" && (
          <div
            role="status"
            className="border-b px-6 py-2 text-center text-xs text-[var(--color-muted-fg)]"
            style={{ borderColor: "var(--color-border)", background: "var(--color-muted)" }}
          >
            You&apos;re exploring HalalFlow on this device.{" "}
            <Link href="/signup" className="font-medium text-[var(--color-primary)] hover:underline">
              Create a free account
            </Link>{" "}
            to keep your invoices after you close the browser.
          </div>
        )}

        <main id="main-content" className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[1180px] px-6 py-4">{children}</div>
        </main>

        {/* Global floating chat widget */}
        <ChatWidget />
      </div>
    </div>
  );
}
