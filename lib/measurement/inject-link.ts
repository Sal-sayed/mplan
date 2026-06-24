// inject-link.ts — wire CREATE → INJECT. Picks the GTM-XXXX that should populate
// the snippet-injection step from the available sources, so the just-created (or
// already-existing) container's public id flows into the inject step automatically
// — no manual copy-paste — while a manually typed id still wins (independent use
// preserved). Pure + framework-free so the create→inject link is unit-testable.

export interface InjectIdSources {
  typed?: string; // what the user typed in the inject field — a manual override
  createdId?: string; // GTM-XXXX from a just-created container
  existingId?: string; // GTM-XXXX from check-before-create ("already exists")
  fallback?: string; // an id supplied elsewhere (e.g. the readiness GTM field)
}

// Precedence: a manual entry wins; else the just-created id; else the existing id;
// else any fallback. Empty string when nothing is available.
export function resolveInjectContainerId(s: InjectIdSources): string {
  return s.typed?.trim() || s.createdId?.trim() || s.existingId?.trim() || s.fallback?.trim() || '';
}
