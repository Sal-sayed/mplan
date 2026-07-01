// fetch-retry.mjs — a tiny transport-resilient fetch for the cron entrypoints.
//
// The deployed app (Render) can cold-start on the first request of the day, so the
// gateway answers 502/503/504 (or the socket resets / times out) for the first
// ~30–60s while the instance spins up. That's exactly what red-X'd the governance
// sweep (it runs first and hit the cold gateway: "HTTP 502: unknown error").
//
// Retry those transient conditions with exponential backoff so a sleeping app warms
// up instead of failing the whole run. Non-transient responses (401, 400, a real
// 500 that keeps repeating, etc.) are returned to the caller unchanged — the caller
// still decides what's a genuine failure. If every attempt is transient, the last
// response is returned so the caller can surface it.

const RETRIABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function fetchWithRetry(url, options = {}, opts = {}) {
  const retries = opts.retries ?? 5;
  const baseDelayMs = opts.baseDelayMs ?? 3000;
  const maxDelayMs = opts.maxDelayMs ?? 20000;
  const timeoutMs = opts.timeoutMs ?? 40000;

  const backoff = (attempt) => Math.min(baseDelayMs * 2 ** attempt, maxDelayMs);
  let lastErr;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timer);
      // Retry transient gateway / warm-up statuses; return anything else immediately.
      if (RETRIABLE_STATUS.has(res.status) && attempt < retries) {
        const delay = backoff(attempt);
        console.warn(`  transient HTTP ${res.status} (attempt ${attempt + 1}/${retries + 1}); retrying in ${Math.round(delay / 1000)}s…`);
        await sleep(delay);
        continue;
      }
      return res;
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      if (attempt < retries) {
        const delay = backoff(attempt);
        const why = err?.name === 'AbortError' ? `timeout after ${Math.round(timeoutMs / 1000)}s` : (err?.message ?? err);
        console.warn(`  request error: ${why} (attempt ${attempt + 1}/${retries + 1}); retrying in ${Math.round(delay / 1000)}s…`);
        await sleep(delay);
        continue;
      }
    }
  }
  throw lastErr ?? new Error('fetchWithRetry: exhausted retries');
}
