// ESM resolve hook: maps the "@/x" path alias (from tsconfig paths) to a real
// file URL under the repo root, appending ".ts" when the specifier has no
// extension. node:test's mock.module RESOLVES a specifier before substituting,
// and a bare "@/..." looks like an npm package (ERR_MODULE_NOT_FOUND) without
// this. Tiny and dependency-free; only "@/" specifiers are touched.

import path from 'node:path';
import { pathToFileURL } from 'node:url';

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) {
    const rel = specifier.slice(2);
    const abs = path.join(process.cwd(), rel) + (path.extname(rel) ? '' : '.ts');
    return nextResolve(pathToFileURL(abs).href, context);
  }
  // `next` ships no ESM `exports` map, so a bare `import 'next/server'` won't
  // resolve under plain node (the ".js" is never appended). Point it at the
  // real file URL so mock.module can resolve + substitute it for the test; the
  // real file is only resolved, never executed.
  if (specifier === 'next/server') {
    const abs = path.join(process.cwd(), 'node_modules', 'next', 'server.js');
    return nextResolve(pathToFileURL(abs).href, context);
  }
  return nextResolve(specifier, context);
}
