// Marketing landing page (public, additive) at /home. The existing app stays at /
// and is NOT touched. Self-contained server component (SEO metadata, no client JS —
// section nav is plain anchor links). Scrolls in its own container because the app
// shell sets `body { overflow: hidden }`.
//
// Visual direction: dark premium enterprise-AI — deep violet gradient canvas,
// glassmorphism cards, gradient headline text, a glowing CTA pill, and a stylised
// pipeline diagram. CTAs link to the real app entry (/). Prices are placeholders;
// the stat band uses true product facts (no fabricated social proof).

import type { Metadata } from 'next';
import Link from 'next/link';
import {
  Sparkles, ClipboardList, Settings2, Rocket, Activity, Globe, ChevronRight,
  BarChart3, Layers, Lock, GitPullRequest, ShieldCheck, Check, ArrowRight,
} from 'lucide-react';

export const metadata: Metadata = {
  title: 'mplan — website analytics, set up in minutes',
  description:
    'Connect your site and mplan builds your measurement plan, creates GA4 and GTM, adds tracking, and keeps it healthy. No analytics expertise needed.',
};

// The existing app entry — where the product flow begins. Don't invent an auth flow.
const GET_STARTED = '/';

// Gradient used on the distinctive headline words (violet → fuchsia).
const HEADLINE_GRADIENT = { backgroundImage: 'linear-gradient(92deg,#a78bfa 0%,#d946ef 55%,#f0abfc 100%)' } as const;

// ─────────────────────────────────────────────────────────────────────────────

function Wordmark() {
  return (
    <span className="inline-flex items-center gap-2">
      <span
        aria-hidden
        className="flex h-7 w-7 items-center justify-center rounded-lg text-sm font-medium text-white"
        style={{ backgroundImage: 'linear-gradient(135deg,#7c3aed,#d946ef)' }}
      >
        m
      </span>
      <span className="text-[15px] font-medium tracking-tight text-white">mplan</span>
    </span>
  );
}

// Dark glassy pill with a violet glow — the primary action (Talisma-style).
function PrimaryCta({ children, href = GET_STARTED, className = '' }: { children: React.ReactNode; href?: string; className?: string }) {
  return (
    <Link
      href={href}
      className={`group inline-flex items-center justify-center gap-2 rounded-xl border border-violet-400/40 bg-[#160d2e] px-5 py-3 text-sm font-medium text-white transition-all hover:border-violet-300/70 hover:bg-[#1c1138] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-400 ${className}`}
      style={{ boxShadow: '0 0 36px -8px rgba(168,85,247,0.65)' }}
    >
      {children}
    </Link>
  );
}

