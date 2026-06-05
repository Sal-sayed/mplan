import { NextRequest, NextResponse } from 'next/server';
import { getAnthropic } from '@/lib/anthropic';
import { MEASUREMENT_PLAN_PROMPT } from '@/lib/prompts';
import { sanitizePlan } from '@/lib/sanitize-plan';
import { checkRateLimit, getClientIdentifier, rateLimitHeaders } from '@/lib/rate-limit';

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
      model: 'claude-sonnet-4-20250514',
      max_tokens: 16000,
      messages: [
        {
          role: 'user',
          content: MEASUREMENT_PLAN_PROMPT(JSON.stringify(websiteData), score),
        },
      ],
    });

    const textBlock = message.content.find((b) => b.type === 'text');
    const responseText = textBlock?.type === 'text' ? textBlock.text : '';

    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json(
        { success: false, error: 'Failed to parse AI response' },
        { status: 500 }
      );
    }

    let plan = JSON.parse(jsonMatch[0]);
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
