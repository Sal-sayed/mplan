// Small JSON repair helper for Anthropic responses. Large structured outputs
// occasionally land with trailing commas before closing brackets, an
// unterminated trailing array element, or extra prose after the JSON.
// We parse with the strict parser first, then fall back to repairs only if
// that throws — so happy-path requests pay nothing extra.

export function parseJsonLoose<T = unknown>(raw: string): T {
  let text = extractJsonObject(raw);

  try {
    return JSON.parse(text) as T;
  } catch {
    // Try progressive repairs.
  }

  // 1. Strip trailing commas before } or ]
  let attempt = text.replace(/,(\s*[}\]])/g, '$1');
  try {
    return JSON.parse(attempt) as T;
  } catch {
    /* continue */
  }

  // 2. Same plus close any unbalanced brackets at the end (truncation).
  attempt = closeUnbalanced(attempt);
  try {
    return JSON.parse(attempt) as T;
  } catch {
    /* continue */
  }

  // 3. Drop trailing partial element after the last successful close.
  attempt = truncateToLastValid(text);
  attempt = attempt.replace(/,(\s*[}\]])/g, '$1');
  attempt = closeUnbalanced(attempt);
  return JSON.parse(attempt) as T;
}

function extractJsonObject(raw: string): string {
  // Find the first {...} that looks like JSON, ignoring surrounding prose.
  const m = raw.match(/\{[\s\S]*\}/);
  return m ? m[0] : raw;
}

function closeUnbalanced(s: string): string {
  // Walk the string and track open brackets/braces, ignoring brackets inside
  // strings. Append matching closers for anything still open at the end.
  const stack: string[] = [];
  let inString = false;
  let escaped = false;
  for (const c of s) {
    if (inString) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') {
      inString = true;
      continue;
    }
    if (c === '{' || c === '[') stack.push(c);
    else if (c === '}') {
      if (stack[stack.length - 1] === '{') stack.pop();
    } else if (c === ']') {
      if (stack[stack.length - 1] === '[') stack.pop();
    }
  }
  let out = s;
  if (inString) out += '"';
  while (stack.length) {
    const open = stack.pop();
    out += open === '{' ? '}' : ']';
  }
  return out;
}

function truncateToLastValid(s: string): string {
  // Cut off everything after the last complete top-level array element by
  // finding the rightmost `},` followed by whitespace and `]` or end of string.
  // Falls back to original string if no candidate found.
  const lastSafeBracket = Math.max(s.lastIndexOf('}'), s.lastIndexOf(']'));
  if (lastSafeBracket === -1) return s;
  return s.slice(0, lastSafeBracket + 1);
}
