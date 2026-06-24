// Locate a site's <head> file and produce the file content with the GTM container
// snippet injected — OR, when it cannot confidently identify the <head>, refuse to
// guess and hand back the exact snippet for the user to paste manually.
//
// SCOPE (slice 1): ONLY the GTM container snippet in <head> (+ the <noscript> after
// <body>). NO dataLayer.push injection into business logic — that is explicitly out.
//
// SAFETY INVARIANT: never inject into a file we aren't confident is the site's HTML
// entry point. The confident set is a small allowlist of conventional entry files;
// anything else → the paste fallback. A wrong injection is worse than no injection.

export interface CandidateFile {
  path: string;
  content: string;
}

// Conventional HTML entry points we are confident about:
//   index.html         — plain static sites AND Vite (its entry is the project-root index.html)
//   public/index.html  — Create-React-App / many React setups
// Order = preference when several exist.
const CONFIDENT_PATHS = ['index.html', 'public/index.html', 'src/index.html'];

export type InjectionResult =
  | { status: 'inject'; filePath: string; newContent: string } // confident — caller commits this
  | { status: 'already_installed'; filePath: string } // confident — a GTM snippet is already there
  | { status: 'not_confident'; pasteSnippet: string }; // refuse to guess — user pastes manually

function normalize(p: string): string {
  return p.replace(/^\.?\//, '');
}

function isGtmContainerId(id: string): boolean {
  return /^GTM-[A-Z0-9]+$/i.test(id.trim());
}

// The two halves of the official GTM container snippet.
export function buildGtmSnippet(containerId: string): { head: string; noscript: string } {
  const id = containerId.trim().toUpperCase();
  const head =
    `<!-- Google Tag Manager -->\n` +
    `<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':\n` +
    `new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],\n` +
    `j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=\n` +
    `'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);\n` +
    `})(window,document,'script','dataLayer','${id}');</script>\n` +
    `<!-- End Google Tag Manager -->`;
  const noscript =
    `<!-- Google Tag Manager (noscript) -->\n` +
    `<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=${id}"\n` +
    `height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>\n` +
    `<!-- End Google Tag Manager (noscript) -->`;
  return { head, noscript };
}

// What the user pastes when we can't confidently find the <head>. Both halves with
// the standard "as high as possible in <head>" / "right after <body>" guidance.
export function buildPasteInstructions(containerId: string): string {
  const { head, noscript } = buildGtmSnippet(containerId);
  return (
    `Place this immediately after the opening <head> tag (as high as possible):\n\n${head}\n\n` +
    `And place this immediately after the opening <body> tag:\n\n${noscript}`
  );
}

// True if SOME Google Tag Manager loader is already present (this container or any).
// Re-injecting a second GTM loader is unsafe, so any existing loader → already-installed.
function alreadyHasGtm(content: string, containerId: string): boolean {
  if (/googletagmanager\.com\/(gtm\.js|ns\.html)/i.test(content)) return true;
  return content.toUpperCase().includes(containerId.trim().toUpperCase());
}

function injectInto(content: string, containerId: string): string {
  const { head, noscript } = buildGtmSnippet(containerId);
  // Insert the loader immediately after the opening <head ...> tag.
  let out = content.replace(/<head[^>]*>/i, (m) => `${m}\n  ${head}\n`);
  // Insert the <noscript> immediately after the opening <body ...> tag, if present.
  if (/<body[^>]*>/i.test(out)) {
    out = out.replace(/<body[^>]*>/i, (m) => `${m}\n  ${noscript}\n`);
  }
  return out;
}

// Decide what to do given the candidate entry files fetched from the repo.
// Pure + synchronous so it is trivially unit-testable with plain string inputs.
export function resolveHeadInjection(files: CandidateFile[], containerId: string): InjectionResult {
  if (!isGtmContainerId(containerId)) {
    // Defensive: callers validate first, but never inject a bogus id.
    return { status: 'not_confident', pasteSnippet: buildPasteInstructions(containerId) };
  }

  // Restrict to the confident allowlist, in preference order.
  const byPath = new Map(files.map((f) => [normalize(f.path), f]));
  const recognized = CONFIDENT_PATHS.map((p) => byPath.get(p)).filter((f): f is CandidateFile => Boolean(f));

  // If a GTM loader is already present in any recognized entry file → no-op.
  const installed = recognized.find((f) => alreadyHasGtm(f.content, containerId));
  if (installed) return { status: 'already_installed', filePath: normalize(installed.path) };

  // Otherwise inject into the first recognized file that actually has a <head>.
  const target = recognized.find((f) => /<head[^>]*>/i.test(f.content));
  if (target) {
    return { status: 'inject', filePath: normalize(target.path), newContent: injectInto(target.content, containerId) };
  }

  // Not confident — refuse to guess; return the paste fallback.
  return { status: 'not_confident', pasteSnippet: buildPasteInstructions(containerId) };
}

// The conventional entry paths the orchestration should fetch from the repo and
// feed into resolveHeadInjection. Exported so the route and tests stay in sync.
export const CANDIDATE_PATHS = CONFIDENT_PATHS;
