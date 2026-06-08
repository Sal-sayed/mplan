import { NextRequest, NextResponse } from 'next/server';
import { MEASUREMENT_PLAN_SYSTEM_PROMPT, MEASUREMENT_PLAN_USER } from '@/lib/prompts';
import { sanitizePlan } from '@/lib/sanitize-plan';
import { checkRateLimit, getClientIdentifier, rateLimitHeaders } from '@/lib/rate-limit';
import { buildClaudeSseStream, streamResponseHeaders } from '@/lib/claude-stream';
import { GEMINI_MODELS } from '@/lib/gemini';

export const maxDuration = 90;

const PLAN_MILESTONES = [
  { keyword: '"websiteInfo"', emoji: '🔍', message: 'Analyzing site structure...' },
  { keyword: '"businessObjectives"', emoji: '🎯', message: 'Defining business objectives...' },
  { keyword: '"kpis"', emoji: '📊', message: 'Mapping KPIs to objectives...' },
  { keyword: '"userJourneys"', emoji: '🛤️', message: 'Building user journey flows...' },
  { keyword: '"events"', emoji: '📡', message: 'Configuring event tracking...' },
  { keyword: '"customDimensions"', emoji: '🏷️', message: 'Adding custom dimensions...' },
  { keyword: '"conversionGoals"', emoji: '💰', message: 'Setting conversion goals...' },
  { keyword: '"implementationPlan"', emoji: '🛠️', message: 'Building implementation roadmap...' },
  { keyword: '"dataLayerSchema"', emoji: '📐', message: 'Designing dataLayer schema...' },
  { keyword: '"gtmConfiguration"', emoji: '🏗️', message: 'Configuring GTM tags...' },
  { keyword: '"insights"', emoji: '💡', message: 'Generating final insights...' },
];

export async function POST(req: NextRequest) {
  const clientId = getClientIdentifier(req);
  const rl = await checkRateLimit(clientId);
  if (!rl.allowed) {
    const resetMinutes = Math.max(1, Math.ceil((rl.reset - Date.now()) / 1000 / 60));
    return NextResponse.json(
      {
        success: false,
        error: `Rate limit exceeded. You can submit ${rl.limit} requests per hour. Try again in ${resetMinutes} minute${resetMinutes === 1 ? '' : 's'}.`,
        rateLimitInfo: { limit: rl.limit, remaining: rl.remaining, resetInMinutes: resetMinutes },
      },
      { status: 429, headers: rateLimitHeaders(rl) }
    );
  }

  const { websiteData, score } = await req.json();
  if (!websiteData) {
    return NextResponse.json({ success: false, error: 'Website data is required' }, { status: 400 });
  }

  const stream = buildClaudeSseStream({
    model: GEMINI_MODELS.flash,
    thinkingBudget: 0, // flash: disable thinking — structured JSON task, faster/cheaper
    system: [
      {
        type: 'text',
        text: MEASUREMENT_PLAN_SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
    ],
    userMessage: MEASUREMENT_PLAN_USER(JSON.stringify(websiteData), score),
    maxTokens: 16000,
    milestones: PLAN_MILESTONES,
    postProcess: (plan) => sanitizePlan(plan),
    logLabel: 'generate-plan',
  });

  return new Response(stream, { headers: streamResponseHeaders() });
}
