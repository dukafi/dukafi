/**
 * Parse an HTML string into a DOM Document using the global DOMParser.
 *
 * This module MUST NOT statically import happy-dom or any server-side DOM
 * library. `src/core/` is bundled into the browser; a static import of
 * happy-dom would bloat the browser bundle.
 *
 * parseHtml / walkAndMap only ever run browser-side (paste UI + the
 * browser-side agent executor). In `bun test` the test setup
 * (`src/__tests__/setup.ts`) polyfills `globalThis.DOMParser` via happy-dom,
 * so tests run without any changes to this module.
 *
 * If server-side parsing is ever needed, add a guarded dynamic import at that
 * call site — do not add it here.
 */

export function parseHtml(source: string): Document {
  return new DOMParser().parseFromString(source, 'text/html')
}
