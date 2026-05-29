/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { deepScrapeWebsite, type SiteType } from '@/lib/scraper';
import { auditExistingSite, type AuditResult, type GA4Event, type PixelEvent, type GTMEvent } from '@/lib/existing-site-auditor';

export const maxDuration = 60;

type ScrapeMode = 'new' | 'existing';

const VALID_SITE_TYPES: ReadonlyArray<SiteType> = ['ecommerce', 'lead-gen', 'saas', 'content', 'marketplace', 'other'];

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { url } = body;
    const rawMode = body?.mode;
    const mode: ScrapeMode = rawMode === 'existing' || rawMode === 'audit' ? 'existing' : 'new';
    const rawSiteType = body?.siteType;
    const siteType: SiteType = VALID_SITE_TYPES.includes(rawSiteType) ? rawSiteType : 'ecommerce';

    if (!url || typeof url !== 'string') {
      return NextResponse.json(
        { success: false, error: 'URL is required' },
        { status: 400 }
      );
    }

    try {
      new URL(url);
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid URL format' },
        { status: 400 }
      );
    }

    // ───────────────────────────────────────────────────────────
    // EXISTING-WEBSITE PATH — clean 4-step auditor
    // ───────────────────────────────────────────────────────────
    if (mode === 'existing') {
      const audit = await auditExistingSite(url);
      return NextResponse.json({ success: true, data: shapeAuditForDownstream(audit, siteType) });
    }

    // ───────────────────────────────────────────────────────────
    // NEW-WEBSITE PATH — unchanged (deepScrapeWebsite returns site structure only)
    // ───────────────────────────────────────────────────────────
    const data = await deepScrapeWebsite(url, mode, siteType);
    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Failed to analyze website';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