function GhostCta({ children, href, className = '' }: { children: React.ReactNode; href: string; className?: string }) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/[0.03] px-5 py-3 text-sm font-medium text-slate-200 transition-colors hover:border-white/30 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-400 ${className}`}
    >
      {children}
    </Link>
  );
}

// ── Nav ───────────────────────────────────────────────────────────────────────

function Nav() {
  return (
    <header className="sticky top-0 z-30 border-b border-white/10 bg-[#0a0613]/80 backdrop-blur-md">
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8" aria-label="Primary">
        <Link href="/home" className="rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-400" aria-label="mplan home">
          <Wordmark />
        </Link>
        <div className="hidden items-center gap-8 md:flex">
          <a href="#how-it-works" className="text-sm font-normal text-slate-300 transition-colors hover:text-white">How it works</a>
          <a href="#features" className="text-sm font-normal text-slate-300 transition-colors hover:text-white">Features</a>
          <a href="#pricing" className="text-sm font-normal text-slate-300 transition-colors hover:text-white">Pricing</a>
        </div>
        <PrimaryCta className="px-4 py-2">Get started</PrimaryCta>
      </nav>
    </header>
  );
}

// ── Hero ──────────────────────────────────────────────────────────────────────

const PIPELINE = [
  { icon: Globe, label: 'Your website' },
  { icon: Sparkles, label: 'AI measurement plan' },
  { icon: BarChart3, label: 'GA4 + GTM created' },
  { icon: Layers, label: 'Tracking added' },
  { icon: Activity, label: 'Health checks' },
] as const;

function PipelineDiagram() {
  return (
    <div className="relative mx-auto mt-16 max-w-4xl">
      <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-sm sm:p-8" style={{ boxShadow: '0 0 80px -30px rgba(124,58,237,0.6)' }}>
        <p className="mb-5 text-center text-[11px] font-medium uppercase tracking-[0.2em] text-violet-300/80">The mplan pipeline</p>
        <ol className="flex flex-col items-stretch gap-3 md:flex-row md:items-center md:gap-2">
          {PIPELINE.map(({ icon: Icon, label }, i) => (
            <li key={label} className="contents">
              <div className="flex flex-1 flex-col items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-4 text-center">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg border border-violet-400/20 bg-violet-500/10 text-violet-300">
                  <Icon size={18} aria-hidden />
                </span>
                <span className="text-xs font-normal leading-tight text-slate-200">{label}</span>
              </div>
              {i < PIPELINE.length - 1 && (
                <ChevronRight size={16} aria-hidden className="mx-auto shrink-0 rotate-90 text-violet-400/50 md:rotate-0" />
              )}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

function Hero() {
  return (
    <section className="mx-auto max-w-6xl px-5 pb-8 pt-16 sm:px-8 sm:pt-24">
      <div className="mx-auto max-w-3xl text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.04] px-3 py-1 text-xs font-medium text-violet-200 backdrop-blur-sm">
          <Sparkles size={13} aria-hidden /> AI-powered analytics setup
        </span>

        <h1 className="mt-7 text-5xl font-normal leading-[1.05] tracking-tight text-white sm:text-6xl lg:text-7xl">
          <span className="bg-clip-text text-transparent" style={HEADLINE_GRADIENT}>Website analytics,</span>
          <br />
          set up in minutes
        </h1>

        <p className="mx-auto mt-6 max-w-xl text-base font-normal leading-relaxed text-slate-300 sm:text-lg">
          Connect your site and we build the measurement plan, create GA4 and GTM, add the
          tracking, and keep it healthy. No analytics expertise needed.
        </p>

        <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <PrimaryCta className="w-full sm:w-auto">
            Get started free <ArrowRight size={15} aria-hidden className="transition-transform group-hover:translate-x-0.5" />
          </PrimaryCta>
          <GhostCta href="#how-it-works" className="w-full sm:w-auto">See how it works</GhostCta>
        </div>

        <p className="mt-5 text-xs font-normal text-slate-400">
          No credit card needed · Your code is never changed without your review.
        </p>
      </div>

      <PipelineDiagram />
    </section>
  );
}

// ── Stats band (true product facts, not fabricated social proof) ──────────────

const STATS = [
  { value: '4', label: 'Stages from plan to monitoring' },
  { value: 'GA4 + GTM', label: 'Created automatically' },
  { value: 'Daily', label: 'Health checks & alerts' },
  { value: '100%', label: 'Code changes you review first' },
] as const;

function Stats() {
  return (
    <section className="mx-auto max-w-6xl px-5 py-16 sm:px-8">
      <div className="grid grid-cols-2 gap-8 lg:grid-cols-4">
        {STATS.map((s) => (
          <div key={s.label} className="text-center">
            <p className="bg-clip-text text-3xl font-normal tracking-tight text-transparent sm:text-4xl" style={HEADLINE_GRADIENT}>{s.value}</p>
            <p className="mt-2 text-sm font-normal text-slate-400">{s.label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

// ── How it works ──────────────────────────────────────────────────────────────

const STAGES = [
  { icon: ClipboardList, n: 1, stage: 'Plan', desc: 'AI builds your measurement plan from your site.' },
  { icon: Settings2, n: 2, stage: 'Set up', desc: 'We create GA4 and GTM and add the tracking.' },
  { icon: Rocket, n: 3, stage: 'Go live', desc: 'A readiness check confirms it works, then you publish.' },
  { icon: Activity, n: 4, stage: 'Monitor', desc: 'We watch for tracking that breaks and alert you.' },
] as const;

function HowItWorks() {
  return (
    <section id="how-it-works" className="scroll-mt-20 border-t border-white/10">
      <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-normal tracking-tight text-white sm:text-4xl">How it works</h2>
          <p className="mt-3 text-base font-normal text-slate-400">Four steps from a URL to analytics you can trust.</p>
        </div>

        <ol className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STAGES.map(({ icon: Icon, n, stage, desc }) => (
            <li key={stage} className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur-sm transition-colors hover:border-violet-400/30">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg border border-violet-400/20 bg-violet-500/10 text-violet-300">
                <Icon size={20} aria-hidden />
              </span>
              <p className="mt-4 text-xs font-medium uppercase tracking-wide text-violet-300/70">{n} · Stage</p>
              <p className="mt-1 text-base font-medium text-white">{stage}</p>
              <p className="mt-1.5 text-sm font-normal leading-relaxed text-slate-400">{desc}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

// ── Features ──────────────────────────────────────────────────────────────────

const FEATURES = [
  { icon: Sparkles, title: 'AI measurement plan', desc: 'Describes your site’s tracking automatically — objectives, KPIs, and events.' },
  { icon: BarChart3, title: 'Auto-create GA4 & GTM', desc: 'No manual setup — we create the property and container for you.' },
  { icon: Layers, title: 'Smart event handling', desc: 'Most events are tracked with no code; the rest come as ready snippets for your developer.' },
  { icon: Activity, title: 'Catches tracking that breaks', desc: 'Daily health checks with alerts when something stops firing.' },
  { icon: Lock, title: 'Your data stays private', desc: 'Per-customer isolation — one customer never sees another’s data.' },
  { icon: GitPullRequest, title: 'Safe by design', desc: 'We open pull requests you review — we never silently edit your code.' },
] as const;

function Features() {
  return (
    <section id="features" className="scroll-mt-20 border-t border-white/10">
      <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-normal tracking-tight text-white sm:text-4xl">Everything you need, none of the busywork</h2>
          <p className="mt-3 text-base font-normal text-slate-400">Built for teams without an analytics specialist.</p>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur-sm transition-colors hover:border-violet-400/30">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg border border-violet-400/20 bg-violet-500/10 text-violet-300">
                <Icon size={20} aria-hidden />
              </span>
              <h3 className="mt-4 text-base font-medium text-white">{title}</h3>
              <p className="mt-1.5 text-sm font-normal leading-relaxed text-slate-400">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Trust statement band (vivid gradient, echoing the reference) ──────────────

const TRUST = [
  { icon: Lock, title: 'Data isolation', desc: 'Every customer’s data is kept separate — never shared or co-mingled.' },
  { icon: GitPullRequest, title: 'Review before any change', desc: 'Code changes arrive as pull requests you approve. Nothing ships silently.' },
  { icon: ShieldCheck, title: 'Read-only by default', desc: 'We request only the access we need, and write nothing without your say-so.' },
] as const;

function TrustBand() {
  return (
    <section className="relative overflow-hidden border-y border-white/10" style={{ backgroundImage: 'linear-gradient(160deg,#1a1140 0%,#3b2a8c 55%,#5b4fd6 100%)' }}>
      <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
        <h2 className="mx-auto max-w-3xl text-center text-3xl font-normal leading-tight tracking-tight text-white sm:text-5xl">
          Built for teams without an analytics specialist<span className="text-fuchsia-300">.</span>
        </h2>

        <div className="mt-14 grid grid-cols-1 gap-8 sm:grid-cols-3">
          {TRUST.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="flex gap-3">
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/20 bg-white/10 text-white">
                <Icon size={17} aria-hidden />
              </span>
              <div>
                <p className="text-sm font-medium text-white">{title}</p>
                <p className="mt-1 text-sm font-normal leading-relaxed text-violet-100/80">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Pricing (placeholder) ─────────────────────────────────────────────────────

const TIERS = [
  {
    name: 'Starter', price: '$0', cadence: '/mo', popular: false,
    blurb: 'For trying it on one site.',
    features: ['1 website', 'AI measurement plan', 'GA4 + GTM setup', 'Excel plan delivered to your inbox'],
    cta: 'Get started', href: GET_STARTED,
  },
  {
    name: 'Pro', price: '$49', cadence: '/mo', popular: true,
    blurb: 'For teams running analytics for real.',
    features: ['Up to 10 websites', 'Daily health checks + alerts', 'Saved plan history', 'Review-PR code injection', 'Auto-create GA4 & GTM'],
    cta: 'Get started', href: GET_STARTED,
  },
  {
    name: 'Enterprise', price: 'Custom', cadence: '', popular: false,
    blurb: 'For organisations with scale and security needs.',
    features: ['Unlimited websites', 'SSO & strict data isolation', 'Priority support', 'Custom integrations'],
    cta: 'Contact sales', href: 'mailto:sales@example.com',
  },
] as const;

function Pricing() {
  return (
    <section id="pricing" className="scroll-mt-20 border-t border-white/10">
      <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-normal tracking-tight text-white sm:text-4xl">Simple, honest pricing</h2>
          <p className="mt-3 text-base font-normal text-slate-400">Example pricing — final plans to be confirmed.</p>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-4 lg:grid-cols-3">
          {TIERS.map((t) => (
            <div
              key={t.name}
              className={`relative flex flex-col rounded-2xl bg-white/[0.04] p-6 backdrop-blur-sm ${
                t.popular ? 'border-2 border-violet-400/70' : 'border border-white/10'
              }`}
              style={t.popular ? { boxShadow: '0 0 50px -18px rgba(168,85,247,0.7)' } : undefined}
            >
              {t.popular && (
                <span
                  className="absolute -top-3 left-6 rounded-full px-2.5 py-0.5 text-[11px] font-medium text-white"
                  style={{ backgroundImage: 'linear-gradient(135deg,#7c3aed,#d946ef)' }}
                >
                  Most popular
                </span>
              )}
              <p className="text-sm font-medium text-white">{t.name}</p>
              <p className="mt-1 text-sm font-normal text-slate-400">{t.blurb}</p>
              <p className="mt-5">
                <span className="text-3xl font-medium tracking-tight text-white">{t.price}</span>
                {t.cadence && <span className="text-sm font-normal text-slate-400">{t.cadence}</span>}
              </p>

              <ul className="mt-5 flex-1 space-y-2.5">
                {t.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm font-normal text-slate-300">
                    <Check size={16} className="mt-0.5 shrink-0 text-violet-300" aria-hidden />
                    {f}
                  </li>
                ))}
              </ul>

              {t.popular ? (
                <PrimaryCta href={t.href} className="mt-6 w-full">{t.cta}</PrimaryCta>
              ) : (
                <GhostCta href={t.href} className="mt-6 w-full">{t.cta}</GhostCta>
              )}
            </div>
          ))}
        </div>
        <p className="mt-6 text-center text-xs font-normal text-slate-500">Placeholder prices — set your real numbers before launch.</p>
      </div>
    </section>
  );
}

// ── Final CTA ─────────────────────────────────────────────────────────────────

function FinalCta() {
  return (
    <section className="mx-auto max-w-6xl px-5 py-24 sm:px-8">
      <div
        className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] px-6 py-16 text-center backdrop-blur-sm"
        style={{ boxShadow: '0 0 90px -30px rgba(124,58,237,0.7)' }}
      >
        <h2 className="mx-auto max-w-xl text-3xl font-normal tracking-tight text-white sm:text-4xl">
          Set up analytics you can actually <span className="bg-clip-text text-transparent" style={HEADLINE_GRADIENT}>trust</span>
        </h2>
        <p className="mx-auto mt-4 max-w-md text-base font-normal text-slate-300">
          Hand us a URL — we’ll hand back a complete, working measurement setup.
        </p>
        <div className="mt-8 flex justify-center">
          <PrimaryCta>Get started free <ArrowRight size={15} aria-hidden /></PrimaryCta>
        </div>
        <p className="mt-4 text-xs font-normal text-slate-400">No credit card needed.</p>
      </div>
    </section>
  );
}

// ── Footer ────────────────────────────────────────────────────────────────────

const FOOTER_COLS = [
  { title: 'Product', links: [{ label: 'How it works', href: '#how-it-works' }, { label: 'Features', href: '#features' }, { label: 'Pricing', href: '#pricing' }] },
  { title: 'Company', links: [{ label: 'About', href: '#' }, { label: 'Contact', href: 'mailto:sales@example.com' }] },
  { title: 'Legal', links: [{ label: 'Privacy policy', href: '/privacy' }, { label: 'Terms', href: '/terms' }] },
] as const;

function Footer() {
  return (
    <footer className="border-t border-white/10">
      <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8">
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
          <div className="col-span-2 sm:col-span-1">
            <Wordmark />
            <p className="mt-3 max-w-[16rem] text-sm font-normal leading-relaxed text-slate-400">
              Website analytics, set up and kept healthy — without the manual work.
            </p>
          </div>
          {FOOTER_COLS.map((col) => (
            <div key={col.title}>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{col.title}</p>
              <ul className="mt-3 space-y-2">
                {col.links.map((l) => (
                  <li key={l.label}>
                    <Link href={l.href} className="text-sm font-normal text-slate-400 transition-colors hover:text-white">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-12 border-t border-white/10 pt-6">
          <p className="text-xs font-normal text-slate-500">© 2026 mplan. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}

// ── Floating CTA (desktop) — echoes the reference's floating action pill ───────

function FloatingCta() {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-40 hidden justify-center lg:flex">
      <Link
        href={GET_STARTED}
        className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-violet-400/50 px-5 py-2.5 text-sm font-medium text-white transition-transform hover:scale-[1.03]"
        style={{ backgroundImage: 'linear-gradient(135deg,#7c3aed,#d946ef)', boxShadow: '0 0 40px -8px rgba(217,70,239,0.7)' }}
      >
        <Sparkles size={15} aria-hidden /> Get started free
      </Link>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export default function MarketingHome() {
  return (
    <main className="relative h-full overflow-y-auto scroll-smooth bg-[#0a0613] text-white">
      {/* Ambient violet glows behind the content */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 h-[36rem] w-[36rem] -translate-x-1/2 rounded-full bg-violet-600/25 blur-[140px]" />
        <div className="absolute top-[20%] -right-40 h-[30rem] w-[30rem] rounded-full bg-fuchsia-600/15 blur-[140px]" />
        <div className="absolute top-[8%] -left-40 h-[28rem] w-[28rem] rounded-full bg-indigo-600/15 blur-[140px]" />
      </div>

      <div className="relative">
        <Nav />
        <Hero />
        <Stats />
        <HowItWorks />
        <Features />
        <TrustBand />
        <Pricing />
        <FinalCta />
        <Footer />
      </div>

      <FloatingCta />
    </main>
  );
}
