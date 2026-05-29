'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Plus, Pencil, Trash2, Zap, MapPin, Layers, FileText, Radio, GitCompare, Wrench, AlertTriangle, ExternalLink } from 'lucide-react';

/* eslint-disable @typescript-eslint/no-explicit-any */

interface Props {
  audit: any;
  score: any;
  scrapeData?: any;
  onReset: () => void;
  onBack: () => void;
}

function PriorityBadge({ priority }: { priority: string }) {
  const colors: Record<string, string> = {
    critical: 'bg-red-500/15 text-red-400 border-red-500/20',
    high: 'bg-orange-500/15 text-orange-400 border-orange-500/20',
    medium: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/20',
    low: 'bg-slate-500/15 text-slate-400 border-slate-500/20',
  };
  return (
    <span className={`text-[11px] px-2.5 py-1 rounded-md uppercase tracking-wider font-semibold border ${colors[priority?.toLowerCase()] || colors.medium}`}>
      {priority}
    </span>
  );
}

const TABS = [
  { id: 'summary', label: 'Summary', icon: FileText },
  { id: 'current', label: 'Current Events', icon: Radio },
  { id: 'buckets', label: 'Event Audit', icon: Layers },
  { id: 'planvs', label: 'Plan vs Reality', icon: GitCompare },
  { id: 'add', label: 'Events to Add', icon: Plus },
  { id: 'fix', label: 'Events to Fix', icon: Wrench },
  { id: 'quickwins', label: 'Quick Wins', icon: Zap },
  { id: 'roadmap', label: 'Roadmap', icon: MapPin },
];

