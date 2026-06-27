// Marketing landing page (public, additive). Lives at /home — the existing app
// stays at / and is NOT touched. Self-contained: a server component using the
// global always-light `ds-*` design tokens. No client JS — section navigation is
// plain anchor links; the page scrolls inside its own container because the app
// shell sets `body { overflow: hidden }`.
//
// CTAs link to the real app entry (/) where a visitor starts using the product.
// Placeholder copy/prices are marked; swap them for real numbers anytime.

import type { Metadata } from 'next';
import Link from 'next/link';
import {
  Sparkles, ClipboardList, Settings2, Rocket, Activity,
  BarChart3, Layers, Lock, GitPullRequest, ShieldCheck, Check, ArrowRight,
} from 'lucide-react';

export const metadata: Metadata = {
  title: 'mplan — website analytics, set up in minutes',
  description:
    'Connect your site and mplan builds your measurement plan, creates GA4 and GTM, adds tracking, and keeps it healthy. No analytics expertise needed.',
};

// The existing app entry — where the product flow begins. Don't invent an auth
// flow; this is where sign-in / the generator already lives.
const GET_STARTED = '/';

// ─────────────────────────────────────────────────────────────────────────────

function Wordmark() {
  return (
    <span className="inline-flex items-center gap-2">
      <span
        aria-hidden
        className="flex h-7 w-7 items-center justify-center rounded-lg bg-ds-accent text-sm font-medium text-ds-accent-ink"
      >
        m
      </span>
      <span className="text-[15px] font-medium tracking-tight text-ds-ink">mplan</span>
    </span>
  );
}

function PrimaryCta({ children, href = GET_STARTED, className = '' }: { children: React.ReactNode; href?: string; className?: string }) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center justify-center gap-2 rounded-lg bg-ds-accent px-5 py-2.5 text-sm font-medium text-ds-accent-ink transition-colors hover:bg-ds-accent-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent ${className}`}
    >
      {children}
    </Link>
  );
}

function GhostCta({ children, href, className = '' }: { children: React.ReactNode; href: string; className?: string }) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center justify-center gap-2 rounded-lg border border-ds-line-strong bg-ds-card px-5 py-2.5 text-sm font-medium text-ds-ink transition-colors hover:border-ds-accent hover:text-ds-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent ${className}`}
    >
      {children}
    </Link>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function Nav() {
  return (
    <header className="sticky top-0 z-30 border-b border-ds-line bg-ds-page/85 backdrop-blur">
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8" aria-label="Primary">
        <Link href="/home" className="rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent" aria-label="mplan home">
          <Wordmark />
        </Link>
        <div className="hidden items-center gap-8 md:flex">
          <a href="#how-it-works" className="text-sm font-normal text-ds-secondary transition-colors hover:text-ds-ink">How it works</a>
          <a href="#features" className="text-sm font-normal text-ds-secondary transition-colors hover:text-ds-ink">Features</a>
          <a href="#pricing" className="text-sm font-normal text-ds-secondary transition-colors hover:text-ds-ink">Pricing</a>
        </div>
        <PrimaryCta className="px-4 py-2">Get started</PrimaryCta>
      </nav>
    </header>
  );
}

function Hero() {
  return (
    <section className="mx-auto max-w-6xl px-5 pb-20 pt-16 sm:px-8 sm:pt-24">
      <div className="mx-auto max-w-2xl text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-ds-line bg-ds-card px-3 py-1 text-xs font-medium text-ds-accent">
          <Sparkles size={13} aria-hidden /> AI-powered analytics setup
        </span>

        <h1 className="mt-6 text-4xl font-medium leading-[1.1] tracking-tight text-ds-ink sm:text-5xl">
          Website analytics, set up in minutes
        </h1>

        <p className="mx-auto mt-5 max-w-xl text-base font-normal leading-relaxed text-ds-secondary sm:text-lg">
          Connect your site and we build the measurement plan, create GA4 and GTM, add the
          tracking, and keep it healthy. No analytics expertise needed.
        </p>

        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <PrimaryCta className="w-full sm:w-auto">
            Get started free <ArrowRight size={15} aria-hidden />
          </PrimaryCta>
          <GhostCta href="#how-it-works" className="w-full sm:w-auto">See how it works</GhostCta>
        </div>

        <p className="mt-5 text-xs font-normal text-ds-muted">
          No credit card needed · Your code is never changed without your review.
        </p>
      </div>
    </section>
  );
}

