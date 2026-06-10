import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, getClientIdentifier, rateLimitHeaders } from '@/lib/rate-limit';
import { buildClaudeSseStream, streamResponseHeaders } from '@/lib/claude-stream';
import { getGeminiModel } from '@/lib/gemini';
import { resolveClassification, LowConfidenceError } from '@/lib/measurement/pipeline';
import { buildPlanPrompt, finalizePlan } from '@/lib/measurement/generate-plan';
import type { BusinessModel, FormInfo, PageInfo, SiteContext } from '@/lib/measurement/types';

export const maxDuration = 90;

// Milestone keywords track the new MeasurementPlan schema fields as they stream.
const PLAN_MILESTONES = [
  { keyword: '"kpis"', emoji: '📊', message: 'Mapping KPIs to objectives...' },
  { keyword: '"events"', emoji: '📡', message: 'Configuring event tracking...' },
  { keyword: '"dataLayer"', emoji: '📐', message: 'Designing dataLayer schema...' },
  { keyword: '"consent"', emoji: '🔐', message: 'Planning consent & Consent Mode...' },
  { keyword: '"tooling"', emoji: '🏗️', message: 'Configuring GA4 & GTM...' },
];

const VALID_MODELS: BusinessModel[] = [
  'ecommerce',
  'saas',
  'lead_gen',
  'media_content',
  'marketplace',
];

function coercePages(input: unknown): PageInfo[] | undefined {
  if (!Array.isArray(input)) return undefined;
  return input
    .map((p): PageInfo | null => {
      if (typeof p === 'string') return { path: p };
      if (p && typeof p === 'object' && typeof (p as PageInfo).path === 'string') {
        return { path: (p as PageInfo).path, title: (p as PageInfo).title };
      }
      return null;
    })
    .filter((p): p is PageInfo => p !== null);
}

function coerceForms(input: unknown): FormInfo[] | undefined {
  if (!Array.isArray(input)) return undefined;
  return input
    .map((f): FormInfo | null => {
      if (!f || typeof f !== 'object') return null;
      const form = f as Partial<FormInfo>;
      return {
        action: typeof form.action === 'string' ? form.action : undefined,
        fields: Array.isArray(form.fields) ? form.fields.filter((x) => typeof x === 'string') : [],
        purpose: typeof form.purpose === 'string' ? form.purpose : undefined,
      };
    })
    .filter((f): f is FormInfo => f !== null);
}

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

  const body = await req.json().catch(() => null);
  const url: string | undefined = typeof body?.url === 'string' ? body.url.trim() : undefined;
  const brief: string | undefined = typeof body?.brief === 'string' ? body.brief.trim() : undefined;

  if (!url && !brief) {
    return NextResponse.json(
      { success: false, error: 'Provide a url or a brief to generate a plan.' },
      { status: 400 }
    );
  }

  const ctx: SiteContext = {
    mode: 'new',
    url: url || '',
    brief: brief || undefined,
    pages: coercePages(body?.pages),
    forms: coerceForms(body?.forms),
    detectedStack: Array.isArray(body?.detectedStack)
      ? body.detectedStack.filter((x: unknown) => typeof x === 'string')
      : undefined,
  };

  // A UI-confirmed business model overrides the deterministic guess and skips
  // the low-confidence gate.
  const override: BusinessModel | undefined =
    typeof body?.businessModel === 'string' && VALID_MODELS.includes(body.businessModel)
      ? (body.businessModel as BusinessModel)
      : undefined;

  // Gate BEFORE streaming so we can return a real 409 HTTP status. The classify
  // stage is deterministic and instant — no LLM call happens here.
  let classification;
  try {
    classification = resolveClassification(ctx, {
      requireConfidentClassification: true,
      overrideClassification: override,
    });
  } catch (err) {
    if (err instanceof LowConfidenceError) {
      return NextResponse.json(
        { success: false, needsConfirmation: true, classification: err.classification },
        { status: 409, headers: rateLimitHeaders(rl) }
      );
    }
    const message = (err as Error)?.message || 'Classification failed';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }

  // Confident (or overridden): stream the Gemini generation. We reuse the
  // pipeline's generation stages (buildPlanPrompt + finalizePlan) as stream
  // post-processing so token streaming and the SSE event protocol are preserved.
  const { system, user } = buildPlanPrompt(ctx, classification);

  const stream = buildClaudeSseStream({
    model: getGeminiModel(),
    thinkingBudget: 0,
    system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
    userMessage: user,
    maxTokens: 16000,
    milestones: PLAN_MILESTONES,
    postProcess: (parsed) => ({
      success: true,
      classification,
      plan: finalizePlan(parsed, ctx, classification),
    }),
    logLabel: 'generate-plan',
  });

  return new Response(stream, { headers: streamResponseHeaders() });
}
