/**
 * Custom bun:test matchers for the instatic test suite.
 *
 * Import this file as a side-effect in any test that uses the custom matchers:
 *   import '../matchers'
 *
 * Matchers:
 *   - toBeCleanHTML() — asserts an HTML string contains no XSS vectors
 */

import { expect } from 'bun:test'

// ---------------------------------------------------------------------------
// TypeScript augmentation — lets IDEs autocomplete the custom matchers
// ---------------------------------------------------------------------------

declare module 'bun:test' {
  interface Matchers<R = unknown> {
    /**
     * Asserts that the received HTML string contains no XSS vectors:
     * - No `<script>` tags
     * - No `javascript:` URLs in href/src/action attributes
     * - No inline event handlers (`onclick=`, `onerror=`, etc.)
     */
    toBeCleanHTML(): void
  }
}

// ---------------------------------------------------------------------------
// toBeCleanHTML
// ---------------------------------------------------------------------------

expect.extend({
  toBeCleanHTML(received: unknown) {
    if (typeof received !== 'string') {
      return {
        pass: false,
        message: () =>
          `toBeCleanHTML: expected a string, but received ${typeof received}`,
      }
    }

    // 1. No <script> tags
    if (/<script[\s>]/i.test(received)) {
      return {
        pass: false,
        message: () =>
          `toBeCleanHTML: HTML contains a <script> tag:\n  ${received}`,
      }
    }

    // 2. No javascript: URLs in href / src / action / formaction attributes
    if (/\b(?:href|src|action|formaction)\s*=\s*["']?\s*javascript:/i.test(received)) {
      return {
        pass: false,
        message: () =>
          `toBeCleanHTML: HTML contains a javascript: URL in an attribute:\n  ${received}`,
      }
    }

    // 3. No inline event handlers (on* = ...) — only check inside actual HTML tags,
    //    not in escaped text content (e.g. &lt;img onerror=...&gt; is safe escaped text).
    const tagContents = received.match(/<[^>]+>/g) ?? []
    for (const tag of tagContents) {
      if (/\bon\w+\s*=/i.test(tag)) {
        return {
          pass: false,
          message: () =>
            `toBeCleanHTML: HTML contains inline event handler(s) (on*) in tag:\n  ${tag}`,
        }
      }
    }

    return {
      pass: true,
      message: () =>
        `toBeCleanHTML: expected HTML to NOT be clean, but no XSS vectors were found.`,
    }
  },
})
