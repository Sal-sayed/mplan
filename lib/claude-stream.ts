/* eslint-disable @typescript-eslint/no-explicit-any */
import type Anthropic from '@anthropic-ai/sdk';
import { getAnthropic } from '@/lib/anthropic';
import { parseJsonLoose } from '@/lib/json-repair';

export interface MilestoneConfig {
  keyword: string;          // Substring to watch for in the streaming response
  message: string;          // Human-readable status shown to the user
  emoji?: string;
}

export interface StreamConfig {
  model: string;
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
  const label = config.logLabel || 'claude-stream';

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

      try {
        send('milestone', { emoji: '🚀', message: 'Starting AI analysis...', progress: 5 });

        const anthropic = getAnthropic();
        const params: Anthropic.MessageStreamParams = {
          model: config.model,
          max_tokens: config.maxTokens,
          messages: [{ role: 'user', content: config.userMessage }],
        };
        if (config.system) {
          params.system = config.system as any;
        }

        const stream = anthropic.messages.stream(params);

        for await (const event of stream) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            const text = event.delta.text;
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
            // soon as Claude opens that field.
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
        }

        const finalMessage = await stream.finalMessage();
        console.log(`[${label}] usage:`, {
          input: finalMessage.usage.input_tokens,
          output: finalMessage.usage.output_tokens,
          cacheRead: finalMessage.usage.cache_read_input_tokens ?? 0,
          cacheWrite: finalMessage.usage.cache_creation_input_tokens ?? 0,
        });

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
            input: finalMessage.usage.input_tokens,
            output: finalMessage.usage.output_tokens,
            cacheRead: finalMessage.usage.cache_read_input_tokens ?? 0,
            cacheWrite: finalMessage.usage.cache_creation_input_tokens ?? 0,
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
