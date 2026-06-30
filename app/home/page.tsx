// Marketing landing page (public, additive) at /home. The app at / and the whole
// authenticated journey/audit path are NOT touched. Self-contained server component
// (SEO metadata, no client JS — section nav is plain anchor links). Scrolls in its
// own container because the app shell sets `body { overflow: hidden }`.
//
// On-brand with the app: built on the shared ds-* dark design tokens and the core
// components (Card, Badge). The "Get started" CTAs go straight into Google sign-in
// (/api/auth/google/start — sets the CSRF state cookie and redirects to Google's
// consent screen), so one click begins authorization. Footer links to /privacy +
// /terms. Prices are placeholders, clearly marked.

import type { Metadata } from 'next';
import Link from 'next/link';
import {
  Sparkles, ClipboardList, Settings2, Rocket, Activity, Globe, ChevronRight,
  BarChart3, Layers, Lock, GitPullRequest, ShieldCheck, Check, ArrowRight,
} from 'lucide-react';
import { Card, Badge } from '@/components/ds';

export const metadata: Metadata = {
  title: 'mplan — website analytics, set up in minutes',
  description:
    'Connect your site and mplan builds your measurement plan, creates GA4 and GTM, adds tracking, and keeps it healthy. No analytics expertise needed.',
};

// The real Google sign-in entry — a GET that redirects to Google's consent screen
// (sets a CSRF state cookie). CTAs use a plain <a> (full navigation, no prefetch) so
// the redirect + cookie work; a Next <Link> would client-route/prefetch and break it.
const GOOGLE_AUTH = '/api/auth/google/start';

// Signature violet→fuchsia accent used on the distinctive headline words. The one
// decorative gradient; everything structural reads from the ds-* tokens.
const HEADLINE_GRADIENT = { backgroundImage: 'linear-gradient(92deg,#a78bfa 0%,#d946ef 55%,#f0abfc 100%)' } as const;

// CTA recipes mirror the design system's Button variants (token-driven), but render
// as <Link>s for navigation.
const CTA_PRIMARY =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-ds-accent px-5 py-3 text-sm font-medium text-ds-accent-ink shadow-sm transition-colors hover:bg-ds-accent-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent';
const CTA_SECONDARY =
  'inline-flex items-center justify-center gap-2 rounded-xl border border-ds-line-strong bg-ds-card px-5 py-3 text-sm font-medium text-ds-ink transition-colors hover:bg-ds-panel focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent';

// ─────────────────────────────────────────────────────────────────────────────

function Wordmark() {
  // Brand logo — the real artwork with its white background removed (transparent
  // PNG), so it sits cleanly on the dark app background.
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/logo.png?v=2" alt="Sirah" className="h-9 w-auto select-none" />
  );
}

// Plain <a> (not Next <Link>): the primary target is the Google OAuth start route,
// which must be a full-page GET (redirect + state cookie). In-page anchors and the
// mailto/legal links work fine as <a> too.
function PrimaryCta({ children, href = GOOGLE_AUTH, className = '' }: { children: React.ReactNode; href?: string; className?: string }) {
  return (
    <a href={href} className={`group ${CTA_PRIMARY} ${className}`} style={{ boxShadow: '0 0 36px -10px rgba(139,92,246,0.6)' }}>
      {children}
    </a>
  );
}

function GhostCta({ children, href, className = '' }: { children: React.ReactNode; href: string; className?: string }) {
  return (
    <a href={href} className={`${CTA_SECONDARY} ${className}`}>{children}</a>
  );
}

// ── Nav ───────────────────────────────────────────────────────────────────────