// ── How it works ────────────────────────────────────────────────────────────

const STAGES = [
  { icon: ClipboardList, n: 1, stage: 'Plan', desc: 'AI builds your measurement plan from your site.' },
  { icon: Settings2, n: 2, stage: 'Set up', desc: 'We create GA4 and GTM and add the tracking.' },
  { icon: Rocket, n: 3, stage: 'Go live', desc: 'A readiness check confirms it works, then you publish.' },
  { icon: Activity, n: 4, stage: 'Monitor', desc: 'We watch for tracking that breaks and alert you.' },
] as const;

function HowItWorks() {
  return (
    <section id="how-it-works" className="scroll-mt-20 border-t border-ds-line bg-ds-card">
      <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-medium tracking-tight text-ds-ink sm:text-3xl">How it works</h2>
          <p className="mt-3 text-base font-normal text-ds-secondary">Four steps from a URL to analytics you can trust.</p>
        </div>

        <ol className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STAGES.map(({ icon: Icon, n, stage, desc }) => (
            <li key={stage} className="rounded-ds border border-ds-line bg-ds-page p-6">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-ds-accent-soft text-ds-accent">
                <Icon size={20} aria-hidden />
              </span>
              <p className="mt-4 text-xs font-medium uppercase tracking-wide text-ds-muted">{n} · Stage</p>
              <p className="mt-1 text-base font-medium text-ds-ink">{stage}</p>
              <p className="mt-1.5 text-sm font-normal leading-relaxed text-ds-secondary">{desc}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

// ── Features ─────────────────────────────────────────────────────────────────

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
    <section id="features" className="scroll-mt-20">
      <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-medium tracking-tight text-ds-ink sm:text-3xl">Everything you need, none of the busywork</h2>
          <p className="mt-3 text-base font-normal text-ds-secondary">Built for teams without an analytics specialist.</p>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="rounded-ds border border-ds-line bg-ds-card p-6">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-ds-accent-soft text-ds-accent">
                <Icon size={20} aria-hidden />
              </span>
              <h3 className="mt-4 text-base font-medium text-ds-ink">{title}</h3>
              <p className="mt-1.5 text-sm font-normal leading-relaxed text-ds-secondary">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Trust / security strip ───────────────────────────────────────────────────

const TRUST = [
  { icon: Lock, title: 'Data isolation', desc: 'Every customer’s data is kept separate — never shared or co-mingled.' },
  { icon: GitPullRequest, title: 'Review before any change', desc: 'Code changes arrive as pull requests you approve. Nothing ships silently.' },
  { icon: ShieldCheck, title: 'Read-only by default', desc: 'We only request the access we need, and write nothing without your say-so.' },
] as const;

function TrustStrip() {
  return (
    <section className="border-y border-ds-line bg-ds-accent-soft">
      <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8">
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-3">
          {TRUST.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="flex gap-3">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-ds-card text-ds-accent">
                <Icon size={17} aria-hidden />
              </span>
              <div>
                <p className="text-sm font-medium text-ds-ink">{title}</p>
                <p className="mt-1 text-sm font-normal leading-relaxed text-ds-secondary">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Pricing (placeholder) ────────────────────────────────────────────────────

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
    <section id="pricing" className="scroll-mt-20 border-t border-ds-line bg-ds-card">
      <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-medium tracking-tight text-ds-ink sm:text-3xl">Simple, honest pricing</h2>
          <p className="mt-3 text-base font-normal text-ds-secondary">
            Example pricing — final plans to be confirmed.
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-4 lg:grid-cols-3">
          {TIERS.map((t) => (
            <div
              key={t.name}
              className={`relative flex flex-col rounded-ds bg-ds-page p-6 ${
                t.popular ? 'border-2 border-ds-accent' : 'border border-ds-line'
              }`}
            >
              {t.popular && (
                <span className="absolute -top-3 left-6 rounded-full bg-ds-accent px-2.5 py-0.5 text-[11px] font-medium text-ds-accent-ink">
                  Most popular
                </span>
              )}
              <p className="text-sm font-medium text-ds-ink">{t.name}</p>
              <p className="mt-1 text-sm font-normal text-ds-secondary">{t.blurb}</p>
              <p className="mt-5">
                <span className="text-3xl font-medium tracking-tight text-ds-ink">{t.price}</span>
                {t.cadence && <span className="text-sm font-normal text-ds-muted">{t.cadence}</span>}
              </p>

              <ul className="mt-5 flex-1 space-y-2.5">
                {t.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm font-normal text-ds-secondary">
                    <Check size={16} className="mt-0.5 shrink-0 text-ds-accent" aria-hidden />
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
        <p className="mt-6 text-center text-xs font-normal text-ds-muted">Placeholder prices — set your real numbers before launch.</p>
      </div>
    </section>
  );
}

// ── Final CTA ────────────────────────────────────────────────────────────────

function FinalCta() {
  return (
    <section className="mx-auto max-w-6xl px-5 py-24 sm:px-8">
      <div className="rounded-2xl border border-ds-line bg-ds-card px-6 py-16 text-center">
        <h2 className="mx-auto max-w-xl text-2xl font-medium tracking-tight text-ds-ink sm:text-3xl">
          Set up analytics you can actually trust
        </h2>
        <p className="mx-auto mt-3 max-w-md text-base font-normal text-ds-secondary">
          Hand us a URL — we’ll hand back a complete, working measurement setup.
        </p>
        <div className="mt-8 flex justify-center">
          <PrimaryCta>Get started free <ArrowRight size={15} aria-hidden /></PrimaryCta>
        </div>
        <p className="mt-4 text-xs font-normal text-ds-muted">No credit card needed.</p>
      </div>
    </section>
  );
}

// ── Footer ───────────────────────────────────────────────────────────────────

const FOOTER_COLS = [
  { title: 'Product', links: [{ label: 'How it works', href: '#how-it-works' }, { label: 'Features', href: '#features' }, { label: 'Pricing', href: '#pricing' }] },
  { title: 'Company', links: [{ label: 'About', href: '#' }, { label: 'Contact', href: 'mailto:sales@example.com' }] },
  { title: 'Legal', links: [{ label: 'Privacy policy', href: '/privacy' }, { label: 'Terms', href: '/terms' }] },
] as const;

function Footer() {
  return (
    <footer className="border-t border-ds-line bg-ds-page">
      <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8">
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
          <div className="col-span-2 sm:col-span-1">
            <Wordmark />
            <p className="mt-3 max-w-[16rem] text-sm font-normal leading-relaxed text-ds-secondary">
              Website analytics, set up and kept healthy — without the manual work.
            </p>
          </div>
          {FOOTER_COLS.map((col) => (
            <div key={col.title}>
              <p className="text-xs font-medium uppercase tracking-wide text-ds-muted">{col.title}</p>
              <ul className="mt-3 space-y-2">
                {col.links.map((l) => (
                  <li key={l.label}>
                    <Link href={l.href} className="text-sm font-normal text-ds-secondary transition-colors hover:text-ds-ink">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-12 border-t border-ds-line pt-6">
          <p className="text-xs font-normal text-ds-muted">© 2026 mplan. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export default function MarketingHome() {
  return (
    <main className="h-full overflow-y-auto scroll-smooth bg-ds-page text-ds-ink">
      <Nav />
      <Hero />
      <HowItWorks />
      <Features />
      <TrustStrip />
      <Pricing />
      <FinalCta />
      <Footer />
    </main>
  );
}
