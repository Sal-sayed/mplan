// Preloaded via `node --import ./test/setup.mjs`. Registers the "@/" path-alias
// resolve hook before any test module (or mock.module specifier) is resolved.
import { register } from 'node:module';

register('./resolve-alias.mjs', import.meta.url);