function Nav() {
  return (
    <header className="sticky top-0 z-30 border-b border-ds-line bg-ds-page/80 backdrop-blur-md">
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8" aria-label="Primary">
        <Link href="/home" className="rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent" aria-label="mplan home">
          <Wordmark />
        </Link>
        <div className="hidden items-center gap-8 md:flex">
          <a href="#how-it-works" className="text-sm font-normal text-ds-secondary transition-colors hover:text-ds-ink">How it works</a>
          <a href="#features" className="text-sm font-normal text-ds-secondary transition-colors hover:text-ds-ink">Features</a>
          <a href="#pricing" className="text-sm font-normal text-ds-secondary transition-colors hover:text-ds-ink">Pricing</a>
        </div>
        <div className="flex items-center gap-2 sm:gap-4">
          {/* Secondary action for returning users — same Google entry, plain <a>. */}
          <a
            href={GOOGLE_AUTH}
            className="hidden text-sm font-normal text-ds-secondary transition-colors hover:text-ds-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent sm:inline"
          >
            Sign in
          </a>
          <PrimaryCta className="!px-4 !py-2">Get started</PrimaryCta>
        </div>
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
      <div className="rounded-3xl border border-ds-line bg-ds-card p-5 sm:p-8" style={{ boxShadow: '0 0 80px -30px rgba(124,58,237,0.55)' }}>
        <p className="mb-5 text-center text-[11px] font-medium uppercase tracking-[0.2em] text-ds-accent">The mplan pipeline</p>
        <ol className="flex flex-col items-stretch gap-3 md:flex-row md:items-center md:gap-2">
          {PIPELINE.map(({ icon: Icon, label }, i) => (
            <li key={label} className="contents">
              <div className="flex flex-1 flex-col items-center gap-2 rounded-2xl border border-ds-line bg-ds-panel px-3 py-4 text-center">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-ds-accent-soft text-ds-accent">
                  <Icon size={18} aria-hidden />
                </span>
                <span className="text-xs font-normal leading-tight text-ds-secondary">{label}</span>
              </div>
              {i < PIPELINE.length - 1 && (
                <ChevronRight size={16} aria-hidden className="mx-auto shrink-0 rotate-90 text-ds-accent/60 md:rotate-0" />
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
        <Badge variant="neutral">
          <Sparkles size={13} aria-hidden className="text-ds-accent" /> AI-powered analytics setup
        </Badge>

        <h1 className="mt-7 text-5xl font-normal leading-[1.05] tracking-tight text-ds-ink sm:text-6xl lg:text-7xl">
          <span className="bg-clip-text text-transparent" style={HEADLINE_GRADIENT}>Website analytics,</span>
          <br />
          set up in minutes
        </h1>

        <p className="mx-auto mt-6 max-w-xl text-base font-normal leading-relaxed text-ds-secondary sm:text-lg">
          Connect your site and we build the measurement plan, create GA4 and GTM, add the
          tracking, and keep it healthy. No analytics expertise needed.
        </p>

        <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <PrimaryCta className="w-full sm:w-auto">
            Get started free <ArrowRight size={15} aria-hidden className="transition-transform group-hover:translate-x-0.5" />
          </PrimaryCta>
          <GhostCta href="#how-it-works" className="w-full sm:w-auto">See how it works</GhostCta>
        </div>

        <p className="mt-5 text-xs font-normal text-ds-muted">
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
            <p className="mt-2 text-sm font-normal text-ds-muted">{s.label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

// ── How it works (the real 4-stage in-app journey) ────────────────────────────

const STAGES = [
  { icon: ClipboardList, n: 1, stage: 'Plan', desc: 'AI builds your measurement plan from your site.' },
  { icon: Settings2, n: 2, stage: 'Set up', desc: 'We create GA4 and GTM and add the tracking.' },
  { icon: Rocket, n: 3, stage: 'Go live', desc: 'A readiness check confirms it works, then you publish.' },
  { icon: Activity, n: 4, stage: 'Monitor', desc: 'We watch for tracking that breaks and alert you.' },
] as const;

function HowItWorks() {
  return (
    <section id="how-it-works" className="scroll-mt-20 border-t border-ds-line">
      <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-normal tracking-tight text-ds-ink sm:text-4xl">How it works</h2>
          <p className="mt-3 text-base font-normal text-ds-muted">Four steps from a URL to analytics you can trust.</p>
        </div>

        <ol className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STAGES.map(({ icon: Icon, n, stage, desc }) => (
            <li key={stage}>
              <Card className="h-full transition-colors hover:border-ds-accent/40">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-ds-accent-soft text-ds-accent">
                  <Icon size={20} aria-hidden />
                </span>
                <p className="mt-4 text-xs font-medium uppercase tracking-wide text-ds-accent">{n} · Stage</p>
                <p className="mt-1 text-base font-medium text-ds-ink">{stage}</p>
                <p className="mt-1.5 text-sm font-normal leading-relaxed text-ds-secondary">{desc}</p>
              </Card>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

// ── Features / benefits ───────────────────────────────────────────────────────

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
    <section id="features" className="scroll-mt-20 border-t border-ds-line">
      <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-normal tracking-tight text-ds-ink sm:text-4xl">Everything you need, none of the busywork</h2>
          <p className="mt-3 text-base font-normal text-ds-muted">Built for teams without an analytics specialist.</p>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, desc }) => (
            <Card key={title} className="transition-colors hover:border-ds-accent/40">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-ds-accent-soft text-ds-accent">
                <Icon size={20} aria-hidden />
              </span>
              <h3 className="mt-4 text-base font-medium text-ds-ink">{title}</h3>
              <p className="mt-1.5 text-sm font-normal leading-relaxed text-ds-secondary">{desc}</p>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Trust / security strip (calm, reassuring) ─────────────────────────────────

const TRUST = [
  { icon: Lock, title: 'Data isolation', desc: 'Every customer’s data is kept separate — never shared or co-mingled.' },
  { icon: GitPullRequest, title: 'Review before any change', desc: 'Code changes arrive as pull requests you approve. Nothing ships silently.' },
  { icon: ShieldCheck, title: 'Read-only by default', desc: 'We request only the access we need, and write nothing without your say-so.' },
] as const;

function TrustBand() {
  return (
    <section className="border-y border-ds-line bg-ds-card">
      <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
        <h2 className="mx-auto max-w-3xl text-center text-3xl font-normal leading-tight tracking-tight text-ds-ink sm:text-4xl">
          Built for teams without an analytics specialist<span className="text-ds-accent">.</span>
        </h2>

        <div className="mt-14 grid grid-cols-1 gap-8 sm:grid-cols-3">
          {TRUST.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="flex gap-3">
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-ds-accent-soft text-ds-accent">
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

// ── Pricing (placeholder) ─────────────────────────────────────────────────────

const TIERS = [
  {
    name: 'Starter', price: '$0', cadence: '/mo', popular: false,
    blurb: 'For trying it on one site.',
    features: ['1 website', 'AI measurement plan', 'GA4 + GTM setup', 'Excel plan delivered to your inbox'],
    cta: 'Get started', href: GOOGLE_AUTH,
  },
  {
    name: 'Pro', price: '$49', cadence: '/mo', popular: true,
    blurb: 'For teams running analytics for real.',
    features: ['Up to 10 websites', 'Daily health checks + alerts', 'Saved plan history', 'Review-PR code injection', 'Auto-create GA4 & GTM'],
    cta: 'Get started', href: GOOGLE_AUTH,
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
    <section id="pricing" className="scroll-mt-20 border-t border-ds-line">
      <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-normal tracking-tight text-ds-ink sm:text-4xl">Simple, honest pricing</h2>
          <p className="mt-3 text-base font-normal text-ds-muted">Example pricing — final plans to be confirmed.</p>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-4 lg:grid-cols-3">
          {TIERS.map((t) => (
            <Card
              key={t.name}
              className={`relative flex flex-col ${t.popular ? '!border-2 !border-ds-accent' : ''}`}
            >
              {t.popular && (
                <span className="absolute -top-3 left-6 rounded-full bg-ds-accent px-2.5 py-0.5 text-[11px] font-medium text-ds-accent-ink">
                  Most popular
                </span>
              )}
              <p className="text-sm font-medium text-ds-ink">{t.name}</p>
              <p className="mt-1 text-sm font-normal text-ds-muted">{t.blurb}</p>
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
            </Card>
          ))}
        </div>
        <p className="mt-6 text-center text-xs font-normal text-ds-muted">Placeholder prices — set your real numbers before launch.</p>
      </div>
    </section>
  );
}

// ── Final CTA ─────────────────────────────────────────────────────────────────

function FinalCta() {
  return (
    <section className="mx-auto max-w-6xl px-5 py-24 sm:px-8">
      <div
        className="relative overflow-hidden rounded-3xl border border-ds-line bg-ds-card px-6 py-16 text-center"
        style={{ boxShadow: '0 0 90px -30px rgba(124,58,237,0.6)' }}
      >
        <h2 className="mx-auto max-w-xl text-3xl font-normal tracking-tight text-ds-ink sm:text-4xl">
          Set up analytics you can actually <span className="bg-clip-text text-transparent" style={HEADLINE_GRADIENT}>trust</span>
        </h2>
        <p className="mx-auto mt-4 max-w-md text-base font-normal text-ds-secondary">
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

// ── Footer ────────────────────────────────────────────────────────────────────

const FOOTER_COLS = [
  { title: 'Product', links: [{ label: 'How it works', href: '#how-it-works' }, { label: 'Features', href: '#features' }, { label: 'Pricing', href: '#pricing' }] },
  { title: 'Company', links: [{ label: 'About', href: '#' }, { label: 'Contact', href: 'mailto:sales@example.com' }] },
  { title: 'Legal', links: [{ label: 'Privacy policy', href: '/privacy' }, { label: 'Terms', href: '/terms' }] },
] as const;

function Footer() {
  return (
    <footer className="border-t border-ds-line">
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

// ── Floating CTA (desktop) ────────────────────────────────────────────────────

function FloatingCta() {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-40 hidden justify-center lg:flex">
      <a
        href={GOOGLE_AUTH}
        className="pointer-events-auto inline-flex items-center gap-2 rounded-full bg-ds-accent px-5 py-2.5 text-sm font-medium text-ds-accent-ink transition-transform hover:scale-[1.03] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
        style={{ boxShadow: '0 0 40px -8px rgba(139,92,246,0.7)' }}
      >
        <Sparkles size={15} aria-hidden /> Get started free
      </a>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export default function MarketingHome() {
  return (
    <main className="relative h-full overflow-y-auto scroll-smooth bg-ds-page text-ds-ink">
      {/* Ambient violet glows behind the content (decorative) */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 h-[36rem] w-[36rem] -translate-x-1/2 rounded-full bg-violet-600/20 blur-[140px]" />
        <div className="absolute top-[20%] -right-40 h-[30rem] w-[30rem] rounded-full bg-fuchsia-600/12 blur-[140px]" />
        <div className="absolute top-[8%] -left-40 h-[28rem] w-[28rem] rounded-full bg-indigo-600/12 blur-[140px]" />
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
