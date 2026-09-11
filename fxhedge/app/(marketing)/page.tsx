"use client";
import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { Phone3D } from "@/components/phone-3d";
import { ThemeToggle } from "@/components/theme-toggle";
import { HalalFlowLogo } from "@/components/halalflow-logo";

const features = [
  {
    title: "True cost visibility",
    desc:  "See the real gap between the mid market rate and what you actually pay. That gap is your provider's margin, and it comes straight out of your bottom line.",
  },
  {
    title: "Provider comparison",
    desc:  "Wise, Instarem, Deutsche Bank and Western Union ranked by what your supplier actually receives, not the headline rate. One view, real numbers.",
  },
  {
    title: "Ask before you hedge",
    desc:  "HalalFlow Assistant explains murabaha, wa'd, and natural hedges with cited sources — educational guidance, not a fatwa.",
  },
];

/** No-op store — lets useSyncExternalStore report hydration state. */
function subscribeNever(): () => void {
  return () => {};
}

const TAGLINE = "Trade honestly. See the cost before you pay it.";

/**
 * Sourced passages for the flowing strip. Quran — Sahih International;
 * hadith as cited. Never paraphrase scripture: quote a named translation
 * or leave it out.
 */
const VERSES = [
  {
    ref: "Quran 2:275",
    ar: "وَأَحَلَّ اللَّهُ الْبَيْعَ وَحَرَّمَ الرِّبَا",
    en: "But Allah has permitted trade and has forbidden riba.",
  },
  {
    ref: "Quran 2:276",
    ar: "يَمْحَقُ اللَّهُ الرِّبَا وَيُرْبِي الصَّدَقَاتِ",
    en: "Allah destroys riba and gives increase to charities.",
  },
  {
    ref: "Hadith · Sahih Muslim",
    ar: "لَعَنَ رَسُولُ اللَّهِ ﷺ آكِلَ الرِّبَا وَمُؤْكِلَهُ",
    en: "The Prophet ﷺ cursed the one who consumes riba and the one who pays it.",
  },
  {
    ref: "Quran 3:130",
    ar: "يَا أَيُّهَا الَّذِينَ آمَنُوا لَا تَأْكُلُوا الرِّبَا أَضْعَافًا مُضَاعَفَةً",
    en: "Do not consume riba, doubled and multiplied, but fear Allah that you may be successful.",
  },
  {
    ref: "Hadith · Sahih Muslim",
    ar: "الذَّهَبُ بِالذَّهَبِ وَالْفِضَّةُ بِالْفِضَّةِ... يَدًا بِيَدٍ",
    en: "Gold for gold, silver for silver, hand to hand — the standard on fair exchange.",
  },
  {
    ref: "Quran 2:278–279",
    ar: "وَاتَّقُوا اللَّهَ وَذَرُوا مَا بَقِيَ مِنَ الرِّبَا إِن كُنتُم مُّؤْمِنِينَ",
    en: "Fear Allah and give up what remains of riba, if you should be believers.",
  },
];

