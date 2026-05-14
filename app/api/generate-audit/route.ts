/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { AUDIT_PROMPT } from '@/lib/audit-prompt';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
export const maxDuration = 90;

export async function POST(req: NextRequest) {
  try {
    const { websiteData, score, existingPlan } = await req.json();

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 16000,
      messages: [{
        role: 'user',
        content: AUDIT_PROMPT(
          JSON.stringify(websiteData),
          JSON.stringify(score),
          existingPlan ? JSON.stringify(existingPlan) : null
        ),
      }],
    });

    const textBlock = message.content.find((b: any) => b.type === 'text');
    const responseText = textBlock?.type === 'text' ? textBlock.text : '';
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    const audit = jsonMatch ? JSON.parse(jsonMatch[0]) : null;

    return NextResponse.json({ success: true, audit, mode: 'audit' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Audit generation failed';
    console.error('Audit generation error:', err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
