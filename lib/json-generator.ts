/* eslint-disable @typescript-eslint/no-explicit-any */
import { sanitizePlan } from './sanitize-plan';

export function generatePlanJSON(plan: any, score: any, scrapeData?: any): Buffer {
  plan = sanitizePlan(plan);
  const exportPayload = {
    $schema: 'https://measurement-plan-agent.com/schema/v1.json',
    version: '1.0',
    exportedAt: new Date().toISOString(),
    exportedBy: 'Web Analytics Measurement Plan Agent',
    website: {
      url: plan.websiteInfo?.url,
      title: plan.websiteInfo?.title,
      industry: plan.websiteInfo?.industry,
      businessType: plan.websiteInfo?.businessType,
      detectedTech: plan.websiteInfo?.detectedTech || [],
    },
    healthScore: {
      total: score?.total,
      maxTotal: score?.maxTotal,
      grade: score?.grade,
      verdict: score?.verdict,
      dimensions: score?.dimensions,
      topFixes: score?.topFixes,
      detectedStack: score?.detectedStack,
    },
    measurementPlan: {
      businessObjectives: plan.businessObjectives,
      kpis: plan.kpis,
      userJourneys: plan.userJourneys,
      events: plan.events,
      customDimensions: plan.customDimensions,
      conversionGoals: plan.conversionGoals,
      recommendedTools: plan.recommendedTools,
      implementationPlan: plan.implementationPlan,
      dataLayerSchema: plan.dataLayerSchema,
      gtmConfiguration: plan.gtmConfiguration,
      insights: plan.insights,
    },
    siteFeatures: plan.siteFeatures,
    quickReference: {
      eventNames: (plan.events || []).map((e: any) => e.eventName),
      customDimensionNames: (plan.customDimensions || []).map((d: any) => d.name),
      conversionEvents: (plan.conversionGoals || []).map((c: any) => c.event),
      mustHaveEvents: (plan.events || [])
        .filter((e: any) => e.priority === 'Must Have')
        .map((e: any) => e.eventName),
    },
    gtmImportReady: {
      tags: plan.gtmConfiguration?.tags || [],
      triggers: plan.gtmConfiguration?.triggers || [],
      variables: plan.gtmConfiguration?.variables || [],
    },
    scrapeData: scrapeData || undefined,
  };

  return Buffer.from(JSON.stringify(exportPayload, null, 2), 'utf-8');
}