/** Flowing strip of scripture on honest trade — pauses on hover so a passage can be read. */
function VerseMarquee() {
  return (
    <section
      aria-label="Verses and hadith on honest trade"
      className="verse-marquee border-y"
      style={{ borderColor: "var(--color-border)", background: "var(--color-card)" }}
    >
      {/* Track holds two copies; the CSS animation translates exactly -50% for a seamless loop */}
      <div className="verse-marquee-track py-6">
        {[0, 1].map((copy) => (
          <div key={copy} className="flex shrink-0 items-stretch" aria-hidden={copy === 1}>
            {VERSES.map((v) => (
              <figure key={`${copy}-${v.ref}`} className="m-0 mx-6 w-[400px] shrink-0">
                <blockquote className="m-0">
                  <p
                    lang="ar"
                    dir="rtl"
                    className="font-arabic text-right text-xl m-0 text-[var(--color-fg)]"
                  >
                    {v.ar}
                  </p>
                  <p className="text-pretty mt-2 m-0 text-sm leading-relaxed text-[var(--color-muted-fg)]">
                    &ldquo;{v.en}&rdquo;
                  </p>
                </blockquote>
                <figcaption className="mt-2 text-xs uppercase tracking-widest" style={{ color: "var(--color-primary)" }}>
                  {v.ref}
                </figcaption>
              </figure>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}

export default function LandingPage() {
  const [liveValue, setLiveValue] = useState("$0");
  const { resolvedTheme } = useTheme();

  // Hydration gate without setState-in-effect: server snapshot false, client true.
  // Same semantics as the old mounted flag, no cascading render.
  const mounted = useSyncExternalStore(subscribeNever, () => true, () => false);
  const isDark = mounted && resolvedTheme === "dark";

  // Trigger the .in animations on mount + IntersectionObserver for .sr-fade
  useEffect(() => {
    requestAnimationFrame(() => document.body.classList.add("in"));

    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add("show");
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.15 });

    document.querySelectorAll(".sr-fade, .tagline-reveal").forEach((el, i) => {
      (el as HTMLElement).style.transitionDelay = `${(i % 4) * 60}ms`;
      io.observe(el);
    });

    return () => { io.disconnect(); document.body.classList.remove("in"); };
  }, []);

  // Theme-aware tokens for one-off overlays / gradients that need translucency
  const topGlow      = isDark ? "rgba(34,197,94,0.24)"  : "rgba(22,163,74,0.12)";
  const orbGreen     = isDark ? "rgba(34,197,94,0.17)"  : "rgba(22,163,74,0.10)";
  const orbSecondary = isDark ? "rgba(99,102,241,0.12)" : "rgba(180,165,120,0.14)"; // indigo dark → warm sand light
  const grainOpacity = isDark ? 0.04 : 0.02;
  const ghostBg      = isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)";
  const ghostBorder  = isDark ? "rgba(255,255,255,0.20)" : "rgba(10,10,10,0.15)";
  const liveCardBg   = isDark ? "rgba(16,16,16,0.85)"   : "rgba(255,255,255,0.92)";
  const featureBg    = isDark ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.7)";
  const featureBorder = isDark ? "rgba(255,255,255,0.08)" : "rgba(10,10,10,0.08)";

  return (
    <div
      className="min-h-full"
      style={{ background: "var(--color-surface)", color: "var(--color-fg)" }}
    >

      {/* ── Announcement banner ────────────────────────────────── */}
      <div
        className="relative z-40 text-center text-[13px] py-[9px] px-4 text-white"
        style={{ background: "linear-gradient(90deg, #16A34A 0%, #22C55E 55%, #4ADE80 100%)" }}
      >
        <a href="#features" className="inline-flex items-center gap-2 font-medium group">
          <span>New. Halal finance comparison is now live</span>
          <span className="transition-transform duration-300 group-hover:translate-x-1">→</span>
        </a>
      </div>

      {/* ── Sticky nav ─────────────────────────────────────────── */}
      <header
        className="sticky top-0 z-30 border-b"
        style={{
          borderColor: "var(--color-border)",
          background:  isDark ? "rgba(5,5,5,0.60)" : "rgba(245,239,228,0.75)",
          backdropFilter: "blur(18px)",
          WebkitBackdropFilter: "blur(18px)",
        }}
      >
        <div className="mx-auto flex max-w-[1180px] items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2.5 font-serif text-[22px] text-[var(--color-fg)]">
            <HalalFlowLogo size={26} />
            HalalFlow
          </Link>
          <nav className="hidden sm:flex items-center gap-8">
            <a href="#features" className="text-sm text-[var(--color-muted-fg)] hover:text-[var(--color-fg)] transition-colors">Features</a>
            <a href="#how"      className="text-sm text-[var(--color-muted-fg)] hover:text-[var(--color-fg)] transition-colors">How it works</a>
            <a href="#pricing"  className="text-sm text-[var(--color-muted-fg)] hover:text-[var(--color-fg)] transition-colors">Pricing</a>
            <a href="#contact"  className="text-sm text-[var(--color-muted-fg)] hover:text-[var(--color-fg)] transition-colors">Contact</a>
          </nav>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Link href="/login" className="text-sm font-medium text-[var(--color-muted-fg)] hover:text-[var(--color-fg)] transition-colors">Log in</Link>
            <Link
              href="/signup"
              className="rounded-full px-5 py-[9px] text-sm font-semibold transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.96]"
              style={{
                background: "linear-gradient(135deg, #16A34A, #4ADE80)",
                boxShadow:  "0 0 22px rgba(34,197,94,.35)",
                color:      "#04120A",
              }}
            >
              Start free
            </Link>
          </div>
        </div>
      </header>

      {/* ── Hero ───────────────────────────────────────────────── */}
      <section className="relative overflow-hidden pt-14 pb-11">
        {/* Top green glow */}
        <div
          className="absolute inset-x-0 top-0 h-[60vh] pointer-events-none"
          style={{ background: `radial-gradient(ellipse 78% 62% at 50% -6%, ${topGlow}, transparent 68%)` }}
        />
        {/* Ambient orbs */}
        <div
          className="orb-a absolute pointer-events-none rounded-full"
          style={{ right: "-6%", top: "12%", width: 640, height: 640, filter: "blur(90px)", background: `radial-gradient(circle, ${orbGreen}, transparent 70%)` }}
        />
        <div
          className="orb-b absolute pointer-events-none rounded-full"
          style={{ left: "2%", bottom: 0, width: 460, height: 460, filter: "blur(90px)", background: `radial-gradient(circle, ${orbSecondary}, transparent 70%)` }}
        />
        {/* Grain */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            opacity: grainOpacity,
            backgroundImage: `url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='300' height='300'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3'/><feColorMatrix type='saturate' values='0'/></filter><rect width='300' height='300' filter='url(%23n)'/></svg>")`,
          }}
        />

        <div className="relative z-10 mx-auto max-w-[1180px] px-6 grid gap-9 items-center lg:grid-cols-[1.05fr_0.95fr] lg:gap-3">

          {/* Left: copy */}
          <div>
            <h1
              className="lp-reveal lp-d1 font-serif font-normal m-0 leading-[1.03] text-balance"
              style={{
                fontSize: "clamp(2.55rem, 6vw, 4.5rem)",
                letterSpacing: "-0.01em",
                maxWidth: "15ch",
                /* B5: the one sanctioned gradient — on the heading text only */
                backgroundImage: isDark
                  ? "linear-gradient(90deg, #FFFFFF, #9B9B9B)"
                  : "linear-gradient(90deg, #0A0A0A, #666666)",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                color: "transparent",
              }}
            >
              Stop losing margin to hidden FX costs.
            </h1>

            <p
              className="lp-reveal lp-d2 mt-6 text-[var(--color-muted-fg)]"
              style={{ fontSize: "clamp(1rem, 2.4vw, 1.16rem)", maxWidth: "48ch" }}
            >
              HalalFlow helps Muslim owned businesses see what a transfer really costs, compare every major provider by what your supplier actually receives, and explore halal compliant alternatives, all in one place.
            </p>

            <div className="lp-reveal lp-d3 mt-[34px] flex flex-wrap gap-3">
              <Link
                href="/signup"
                className="rounded-full px-[30px] py-[14px] text-[14.5px] font-semibold transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.96]"
                style={{
                  background: "linear-gradient(135deg, #16A34A, #4ADE80)",
                  boxShadow:  "0 0 22px rgba(34,197,94,.35)",
                  color:      "#04120A",
                }}
              >
                Start for free
              </Link>
              <Link
                href="/dashboard"
                className="rounded-full border px-[30px] py-[14px] text-[14.5px] font-semibold transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.96]"
                style={{
                  borderColor: ghostBorder,
                  background:  ghostBg,
                  color:       "var(--color-fg)",
                }}
              >
                See live demo <span className="ml-2 inline-block">▸</span>
              </Link>
            </div>

            <p className="lp-reveal lp-d4 mt-5 text-xs text-[var(--color-muted-fg)] opacity-70">
              No card required · No money moved · Not financial advice
            </p>
          </div>

          {/* Right: 3D phone + live-card */}
          <div className="relative min-h-[600px]">
            <div
              className="absolute left-1/2 -translate-x-1/2 bottom-[74px] w-[240px] h-14 z-0"
              style={{ borderRadius: "50%", background: `radial-gradient(ellipse, ${isDark ? "rgba(0,0,0,0.55)" : "rgba(10,10,10,0.15)"}, transparent 70%)`, filter: "blur(20px)" }}
              aria-hidden="true"
            />
            <Phone3D onLiveValueChange={setLiveValue} theme={isDark ? "dark" : "light"} />

            {/* Live card overlay */}
            <div
              className="lp-live-card absolute bottom-[26px] z-20 w-[232px] rounded-[18px] p-[15px] border"
              style={{
                left: 0,
                borderColor: "var(--color-border)",
                background:  liveCardBg,
                backdropFilter: "blur(14px)",
                WebkitBackdropFilter: "blur(14px)",
                boxShadow: isDark
                  ? "0 30px 60px -24px rgba(0,0,0,.8)"
                  : "0 30px 60px -24px rgba(10,10,10,0.25)",
              }}
            >
              <div className="flex items-center gap-[7px] text-[10.5px] text-[var(--color-muted-fg)] mb-0.5">
                <span
                  className="lp-live-dot h-1.5 w-1.5 rounded-full"
                  style={{ background: "#22C55E", boxShadow: "0 0 8px #22C55E" }}
                />
                Realized savings · last 90 days
              </div>
              <div className="text-xs text-[var(--color-fg)] mb-2.5">Across 14 transfers</div>

              <svg className="w-full h-14 block" viewBox="0 0 220 56" preserveAspectRatio="none" aria-hidden="true">
                <defs>
                  <linearGradient id="sg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="rgba(34,197,94,.35)" />
                    <stop offset="1" stopColor="rgba(34,197,94,0)"   />
                  </linearGradient>
                  <linearGradient id="sl" x1="0" y1="1" x2="1" y2="0">
                    <stop offset="0" stopColor="#16A34A" />
                    <stop offset="1" stopColor="#4ADE80" />
                  </linearGradient>
                </defs>
                <path
                  d="M0,44 L18,40 L40,42 L64,32 L88,36 L112,24 L138,28 L162,16 L188,20 L214,6 L214,56 L0,56 Z"
                  fill="url(#sg)"
                />
                <path
                  className="lp-spark-line"
                  d="M0,44 L18,40 L40,42 L64,32 L88,36 L112,24 L138,28 L162,16 L188,20 L214,6"
                  fill="none"
                  stroke="url(#sl)"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  pathLength={1}
                />
              </svg>
              <div className="flex items-baseline gap-2 mt-2">
                <span className="font-mono text-[22px] text-[var(--color-fg)]" style={{ letterSpacing: "-0.02em" }}>{liveValue}</span>
                <span className="text-[11px]" style={{ color: "#22C55E" }}>↑ $505 this month</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Flowing verses + hadith ───────────────────────────── */}
      <VerseMarquee />

      {/* ── Tagline reveal ─────────────────────────────────────── */}
      <section className="py-20" aria-label="Why HalalFlow exists">
        <div className="mx-auto max-w-[680px] px-6">
          <p
            className="tagline-reveal font-serif text-balance m-0 text-[var(--color-fg)]"
            style={{ fontSize: "clamp(1.9rem, 4.5vw, 3rem)", lineHeight: 1.15 }}
          >
            {TAGLINE.split(" ").map((word, i) => (
              <span
                key={i}
                className="tagline-word inline-block"
                style={{ transitionDelay: `${Math.min(i * 90, 1400)}ms` }}
              >
                {word}&nbsp;
              </span>
            ))}
          </p>
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────────────── */}
      <section id="how" className="py-[88px]">
        <div className="mx-auto max-w-[1100px] px-6">
          <h2
            className="sr-fade font-serif font-normal m-0 text-[var(--color-fg)]"
            style={{ fontSize: "clamp(1.8rem, 4vw, 2.4rem)" }}
          >
            How it works
          </h2>
          <p className="sr-fade mt-3.5 max-w-lg text-[15px] text-[var(--color-muted-fg)]">
            Three steps, about a minute. We never touch your money — you still pay
            through whichever provider you choose.
          </p>

          <ol className="mt-10 grid gap-6 sm:grid-cols-3">
            {[
              {
                n: "1",
                title: "Enter the invoice",
                body: "Amount, the currency your supplier bills in, and when it is due. Nothing else.",
              },
              {
                n: "2",
                title: "See the real cost",
                body: "We price it at the ECB reference rate, then show what each provider would actually deliver — including the markup they bury in the rate.",
              },
              {
                n: "3",
                title: "Decide with the range",
                body: "We show how far the rate has moved in stretches like yours, priced against your bill, plus the halal alternatives to a conventional forward.",
              },
            ].map((s) => (
              <li
                key={s.n}
                className="sr-fade rounded-[18px] border p-6"
                style={{ borderColor: "var(--color-border)", background: "var(--color-card)" }}
              >
                <span
                  className="grid h-9 w-9 place-items-center rounded-full text-[15px] font-bold"
                  style={{ background: "var(--color-primary)", color: "#04120A" }}
                >
                  {s.n}
                </span>
                <h3 className="mt-4 text-[16px] font-semibold text-[var(--color-fg)]">{s.title}</h3>
                <p className="mt-2 text-[14px] leading-relaxed text-[var(--color-muted-fg)]">{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── Features ───────────────────────────────────────────── */}
      <section id="features" className="py-[88px]">
        <div className="mx-auto max-w-[1180px] px-6">
          <h2 className="sr-fade font-serif font-normal m-0 text-[var(--color-fg)]" style={{ fontSize: "clamp(1.8rem, 4vw, 2.4rem)" }}>
            What HalalFlow does
          </h2>
          <p className="sr-fade mt-3.5 max-w-lg text-[15px] text-[var(--color-muted-fg)]">
            The visibility small businesses deserve before every international payment. Nothing predicted, nothing moved.
          </p>

          <div className="mt-11 grid grid-cols-1 md:grid-cols-3 gap-[18px]">
            {features.map((f) => (
              <div
                key={f.title}
                className="sr-fade rounded-[18px] border p-6 transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:-translate-y-[3px]"
                style={{ borderColor: featureBorder, background: featureBg }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = "rgba(34,197,94,.5)")}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = featureBorder)}
              >
                <div
                  className="w-7 h-1 rounded-full mb-[18px]"
                  style={{ background: "linear-gradient(90deg, #16A34A, #4ADE80)" }}
                />
                <h3 className="text-base m-0 mb-2 font-semibold text-[var(--color-fg)]">{f.title}</h3>
                <p className="text-[13.5px] text-[var(--color-muted-fg)] m-0 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA strip ──────────────────────────────────────────── */}
      <section
        id="pricing"
        className="relative overflow-hidden border-t py-20 text-center"
        style={{ borderColor: "var(--color-border)", background: "var(--color-card)" }}
      >
        <div
          className="absolute inset-x-0 bottom-[-40%] h-[70%] pointer-events-none"
          style={{ background: `radial-gradient(ellipse 60% 100% at 50% 100%, ${isDark ? "rgba(34,197,94,0.20)" : "rgba(22,163,74,0.10)"}, transparent 70%)` }}
        />
        <div className="wrap relative mx-auto max-w-[1180px] px-6">
          <h2 className="sr-fade font-serif font-normal m-0 text-[var(--color-fg)]" style={{ fontSize: "clamp(1.9rem, 4vw, 2.6rem)" }}>
            See your real FX cost in minutes.
          </h2>
          <p className="sr-fade mt-3.5 text-[var(--color-muted-fg)]">Free to use. No card required. Real rates, real providers.</p>
          <Link
            href="/signup"
            className="sr-fade mt-[30px] inline-block rounded-full px-[30px] py-[14px] text-[14.5px] font-semibold transition-[opacity,scale] duration-200 active:scale-[0.96]"
            style={{
              background: "linear-gradient(135deg, #16A34A, #4ADE80)",
              boxShadow:  "0 0 22px rgba(34,197,94,.35)",
              color:      "#04120A",
            }}
          >
            Start for free
          </Link>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────── */}
      <footer id="contact" className="border-t" style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}>
        <div className="mx-auto max-w-[1180px] px-6 flex flex-col sm:flex-row justify-between items-center gap-4 py-[34px]">
          <div>
            <div className="text-[13px] font-medium text-[var(--color-fg)]">Contact</div>
            <a href="mailto:hello@halalflow.com" className="text-[13px] hover:opacity-80 transition-opacity" style={{ color: "var(--color-primary)" }}>
              hello@halalflow.com
            </a>
          </div>
          <p className="text-center text-[11.5px] text-[var(--color-muted-fg)] max-w-[44ch]">
            HalalFlow never moves money and never predicts exchange rates. General education only, not financial advice.
          </p>
        </div>
      </footer>
    </div>
  );
}
