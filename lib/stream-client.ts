/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useCallback, useRef, useState } from 'react';

export interface StreamOutcome {
  needsConfirmation: boolean;
  classification: any | null;
}

export interface StreamMilestone {
  emoji: string;
  message: string;
  progress: number;
  timestamp: number;
}

export interface StreamUsage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export interface UseStreamingClaudeResult {
  milestones: StreamMilestone[];
  currentMessage: string;
  currentEmoji: string;
  progress: number;
  tokenCount: number;
  isStreaming: boolean;
  error: string | null;
  // Populated synchronously by startStream. When the server returns 409
  // (low-confidence classification) instead of a stream, `needsConfirmation`
  // is set true with the guessed `classification`. Exposed as a ref so it can
  // be read reliably right after `await startStream(...)` without a stale
  // closure on React state.
  outcome: { current: StreamOutcome };
  startStream: <T = any>(url: string, body: any) => Promise<T | null>;
  reset: () => void;
}

export function useStreamingClaude(): UseStreamingClaudeResult {
  const [milestones, setMilestones] = useState<StreamMilestone[]>([]);
  const [currentMessage, setCurrentMessage] = useState('');
  const [currentEmoji, setCurrentEmoji] = useState('🚀');
  const [progress, setProgress] = useState(0);
  const [tokenCount, setTokenCount] = useState(0);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const outcome = useRef<StreamOutcome>({ needsConfirmation: false, classification: null });

  const reset = useCallback(() => {
    setMilestones([]);
    setCurrentMessage('');
    setCurrentEmoji('🚀');
    setProgress(0);
    setTokenCount(0);
    setIsStreaming(false);
    setError(null);
    outcome.current = { needsConfirmation: false, classification: null };
  }, []);

  const startStream = useCallback(async <T = any>(url: string, body: any): Promise<T | null> => {
    setIsStreaming(true);
    setMilestones([]);
    setProgress(0);
    setTokenCount(0);
    setError(null);
    outcome.current = { needsConfirmation: false, classification: null };

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      // Rate limit (429) is non-streaming — server returns JSON.
      if (res.status === 429) {
        const data = await res.json().catch(() => ({}));
        setError(data?.error || 'Rate limit exceeded');
        setIsStreaming(false);
        return null;
      }

      // Low-confidence classification (409) is non-streaming — server returns
      // the guessed classification and asks the caller to confirm.
      if (res.status === 409) {
        const data = await res.json().catch(() => ({}));
        outcome.current = { needsConfirmation: true, classification: data?.classification ?? null };
        setIsStreaming(false);
        return null;
      }

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        setError(data?.error || `Request failed: ${res.status}`);
        setIsStreaming(false);
        return null;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let finalResult: T | null = null;
      let sawError = false;

      // Parse one SSE message ("event: …\ndata: …"). Returns true if it was an
      // `error` event (caller should abort). Mutates finalResult via closure.
      const handlePart = (part: string): boolean => {
        if (!part.trim()) return false;
        const lines = part.split('\n');
        let event = 'message';
        let data = '';
        for (const line of lines) {
          if (line.startsWith('event:')) event = line.slice(6).trim();
          else if (line.startsWith('data:')) data += line.slice(5).trim();
        }
        if (!data) return false;

        let payload: any;
        try { payload = JSON.parse(data); } catch { return false; }

        if (event === 'milestone') {
          const m: StreamMilestone = {
            emoji: payload.emoji || '✨',
            message: payload.message || '',
            progress: typeof payload.progress === 'number' ? payload.progress : 0,
            timestamp: Date.now(),
          };
          setMilestones(prev => [...prev, m]);
          setCurrentMessage(m.message);
          setCurrentEmoji(m.emoji);
          setProgress(m.progress);
        } else if (event === 'progress') {
          if (typeof payload.tokens === 'number') setTokenCount(payload.tokens);
        } else if (event === 'complete') {
          finalResult = payload.result as T;
          setProgress(100);
          setCurrentMessage('Complete!');
          setCurrentEmoji('✅');
        } else if (event === 'error') {
          setError(payload.message || 'Streaming failed');
          return true;
        }
        return false;
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // SSE: split on the double-newline boundary between messages.
        const parts = buffer.split('\n\n');
        buffer = parts.pop() || ''; // last segment may be a partial message

        for (const part of parts) {
          if (handlePart(part)) { sawError = true; break; }
        }
        if (sawError) break;
      }

      // Flush any trailing message left in the buffer. The final `complete` event
      // can arrive WITHOUT its trailing blank line (a connection close or Render's
      // proxy can drop it) — without this, that result would be silently lost and
      // surface as a bogus "Failed to generate plan".
      if (!sawError && buffer.trim()) {
        if (handlePart(buffer)) sawError = true;
      }

      setIsStreaming(false);
      return sawError ? null : finalResult;
    } catch (err: any) {
      setError(err?.message || 'Streaming failed');
      setIsStreaming(false);
      return null;
    }
  }, []);

  return {
    milestones,
    currentMessage,
    currentEmoji,
    progress,
    tokenCount,
    isStreaming,
    error,
    outcome,
    startStream,
    reset,
  };
}