export default function AuditResultsScreen({ audit, score, scrapeData, onReset, onBack }: Props) {
  const [activeTab, setActiveTab] = useState('summary');
  const [scrollTargetId, setScrollTargetId] = useState<string | null>(null);

  // When a stat tile asks us to jump to a specific section inside a tab,
  // wait one frame for the tab content to mount, then scroll the target
  // into view and pulse a ring on it so the user sees where they landed.
  useEffect(() => {
    if (!scrollTargetId) return;
    const targetId = scrollTargetId;
    const t = setTimeout(() => {
      const el = document.getElementById(targetId);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        el.classList.add('ring-2', 'ring-cyan-400/50');
        setTimeout(() => el.classList.remove('ring-2', 'ring-cyan-400/50'), 1600);
      }
      setScrollTargetId(null);
    }, 100);
    return () => clearTimeout(t);
  }, [scrollTargetId, activeTab]);

  if (!audit) return null;

  const eventsToAdd = audit.eventsToAdd || [];
  const eventsToFix = audit.eventsToFix || audit.eventsToModify || [];
  const eventsToRemove = audit.eventsToRemove || [];
  const quickWins = audit.quickWins || [];
  const roadmap = audit.implementationRoadmap || audit.implementationPriority || [];
  const dimensions = audit.newDimensions || [];
  const planVsReality = audit.planVsReality || null;

  const firingEvents = audit.currentState?.eventsCurrentlyFiring || [];
  const trackingIds = audit.currentState?.detectedTrackingIds || {};
  const consent = audit.currentState?.consentMode;

  const eventBuckets = audit.eventAudit || null;
  const missingEvents = audit.missingEvents || [];
  const hasAnyBucket = !!(eventBuckets && (
    (eventBuckets.firingEvents?.length || 0) > 0 ||
    (eventBuckets.configuredEvents?.length || 0) > 0 ||
    missingEvents.length > 0
  ));

  const visibleTabs = TABS.filter(t => {
    if (t.id === 'current') return firingEvents.length > 0 || trackingIds.ga4?.length || trackingIds.gtm?.length;
    if (t.id === 'buckets') return hasAnyBucket;
    if (t.id === 'planvs') return planVsReality && (planVsReality.documentedButNotFiring?.length > 0 || planVsReality.firingButNotDocumented?.length > 0 || planVsReality.namingInconsistencies?.length > 0);
    if (t.id === 'fix') return eventsToFix.length > 0 || eventsToRemove.length > 0;
    if (t.id === 'roadmap') return roadmap.length > 0;
    return true;
  });

  return (
    <div className="h-full w-full overflow-hidden bg-[#0b1120] flex flex-col">

      {/* ─── HEADER ─── */}
      <div className="shrink-0 px-8 py-4 flex items-center justify-between border-b border-white/[0.08]">
        <button onClick={onBack} className="flex items-center gap-2 text-slate-400 hover:text-white transition text-sm">
          <ArrowLeft size={16} /> Back
        </button>
        <div className="text-center">
          {(() => {
            const rawUrl = audit.websiteInfo?.url || '';
            const href = rawUrl ? (rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`) : '';
            // Strip protocol + trailing slash for a clean display label.
            const display = rawUrl
              ? rawUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')
              : '';
            return href ? (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-base text-white font-semibold hover:text-cyan-300 transition group"
                title={`Open ${href} in a new tab`}
              >
                <span className="underline-offset-4 group-hover:underline">{display}</span>
                <ExternalLink size={14} className="opacity-60 group-hover:opacity-100" />
              </a>
            ) : (
              <span className="text-base text-white font-semibold">Website</span>
            );
          })()}
          <p className="text-xs text-slate-400 mt-0.5">{audit.websiteInfo?.industry} &middot; {audit.websiteInfo?.businessType}</p>
        </div>
        <div className="w-16" />
      </div>

      {/* ─── STATS BAR ─── */}
      <div className="shrink-0 px-8 py-4 flex items-center justify-center gap-3 border-b border-white/[0.06] bg-white/[0.01]">
        {(() => {
          const visibleIds = new Set(visibleTabs.map(t => t.id));
          // Resolve each stat to a tab. Falls back to 'summary' if the
          // preferred tab isn't visible (e.g. To Remove has data but no
          // dedicated tab — Events to Fix carries it).
          const pickTab = (preferred: string, fallback = 'summary') =>
            visibleIds.has(preferred) ? preferred : (visibleIds.has(fallback) ? fallback : 'summary');
          const stats: Array<{ label: string; value: number; color: string; tab: string; sectionId?: string }> = [
            { label: 'Configured', value: (audit.eventsConfigured || []).length, color: 'text-blue-400',     tab: pickTab('buckets'),   sectionId: 'section-configured' },
            { label: 'Firing',     value: (audit.eventsFiring || firingEvents).length, color: 'text-emerald-400', tab: pickTab('buckets'), sectionId: 'section-firing' },
            { label: 'To Add',     value: eventsToAdd.length,    color: 'text-emerald-400', tab: pickTab('add') },
            { label: 'To Fix',     value: eventsToFix.length,    color: 'text-yellow-400',  tab: pickTab('fix'),       sectionId: 'section-fix' },
            { label: 'To Remove',  value: eventsToRemove.length, color: 'text-red-400',     tab: pickTab('fix'),       sectionId: 'section-remove' },
            { label: 'Quick Wins', value: quickWins.length,      color: 'text-cyan-400',    tab: pickTab('quickwins') },
            { label: 'Dimensions', value: dimensions.length,     color: 'text-indigo-400',  tab: pickTab('add'),       sectionId: 'section-dimensions' },
          ];
          return stats.map(s => {
            const interactive = s.value > 0;
            const isActive = activeTab === s.tab && interactive;
            return (
              <button
                key={s.label}
                type="button"
                onClick={() => {
                  if (!interactive) return;
                  setActiveTab(s.tab);
                  if (s.sectionId) setScrollTargetId(s.sectionId);
                }}
                disabled={!interactive}
                aria-label={interactive ? `Jump to ${s.label}` : `${s.label} (none)`}
                className={`text-center px-4 py-2 rounded-lg transition-all ${
                  interactive
                    ? `cursor-pointer hover:bg-white/[0.04] hover:scale-[1.04] ${isActive ? 'bg-white/[0.05] ring-1 ring-white/[0.1]' : ''}`
                    : 'opacity-40 cursor-default'
                }`}
              >
                <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
                <div className="text-[11px] text-slate-400 mt-0.5">{s.label}</div>
              </button>
            );
          });
        })()}
      </div>

      {/* ─── TABS ─── */}
      <div className="shrink-0 px-8 pt-4 flex items-center gap-2">
        {visibleTabs.map(tab => {
          const active = activeTab === tab.id;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all ${
                active
                  ? 'bg-blue-500/15 text-blue-300 border border-blue-500/25'
                  : 'text-slate-500 hover:text-white hover:bg-white/[0.04] border border-transparent'
              }`}
            >
              <Icon size={15} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ─── TAB CONTENT ─── */}
      <div className="flex-1 overflow-hidden px-8 py-5">
        <AnimatePresence mode="wait">

          {/* ═══ SUMMARY ═══ */}
          {activeTab === 'summary' && (() => {
            const ids = audit.currentState?.detectedTrackingIds || {};
            const firingEvents = audit.currentState?.eventsCurrentlyFiring || [];
            const consent = audit.currentState?.consentMode;
            return (
            <motion.div key="summary" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="h-full overflow-y-auto scroll-area pb-2 space-y-4">

              {/* Executive Summary */}
              <div className="bg-white/[0.04] border border-white/[0.08] rounded-xl p-6">
                <h3 className="text-xs text-blue-400 uppercase tracking-widest font-semibold mb-3">Executive Summary</h3>
                <p className="text-[15px] text-slate-200 leading-relaxed">{audit.executiveSummary}</p>
              </div>

              {/* Detected Business Model — explains why some events were / weren't recommended */}
              {audit.businessModel?.primaryType && audit.businessModel.primaryType !== 'unknown' && (() => {
                const bm = audit.businessModel;
                const labels: Record<string, string> = {
                  direct_ecommerce:             '\u{1F6D2} Direct E-commerce (own cart + checkout)',
                  brand_catalog_with_retailers: '\u{1F3EA} Brand Catalog (redirects to retailers)',
                  lead_generation:              '\u{1F4E7} Lead Generation (forms + contact)',
                  saas:                         '\u{1F4BC} SaaS (subscription-based)',
                  content_publisher:            '\u{1F4F0} Content Publisher',
                  marketplace:                  '\u{1F3EC} Marketplace (multi-vendor)',
                  service_booking:              '\u{1F4C5} Service Booking',
                  informational:                '\u{2139}\u{FE0F} Informational',
                };
                const label = labels[bm.primaryType] || bm.primaryType;
                return (
                  <div className="bg-white/[0.04] border border-cyan-500/[0.2] rounded-xl p-6">
                    <h3 className="text-xs text-cyan-400 uppercase tracking-widest font-semibold mb-3">Detected Business Model</h3>
                    <div className="text-sm font-medium text-white">{label}</div>
                    <p className="text-[13px] text-slate-300 leading-relaxed mt-2">{bm.reasoning}</p>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
                      <div className="bg-white/[0.02] rounded-lg p-3 text-center">
                        <div className={`text-[11px] uppercase tracking-wider mb-1 ${bm.hasShoppingCart ? 'text-emerald-300' : 'text-slate-500'}`}>Cart</div>
                        <div className={`text-sm font-semibold ${bm.hasShoppingCart ? 'text-emerald-300' : 'text-slate-500'}`}>{bm.hasShoppingCart ? 'Yes' : 'No'}</div>
                      </div>
                      <div className="bg-white/[0.02] rounded-lg p-3 text-center">
                        <div className={`text-[11px] uppercase tracking-wider mb-1 ${bm.hasOwnCheckout ? 'text-emerald-300' : 'text-slate-500'}`}>Checkout</div>
                        <div className={`text-sm font-semibold ${bm.hasOwnCheckout ? 'text-emerald-300' : 'text-slate-500'}`}>{bm.hasOwnCheckout ? 'Yes' : 'No'}</div>
                      </div>
                      <div className="bg-white/[0.02] rounded-lg p-3 text-center">
                        <div className={`text-[11px] uppercase tracking-wider mb-1 ${bm.hasUserAccounts ? 'text-emerald-300' : 'text-slate-500'}`}>Accounts</div>
                        <div className={`text-sm font-semibold ${bm.hasUserAccounts ? 'text-emerald-300' : 'text-slate-500'}`}>{bm.hasUserAccounts ? 'Yes' : 'No'}</div>
                      </div>
                      <div className="bg-white/[0.02] rounded-lg p-3 text-center">
                        <div className={`text-[11px] uppercase tracking-wider mb-1 ${bm.hasLeadForms ? 'text-emerald-300' : 'text-slate-500'}`}>Lead Forms</div>
                        <div className={`text-sm font-semibold ${bm.hasLeadForms ? 'text-emerald-300' : 'text-slate-500'}`}>{bm.hasLeadForms ? 'Yes' : 'No'}</div>
                      </div>
                    </div>

                    {bm.redirectsToRetailers && (bm.retailers?.length > 0) && (
                      <div className="mt-3 text-xs text-slate-400">
                        <span className="text-slate-300 font-semibold">Retailers detected:</span>{' '}
                        {bm.retailers.map((r: string) => (
                          <span key={r} className="inline-block bg-cyan-500/10 text-cyan-300 px-2 py-0.5 rounded-md mr-1.5 mt-1 capitalize">{r}</span>
                        ))}
                      </div>
                    )}

                    {bm.primaryType === 'brand_catalog_with_retailers' && (
                      <div className="mt-3 text-[11px] text-slate-400 italic leading-relaxed">
                        Recommendations exclude on-site checkout events (add_to_cart, purchase, etc.) because those fire on the retailer's domain, not here. Outbound retailer clicks ARE the conversion metric for this model.
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Detected Tracking Setup + Consent */}
              <div className="bg-white/[0.04] border border-white/[0.08] rounded-xl p-6">
                <h3 className="text-xs text-cyan-400 uppercase tracking-widest font-semibold mb-4">Detected Tracking Setup</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {ids.ga4?.length > 0 && (
                    <div>
                      <div className="text-[11px] text-slate-400 uppercase tracking-wider mb-1.5">GA4</div>
                      {ids.ga4.map((id: string) => <div key={id} className="font-mono text-sm text-emerald-300 mb-0.5">{id}</div>)}
                    </div>
                  )}
                  {ids.gtm?.length > 0 && (
                    <div>
                      <div className="text-[11px] text-slate-400 uppercase tracking-wider mb-1.5">Google Tag Manager</div>
                      {ids.gtm.map((id: string) => <div key={id} className="font-mono text-sm text-blue-300 mb-0.5">{id}</div>)}
                    </div>
                  )}
                  {ids.ua?.length > 0 && (
                    <div>
                      <div className="text-[11px] text-yellow-400 uppercase tracking-wider mb-1.5">Universal Analytics <span className="text-red-400">(Deprecated)</span></div>
                      {ids.ua.map((id: string) => <div key={id} className="font-mono text-sm text-yellow-300 mb-0.5">{id}</div>)}
                    </div>
                  )}
                  {ids.metaPixel?.length > 0 && (
                    <div>
                      <div className="text-[11px] text-slate-400 uppercase tracking-wider mb-1.5">Meta Pixel</div>
                      {ids.metaPixel.map((id: string) => <div key={id} className="font-mono text-sm text-indigo-300 mb-0.5">{id}</div>)}
                    </div>
                  )}
                  {ids.googleAds?.length > 0 && (
                    <div>
                      <div className="text-[11px] text-slate-400 uppercase tracking-wider mb-1.5">Google Ads</div>
                      {ids.googleAds.map((id: string) => <div key={id} className="font-mono text-sm text-slate-300 mb-0.5">{id}</div>)}
                    </div>
                  )}
                  {/* Show "None detected" if completely empty */}
                  {!ids.ga4?.length && !ids.gtm?.length && !ids.ua?.length && !ids.metaPixel?.length && !ids.googleAds?.length && (
                    <div className="col-span-full text-sm text-slate-500">No tracking IDs detected on the live site.</div>
                  )}
                </div>
                {(consent || audit.consentDetection) && (() => {
                  const cd = audit.consentDetection || {};
                  const gcm = cd.googleConsentMode || {};
                  return (
                  <div className="mt-4 pt-4 border-t border-white/[0.06] space-y-3">
                    <div className="text-[11px] text-slate-400 uppercase tracking-wider">Consent Management</div>
                    <div className="flex items-start gap-3">
                      <span className={`text-base mt-0.5 ${cd.bannerDetected ? (cd.autoAccepted ? 'text-emerald-400' : 'text-yellow-400') : 'text-slate-600'}`}>
                        {cd.bannerDetected ? (cd.autoAccepted ? '\u2713' : '\u26A0') : '\u25CB'}
                      </span>
                      <div>
                        <div className="text-sm text-slate-200 font-medium">{cd.bannerDetected ? (cd.cmp || 'Cookie banner detected') : 'No cookie banner found'}</div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          {cd.bannerDetected && cd.autoAccepted && `Accepted for accurate scanning (${cd.detectionMethod || 'auto'})`}
                          {cd.bannerDetected && !cd.autoAccepted && 'Detected but could not auto-accept'}
                          {!cd.bannerDetected && 'Banner may load asynchronously or not required'}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <span className={`text-base mt-0.5 ${gcm.active || consent?.enabled ? 'text-emerald-400' : 'text-yellow-400'}`}>
                        {gcm.active || consent?.enabled ? '\u2713' : '\u26A0'}
                      </span>
                      <div>
                        <div className="text-sm text-slate-200 font-medium">Google Consent Mode {gcm.version || 'v2'}</div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          {gcm.active || consent?.enabled ? 'Active \u2014 compliant consent signaling' : 'Not detected \u2014 required for compliant GA4 tracking'}
                        </div>
                      </div>
                    </div>
                  </div>
                  );
                })()}
              </div>

              {/* Automated Interaction Summary — what the simulator actually did */}
              {audit.eventAudit?.userSimulation && audit.eventAudit.userSimulation.pagesSimulated > 0 && (() => {
                const sim = audit.eventAudit.userSimulation;
                const t = sim.totals;
                return (
                  <div className="bg-cyan-500/[0.05] border border-cyan-500/[0.15] rounded-xl p-5">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="text-xs text-cyan-400 uppercase tracking-widest font-semibold flex items-center gap-2">
                          <span>{'\u{1F916}'}</span> Automated Interaction Summary
                        </h3>
                        <p className="text-xs text-slate-400 mt-1">
                          {sim.totalInteractions} interactions across {sim.pagesSimulated} page{sim.pagesSimulated === 1 ? '' : 's'}
                        </p>
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono">{(sim.totalDurationMs / 1000).toFixed(1)}s total</div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                      <div className="bg-cyan-500/10 border border-cyan-500/20 rounded-lg p-3 text-center">
                        <div className="text-2xl font-bold text-cyan-300 tabular-nums">{t.eventMarkersTriggered || 0}</div>
                        <div className="text-[11px] text-cyan-200/70 mt-1">Event markers triggered</div>
                      </div>
                      <div className="bg-cyan-500/10 border border-cyan-500/20 rounded-lg p-3 text-center">
                        <div className="text-2xl font-bold text-cyan-300 tabular-nums">{t.elementsClicked || 0}</div>
                        <div className="text-[11px] text-cyan-200/70 mt-1">Buttons clicked</div>
                      </div>
                      <div className="bg-cyan-500/10 border border-cyan-500/20 rounded-lg p-3 text-center">
                        <div className="text-2xl font-bold text-cyan-300 tabular-nums">{t.productsClicked || 0}</div>
                        <div className="text-[11px] text-cyan-200/70 mt-1">Product cards clicked</div>
                      </div>
                      <div className="bg-cyan-500/10 border border-cyan-500/20 rounded-lg p-3 text-center">
                        <div className="text-2xl font-bold text-cyan-300 tabular-nums">{t.ctasClicked || 0}</div>
                        <div className="text-[11px] text-cyan-200/70 mt-1">CTAs clicked</div>
                      </div>
                    </div>

                    <div className="text-[11px] text-slate-400">
                      Also: {t.linksClicked || 0} nav links · {t.searchesPerformed || 0} search{t.searchesPerformed === 1 ? '' : 'es'} · {t.formInteractions || 0} form focus · {t.scrolls || 0} scrolls
                    </div>
                  </div>
                );
              })()}

              {/* Pages Scanned — multi-page deep scan roster */}
              {audit.eventAudit?.pagesScanned?.length > 0 && (
                <div className="bg-white/[0.04] border border-white/[0.08] rounded-xl p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-xs text-cyan-400 uppercase tracking-widest font-semibold">{'\u{1F4CD}'} Pages Scanned</h3>
                    <span className="text-xs text-slate-400">{audit.eventAudit.pagesScanned.length} pages</span>
                  </div>
                  <div className="space-y-1.5">
                    {audit.eventAudit.pagesScanned.map((p: any, i: number) => (
                      <div key={i} className="flex items-start gap-3 py-2 px-3 bg-white/[0.02] rounded-lg">
                        <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${p.success ? 'bg-emerald-400' : 'bg-yellow-400'}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[10px] px-1.5 py-0.5 bg-cyan-500/15 text-cyan-300 rounded uppercase tracking-wider">{p.type}</span>
                            <code className="text-xs text-slate-300 font-mono truncate">{p.url}</code>
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            {p.success ? `${p.eventsFound} events captured` : (p.error ? `Could not be scanned · ${p.error}` : 'Page could not be scanned (timeout or 404)')}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="text-[11px] text-slate-500 italic mt-3">
                    Events captured across all scanned pages are merged before classifying firing / configured / missing.
                  </div>
                </div>
              )}

              {/* Live Network Capture (existing-website mode only) */}
              {scrapeData?.networkCapture && (
                <div className="bg-white/[0.04] border border-white/[0.08] rounded-xl p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-xs text-emerald-400 uppercase tracking-widest font-semibold">Live Network Capture</h3>
                      <p className="text-xs text-slate-400 mt-1">Events observed firing in real-time during scan</p>
                    </div>
                    <div className="text-xs text-slate-400">
                      {scrapeData.networkCapture.totalAnalyticsRequests} analytics requests intercepted
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="bg-emerald-500/10 border border-emerald-500/30 rounded p-3 text-center">
                      <div className="text-2xl font-bold text-emerald-400">{scrapeData.networkCapture.ga4Hits}</div>
                      <div className="text-xs text-emerald-400 mt-1">GA4 Hits</div>
                    </div>
                    <div className="bg-indigo-500/10 border border-indigo-500/30 rounded p-3 text-center">
                      <div className="text-2xl font-bold text-indigo-300">{scrapeData.networkCapture.metaPixelHits}</div>
                      <div className="text-xs text-indigo-300 mt-1">Meta Pixel</div>
                    </div>
                    <div className="bg-yellow-500/10 border border-yellow-500/30 rounded p-3 text-center">
                      <div className="text-2xl font-bold text-yellow-400">{scrapeData.networkCapture.uaHits}</div>
                      <div className="text-xs text-yellow-400 mt-1">UA Legacy</div>
                    </div>
                    <div className="bg-purple-500/10 border border-purple-500/30 rounded p-3 text-center">
                      <div className="text-2xl font-bold text-purple-400">
                        {scrapeData.networkCapture.toolsDetected?.length || 0}
                      </div>
                      <div className="text-xs text-purple-400 mt-1">Tools Active</div>
                    </div>
                  </div>

                  {scrapeData.networkCapture.toolsDetected?.length > 0 && (
                    <div className="text-xs text-slate-400 mt-3">
                      <strong className="text-slate-300">Detected:</strong> {scrapeData.networkCapture.toolsDetected.join(' · ')}
                    </div>
                  )}
                </div>
              )}

              {/* Detection Accuracy Badge */}
              {audit.verification && (
                <div className="bg-white/[0.04] border border-white/[0.08] rounded-xl p-5 flex items-center gap-5">
                  <div className={`w-14 h-14 rounded-full flex items-center justify-center font-mono font-bold text-base shrink-0 ${
                    audit.verification.accuracyRatio >= 95 ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    : audit.verification.accuracyRatio >= 80 ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                    : 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20'
                  }`}>
                    {audit.verification.accuracyRatio}%
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-white font-medium">
                      {audit.verification.scraperEventCount} of {audit.verification.consoleEventCount} dataLayer events captured
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      {audit.verification.accuracyRatio >= 95
                        ? '\u2713 Verified against live dataLayer \u2014 complete capture'
                        : audit.verification.accuracyRatio >= 80
                        ? '\u2713 Verified against live dataLayer \u2014 minor gaps auto-filled'
                        : '\u26A0 Some events may require manual verification'}
                    </div>
                    {(audit.verification.eventsMissedByScraper || []).length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <span className="text-[10px] text-slate-500">Auto-recovered:</span>
                        {audit.verification.eventsMissedByScraper.map((name: string) => (
                          <span key={name} className="text-[10px] font-mono text-emerald-400/80 bg-emerald-500/10 px-1.5 py-0.5 rounded">{name}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Currently Tracked Events */}
              <div className="bg-white/[0.04] border border-white/[0.08] rounded-xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xs text-emerald-400 uppercase tracking-widest font-semibold">Currently Tracked Events</h3>
                  <span className="text-xs text-slate-400">{firingEvents.length} events firing</span>
                </div>
                {firingEvents.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {firingEvents.map((evt: any, i: number) => {
                      const name = typeof evt === 'string' ? evt : evt.eventName;
                      const source = typeof evt === 'string' ? 'Detected' : (evt.source || 'Unknown');
                      const isStd = typeof evt === 'object' && evt.isStandard;
                      const notes = typeof evt === 'object' ? evt.notes : '';
                      return (
                        <div key={i} className="flex items-center gap-3 py-2 px-3 bg-white/[0.02] rounded-lg">
                          <div className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <code className="text-sm text-white font-mono">{name}</code>
                              {isStd && <span className="text-[9px] px-1.5 py-0.5 bg-blue-500/15 text-blue-300 rounded">STANDARD</span>}
                            </div>
                            <div className="text-[11px] text-slate-500">{source}{notes ? ` \u00B7 ${notes}` : ''}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">No custom events detected. Only default page view tracking is active.</p>
                )}
              </div>

              {/* Current State + Critical Issues */}
              <div className="flex gap-4">
                <div className="bg-white/[0.04] border border-white/[0.08] rounded-xl p-6 flex-1">
                  <h3 className="text-xs text-slate-400 uppercase tracking-widest font-semibold mb-3">Current State</h3>
                  <p className="text-sm text-slate-300 leading-relaxed">{audit.currentState?.summary}</p>
                </div>

                <div className="bg-white/[0.04] border border-white/[0.08] rounded-xl p-6 flex-1">
                  <h3 className="text-xs text-red-400 uppercase tracking-widest font-semibold mb-3">Critical Issues</h3>
                  <div className="space-y-2.5">
                    {(audit.currentState?.criticalIssues || []).slice(0, 5).map((issue: string, i: number) => (
                      <div key={i} className="text-sm text-red-200/80 pl-3 border-l-2 border-red-500/30 leading-relaxed">{issue}</div>
                    ))}
                    {(!audit.currentState?.criticalIssues?.length) && (
                      <p className="text-sm text-slate-500">No critical issues found</p>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
            );
          })()}

          {/* ═══ CURRENT EVENTS (what's already firing) ═══ */}
          {activeTab === 'current' && (
            <motion.div key="current" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="h-full overflow-y-auto scroll-area pb-2 space-y-5">

              {/* Detected Tracking IDs */}
              <div className="bg-white/[0.04] border border-white/[0.08] rounded-xl p-6">
                <h3 className="text-xs text-cyan-400 uppercase tracking-widest font-semibold mb-4">Detected Tracking Setup</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
                  {trackingIds.ga4?.length > 0 && (
                    <div>
                      <div className="text-[11px] text-slate-400 uppercase tracking-wider mb-2">GA4</div>
                      {trackingIds.ga4.map((id: string) => <div key={id} className="font-mono text-sm text-emerald-300 mb-1">{id}</div>)}
                    </div>
                  )}
                  {trackingIds.gtm?.length > 0 && (
                    <div>
                      <div className="text-[11px] text-slate-400 uppercase tracking-wider mb-2">Google Tag Manager</div>
                      {trackingIds.gtm.map((id: string) => <div key={id} className="font-mono text-sm text-blue-300 mb-1">{id}</div>)}
                    </div>
                  )}
                  {trackingIds.ua?.length > 0 && (
                    <div>
                      <div className="text-[11px] text-yellow-400 uppercase tracking-wider mb-2">Universal Analytics <span className="text-red-400">(Deprecated)</span></div>
                      {trackingIds.ua.map((id: string) => <div key={id} className="font-mono text-sm text-yellow-300 mb-1">{id}</div>)}
                    </div>
                  )}
                  {trackingIds.metaPixel?.length > 0 && (
                    <div>
                      <div className="text-[11px] text-slate-400 uppercase tracking-wider mb-2">Meta Pixel</div>
                      {trackingIds.metaPixel.map((id: string) => <div key={id} className="font-mono text-sm text-indigo-300 mb-1">{id}</div>)}
                    </div>
                  )}
                  {trackingIds.googleAds?.length > 0 && (
                    <div>
                      <div className="text-[11px] text-slate-400 uppercase tracking-wider mb-2">Google Ads</div>
                      {trackingIds.googleAds.map((id: string) => <div key={id} className="font-mono text-sm text-slate-300 mb-1">{id}</div>)}
                    </div>
                  )}
                </div>
                {(consent || audit.consentDetection) && (() => {
                  const cd = audit.consentDetection || {};
                  const gcm = cd.googleConsentMode || {};
                  return (
                  <div className="mt-4 pt-4 border-t border-white/[0.06] space-y-3">
                    <div className="text-[11px] text-slate-400 uppercase tracking-wider">Consent Management</div>
                    <div className="flex items-start gap-3">
                      <span className={`text-base mt-0.5 ${cd.bannerDetected ? (cd.autoAccepted ? 'text-emerald-400' : 'text-yellow-400') : 'text-slate-600'}`}>
                        {cd.bannerDetected ? (cd.autoAccepted ? '\u2713' : '\u26A0') : '\u25CB'}
                      </span>
                      <div>
                        <div className="text-sm text-slate-200 font-medium">{cd.bannerDetected ? (cd.cmp || 'Cookie banner detected') : 'No cookie banner found'}</div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          {cd.bannerDetected && cd.autoAccepted && `Accepted for accurate scanning (${cd.detectionMethod || 'auto'})`}
                          {cd.bannerDetected && !cd.autoAccepted && 'Detected but could not auto-accept'}
                          {!cd.bannerDetected && 'Banner may load asynchronously or not required'}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <span className={`text-base mt-0.5 ${gcm.active || consent?.enabled ? 'text-emerald-400' : 'text-yellow-400'}`}>
                        {gcm.active || consent?.enabled ? '\u2713' : '\u26A0'}
                      </span>
                      <div>
                        <div className="text-sm text-slate-200 font-medium">Google Consent Mode {gcm.version || 'v2'}</div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          {gcm.active || consent?.enabled ? 'Active \u2014 compliant consent signaling' : 'Not detected \u2014 required for compliant GA4 tracking'}
                        </div>
                      </div>
                    </div>
                  </div>
                  );
                })()}
              </div>

              {/* Configured Events (GTM / HTML markers — may not fire until interaction) */}
              {(audit.eventsConfigured || []).length > 0 && (
                <div className="bg-white/[0.04] border border-white/[0.08] rounded-xl p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-xs text-blue-400 uppercase tracking-widest font-semibold">Configured Events</h3>
                      <p className="text-xs text-slate-500 mt-1">Found in GTM containers or HTML markers — fire on user interaction</p>
                    </div>
                    <span className="text-sm text-white font-semibold">{(audit.eventsConfigured || []).length}</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                    {(audit.eventsConfigured || []).map((evt: any, i: number) => (
                      <div key={i} className="flex items-center gap-3 py-2.5 px-4 bg-blue-500/5 border border-blue-500/10 rounded-lg">
                        <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                          evt.confidence === 'high' ? 'bg-emerald-400' : evt.confidence === 'medium' ? 'bg-blue-400' : 'bg-slate-500'
                        }`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <code className="text-sm text-white font-mono font-medium">{evt.eventName}</code>
                            {(evt.sourceCount || 0) >= 2 && (
                              <span className="text-[8px] px-1.5 py-0.5 bg-emerald-500/15 text-emerald-400 rounded font-medium">
                                Verified ({evt.sourceCount} sources)
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-400 mt-0.5">
                            {evt.allSources ? evt.allSources.join(' + ') : evt.source}
                          </div>
                        </div>
                        <span className="text-[9px] px-1.5 py-0.5 bg-blue-500/15 text-blue-300 rounded font-medium shrink-0">CONFIGURED</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Events Firing Now (captured live during scraping) */}
              <div className="bg-white/[0.04] border border-white/[0.08] rounded-xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-xs text-emerald-400 uppercase tracking-widest font-semibold">Events Firing Now</h3>
                    <p className="text-xs text-slate-500 mt-1">Captured live during the scan</p>
                  </div>
                  <span className="text-sm text-white font-semibold">{(audit.eventsFiring || firingEvents).length}</span>
                </div>
                {(audit.eventsFiring || firingEvents).length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                    {(audit.eventsFiring || firingEvents).map((evt: any, i: number) => {
                      const name = typeof evt === 'string' ? evt : evt.eventName;
                      const source = typeof evt === 'string' ? 'Detected' : (evt.allSources ? evt.allSources.join(' + ') : (evt.source || 'Unknown'));
                      const isStd = typeof evt === 'object' && evt.isStandard;
                      return (
                        <div key={i} className="flex items-center gap-3 py-2.5 px-4 bg-emerald-500/5 border border-emerald-500/10 rounded-lg">
                          <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                            evt.confidence === 'high' ? 'bg-emerald-400' : evt.confidence === 'medium' ? 'bg-blue-400' : 'bg-emerald-400'
                          }`} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <code className="text-sm text-white font-mono font-medium">{name}</code>
                              {(evt.sourceCount || 0) >= 2 && (
                                <span className="text-[8px] px-1.5 py-0.5 bg-emerald-500/15 text-emerald-400 rounded font-medium">
                                  Verified ({evt.sourceCount})
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-slate-400 mt-0.5">{source}</div>
                          </div>
                          <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium shrink-0 ${isStd ? 'bg-slate-500/15 text-slate-400' : 'bg-emerald-500/15 text-emerald-300'}`}>
                            {isStd ? 'STANDARD' : 'FIRING'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">No events fired during page load. Events may require user interaction.</p>
                )}
              </div>
            </motion.div>
          )}

          {/* ═══ EVENT AUDIT — 3 categorized sections ═══ */}
          {activeTab === 'buckets' && (() => {
            const buckets = audit.eventAudit || { firingEvents: [], configuredEvents: [], detectionMethod: 'Playwright only', trackingSpy: { installed: false, rawHitCount: 0, counters: { fetch: 0, xhr: 0, beacon: 0, image: 0, dataLayer: 0 } } };
            const firingNow = buckets.firingEvents || [];
            const configuredNotFiring = buckets.configuredEvents || [];
            const missing = audit.missingEvents || [];
            const siteType = audit.siteType || 'ecommerce';
            const spy = buckets.trackingSpy || {};
            return (
            <motion.div key="buckets" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="h-full overflow-y-auto scroll-area pb-2 space-y-5">

              {/* Detection-method strip — same style as existing eyebrow row */}
              <div className="flex items-center justify-between bg-white/[0.02] border border-white/[0.06] rounded-lg px-4 py-2.5">
                <div className="flex items-center gap-6">
                  <div>
                    <div className="text-[10px] text-slate-500 uppercase tracking-widest">Detection method</div>
                    <div className="text-sm text-white mt-0.5">{buckets.detectionMethod}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-500 uppercase tracking-widest">Site type</div>
                    <div className="text-sm text-white mt-0.5">{siteType}</div>
                  </div>
                  {spy.installed && (
                    <div>
                      <div className="text-[10px] text-slate-500 uppercase tracking-widest">Tracking Spy</div>
                      <div className="text-sm text-emerald-300 mt-0.5">{spy.rawHitCount || 0} hits</div>
                    </div>
                  )}
                </div>
                {spy.installed && spy.counters && (
                  <div className="flex gap-2 text-[10px] font-mono text-slate-400">
                    <span className="bg-white/[0.03] px-2 py-1 rounded">fetch {spy.counters.fetch}</span>
                    <span className="bg-white/[0.03] px-2 py-1 rounded">xhr {spy.counters.xhr}</span>
                    <span className="bg-white/[0.03] px-2 py-1 rounded">beacon {spy.counters.beacon}</span>
                    <span className="bg-white/[0.03] px-2 py-1 rounded">img {spy.counters.image}</span>
                    <span className="bg-white/[0.03] px-2 py-1 rounded">dl {spy.counters.dataLayer}</span>
                  </div>
                )}
              </div>

              {/* SECTION 1: FIRING NOW (Tracking Spy verified) */}
              <div id="section-firing" className="scroll-mt-4 bg-white/[0.04] border border-white/[0.08] rounded-xl p-6 transition-all">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-xs text-emerald-400 uppercase tracking-widest font-semibold">{'\u{1F7E2}'} Events Firing Now</h3>
                    <p className="text-xs text-slate-400 mt-1">Captured live during scan</p>
                  </div>
                  <span className="text-xs text-slate-400">{firingNow.length} events</span>
                </div>
                {firingNow.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {firingNow.map((evt: any, i: number) => (
                      <div key={i} className="flex items-center gap-3 py-2 px-3 bg-white/[0.02] rounded-lg">
                        <div className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <code className="text-sm text-white font-mono truncate">{evt.eventName}</code>
                            {evt.isStandard && <span className="text-[9px] px-1.5 py-0.5 bg-blue-500/15 text-blue-300 rounded">STANDARD</span>}
                            {evt.confidenceSource && (
                              <span className="text-[9px] px-1.5 py-0.5 bg-emerald-500/15 text-emerald-300 rounded">{evt.confidenceSource}</span>
                            )}
                            {evt.count && evt.count > 1 && (
                              <span className="text-[9px] px-1.5 py-0.5 bg-white/[0.05] text-slate-300 rounded">x{evt.count}</span>
                            )}
                            {Array.isArray(evt.capturedFromPages) && evt.capturedFromPages.map((p: string) => (
                              <span key={p} className="text-[9px] px-1.5 py-0.5 bg-cyan-500/15 text-cyan-300 rounded capitalize">{p}</span>
                            ))}
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5">{evt.source}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">No events fired during the scan.</p>
                )}
              </div>

              {/* SECTION 2: CONFIGURED BUT NOT FIRING */}
              <div id="section-configured" className="scroll-mt-4 bg-white/[0.04] border border-white/[0.08] rounded-xl p-6 transition-all">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-xs text-blue-400 uppercase tracking-widest font-semibold">{'\u{1F535}'} Configured but Not Firing</h3>
                    <p className="text-xs text-slate-400 mt-1">Found in GTM container or HTML markers — require user interaction</p>
                  </div>
                  <span className="text-xs text-slate-400">{configuredNotFiring.length} events</span>
                </div>
                {configuredNotFiring.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {configuredNotFiring.map((evt: any, i: number) => (
                      <div key={i} className="flex items-center gap-3 py-2 px-3 bg-white/[0.02] rounded-lg">
                        <div className="w-2 h-2 rounded-full bg-blue-400 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <code className="text-sm text-white font-mono truncate">{evt.eventName}</code>
                            {evt.gtmContainer && (
                              <span className="text-[9px] px-1.5 py-0.5 bg-blue-500/15 text-blue-300 rounded font-mono">{evt.gtmContainer}</span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5">{evt.tagType || evt.source}{evt.trigger ? ` · ${evt.trigger}` : ''}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">No additional configured-but-not-firing events found in GTM.</p>
                )}
              </div>

              {/* SECTION 3: MISSING — SHOULD BE ADDED */}
              <div className="bg-white/[0.04] border border-yellow-500/30 rounded-xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-xs text-yellow-400 uppercase tracking-widest font-semibold">{'\u{1F7E1}'} Missing &mdash; Should Be Added</h3>
                    <p className="text-xs text-slate-400 mt-1">Industry-standard events expected for a {siteType} site that aren&apos;t firing or configured</p>
                  </div>
                  <span className="text-xs text-slate-400">{missing.length} recommendations</span>
                </div>
                {missing.length > 0 ? (
                  <div className="space-y-3">
                    {missing.map((evt: any, i: number) => {
                      const pri = (evt.priority || 'Medium').toLowerCase();
                      const priClass =
                        pri === 'critical' ? 'bg-red-500/15 text-red-300 border-red-500/25' :
                        pri === 'high' ? 'bg-yellow-500/15 text-yellow-300 border-yellow-500/25' :
                        'bg-blue-500/15 text-blue-300 border-blue-500/25';
                      return (
                        <div key={evt.id || i} className="bg-white/[0.02] border border-yellow-500/15 rounded-lg p-4">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <code className="text-sm text-white font-mono font-medium">{evt.eventName}</code>
                            {evt.category && <span className="text-[9px] px-1.5 py-0.5 bg-yellow-500/10 text-yellow-300 rounded">{evt.category}</span>}
                            <span className={`text-[9px] px-1.5 py-0.5 rounded border ml-auto uppercase tracking-wider font-semibold ${priClass}`}>{evt.priority || 'Medium'}</span>
                          </div>
                          {evt.whyMissing && <div className="text-sm text-slate-200 mt-1.5 leading-relaxed">{evt.whyMissing}</div>}
                          {evt.recommendedTrigger && (
                            <div className="text-xs text-slate-400 mt-1.5">
                              <span className="text-slate-300 font-semibold">Trigger:</span> {evt.recommendedTrigger}
                            </div>
                          )}
                          {Array.isArray(evt.parameters) && evt.parameters.length > 0 && (
                            <div className="text-xs text-slate-400 mt-1">
                              <span className="text-slate-300 font-semibold">Parameters:</span>{' '}
                              {evt.parameters.map((p: any) => `${p.name}${p.type ? ` (${p.type})` : ''}${p.required ? '*' : ''}`).join(', ')}
                            </div>
                          )}
                          <div className="flex items-center gap-4 text-[11px] text-slate-500 mt-2.5">
                            {evt.estimatedImpact && <span><span className="text-slate-400">Impact:</span> {evt.estimatedImpact}</span>}
                            {evt.implementationEffort && <span><span className="text-slate-400">Effort:</span> {evt.implementationEffort}</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">All standard {siteType} events appear to be tracked. Nice work.</p>
                )}
              </div>

              {/* ═══ BY SOURCE — raw lists from the 4-step auditor ═══ */}
              {(() => {
                const ea: any = audit.eventAudit || {};
                const gtmContainerEvents: any[] = ea.gtmContainerEvents || [];
                const ga4Events: any[] = ea.ga4Events || [];
                const metaPixelEvents: any[] = ea.metaPixelEvents || [];
                const otherPixelEvents: any[] = ea.otherPixelEvents || [];
                const sourcePages: any[] = ea.pagesScanned || [];
                const hasAny = gtmContainerEvents.length || ga4Events.length || metaPixelEvents.length || otherPixelEvents.length || sourcePages.length;
                if (!hasAny) return null;

                return (
                <>
                  {/* Separator */}
                  <div className="flex items-center gap-3 pt-2">
                    <div className="h-px flex-1 bg-white/[0.06]" />
                    <span className="text-[10px] text-slate-500 uppercase tracking-widest">By Source</span>
                    <div className="h-px flex-1 bg-white/[0.06]" />
                  </div>

                  {/* 📦 GTM Container Events */}
                  {gtmContainerEvents.length > 0 && (
                    <div className="bg-white/[0.04] border border-white/[0.08] rounded-xl p-6">
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <h3 className="text-xs text-blue-400 uppercase tracking-widest font-semibold">{'\u{1F4E6}'} GTM Container Events</h3>
                          <p className="text-xs text-slate-400 mt-1">Events configured in GTM — extracted directly from container JS</p>
                        </div>
                        <span className="text-xs text-slate-400">{gtmContainerEvents.length} events</span>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {gtmContainerEvents.map((evt: any, i: number) => (
                          <div key={i} className="flex items-center gap-3 py-2 px-3 bg-white/[0.02] rounded-lg">
                            <div className="w-2 h-2 rounded-full bg-blue-400 shrink-0" />
                            <code className="text-sm text-white font-mono truncate flex-1">{evt.eventName}</code>
                            {evt.gtmContainer && <span className="text-[9px] px-1.5 py-0.5 bg-blue-500/15 text-blue-300 rounded font-mono">{evt.gtmContainer}</span>}
                            <span className="text-[10px] text-slate-500">{evt.tagType || 'GTM'}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 📊 GA4 Events Fired */}
                  {ga4Events.length > 0 && (
                    <div className="bg-white/[0.04] border border-white/[0.08] rounded-xl p-6">
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <h3 className="text-xs text-emerald-400 uppercase tracking-widest font-semibold">{'\u{1F4CA}'} GA4 Events Fired</h3>
                          <p className="text-xs text-slate-400 mt-1">GA4 events captured during automated interaction</p>
                        </div>
                        <span className="text-xs text-slate-400">{ga4Events.length} events</span>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {ga4Events.map((evt: any, i: number) => (
                          <div key={i} className="flex items-center gap-3 py-2 px-3 bg-white/[0.02] rounded-lg">
                            <div className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                            <code className="text-sm text-white font-mono truncate flex-1">{evt.eventName}</code>
                            {evt.isStandardEvent && <span className="text-[9px] px-1.5 py-0.5 bg-emerald-500/15 text-emerald-300 rounded">STANDARD</span>}
                            <span className="text-[9px] text-slate-500 font-mono">{evt.measurementId}</span>
                            <span className="text-[10px] text-slate-500 shrink-0">on {(evt.capturedFromPages || []).length} pg</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 📘 Meta Pixel Events */}
                  {metaPixelEvents.length > 0 && (
                    <div className="bg-white/[0.04] border border-white/[0.08] rounded-xl p-6">
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <h3 className="text-xs text-indigo-400 uppercase tracking-widest font-semibold">{'\u{1F4D8}'} Meta Pixel Events</h3>
                          <p className="text-xs text-slate-400 mt-1">facebook.com/tr requests captured firing</p>
                        </div>
                        <span className="text-xs text-slate-400">{metaPixelEvents.length} events</span>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {metaPixelEvents.map((evt: any, i: number) => (
                          <div key={i} className="flex items-center gap-3 py-2 px-3 bg-white/[0.02] rounded-lg">
                            <div className="w-2 h-2 rounded-full bg-indigo-400 shrink-0" />
                            <code className="text-sm text-white font-mono truncate flex-1">{evt.eventName}</code>
                            {evt.pixelId && <span className="text-[9px] text-slate-500 font-mono">{evt.pixelId}</span>}
                            <span className="text-[10px] text-slate-500 shrink-0">on {(evt.capturedFromPages || []).length} pg</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Other pixels */}
                  {otherPixelEvents.length > 0 && (
                    <div className="bg-white/[0.04] border border-white/[0.08] rounded-xl p-6">
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <h3 className="text-xs text-purple-400 uppercase tracking-widest font-semibold">{'\u{1F4E1}'} Other Tracking Pixels</h3>
                          <p className="text-xs text-slate-400 mt-1">TikTok, LinkedIn, Google Ads, Hotjar, Segment, etc.</p>
                        </div>
                        <span className="text-xs text-slate-400">{otherPixelEvents.length} events</span>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {otherPixelEvents.map((evt: any, i: number) => (
                          <div key={i} className="flex items-center gap-3 py-2 px-3 bg-white/[0.02] rounded-lg">
                            <div className="w-2 h-2 rounded-full bg-purple-400 shrink-0" />
                            <code className="text-sm text-white font-mono truncate flex-1">{evt.eventName}</code>
                            <span className="text-[10px] px-1.5 py-0.5 bg-purple-500/15 text-purple-300 rounded">{evt.source}</span>
                            <span className="text-[10px] text-slate-500 shrink-0">on {(evt.capturedFromPages || []).length} pg</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
                );
              })()}
            </motion.div>
            );
          })()}

          {/* ═══ PLAN VS REALITY ═══ */}
          {activeTab === 'planvs' && planVsReality && (
            <motion.div key="planvs" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="h-full overflow-y-auto scroll-area pb-2 space-y-5">

              {/* Documented but NOT firing */}
              {(planVsReality.documentedButNotFiring || []).length > 0 && (
                <div className="bg-white/[0.04] border border-white/[0.08] rounded-xl p-6">
                  <h3 className="text-xs text-red-400 uppercase tracking-widest font-semibold mb-4 flex items-center gap-2">
                    <Trash2 size={13} /> In Your Plan but NOT Firing ({planVsReality.documentedButNotFiring.length})
                  </h3>
                  <div className="space-y-2.5">
                    {planVsReality.documentedButNotFiring.map((e: any, i: number) => (
                      <div key={i} className="flex items-start gap-4 py-3 px-4 bg-red-500/5 border border-red-500/10 rounded-lg">
                        <span className="text-lg shrink-0">{'\u274C'}</span>
                        <div className="flex-1 min-w-0">
                          <code className="text-sm text-red-300 font-mono font-medium">{e.eventName}</code>
                          <p className="text-sm text-slate-400 mt-1">{e.businessImpact}</p>
                          <div className="flex items-center gap-3 mt-1.5">
                            <span className="text-[10px] text-slate-500">From: {e.documentedIn}</span>
                            <PriorityBadge priority={e.severity} />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Firing but NOT documented */}
              {(planVsReality.firingButNotDocumented || []).length > 0 && (
                <div className="bg-white/[0.04] border border-white/[0.08] rounded-xl p-6">
                  <h3 className="text-xs text-amber-400 uppercase tracking-widest font-semibold mb-4 flex items-center gap-2">
                    <AlertTriangle size={13} /> Firing but NOT in Your Plan ({planVsReality.firingButNotDocumented.length})
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                    {planVsReality.firingButNotDocumented.map((e: any, i: number) => (
                      <div key={i} className="py-2.5 px-4 bg-amber-500/5 border border-amber-500/10 rounded-lg">
                        <code className="text-sm text-amber-300 font-mono font-medium">{e.eventName}</code>
                        <p className="text-xs text-slate-400 mt-1">{e.recommendation}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Naming inconsistencies */}
              {(planVsReality.namingInconsistencies || []).length > 0 && (
                <div className="bg-white/[0.04] border border-white/[0.08] rounded-xl p-6">
                  <h3 className="text-xs text-yellow-400 uppercase tracking-widest font-semibold mb-4">Naming Inconsistencies</h3>
                  <div className="space-y-2.5">
                    {planVsReality.namingInconsistencies.map((e: any, i: number) => (
                      <div key={i} className="flex items-center gap-4 py-2.5 px-4 bg-white/[0.03] border border-white/[0.06] rounded-lg">
                        <code className="text-sm text-slate-400 font-mono line-through">{e.planName}</code>
                        <span className="text-slate-600">{'\u2192'}</span>
                        <code className="text-sm text-emerald-300 font-mono font-semibold">{e.liveName}</code>
                        <span className="text-xs text-slate-500 ml-auto">{e.fix}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {!planVsReality.documentedButNotFiring?.length && !planVsReality.firingButNotDocumented?.length && !planVsReality.namingInconsistencies?.length && (
                <div className="text-center py-12 text-slate-500">
                  <p className="text-sm">No plan/reality gaps detected.</p>
                </div>
              )}
            </motion.div>
          )}

          {/* ═══ EVENTS TO ADD ═══ */}
          {activeTab === 'add' && (
            <motion.div key="add" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="h-full overflow-y-auto scroll-area pb-2">
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {eventsToAdd.map((e: any, i: number) => (
                  <motion.div key={i}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.03 }}
                    className="bg-white/[0.04] border border-white/[0.08] rounded-xl p-5 hover:border-emerald-500/25 transition"
                  >
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <code className="text-sm text-emerald-300 font-mono font-semibold">{e.eventName}</code>
                      <PriorityBadge priority={e.priority} />
                    </div>
                    <div className="text-xs text-slate-300 uppercase tracking-wider font-medium mb-2">{e.category}</div>
                    <div className="text-sm text-slate-300 mb-2 leading-relaxed">{e.trigger}</div>
                    <div className="text-sm text-slate-400 leading-relaxed">{e.rationale}</div>
                    {e.parameters?.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-white/[0.06] flex flex-wrap gap-1.5">
                        {e.parameters.map((p: any, pi: number) => (
                          <span key={pi} className="text-[11px] bg-white/[0.06] text-slate-300 px-2 py-1 rounded-md font-mono">
                            {p.name} <span className="text-slate-500">({p.type})</span>
                          </span>
                        ))}
                      </div>
                    )}
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}

          {/* ═══ EVENTS TO FIX ═══ */}
          {activeTab === 'fix' && (
            <motion.div key="fix" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="h-full flex flex-col gap-4 overflow-y-auto scroll-area pb-2">

              {eventsToFix.length > 0 && (
                <div id="section-fix" className="scroll-mt-4 transition-all">
                  <h3 className="text-xs text-amber-400 uppercase tracking-widest font-semibold mb-3 flex items-center gap-2">
                    <Wrench size={13} /> Events to Fix ({eventsToFix.length})
                  </h3>
                  <div className="space-y-3">
                    {eventsToFix.map((e: any, i: number) => {
                      const methodLabel =
                        e.detectionMethod === 'normalized-match' ? 'Auto-detected' :
                        e.detectionMethod === 'keyword-match' ? 'Keyword match' :
                        e.detectionMethod === 'ai-check' ? 'AI verified' :
                        e.detectionMethod ? 'Detected' : null;
                      const pri = (e.priority || '').toLowerCase();
                      const priClass =
                        pri === 'critical' ? 'bg-red-500/15 text-red-300 border-red-500/25' :
                        pri === 'high' ? 'bg-yellow-500/15 text-yellow-300 border-yellow-500/25' :
                        pri === 'medium' ? 'bg-blue-500/15 text-blue-300 border-blue-500/25' :
                        '';
                      return (
                        <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                          className="bg-white/[0.04] border border-white/[0.08] rounded-xl p-5">
                          <div className="flex items-center gap-2 flex-wrap mb-2">
                            <span className="text-[10px] px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-400 border border-amber-500/20 font-semibold uppercase tracking-wider">{e.fixType || 'Fix'}</span>
                            {methodLabel && (
                              <span className="text-[10px] px-1.5 py-0.5 bg-cyan-500/15 text-cyan-300 rounded">{methodLabel}</span>
                            )}
                            {e.priority && (
                              <span className={`text-[10px] px-1.5 py-0.5 rounded border uppercase tracking-wider font-semibold ml-auto ${priClass}`}>{e.priority}</span>
                            )}
                          </div>
                          {e.recommendedName ? (
                            <div className="flex items-center gap-2 flex-wrap mb-2">
                              <code className="text-sm font-mono bg-red-500/10 text-red-300 border border-red-500/20 px-2 py-1 rounded">{e.currentName}</code>
                              <span className="text-slate-500">{'→'}</span>
                              <code className="text-sm font-mono bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 px-2 py-1 rounded">{e.recommendedName}</code>
                            </div>
                          ) : (
                            <code className="text-sm text-white font-mono font-medium block mb-2">{e.currentName}</code>
                          )}
                          <p className="text-sm text-slate-400 mb-2">{e.currentIssue}</p>
                          <div className="text-sm text-emerald-300 bg-emerald-500/5 border border-emerald-500/10 rounded-lg px-3 py-2">
                            <span className="font-semibold">Fix:</span> {e.recommendedFix || e.fix}
                          </div>
                          {e.detectionReasoning && (
                            <div className="text-[11px] text-slate-500 italic mt-2">
                              <span className="text-slate-400 font-semibold">Why:</span> {e.detectionReasoning}
                            </div>
                          )}
                        </motion.div>
                      );
                    })}
                  </div>
                </div>
              )}

              {eventsToRemove.length > 0 && (
                <div id="section-remove" className="scroll-mt-4 transition-all">
                  <h3 className="text-xs text-red-400 uppercase tracking-widest font-semibold mb-3 flex items-center gap-2">
                    <Trash2 size={13} /> Events to Remove ({eventsToRemove.length})
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {eventsToRemove.map((e: any, i: number) => (
                      <div key={i} className="bg-red-500/5 border border-red-500/15 rounded-xl p-4">
                        <code className="text-sm text-red-300 font-mono font-medium">{e.eventName}</code>
                        <p className="text-sm text-slate-400 mt-1.5">{e.reason}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {/* ═══ QUICK WINS ═══ */}
          {activeTab === 'quickwins' && (
            <motion.div key="quickwins" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="h-full overflow-y-auto scroll-area pb-2 space-y-5">

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {quickWins.map((w: any, i: number) => (
                  <motion.div key={i}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="bg-white/[0.04] border border-white/[0.08] rounded-xl p-5 hover:border-cyan-500/25 transition"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <Zap size={14} className="text-cyan-400 shrink-0" />
                          <h4 className="text-sm text-white font-semibold">{w.action}</h4>
                        </div>
                        <p className="text-sm text-slate-400 leading-relaxed">{w.impact}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-sm text-white font-mono">{w.timeRequired}</div>
                        <div className={`text-xs mt-1.5 px-2.5 py-1 rounded-md font-medium ${
                          w.difficulty === 'Easy' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-yellow-500/15 text-yellow-400'
                        }`}>{w.difficulty}</div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>

              {/* New dimensions */}
              {dimensions.length > 0 && (
                <div id="section-dimensions" className="scroll-mt-4 transition-all">
                  <h3 className="text-xs text-indigo-400 uppercase tracking-widest font-semibold mb-3 flex items-center gap-2">
                    <Layers size={13} /> New Dimensions ({dimensions.length})
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {dimensions.map((d: any, i: number) => (
                      <div key={i} className="bg-indigo-500/5 border border-indigo-500/15 rounded-xl p-4">
                        <div className="flex items-center gap-2 mb-1.5">
                          <code className="text-sm text-indigo-300 font-mono font-medium">{d.name}</code>
                          <span className="text-[11px] bg-white/[0.06] text-slate-400 px-2 py-0.5 rounded-md">{d.scope}</span>
                        </div>
                        <p className="text-sm text-slate-400">{d.description}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {/* ═══ ROADMAP ═══ */}
          {activeTab === 'roadmap' && (
            <motion.div key="roadmap" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="h-full flex flex-col gap-4">
              {roadmap.map((p: any, i: number) => (
                <motion.div key={i}
                  initial={{ opacity: 0, x: -15 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.1 }}
                  className="bg-white/[0.04] border border-white/[0.08] rounded-xl p-5 flex items-start gap-5"
                >
                  <div className="w-12 h-12 rounded-xl bg-purple-500/15 flex items-center justify-center shrink-0">
                    <span className="text-lg font-bold text-purple-400">{p.phase}</span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-base text-white font-semibold">{p.name}</h4>
                      <span className="text-sm text-slate-300 font-mono shrink-0">{p.duration}</span>
                    </div>
                    <p className="text-sm text-slate-400 mb-3 leading-relaxed">{p.rationale}</p>
                    {p.events?.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {p.events.map((ev: string, ei: number) => (
                          <span key={ei} className="text-[11px] bg-purple-500/10 text-purple-300 px-2 py-1 rounded-md font-mono">{ev}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </motion.div>
              ))}
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </div>
  );
}
