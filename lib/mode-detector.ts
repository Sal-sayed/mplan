/* eslint-disable @typescript-eslint/no-explicit-any */

export interface ModeDetectionResult {
  mode: "new" | "audit";
  confidence: "high" | "medium" | "low";
  detected: {
    hasGA4: boolean;
    hasGTM: boolean;
    hasUA: boolean;
    hasPixels: string[];
    hasConsentMode: boolean;
    eventsFound: string[];
    trackingScore: number;
  };
  summary: string;
}

export function detectMode(scrapeData: any, scoreData: any): ModeDetectionResult {
  const audit = scrapeData?.homepage?.analyticsAudit || {};
  const score = scoreData?.total || 0;

  const detected = {
    hasGA4: audit.ga4?.installed || false,
    hasGTM: audit.gtm?.installed || false,
    hasUA: audit.ua?.installed || false,
    hasPixels: Object.entries(audit.pixels || {})
      .filter(([, v]) => v).map(([k]) => k),
    hasConsentMode: audit.consent?.googleConsentMode || false,
    eventsFound: audit.ga4?.customEventsFound || [],
    trackingScore: score,
  };

  // Score-based threshold: 30+ means existing setup, below means treat as new
  const isExisting =
    score >= 30 ||
    detected.hasGA4 ||
    detected.hasGTM ||
    detected.eventsFound.length >= 3;

  const mode: "new" | "audit" = isExisting ? "audit" : "new";

  // Confidence: how sure are we?
  let confidence: "high" | "medium" | "low" = "medium";
  if (score < 15 || score > 60) confidence = "high";
  if (score >= 25 && score <= 35) confidence = "low";

  // Summary: human-readable explanation
  const installedTools: string[] = [];
  if (detected.hasGA4) installedTools.push("GA4");
  if (detected.hasGTM) installedTools.push("GTM");
  if (detected.hasUA) installedTools.push("Universal Analytics (deprecated)");
  installedTools.push(...detected.hasPixels.map(formatPixelName));

  const summary = mode === "audit"
    ? `Found ${installedTools.length > 0 ? installedTools.join(", ") + " and " : ""}${detected.eventsFound.length} custom events. We'll audit what's there and recommend upgrades.`
    : `No analytics setup detected. We'll build your measurement plan from scratch.`;

  return { mode, confidence, detected, summary };
}

function formatPixelName(key: string): string {
  const names: Record<string, string> = {
    metaPixel: "Meta Pixel",
    linkedinInsight: "LinkedIn Insight Tag",
    tiktokPixel: "TikTok Pixel",
    twitterPixel: "X Pixel",
    pinterestTag: "Pinterest Tag",
    bingUET: "Microsoft UET",
    redditPixel: "Reddit Pixel",
    googleAdsConversion: "Google Ads",
  };
  return names[key] || key;
}
