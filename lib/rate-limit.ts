import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import type { NextRequest } from 'next/server';

let _ratelimiter: Ratelimit | null = null;
function getRatelimiter(): Ratelimit | null {
  if (_ratelimiter) return _ratelimiter;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  const perHour = parseInt(process.env.RATE_LIMIT_PER_HOUR || '5', 10);
  _ratelimiter = new Ratelimit({
    redis: new Redis({ url, token }),
    limiter: Ratelimit.slidingWindow(perHour, '1 h'),
    analytics: true,
    prefix: 'ratelimit:audit',
  });
  return _ratelimiter;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  reset: number; // epoch ms
}

export async function checkRateLimit(identifier: string): Promise<RateLimitResult> {
  const rl = getRatelimiter();
  if (!rl) {
    // Fail open in dev when Upstash isn't configured.
    return { allowed: true, limit: 999, remaining: 999, reset: 0 };
  }
  const r = await rl.limit(identifier);
  return { allowed: r.success, limit: r.limit, remaining: r.remaining, reset: r.reset };
}

export function getClientIdentifier(req: NextRequest | Request): string {
  const headers = req.headers;
  const cf = headers.get('cf-connecting-ip');
  if (cf) return cf;
  const real = headers.get('x-real-ip');
  if (real) return real;
  const fwd = headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0]?.trim() || 'unknown';
  return 'unknown';
}

export function rateLimitHeaders(r: RateLimitResult): Record<string, string> {
  return {
    'X-RateLimit-Limit': String(r.limit),
    'X-RateLimit-Remaining': String(r.remaining),
    'X-RateLimit-Reset': String(r.reset),
  };
}
