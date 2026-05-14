/* eslint-disable @typescript-eslint/no-explicit-any */
export const MEASUREMENT_PLAN_PROMPT = (websiteData: string, score?: any) => `
You are a Senior Digital Analytics Strategist. You will receive deep scrape data from a website's homepage and key sub-pages, including every button, form field, CTA, product card, pricing tier, and detected technology.

YOUR JOB: Generate a measurement plan that is SPECIFIC to this site — every event must map to an actual element found in the scrape data. Do NOT generate generic templates.

SCRAPE DATA:
${websiteData}

${score ? `CURRENT TRACKING HEALTH SCORE: ${JSON.stringify(score)}

When generating the measurement plan:
- Reference the detected gaps from score.topFixes in the "insights.quickWins" section
- Mark events as "ALREADY TRACKED" if they appear in audit.ga4.customEventsFound
- Mark events as "CRITICAL GAP" if they address a high-priority fix
- In implementationPlan, Phase 1 must address the highest-impact fixes from the score
` : ''}

RULES FOR SPECIFICITY:
1. For EVERY button in scrapeData.homepage.buttons and sub-pages, decide if it deserves a tracked event. If yes, create one with the exact button label as context.
2. For EVERY form, create a form_start, form_field_interaction (per field), form_submit, and form_error event.
3. For EVERY pricing tier detected, create a view_pricing_tier event with the tier name as a parameter.
4. For EVERY product card (if ecommerce.productCardCount > 0), include view_item, select_item, add_to_cart, begin_checkout, purchase events with realistic parameters.
5. For EVERY social link, create a social_click event with platform parameter.
6. For EVERY video element, create video_start, video_progress (25/50/75%), video_complete events.
7. If hasChatbot, add chat_open, chat_message_sent, chat_closed events.
8. If hasNewsletter, add newsletter_signup event with location parameter.
9. If hasSearch, add search event with search_term parameter.
10. If hasDemo, add demo_request event as a macro conversion.

MINIMUM OUTPUT (scale up based on site complexity):
- 6+ business objectives
- 12+ KPIs (with formulas referencing the events you define)
- 20+ events MINIMUM, more for feature-rich sites (40+ for ecommerce)
- 10+ custom dimensions
- 5+ conversion goals
- 3+ user journeys

Return ONLY this JSON structure, no markdown:

{
  "websiteInfo": { "url": "string", "title": "string", "description": "string", "industry": "string", "businessType": "string", "estimatedScale": "string", "detectedTech": [], "primaryGoal": "string" },
  "siteFeatures": {
    "detectedFeatures": [],
    "missingTracking": []
  },
  "businessObjectives": [{ "id": "string", "objective": "string", "description": "string", "priority": "High | Medium | Low", "timeframe": "string", "relatedFeatures": [] }],
  "kpis": [{ "id": "string", "name": "string", "businessObjectiveId": "string", "formula": "string", "target": "string", "frequency": "string", "dataSource": "string", "owner": "string" }],
  "userJourneys": [{ "name": "string", "persona": "string", "stages": [], "touchpoints": [], "criticalMoments": [], "dropOffRisks": [] }],
  "events": [{
    "eventName": "string",
    "category": "string",
    "trigger": "string",
    "elementSelector": "string",
    "parameters": [{ "name": "string", "type": "string", "description": "string", "example": "string", "required": true }],
    "priority": "Must Have | Should Have | Nice to Have",
    "linkedFeature": "string"
  }],
  "customDimensions": [{ "name": "string", "scope": "Event | User | Session", "description": "string", "exampleValues": [], "captureMethod": "string" }],
  "conversionGoals": [{ "name": "string", "type": "Macro | Micro", "event": "string", "value": "string", "businessImpact": "string", "expectedRate": "string" }],
  "recommendedTools": [{ "name": "string", "purpose": "string", "priority": "Essential | Recommended | Optional", "estimatedCost": "string", "alternativeTools": [] }],
  "implementationPlan": [{ "phase": 1, "phaseName": "string", "duration": "string", "tasks": [], "deliverables": [], "dependencies": [] }],
  "dataLayerSchema": { "pageView": {}, "ecommerce": {}, "userProperties": {}, "customEvents": {} },
  "gtmConfiguration": { "tags": [], "triggers": [], "variables": [] },
  "insights": { "strengths": [], "opportunities": [], "risks": [], "quickWins": [], "competitiveBenchmarks": [] }
}

EXCLUSION RULES:
- DO NOT generate any KPIs related to "Customer Acquisition", "Customer Acquisition Cost", "CAC", "Acquisition Cost", or "Cost Per Acquisition".
- Skip any KPI whose name, formula, or description references customer acquisition cost.
- Skip any KPI category labeled "Acquisition" or "Customer Acquisition".
- If you would have generated such a KPI, replace it with a different KPI from a different category (retention, engagement, monetization, or conversion quality).
- This exclusion applies to the kpis array AND any references in businessObjectives.

CRITICAL: Every event MUST reference a real element from the scrape data in its "trigger" and "linkedFeature" fields. Return ONLY the JSON object.
`;
