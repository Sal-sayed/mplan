import { NextRequest, NextResponse } from 'next/server';
import { anthropic } from '@/lib/anthropic';
import { MEASUREMENT_PLAN_PROMPT } from '@/lib/prompts';
import { sanitizePlan } from '@/lib/sanitize-plan';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const { websiteData, score } = await req.json();

    if (!websiteData) {
      return NextResponse.json(
        { success: false, error: 'Website data is required' },
        { status: 400 }
      );
    }

    const message = await anthropic.messages.create({
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
