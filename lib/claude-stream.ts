/* eslint-disable @typescript-eslint/no-explicit-any */
// claude-stream.ts
// SSE streaming wrapper for LLM generation. Despite the legacy filename, the
// provider is now Google Gemini (see lib/gemini.ts) — the public surface
// (buildClaudeSseStream / StreamConfig / streamResponseHeaders) and the
// event protocol (milestone / progress / complete / error) are UNCHANGED so
// the route handlers and the frontend need no edits beyond the model id.
import { geminiStreamText, type GeminiUsage } from "@/lib/gemini";
import { parseJsonLoose } from "@/lib/json-repair";

export interface MilestoneConfig {
  keyword: string;          // Substring to watch for in the streaming response
  message: string;          // Human-readable status shown to the user
  emoji?: string;
}

export interface StreamConfig {
  model: string;
  // Kept in the original Anthropic-style shape so callers don't change. The
  // text fields are concatenated into Gemini's systemInstruction; cache_control
  // is ignored (Gemini handles caching differently and it isn't needed here).
  system?: Array<{
    type: 'text';
    text: string;
    cache_control?: { type: 'ephemeral' };
  }>;
  userMessage: string;
  maxTokens: number;
  milestones: MilestoneConfig[];
  // Optional async transform applied to the parsed JSON before the final
  // `complete` event. Use this for the existing server-side post-processing
  // (sanitize, override detectedSetup, filter false-positives, etc.).
  postProcess?: (parsed: any) => any | Promise<any>;
  // Tag for log lines.
  logLabel?: string;
  // Gemini 2.5 thinking budget. 0 disables thinking (flash); omit to use the
  // model default (pro requires a positive budget).
  thinkingBudget?: number;
}

export function streamResponseHeaders(): HeadersInit {
  return {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    // Disables buffering on nginx and Render's reverse proxy.
    'X-Accel-Buffering': 'no',
  };
}

export function buildClaudeSseStream(config: StreamConfig): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const emittedMilestones = new Set<string>();
  const label = config.logLabel || 'gemini-stream';

  return new ReadableStream({
    async start(controller) {
      const send = (event: string, data: any) => {
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
          );
        } catch {
          /* controller may already be closed if the client aborted */
        }
      };

      let fullText = '';
      let outputTokens = 0;
      let lastProgressAt = Date.now();
      const usage: GeminiUsage = { input: 0, output: 0 };

      try {
        send('milestone', { emoji: '🚀', message: 'Starting AI analysis...', progress: 5 });

        // Flatten the Anthropic-style system array into a single instruction.
        const system = config.system?.map((s) => s.text).join('\n\n');

        const stream = geminiStreamText(
          {
            model: config.model,
            system,
            userMessage: config.userMessage,
            maxOutputTokens: config.maxTokens,
            json: true,
            thinkingBudget: config.thinkingBudget,
          },
          usage
        );

        for await (const text of stream) {
          fullText += text;
          outputTokens += 1;

          // Throttle progress events to ~2/sec so we don't spam the wire.
          const now = Date.now();
          if (now - lastProgressAt > 500) {
            send('progress', { tokens: outputTokens, chars: fullText.length });
            lastProgressAt = now;
          }

          // Watch for milestone keywords in the streaming text. The keywords
          // are usually JSON property markers like "kpis" — they appear as
          // soon as the model opens that field.
          for (const m of config.milestones) {
            if (emittedMilestones.has(m.keyword)) continue;
            if (fullText.includes(m.keyword)) {
              emittedMilestones.add(m.keyword);
              const progress = Math.min(
                92,
                Math.round(8 + (emittedMilestones.size / config.milestones.length) * 84)
              );
              send('milestone', {
                emoji: m.emoji || '✨',
                message: m.message,
                progress,
              });
            }
          }
        }

        console.log(`[${label}] usage:`, { input: usage.input, output: usage.output });

        send('milestone', { emoji: '🧮', message: 'Parsing response...', progress: 94 });

        let parsed: any;
        try {
          parsed = parseJsonLoose(fullText);
        } catch (err) {
          console.error(`[${label}] JSON parse failed even after repair:`, (err as Error)?.message);
          console.error(`[${label}] raw head:`, fullText.slice(0, 500));
          console.error(`[${label}] raw tail:`, fullText.slice(-500));
          send('error', { message: 'AI response was malformed. Please try again.' });
          controller.close();
          return;
        }

        if (config.postProcess) {
          send('milestone', { emoji: '🧹', message: 'Finalizing...', progress: 97 });
          try {
            parsed = await config.postProcess(parsed);
          } catch (err) {
            console.error(`[${label}] postProcess threw:`, (err as Error)?.message);
            send('error', { message: 'Failed to finalize result. Please try again.' });
            controller.close();
            return;
          }
        }

        send('complete', {
          result: parsed,
          usage: {
            input: usage.input,
            output: usage.output,
            cacheRead: 0,
            cacheWrite: 0,
          },
        });
        controller.close();
      } catch (err) {
        const msg = (err as Error)?.message || 'AI generation failed';
        console.error(`[${label}] stream error:`, msg);
        send('error', { message: msg });
        controller.close();
      }
    },
  });
}
