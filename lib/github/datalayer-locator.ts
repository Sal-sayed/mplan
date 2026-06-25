// datalayer-locator.ts — best-effort SUGGESTION of which existing repo file likely
// hosts each rich event's action, so the developer can jump straight to it.
//
// SUGGESTION ONLY: it READS the repo tree (+ optionally a candidate file) to NAME a
// likely path + a location hint. It NEVER edits any file, NEVER auto-places a push,
// and NEVER fabricates a path — every suggestedFile is a file that actually exists
// in the provided tree. Deterministic + conservative; pure aside from the injected
// read-only `readFile`. Suggestions are always labelled verify-first downstream.

export interface LocatorEvent {
  name: string;
  category?: string;
}

export interface LocationSuggestion {
  eventName: string;
  suggestedFile: string | null; // a REAL path from the tree, or null when unsure
  locationHint: string; // best-effort; the developer verifies before placing
  confidence: 'low' | 'medium'; // never 'high' — these are guesses
  alternatives: string[]; // other real candidate paths from the tree
}

export interface SuggestLocationsInput {
  events: LocatorEvent[];
  repoTree: string[]; // blob (file) paths from the default branch
  // Optional READ-ONLY reader for a finer handler hint. Best-effort; may return null.
  readFile?: (path: string) => Promise<string | null>;
}

// event-name pattern → likely file-name pattern + a plain-English action phrase.
const RULES: { test: RegExp; files: RegExp; action: string }[] = [
  { test: /contact|generate_lead|\blead\b|enquir|form_submit/i, files: /contact|form|lead|enquir/i, action: 'the form is submitted' },
  { test: /promo|view_promotion|select_promotion|offer|banner/i, files: /promo|offer|banner|hero|pricing/i, action: 'the promotion is viewed or clicked' },
  { test: /sign[_-]?up|register/i, files: /sign[_-]?up|register|auth/i, action: 'the user signs up' },
  { test: /log[_-]?in|sign[_-]?in/i, files: /log[_-]?in|sign[_-]?in|auth/i, action: 'the user logs in' },
  { test: /start_trial|\btrial\b/i, files: /trial|pricing|plan|checkout/i, action: 'the trial starts' },
  { test: /purchase|checkout|add_to_cart|begin_checkout|\bcart\b/i, files: /checkout|cart|payment|product|pricing/i, action: 'the purchase / checkout action happens' },
  { test: /search/i, files: /search/i, action: 'a search runs' },
  { test: /subscribe|newsletter/i, files: /newsletter|subscribe|footer/i, action: 'the user subscribes' },
];

// Never look in build output, deps, tests, or non-code files.
const EXCLUDE_DIR = /(^|\/)(node_modules|dist|build|out|coverage|vendor|\.next|\.git|public|static|assets)(\/|$)/i;
const EXCLUDE_FILE = /(\.(test|spec)\.[jt]sx?$|\.min\.js$|\.map$|package-lock\.json$|yarn\.lock$|pnpm-lock\.yaml$|(^|\/)index\.html?$)/i;
const CODE_EXT = /\.(jsx?|tsx?|mjs|cjs|vue|svelte)$/i;
const COMPONENT_DIR = /(^|\/)(src\/)?(components|features|views|pages|containers|forms|app)(\/|$)/i;
const HANDLER_RE = /\b(handleSubmit|onSubmit|handleClick|onClick)\b|addEventListener\(\s*['"](submit|click)['"]/;
const NEVER = /(?!)/; // matches nothing — for events with no usable tokens

function basename(p: string): string {
  return p.slice(p.lastIndexOf('/') + 1);
}

function tokensFromName(name: string): string[] {
  return name.split(/[_\W]+/).filter((t) => t.length >= 3);
}

function ruleFor(name: string): { files: RegExp; action: string; specific: boolean } {
  for (const r of RULES) if (r.test.test(name)) return { files: r.files, action: r.action, specific: true };
  const toks = tokensFromName(name);
  const files = toks.length ? new RegExp(toks.join('|'), 'i') : NEVER;
  return { files, action: `the “${name}” action happens`, specific: false };
}

function scoreFile(path: string, filesRe: RegExp): number {
  // A NAME match is a prerequisite — we never suggest a file just for being a
  // component; it must relate to the event by name first.
  const nameHit = filesRe.test(basename(path)) ? 2 : filesRe.test(path) ? 1 : 0;
  if (nameHit === 0) return 0;
  let s = nameHit;
  if (COMPONENT_DIR.test(path)) s += 2; // a matching component/handler file — stronger
  if (/\.(jsx|tsx|vue|svelte)$/i.test(path)) s += 1; // component-likely
  return s;
}

async function handlerHint(path: string, action: string, readFile?: (p: string) => Promise<string | null>): Promise<string> {
  const base = `Place the push where ${action}`;
  if (readFile) {
    try {
      const content = await readFile(path);
      const m = content?.match(HANDLER_RE);
      if (m) {
        const which = m[1] ? `\`${m[1]}\`` : `the ${m[2]} listener`;
        return `${base} — this file appears to use ${which}; place the push there, after the action succeeds.`;
      }
    } catch {
      /* read failed — fall back to the generic hint */
    }
  }
  return `${base}, inside the matching submit/click handler (after it succeeds).`;
}

export async function suggestLocations(input: SuggestLocationsInput): Promise<LocationSuggestion[]> {
  // Only real source files are ever candidates → suggestedFile can never be fabricated.
  const files = input.repoTree.filter((p) => !EXCLUDE_DIR.test(p) && !EXCLUDE_FILE.test(p) && CODE_EXT.test(p));

  const out: LocationSuggestion[] = [];
  for (const ev of input.events) {
    const { files: filesRe, action, specific } = ruleFor(ev.name);
    const ranked = files
      .map((p) => ({ p, s: scoreFile(p, filesRe) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s || a.p.length - b.p.length);

    if (ranked.length === 0) {
      out.push({
        eventName: ev.name,
        suggestedFile: null,
        locationHint: `Couldn't find a confident match — place this in the handler where ${action}, then verify.`,
        confidence: 'low',
        alternatives: [],
      });
      continue;
    }

    const top = ranked[0];
    // 'medium' only for a specific rule match that's clearly a component (basename
    // match + component dir = 4). Everything else stays 'low'. Never 'high'.
    const confidence: 'low' | 'medium' = specific && top.s >= 4 ? 'medium' : 'low';
    out.push({
      eventName: ev.name,
      suggestedFile: top.p,
      locationHint: await handlerHint(top.p, action, input.readFile),
      confidence,
      alternatives: ranked.slice(1, 4).map((x) => x.p),
    });
  }
  return out;
}
