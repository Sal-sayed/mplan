/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';

interface DimensionScore {
  name: string;
  icon: string;
  score: number;
  maxScore: number;
  status: 'excellent' | 'good' | 'fair' | 'poor' | 'missing';
  findings: string[];
  fixes: { priority: 'high' | 'medium' | 'low'; action: string; impact: string }[];
}

export async function POST(req: NextRequest) {
  try {
    const { audit, siteFeatures } = await req.json();
    const dimensions: DimensionScore[] = [];

    // 1. CORE ANALYTICS (15 pts)
    let core = 0;
    const coreFindings: string[] = [];
    const coreFixes: any[] = [];
    if (audit.ga4?.installed) { core += 8; coreFindings.push(`GA4 installed (${audit.ga4.measurementId || 'ID hidden'})`); }
    else coreFixes.push({ priority: 'high', action: 'Install Google Analytics 4', impact: '+8 points, enables all event tracking' });
    if (audit.gtm?.installed) { core += 5; coreFindings.push(`GTM container detected (${audit.gtm.containerId})`); }
    else coreFixes.push({ priority: 'high', action: 'Deploy Google Tag Manager', impact: '+5 points, centralizes tag management' });
    if (audit.gtm?.serverSideGTM) { core += 2; coreFindings.push('Server-side GTM detected (advanced setup)'); }
    if (audit.ua?.installed) { coreFindings.push(`Warning: Universal Analytics still present (${audit.ua.trackingId}) - deprecated July 2023`); coreFixes.push({ priority: 'high', action: 'Remove deprecated UA tags', impact: 'Clean up legacy code' }); }
    dimensions.push({ name: 'Core analytics', icon: 'BarChart3', score: Math.min(core, 15), maxScore: 15, status: core >= 13 ? 'excellent' : core >= 8 ? 'good' : core >= 4 ? 'fair' : core > 0 ? 'poor' : 'missing', findings: coreFindings, fixes: coreFixes });

    // 2. CONVERSION TRACKING (15 pts)
    let conv = 0;
    const convFindings: string[] = [];
    const convFixes: any[] = [];
    const customEvents = audit.ga4?.customEventsFound || [];
    const conversionKeywords = ['purchase', 'sign_up', 'signup', 'lead', 'form_submit', 'subscribe', 'demo', 'contact', 'begin_checkout', 'add_to_cart'];
    const conversionsTracked = customEvents.filter((e: string) => conversionKeywords.some(k => e.toLowerCase().includes(k)));
    conv += Math.min(conversionsTracked.length * 3, 12);
    if (conversionsTracked.length > 0) convFindings.push(`${conversionsTracked.length} conversion event(s): ${conversionsTracked.join(', ')}`);
    else convFixes.push({ priority: 'high', action: 'No conversion events detected - add purchase/sign_up/lead events', impact: '+12 points, unlocks attribution & ROAS' });
    if (audit.pixels?.googleAdsConversion) { conv += 3; convFindings.push('Google Ads conversion tag present'); }
    else if (siteFeatures?.hasEcommerce || siteFeatures?.hasSignup) convFixes.push({ priority: 'medium', action: 'Add Google Ads conversion tracking', impact: '+3 points' });
    dimensions.push({ name: 'Conversion tracking', icon: 'Target', score: Math.min(conv, 15), maxScore: 15, status: conv >= 13 ? 'excellent' : conv >= 8 ? 'good' : conv >= 4 ? 'fair' : conv > 0 ? 'poor' : 'missing', findings: convFindings, fixes: convFixes });

    // 3. EVENT COVERAGE (15 pts)
    let evt = 0;
    const evtFindings: string[] = [];
    const evtFixes: any[] = [];
    const buttonCount = siteFeatures?.buttonCount || 0;
    const eventCount = customEvents.length;
    const coverageRatio = buttonCount > 0 ? eventCount / buttonCount : 0;
    if (coverageRatio >= 0.4) { evt += 10; evtFindings.push(`Strong event coverage (${eventCount} events for ${buttonCount} interactive elements)`); }
    else if (coverageRatio >= 0.2) { evt += 6; evtFindings.push(`Moderate coverage (${eventCount} events for ${buttonCount} elements)`); evtFixes.push({ priority: 'medium', action: 'Track more button interactions', impact: '+4 points' }); }
    else if (eventCount > 0) { evt += 3; evtFindings.push(`Low coverage: only ${eventCount} events tracked`); evtFixes.push({ priority: 'high', action: `Add tracking for remaining ${buttonCount - eventCount}+ interactive elements`, impact: '+7 points' }); }
    else evtFixes.push({ priority: 'high', action: 'No custom events found - implement button/CTA tracking', impact: '+10 points' });
    if (siteFeatures?.formCount > 0 && customEvents.some((e: string) => /form|submit/i.test(e))) { evt += 3; evtFindings.push('Form interactions tracked'); }
    else if (siteFeatures?.formCount > 0) evtFixes.push({ priority: 'high', action: `${siteFeatures.formCount} form(s) with no submission tracking`, impact: '+3 points' });
    if (customEvents.some((e: string) => /scroll|engagement|video|click/i.test(e))) { evt += 2; evtFindings.push('Engagement events tracked'); }
    dimensions.push({ name: 'Event coverage', icon: 'MousePointerClick', score: Math.min(evt, 15), maxScore: 15, status: evt >= 13 ? 'excellent' : evt >= 8 ? 'good' : evt >= 4 ? 'fair' : evt > 0 ? 'poor' : 'missing', findings: evtFindings, fixes: evtFixes });

    // 4. DATA LAYER QUALITY (10 pts)
    let dl = 0;
    const dlFindings: string[] = [];
    const dlFixes: any[] = [];
    if (audit.dataLayer?.exists) { dl += 4; dlFindings.push(`dataLayer present with ${audit.dataLayer.pushCount} pushes`); }
    else dlFixes.push({ priority: 'high', action: 'Implement window.dataLayer for GTM-managed events', impact: '+4 points' });
    if (audit.dataLayer?.pushCount >= 5) dl += 2;
    if (audit.dataLayer?.hasEcommerceObject) { dl += 2; dlFindings.push('Ecommerce dataLayer object found'); }
    else if (siteFeatures?.hasEcommerce) dlFixes.push({ priority: 'high', action: 'Add GA4 ecommerce dataLayer schema', impact: '+2 points' });
    if (audit.dataLayer?.namingConvention === 'snake_case') { dl += 2; dlFindings.push('snake_case naming (GA4 standard)'); }
    else if (audit.dataLayer?.namingConvention === 'camelCase') dlFixes.push({ priority: 'medium', action: 'Convert dataLayer keys to snake_case', impact: '+2 points' });
    dimensions.push({ name: 'Data layer quality', icon: 'Database', score: Math.min(dl, 10), maxScore: 10, status: dl >= 9 ? 'excellent' : dl >= 6 ? 'good' : dl >= 3 ? 'fair' : dl > 0 ? 'poor' : 'missing', findings: dlFindings, fixes: dlFixes });

    // 5. PRIVACY & CONSENT (10 pts)
    let priv = 0;
    const privFindings: string[] = [];
    const privFixes: any[] = [];
    if (audit.consent?.cmpDetected) { priv += 4; privFindings.push(`Consent platform: ${audit.consent.cmpDetected}`); }
    else if (audit.consent?.hasCookieBanner) { priv += 2; privFindings.push('Basic cookie banner found'); privFixes.push({ priority: 'medium', action: 'Upgrade to certified CMP', impact: '+2 points' }); }
    else privFixes.push({ priority: 'high', action: 'No consent banner detected', impact: '+4 points, legal compliance' });
    if (audit.consent?.googleConsentMode) { priv += 3; privFindings.push('Google Consent Mode active'); }
    else privFixes.push({ priority: 'high', action: 'Implement Google Consent Mode', impact: '+3 points' });
    if (audit.consent?.consentModeV2) { priv += 3; privFindings.push('Consent Mode v2 (EEA compliant)'); }
    else if (audit.consent?.googleConsentMode) privFixes.push({ priority: 'high', action: 'Upgrade to Consent Mode v2', impact: '+3 points' });
    dimensions.push({ name: 'Privacy & consent', icon: 'ShieldCheck', score: Math.min(priv, 10), maxScore: 10, status: priv >= 9 ? 'excellent' : priv >= 6 ? 'good' : priv >= 3 ? 'fair' : priv > 0 ? 'poor' : 'missing', findings: privFindings, fixes: privFixes });

    // 6. PERFORMANCE (10 pts)
    let perf = 0;
    const perfFindings: string[] = [];
    const perfFixes: any[] = [];
    const asyncRatio = audit.performance?.totalScripts > 0 ? (audit.performance.asyncScripts + audit.performance.deferScripts) / audit.performance.totalScripts : 0;
    if (asyncRatio >= 0.7) { perf += 4; perfFindings.push(`${Math.round(asyncRatio * 100)}% of scripts load async/defer`); }
    else if (audit.performance?.totalScripts > 0) perfFixes.push({ priority: 'medium', action: 'Add async/defer to analytics scripts', impact: '+4 points' });
    if ((audit.performance?.headScripts || 0) <= 3) perf += 2;
    else perfFixes.push({ priority: 'low', action: `${audit.performance.headScripts} scripts in <head> - move non-critical`, impact: '+2 points' });
    if (audit.tagsFiring?.gtmLoaded) { perf += 2; perfFindings.push('GTM loaded successfully'); }
    if (audit.gtm?.serverSideGTM) { perf += 2; perfFindings.push('Server-side GTM reduces client load'); }
    dimensions.push({ name: 'Performance', icon: 'Gauge', score: Math.min(perf, 10), maxScore: 10, status: perf >= 9 ? 'excellent' : perf >= 6 ? 'good' : perf >= 3 ? 'fair' : 'poor', findings: perfFindings, fixes: perfFixes });

    // 7. MARKETING PIXELS (10 pts)
    let pix = 0;
    const pixFindings: string[] = [];
    const pixFixes: any[] = [];
    const pixelList = [
      { key: 'metaPixel', name: 'Meta Pixel', pts: 3 },
      { key: 'linkedinInsight', name: 'LinkedIn Insight', pts: 2 },
      { key: 'tiktokPixel', name: 'TikTok Pixel', pts: 1 },
      { key: 'twitterPixel', name: 'X/Twitter Pixel', pts: 1 },
      { key: 'pinterestTag', name: 'Pinterest Tag', pts: 1 },
      { key: 'bingUET', name: 'Microsoft UET', pts: 1 },
      { key: 'redditPixel', name: 'Reddit Pixel', pts: 1 },
    ];
    pixelList.forEach(p => {
      if (audit.pixels?.[p.key]) { pix += p.pts; pixFindings.push(`${p.name} installed`); }
    });
    if (pix === 0) pixFixes.push({ priority: 'medium', action: 'No marketing pixels detected - add Meta Pixel at minimum', impact: '+3 points' });
    dimensions.push({ name: 'Marketing pixels', icon: 'Share2', score: Math.min(pix, 10), maxScore: 10, status: pix >= 9 ? 'excellent' : pix >= 5 ? 'good' : pix >= 2 ? 'fair' : pix > 0 ? 'poor' : 'missing', findings: pixFindings, fixes: pixFixes });

    // 8. NAMING HYGIENE (5 pts)
    let naming = 0;
    const nameFindings: string[] = [];
    const nameFixes: any[] = [];
    const snakeCaseEvents = customEvents.filter((e: string) => /^[a-z]+(_[a-z]+)*$/.test(e));
    const snakeRatio = customEvents.length > 0 ? snakeCaseEvents.length / customEvents.length : 0;
    if (snakeRatio === 1 && customEvents.length > 0) { naming += 5; nameFindings.push('All events use snake_case'); }
    else if (snakeRatio >= 0.7) { naming += 3; nameFindings.push(`${Math.round(snakeRatio * 100)}% use snake_case`); nameFixes.push({ priority: 'low', action: 'Rename remaining events to snake_case', impact: '+2 points' }); }
    else if (customEvents.length > 0) { naming += 1; nameFixes.push({ priority: 'medium', action: 'Standardize event names to snake_case', impact: '+4 points' }); }
    dimensions.push({ name: 'Naming hygiene', icon: 'Tag', score: naming, maxScore: 5, status: naming === 5 ? 'excellent' : naming >= 3 ? 'good' : naming > 0 ? 'fair' : 'missing', findings: nameFindings, fixes: nameFixes });

    // FINAL SCORE
    const totalScore = dimensions.reduce((sum, d) => sum + d.score, 0);
    const grade = totalScore >= 90 ? 'A+' : totalScore >= 80 ? 'A' : totalScore >= 70 ? 'B' : totalScore >= 60 ? 'C' : totalScore >= 50 ? 'D' : 'F';
    const verdict =
      totalScore >= 90 ? 'World-class analytics setup. Maintain and optimize.' :
      totalScore >= 75 ? 'Solid foundation. A few high-impact fixes will push you to excellence.' :
      totalScore >= 60 ? 'Functional but leaking insights. Critical gaps need addressing.' :
      totalScore >= 40 ? 'Major blind spots. You\'re making decisions on incomplete data.' :
      'Minimal tracking in place. Implement the full measurement plan immediately.';

    const allFixes = dimensions.flatMap(d => d.fixes.map(f => ({ ...f, dimension: d.name })));
    const topFixes = [
      ...allFixes.filter(f => f.priority === 'high'),
      ...allFixes.filter(f => f.priority === 'medium'),
      ...allFixes.filter(f => f.priority === 'low'),
    ].slice(0, 6);

    return NextResponse.json({
      success: true,
      score: {
        total: totalScore,
        maxTotal: 100,
        grade,
        verdict,
        dimensions,
        topFixes,
        detectedStack: {
          analytics: [audit.ga4?.installed && 'GA4', audit.gtm?.installed && 'GTM', audit.ua?.installed && 'UA (deprecated)'].filter(Boolean),
          pixels: Object.entries(audit.pixels || {}).filter(([, v]) => v).map(([k]) => k),
          behavior: Object.entries(audit.behavior || {}).filter(([, v]) => v).map(([k]) => k),
          consent: audit.consent?.cmpDetected,
        },
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to compute score';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
