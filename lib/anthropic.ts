import Anthropic from '@anthropic-ai/sdk';

let _anthropic: Anthropic | null = null;
export function getAnthropic(): Anthropic {
  if (_anthropic) return _anthropic;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY must be set');
  _anthropic = new Anthropic({ apiKey });
  return _anthropic;
}
