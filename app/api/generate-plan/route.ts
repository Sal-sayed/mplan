import { NextRequest, NextResponse } from 'next/server';
import { getAnthropic } from '@/lib/anthropic';
import { MEASUREMENT_PLAN_SYSTEM_PROMPT, MEASUREMENT_PLAN_USER } from '@/lib/prompts';
import { sanitizePlan } from '@/lib/sanitize-plan';
import { checkRateLimit, getClientIdentifier, rateLimitHeaders } from '@/lib/rate-limit';
import { parseJsonLoose } from '@/lib/json-repair';

export const maxDuration = 60;

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

  try {
    const { websiteData, score } = await req.json();

    if (!websiteData) {
      return NextResponse.json(
        { success: false, error: 'Website data is required' },
        { status: 400 }
      );
    }

    const message = await getAnthropic().messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 16000,
      system: [
        {
          type: 'text',
          text: MEASUREMENT_PLAN_SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [
        {
          role: 'user',
          content: MEASUREMENT_PLAN_USER(JSON.stringify(websiteData), score),
        },
      ],
    });

    console.log('[generate-plan] usage:', {
      input: message.usage.input_tokens,
      output: message.usage.output_tokens,
      cacheRead: message.usage.cache_read_input_tokens ?? 0,
      cacheWrite: message.usage.cache_creation_input_tokens ?? 0,
    });

    const textBlock = message.content.find((b) => b.type === 'text');
    const responseText = textBlock?.type === 'text' ? textBlock.text : '';

    let plan;
    try {
      plan = parseJsonLoose(responseText);
    } catch (err) {
      console.error('[generate-plan] JSON parse failed even after repair:', (err as Error)?.message);
      console.error('[generate-plan] raw response head:', responseText.slice(0, 500));
      console.error('[generate-plan] raw response tail:', responseText.slice(-500));
      return NextResponse.json(
        { success: false, error: 'AI response was malformed. Please try again.' },
        { status: 500 }
      );
    }

    plan = sanitizePlan(plan);
    return NextResponse.json({ success: true, plan });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Failed to generate plan';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
