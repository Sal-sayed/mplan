/* eslint-disable @typescript-eslint/no-explicit-any */
// gemini.ts
// Thin wrapper over the Google Gemini REST API (generativelanguage v1beta).
// Replaces the Anthropic SDK as the LLM provider. Uses raw fetch + SSE rather
// than an SDK so there's no SDK-version coupling and we control the streaming
// parse exactly. The public surface mirrors what the app needs:
//   • geminiGenerate()    — one-shot JSON generation (non-streaming)
//   • geminiStreamText()  — async generator of text deltas (for SSE re-emit)

const DEFAULT_BASE = "https://generativelanguage.googleapis.com/v1beta";

// Endpoint is env-overridable (GEMINI_BASE_URL) for proxies / regional
// endpoints / test stubs. Read per-call so env changes are respected.
export function getGeminiBaseUrl(): string {
  return process.env.GEMINI_BASE_URL || DEFAULT_BASE;
}

// Centralized model ids so callers don't scatter magic strings.
export const GEMINI_MODELS = {
  pro: "gemini-2.5-pro",
  flash: "gemini-2.5-flash",
} as const;

// The default model for plan generation, overridable via GEMINI_MODEL.
export function getGeminiModel(): string {
  return process.env.GEMINI_MODEL || GEMINI_MODELS.flash;
}

export function getGeminiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY must be set");
  return key;
}

export interface GeminiUsage {
  input: number;
  output: number;
}

export interface GeminiArgs {
  model: string;
  system?: string; // -> systemInstruction
  userMessage: string;
  maxOutputTokens: number;
  json?: boolean; // force application/json output
  // 2.5 models "think" by default, which consumes tokens and adds latency.
  // Set 0 to disable on flash; pro requires a positive budget (>=128). Leave
  // undefined to use the model default.
  thinkingBudget?: number;
}

function buildBody(args: GeminiArgs): any {
  const generationConfig: any = { maxOutputTokens: args.maxOutputTokens };
  if (args.json) generationConfig.responseMimeType = "application/json";
  if (typeof args.thinkingBudget === "number") {
    generationConfig.thinkingConfig = { thinkingBudget: args.thinkingBudget };
  }
  const body: any = {
    contents: [{ role: "user", parts: [{ text: args.userMessage }] }],
    generationConfig,
  };
  if (args.system) body.systemInstruction = { parts: [{ text: args.system }] };
  return body;
}

// Pull a human-readable message out of a Gemini error body.
function extractGeminiError(status: number, raw: string): string {
  try {
    const j = JSON.parse(raw);
    const msg = j?.error?.message || raw;
    return `Gemini API ${status}: ${msg}`;
  } catch {
    return `Gemini API ${status}: ${raw.slice(0, 300)}`;
  }
}

// Transport-level retry for transient Gemini overloads — SEPARATE from
// generate-plan's output-quality retry. Retries ONLY 503 ("high demand") and
// 429 (rate limit). 401/403/other statuses and network errors propagate at
// once; after the cap it THROWS so a genuine outage surfaces (never loops).
const GEMINI_TRANSPORT_RETRIES = 2;
const TRANSPORT_RETRY_STATUS = new Set([429, 503]);

async function geminiPostWithRetry(url: string, bodyJson: string): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: bodyJson,
    });
    if (resp.ok) return resp;
    if (!TRANSPORT_RETRY_STATUS.has(resp.status) || attempt >= GEMINI_TRANSPORT_RETRIES) {
      throw new Error(extractGeminiError(resp.status, await resp.text()));
    }
    await resp.text().catch(() => {}); // drain the body so the socket frees
    await new Promise((r) => setTimeout(r, 500 * 2 ** attempt)); // 500ms, then 1000ms
  }
}

function textFromCandidate(obj: any): string {
  const parts = obj?.candidates?.[0]?.content?.parts || [];
  return parts.map((p: any) => p?.text || "").join("");
}

function usageFrom(obj: any, prev?: GeminiUsage): GeminiUsage {
  const u = obj?.usageMetadata;
  return {
    input: u?.promptTokenCount ?? prev?.input ?? 0,
    output: u?.candidatesTokenCount ?? prev?.output ?? 0,
  };
}

// ─── Non-streaming one-shot ───
export async function geminiGenerate(
  args: GeminiArgs
): Promise<{ text: string; usage: GeminiUsage }> {
  const url = `${getGeminiBaseUrl()}/models/${encodeURIComponent(args.model)}:generateContent?key=${getGeminiKey()}`;
  const resp = await geminiPostWithRetry(url, JSON.stringify(buildBody(args)));
  const data = await resp.json();
  return { text: textFromCandidate(data), usage: usageFrom(data) };
}

// ─── Streaming: yields text deltas; writes final token usage into `usageOut` ───
export async function* geminiStreamText(
  args: GeminiArgs,
  usageOut: GeminiUsage
): AsyncGenerator<string, void, void> {
  const url = `${getGeminiBaseUrl()}/models/${encodeURIComponent(args.model)}:streamGenerateContent?alt=sse&key=${getGeminiKey()}`;
  const resp = await geminiPostWithRetry(url, JSON.stringify(buildBody(args)));
  if (!resp.body) throw new Error("Gemini API returned no response body");

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  // Parse line-by-line. Gemini's SSE uses CRLF line endings, and each event is
  // a single self-contained `data: <json>` line, so we process whole lines as
  // they complete rather than waiting for a blank-line frame boundary.
  const handleLine = function* (raw: string): Generator<string> {
    let line = raw;
    if (line.endsWith("\r")) line = line.slice(0, -1);
    const trimmed = line.replace(/^\s+/, "");
    if (!trimmed.startsWith("data:")) return;
    const payload = trimmed.slice(5).trim();
    if (!payload || payload === "[DONE]") return;
    try {
      const obj = JSON.parse(payload);
      const text = textFromCandidate(obj);
      if (text) yield text;
      if (obj.usageMetadata) Object.assign(usageOut, usageFrom(obj, usageOut));
    } catch {
      /* a malformed line never crashes the stream */
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let nl: number;
    while ((nl = buffer.indexOf("\n")) !== -1) {
      const raw = buffer.slice(0, nl);
      buffer = buffer.slice(nl + 1);
      yield* handleLine(raw);
    }
  }
  // Flush any trailing line with no terminating newline.
  if (buffer.length > 0) yield* handleLine(buffer);
}