// ───────────────────────────────────────────────────────────
// Shape the new auditor's clean output into a hybrid response that has:
//   • the NEW source-separated event lists (recipe shape) on `eventAudit.*`
//   • the LEGACY shape on `homepage.analyticsAudit.*` so the existing
//     /api/generate-audit safety filters + Excel generator keep working
//
// We're not editorialising the data — every field is derived from the
// auditor's structured output, with no Claude-generated narrative removed.
// ───────────────────────────────────────────────────────────
function shapeAuditForDownstream(audit: AuditResult, siteType: SiteType) {
  const homepageScanned = audit.pagesScanned.find(p => p.pageType === 'homepage');

  // Build the 3-bucket categorization expected by the existing UI/prompt:
  //   firingEvents       = everything actually captured (GA4 + Meta + other)
  //   configuredEvents   = GTM container events NOT in the firing set
  const firingEvents = [
    ...audit.ga4Events.map(e => ({
      eventName: e.eventName,
      source: 'GA4 (Measurement Protocol)',
      vendor: 'GA4',
      parameters: e.parameters,
      measurementId: e.measurementId,
      isStandard: e.isStandardEvent,
      confidenceSource: 'Tracking Spy (verified)',
      capturedFromPages: e.capturedFromPages,
      category: 'firing' as const,
    })),
    ...audit.metaPixelEvents.map(e => ({
      eventName: e.eventName,
      source: 'Meta Pixel',
      vendor: 'MetaPixel',
      parameters: e.parameters,
      pixelId: e.pixelId,
      confidenceSource: 'Tracking Spy (verified)',
      capturedFromPages: e.capturedFromPages,
      category: 'firing' as const,
    })),
    ...audit.otherPixelEvents.map(e => ({
      eventName: e.eventName,
      source: e.source,
      vendor: e.source,
      parameters: e.parameters,
      pixelId: e.pixelId,
      confidenceSource: 'Tracking Spy (verified)',
      capturedFromPages: e.capturedFromPages,
      category: 'firing' as const,
    })),
  ];
  const firingNamesLower = new Set(firingEvents.map(e => e.eventName.toLowerCase().trim()));
  const configuredEvents = audit.gtmContainerEvents
    .filter(e => !firingNamesLower.has(e.eventName.toLowerCase().trim()))
    .map(e => ({
      eventName: e.eventName,
      source: 'GTM Container Config',
      vendor: 'GTM',
      gtmContainer: e.gtmContainer,
      tagType: e.tagType,
      trigger: e.trigger,
      category: 'configured-not-firing' as const,
    }));

  // Legacy analyticsAudit shape — downstream code reads these paths.
  const analyticsAudit: any = {
    ga4: {
      installed: audit.measurementIds.ga4.length > 0,
      measurementId: audit.measurementIds.ga4[0] || null,
      measurementIds: audit.measurementIds.ga4,
      customEventsFound: Array.from(new Set(audit.ga4Events.filter(e => !e.isStandardEvent).map(e => e.eventName))),
      allEventsDetected: Array.from(new Set(audit.ga4Events.map(e => e.eventName))),
    },
    ua: {
      installed: audit.measurementIds.ua.length > 0,
      trackingId: audit.measurementIds.ua[0] || null,
      propertyIds: audit.measurementIds.ua,
    },
    gtm: {
      installed: audit.measurementIds.gtm.length > 0,
      containerId: audit.measurementIds.gtm[0] || null,
      containerIds: audit.measurementIds.gtm,
    },
    pixels: {
      metaPixel: { installed: audit.measurementIds.metaPixel.length > 0, ids: audit.measurementIds.metaPixel },
      tiktokPixel: { installed: audit.measurementIds.tiktokPixel.length > 0, ids: audit.measurementIds.tiktokPixel },
      linkedinInsight: { installed: audit.measurementIds.linkedinInsight.length > 0, ids: audit.measurementIds.linkedinInsight },
      googleAdsConversion: { installed: audit.measurementIds.googleAds.length > 0, ids: audit.measurementIds.googleAds },
      bingUET: { installed: audit.measurementIds.bingUet.length > 0, ids: audit.measurementIds.bingUet },
    },
    consentDetection: {
      bannerDetected: audit.consentResult.detected,
      autoAccepted: audit.consentResult.accepted,
      cmp: audit.consentResult.cmp,
    },
    eventsCurrentlyFiring: firingEvents,
    eventsFiring: firingEvents,
    eventsConfigured: configuredEvents,
  };

  // eventAudit carries BOTH the source-separated lists and the 3-bucket view
  // so the new UI sections and the existing Event Audit tab both work.
  const eventAudit = {
    detectionMethod: 'Tracking Spy + Playwright (4-step auditor)' as const,
    trackingSpy: { installed: true, rawHitCount: 0, counters: { fetch: 0, xhr: 0, beacon: 0, image: 0, dataLayer: 0 } },
    firingEvents,
    configuredEvents,
    pagesScanned: audit.pagesScanned,
    userSimulation: {
      pagesSimulated: audit.pagesScanned.filter(p => p.loadedSuccessfully).length,
      totalInteractions: audit.interactionStats.totalActions,
      totalDurationMs: audit.durationMs,
      totals: {
        eventMarkersTriggered: audit.interactionStats.eventMarkersTriggered,
        ctasClicked: audit.interactionStats.buttonsClicked,
        productsClicked: audit.interactionStats.productsClicked,
        elementsClicked: 0,
        linksClicked: audit.interactionStats.navLinksClicked,
        scrolls: audit.interactionStats.scrollsPerformed,
        hovers: 0,
        formInteractions: audit.interactionStats.formsInteracted,
        searchesPerformed: audit.interactionStats.searchesPerformed,
        mediaTriggered: 0,
      },
    },
    // ─── New source-separated lists per the 4-step recipe ───
    gtmContainerEvents: audit.gtmContainerEvents as GTMEvent[],
    ga4Events: audit.ga4Events as GA4Event[],
    metaPixelEvents: audit.metaPixelEvents as PixelEvent[],
    otherPixelEvents: audit.otherPixelEvents as PixelEvent[],
    interactionStats: audit.interactionStats,
  };

  return {
    siteType,
    submittedUrl: audit.submittedUrl,
    homepage: {
      url: audit.submittedUrl,
      title: homepageScanned?.title || '',
      // Minimal structural fields so generate-audit + the report header don't crash on missing data
      meta: { title: homepageScanned?.title || '', description: '', lang: 'en' },
      headings: { h1: [], h2: [], h3: [] },
      buttons: [],
      links: { nav: [], footer: [], social: [], external: 0, internal: 0 },
      forms: [],
      ecommerce: {},
      pricing: {},
      media: {},
      engagement: {},
      socialProof: {},
      tech: {},
      ldJson: [],
      bodyText: '',
      analyticsAudit,
    },
    subPages: {},
    pagesScraped: audit.totalPagesScanned,
    measurementIds: audit.measurementIds,
    totalPagesScanned: audit.totalPagesScanned,
    auditDurationMs: audit.durationMs,
    eventAudit,
    businessModel: audit.businessModel,
  };
}
