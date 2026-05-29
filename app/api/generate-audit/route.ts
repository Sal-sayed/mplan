/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { AUDIT_PROMPT } from '@/lib/audit-prompt';
import { findEventCoverage } from '@/lib/event-equivalence';

let _anthropic: Anthropic | null = null;
function getAnthropic(): Anthropic {
  if (_anthropic) return _anthropic;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY must be set');
  _anthropic = new Anthropic({ apiKey });
  return _anthropic;
}
export const maxDuration = 90;

export async function POST(req: NextRequest) {
  try {
    const { websiteData, score, existingPlan } = await req.json();

    // Pull categorized event buckets from scrape data so Claude sees them as
    // dedicated input — and so it never re-recommends an event already firing
    // or already configured.
    const eventAudit = websiteData?.eventAudit || {};
    const siteType = websiteData?.siteType || 'ecommerce';
    const firingEventsForPrompt = (eventAudit.firingEvents || []).map((e: any) => ({
      eventName: e.eventName,
      source: e.source,
      confidenceSource: e.confidenceSource,
      capturedFromPages: e.capturedFromPages || [],
    }));
    const configuredEventsForPrompt = (eventAudit.configuredEvents || []).map((e: any) => ({
      eventName: e.eventName,
      source: e.source,
      gtmContainer: e.gtmContainer || null,
    }));
    const pagesScannedForPrompt = (eventAudit.pagesScanned || []).map((p: any) => ({
      type: p.type,
      url: p.url,
      eventsFound: p.eventsFound,
      success: p.success,
    }));
    const businessModel = websiteData?.businessModel || {
      primaryType: 'unknown', reasoning: 'Not detected',
      hasOwnCheckout: false, redirectsToRetailers: false, retailers: [],
      hasShoppingCart: false, hasUserAccounts: false, hasLeadForms: false,
    };
    console.log(`[generate-audit] businessModel.primaryType = ${businessModel.primaryType}`);
    if (businessModel.redirectsToRetailers) {
      console.log(`[generate-audit] retailer redirects: ${(businessModel.retailers || []).join(', ') || 'detected via CTA text'}`);
    }

    const message = await getAnthropic().messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 16000,
      messages: [{
        role: 'user',
        content: AUDIT_PROMPT(
          JSON.stringify(websiteData),
          JSON.stringify(score),
          existingPlan ? JSON.stringify(existingPlan) : null,
          {
            siteType,
            firingEvents: firingEventsForPrompt,
            configuredEvents: configuredEventsForPrompt,
            pagesScanned: pagesScannedForPrompt,
            businessModel,
          }
        ),
      }],
    });

    const textBlock = message.content.find((b: any) => b.type === 'text');
    const responseText = textBlock?.type === 'text' ? textBlock.text : '';
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    const audit = jsonMatch ? JSON.parse(jsonMatch[0]) : null;

    if (!audit) throw new Error('Failed to parse audit response');

    // ─── SAFETY FILTER 1: Force real IDs from scrape data ───
    const liveAudit = websiteData?.homepage?.analyticsAudit || {};

    audit.detectedSetup = audit.detectedSetup || {};

    audit.detectedSetup.ga4 = {
      installed: (liveAudit.ga4?.measurementIds || []).length > 0,
      measurementIds: liveAudit.ga4?.measurementIds || [],
      status: (liveAudit.ga4?.measurementIds || []).length > 0
        ? ((liveAudit.eventsCurrentlyFiring || []).filter((e: any) => e.source?.includes('GA4')).length > 0 ? 'Active' : 'Installed but few events firing')
        : 'Not installed',
    };

    audit.detectedSetup.gtm = {
      installed: (liveAudit.gtm?.containerIds || []).length > 0,
      containerIds: liveAudit.gtm?.containerIds || [],
    };

    audit.detectedSetup.universalAnalytics = {
      installed: (liveAudit.ua?.propertyIds || []).length > 0,
      propertyIds: liveAudit.ua?.propertyIds || [],
      warning: (liveAudit.ua?.propertyIds || []).length > 0
        ? 'Universal Analytics was deprecated July 2023 and stopped processing data. Remove or migrate.'
        : null,
    };

    audit.detectedSetup.metaPixel = {
      installed: liveAudit.pixels?.metaPixel?.installed || false,
      ids: liveAudit.pixels?.metaPixel?.ids || [],
    };

    audit.detectedSetup.googleAds = {
      installed: liveAudit.pixels?.googleAdsConversion?.installed || false,
      ids: liveAudit.pixels?.googleAdsConversion?.ids || [],
    };

    // Consent: use new universal detection data if available, fallback to old format
    const cd = liveAudit.consentDetection || {};
    const gcm = cd.googleConsentMode || {};
    audit.detectedSetup.consentMode = {
      enabled: gcm.active || liveAudit.consent?.googleConsentMode || false,
      cmpDetected: cd.cmp || liveAudit.consent?.cmpDetected || null,
      issue: !(gcm.active || liveAudit.consent?.googleConsentMode)
        ? (cd.cmp || liveAudit.consent?.cmpDetected
          ? `${cd.cmp || liveAudit.consent.cmpDetected} detected but Google Consent Mode is not integrated`
          : 'No consent mode detected')
        : null,
    };

    // Attach full consent detection data for UI
    audit.consentDetection = {
      bannerDetected: cd.bannerDetected || false,
      autoAccepted: cd.autoAccepted || false,
      cmp: cd.cmp || null,
      detectionMethod: cd.detectionMethod || null,
      bannerElement: cd.bannerElement || null,
      googleConsentMode: gcm,
    };

    // ─── SAFETY FILTER 2: Force full firing events list from scrape ───
    const liveEvents = liveAudit.eventsCurrentlyFiring || [];
    const uploadedEventNames = (existingPlan?.detectedEvents || []).map((e: string) => e.toLowerCase().trim());

    audit.currentlyFiringEvents = liveEvents.map((evt: any) => ({
      eventName: evt.eventName,
      source: evt.source || evt.method || 'Detected',
      isStandard: evt.isStandard || false,
      isDocumented: uploadedEventNames.length > 0
        ? uploadedEventNames.some((d: string) => d === evt.eventName?.toLowerCase().trim() || d.replace(/_/g, '') === evt.eventName?.toLowerCase().trim().replace(/_/g, ''))
        : null,
      notes: evt.notes || evt.method || '',
    }));

    // ─── SAFETY FILTER 3: Never recommend already-firing OR configured events ───
    const allKnownEvents = new Set([
      ...(audit.currentlyFiringEvents || []).map((e: any) => e.eventName?.toLowerCase().trim()),
      ...(liveAudit.eventsConfigured || []).map((e: any) => e.eventName?.toLowerCase().trim()),
      ...(liveAudit.eventsFiring || []).map((e: any) => e.eventName?.toLowerCase().trim()),
      ...(liveAudit.eventsCurrentlyFiring || []).map((e: any) => e.eventName?.toLowerCase().trim()),
    ].filter(Boolean));

    if (audit.eventsToAdd) {
      audit.eventsToAdd = audit.eventsToAdd.filter((evt: any) => {
        const name = evt.eventName?.toLowerCase().trim();
        const normalized = name?.replace(/^(event_|ga_event_|gtm_event_|track_)/, '');
        for (const known of allKnownEvents) {
          const knownNorm = known?.replace(/^(event_|ga_event_|gtm_event_|track_)/, '');
          if (name === known || normalized === knownNorm) return false;
        }
        return true;
      });
    }

    // ─── SAFETY FILTER 3.5: UNIVERSAL EQUIVALENCE — catch custom-named events ───
    // After the cheap exact-name dedupe above, some recommendations remain
    // because the site uses custom names (e.g. `event_buy_now` instead of
    // `add_to_cart`). The 3-layer equivalence engine (normalize → keyword →
    // AI fallback) catches these and converts them to rename suggestions.
    const detectedNamePool = Array.from(new Set<string>([
      ...(eventAudit.firingEvents || []).map((e: any) => e.eventName).filter(Boolean),
      ...(eventAudit.configuredEvents || []).map((e: any) => e.eventName).filter(Boolean),
      ...(liveAudit.eventsConfigured || []).map((e: any) => e.eventName).filter(Boolean),
      ...(liveAudit.eventsFiring || []).map((e: any) => e.eventName).filter(Boolean),
      ...(liveAudit.eventsCurrentlyFiring || []).map((e: any) => e.eventName).filter(Boolean),
    ]));

    console.log(`[universal-filter] Coverage check against ${detectedNamePool.length} detected event names`);

    const filteredEventsToAdd: any[] = [];
    const renameRecs: any[] = [];

    for (const evt of (audit.eventsToAdd || [])) {
      const candidateName = evt.eventName;
      if (!candidateName) continue;
      const description = evt.rationale || evt.whyMissing || evt.estimatedImpact || '';

      try {
        const coverage = await findEventCoverage(candidateName, description, detectedNamePool);
        if (coverage.isCovered && coverage.coveredByEvent) {
          console.log(`[universal-filter] ✗ '${candidateName}' covered by '${coverage.coveredByEvent}' (${coverage.method})`);
          renameRecs.push({
            currentName: coverage.coveredByEvent,
            recommendedName: candidateName,
            currentIssue: `Custom event '${coverage.coveredByEvent}' is firing, but uses a non-standard name. GA4 e-commerce reporting expects '${candidateName}'.`,
            recommendedFix: `Rename '${coverage.coveredByEvent}' to '${candidateName}' so GA4 e-commerce reports, enhanced measurement, and remarketing audiences work correctly.`,
            fixType: 'Rename',
            priority: evt.priority || 'Medium',
            detectionMethod: coverage.method,
            detectionReasoning: coverage.reasoning,
            ga4StandardEquivalent: candidateName,
          });
        } else {
          filteredEventsToAdd.push(evt);
        }
      } catch (err) {
        // Engine itself errored — keep the candidate to be safe.
        console.warn(`[universal-filter] coverage check threw for '${candidateName}':`, (err as Error)?.message);
        filteredEventsToAdd.push(evt);
      }
    }

    // Also run universal filtering on missingEvents (the 3rd-bucket recommendations).
    const filteredMissingEvents: any[] = [];
    for (const evt of (audit.missingEvents || [])) {
      const candidateName = evt.eventName;
      if (!candidateName) continue;
      try {
        const coverage = await findEventCoverage(candidateName, evt.whyMissing || '', detectedNamePool);
        if (coverage.isCovered && coverage.coveredByEvent) {
          console.log(`[universal-filter] ✗ missing '${candidateName}' covered by '${coverage.coveredByEvent}' (${coverage.method})`);
          // Don't double-add to renameRecs if it was already added from eventsToAdd
          if (!renameRecs.some(r => r.currentName === coverage.coveredByEvent && r.recommendedName === candidateName)) {
            renameRecs.push({
              currentName: coverage.coveredByEvent,
              recommendedName: candidateName,
              currentIssue: `Custom event '${coverage.coveredByEvent}' fires the user behavior, but GA4 reporting expects '${candidateName}'.`,
              recommendedFix: `Rename '${coverage.coveredByEvent}' to '${candidateName}' for compatibility with GA4 standard reports.`,
              fixType: 'Rename',
              priority: evt.priority || 'Medium',
              detectionMethod: coverage.method,
              detectionReasoning: coverage.reasoning,
              ga4StandardEquivalent: candidateName,
            });
          }
        } else {
          filteredMissingEvents.push(evt);
        }
      } catch (err) {
        console.warn(`[universal-filter] coverage check threw for missing '${candidateName}':`, (err as Error)?.message);
        filteredMissingEvents.push(evt);
      }
    }

    const removedFromAdd = (audit.eventsToAdd || []).length - filteredEventsToAdd.length;
    const removedFromMissing = (audit.missingEvents || []).length - filteredMissingEvents.length;
    console.log(`[universal-filter] Removed ${removedFromAdd + removedFromMissing} false positives (${removedFromAdd} eventsToAdd + ${removedFromMissing} missingEvents) → ${renameRecs.length} rename recommendations`);

    audit.eventsToAdd = filteredEventsToAdd;
    audit.missingEvents = filteredMissingEvents;
    audit.eventsToFix = [...(audit.eventsToFix || []), ...renameRecs];

    // ─── SAFETY FILTER 6: BUSINESS-MODEL GUARDRAIL ───
    // Even if Claude misclassifies, this strips events the business model
    // physically cannot host (e.g. add_to_cart on a brand catalog that
    // redirects to Amazon). Acts on BOTH eventsToAdd and missingEvents.
    const INVALID_BY_MODEL: Record<string, string[]> = {
      brand_catalog_with_retailers: [
        'add_to_cart', 'remove_from_cart', 'view_cart', 'begin_checkout',
        'add_payment_info', 'add_shipping_info', 'purchase', 'refund',
      ],
      lead_generation: [
        'add_to_cart', 'remove_from_cart', 'view_cart', 'begin_checkout',
        'add_payment_info', 'add_shipping_info', 'purchase', 'refund',
        'view_item', 'view_item_list', 'select_item',
      ],
      saas: [
        'add_to_cart', 'remove_from_cart', 'view_cart', 'begin_checkout',
        'add_payment_info', 'add_shipping_info', 'purchase', 'refund',
        'view_item', 'view_item_list',
      ],
      content_publisher: [
        'add_to_cart', 'remove_from_cart', 'view_cart', 'begin_checkout',
        'add_payment_info', 'add_shipping_info', 'purchase', 'refund',
        'view_item', 'view_item_list', 'select_item',
      ],
      service_booking: [
        'add_to_cart', 'remove_from_cart', 'view_cart',
        'view_item_list',
      ],
      informational: [
        'add_to_cart', 'remove_from_cart', 'view_cart', 'begin_checkout',
        'add_payment_info', 'add_shipping_info', 'purchase', 'refund',
        'view_item', 'view_item_list', 'select_item', 'generate_lead',
      ],
    };
    const invalid = new Set((INVALID_BY_MODEL[businessModel.primaryType] || []).map(n => n.toLowerCase().trim()));
    if (invalid.size > 0) {
      const beforeAdd = audit.eventsToAdd?.length || 0;
      const beforeMissing = audit.missingEvents?.length || 0;
      audit.eventsToAdd = (audit.eventsToAdd || []).filter((evt: any) => {
        const name = (evt?.eventName || '').toLowerCase().trim();
        if (invalid.has(name)) {
          console.log(`🚫 Business-model filter: removed '${evt.eventName}' from eventsToAdd — invalid for ${businessModel.primaryType}`);
          return false;
        }
        return true;
      });
      audit.missingEvents = (audit.missingEvents || []).filter((evt: any) => {
        const name = (evt?.eventName || '').toLowerCase().trim();
        if (invalid.has(name)) {
          console.log(`🚫 Business-model filter: removed '${evt.eventName}' from missingEvents — invalid for ${businessModel.primaryType}`);
          return false;
        }
        return true;
      });
      const removedAdd = beforeAdd - audit.eventsToAdd.length;
      const removedMissing = beforeMissing - audit.missingEvents.length;
      if (removedAdd + removedMissing > 0) {
        console.log(`🛡 Business-model filter removed ${removedAdd + removedMissing} impossible events (${removedAdd} eventsToAdd + ${removedMissing} missingEvents) for model '${businessModel.primaryType}'`);
      }
    }

    // Surface businessModel on the audit response so the UI can display it.
    audit.businessModel = businessModel;

    // Also inject configured vs firing into the audit response
    audit.eventsConfigured = (liveAudit.eventsConfigured || []).map((e: any) => ({
      eventName: e.eventName, source: e.source, method: e.method,
      status: 'configured', notes: e.notes || 'Found in GTM container or HTML marker',
    }));
    audit.eventsFiring = (liveAudit.eventsFiring || []).map((e: any) => ({
      eventName: e.eventName, source: e.source, method: e.method,
      status: 'firing', notes: e.notes || 'Captured during live scraping',
    }));

    const firingNames = new Set(audit.currentlyFiringEvents.map((e: any) => e.eventName?.toLowerCase().trim()));

    // ─── SAFETY FILTER 4: Compute planVsReality server-side if upload provided ───
    if (existingPlan?.detectedEvents && uploadedEventNames.length > 0) {
      audit.planVsReality = audit.planVsReality || {};

      // Documented but not firing
      const claudeDocMissing = new Set(
        (audit.planVsReality.documentedButNotFiring || []).map((e: any) => e.eventName?.toLowerCase().trim())
      );

      const missingFromPlan = uploadedEventNames.filter((docName: string) =>
        !firingNames.has(docName) && !claudeDocMissing.has(docName)
      );

      audit.planVsReality.documentedButNotFiring = [
        ...(audit.planVsReality.documentedButNotFiring || []),
        ...missingFromPlan.map((name: string) => ({
          eventName: name,
          documentedIn: 'Uploaded plan',
          severity: 'High',
          businessImpact: 'Event documented in your plan but not firing on the live site',
        })),
      ];

      // Firing but not documented
      const firingButNotDoc = audit.currentlyFiringEvents
        .filter((e: any) => !e.isStandard && !e.isDocumented)
        .map((e: any) => e.eventName);

      const claudeFiringUndoc = new Set(
        (audit.planVsReality.firingButNotDocumented || []).map((e: any) => e.eventName?.toLowerCase().trim())
      );

      const extraUndoc = firingButNotDoc.filter((name: string) => !claudeFiringUndoc.has(name?.toLowerCase().trim()));

      audit.planVsReality.firingButNotDocumented = [
        ...(audit.planVsReality.firingButNotDocumented || []),
        ...extraUndoc.map((name: string) => ({
          eventName: name,
          recommendation: 'Document this event in your plan, or remove from tracking if unnecessary',
        })),
      ];
    }

    // ─── Map old field names for backward compatibility with UI ───
    audit.websiteInfo = audit.websiteInfo || {};
    audit.currentState = {
      summary: audit.executiveSummary,
      detectedTrackingIds: {
        ga4: audit.detectedSetup.ga4.measurementIds,
        gtm: audit.detectedSetup.gtm.containerIds,
        ua: audit.detectedSetup.universalAnalytics.propertyIds,
        metaPixel: audit.detectedSetup.metaPixel.ids,
        googleAds: audit.detectedSetup.googleAds.ids,
      },
      eventsCurrentlyFiring: audit.currentlyFiringEvents,
      consentMode: audit.detectedSetup.consentMode,
      criticalIssues: audit.criticalIssues || [],
    };

    // Attach verification data from scrape for UI display
    audit.verification = liveAudit.verification || null;

    // ─── CATEGORIZED EVENT BUCKETS (3-section view) ───
    // Pass through what scraper already computed, then sanitize missingEvents.
    audit.siteType = siteType;
    audit.eventAudit = {
      detectionMethod: eventAudit.detectionMethod || 'Playwright only',
      trackingSpy: eventAudit.trackingSpy || { installed: false, rawHitCount: 0, counters: { fetch: 0, xhr: 0, beacon: 0, image: 0, dataLayer: 0 } },
      firingEvents: eventAudit.firingEvents || [],
      configuredEvents: eventAudit.configuredEvents || [],
      pagesScanned: eventAudit.pagesScanned || [],
      userSimulation: eventAudit.userSimulation || null,
    };

    // ─── SAFETY FILTER 5: Strip any missingEvents that duplicate firing/configured ───
    const norm = (s: string) => (s || '').toLowerCase().trim().replace(/^(event_|ga_event_|gtm_event_|track_)/, '');
    const alreadyKnown = new Set<string>([
      ...(audit.eventAudit.firingEvents || []).map((e: any) => norm(e.eventName)),
      ...(audit.eventAudit.configuredEvents || []).map((e: any) => norm(e.eventName)),
      ...(audit.currentlyFiringEvents || []).map((e: any) => norm(e.eventName)),
    ].filter(Boolean));

    if (Array.isArray(audit.missingEvents)) {
      const before = audit.missingEvents.length;
      audit.missingEvents = audit.missingEvents.filter((evt: any) => {
        const n = norm(evt?.eventName);
        return n && !alreadyKnown.has(n);
      });
      // Stamp sequential IDs if Claude didn't (or if filtering created gaps)
      audit.missingEvents.forEach((evt: any, i: number) => {
        if (!evt.id) evt.id = `MISS_${i + 1}`;
      });
      console.log(`[generate-audit] missingEvents: ${before} → ${audit.missingEvents.length} after dedupe vs firing+configured`);
    } else {
      audit.missingEvents = [];
    }

    return NextResponse.json({ success: true, audit });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Audit generation failed';
    console.error('Audit generation error:', err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
