/**
 * EditorChromeInjector — injects a self-contained editor-chrome stylesheet
 * into each iframe <head> so editor-only elements (empty-state placeholders,
 * slot boundaries, the unknown-module fallback) are correctly styled inside
 * the iframe document where CSS Modules and parent-document tokens are absent.
 *
 * Why this is needed
 * ──────────────────
 * The canvas renders the page tree into an iframe via createPortal. CSS Module
 * rules (hashed class names like `.CanvasModulePlaceholder_root__abc123`) exist
 * only in the parent editor document's stylesheets — they are never present
 * inside the iframe document. Similarly, design tokens defined in globals.css
 * (--text-subtle, --canvas-placeholder-bg, etc.) only exist on the
 * parent document's :root.
 *
 * Two-part fix implemented here:
 *   1. Copy the tokens the chrome needs from the parent document's :root onto
 *      the iframe's :root at mount time — so `var(--text-subtle)` etc.
 *      resolve correctly inside the chrome CSS.
 *   2. Style editor chrome via STABLE data-attribute selectors
 *      (data-canvas-module-placeholder, data-instatic-slot-instance, etc.) instead
 *      of hashed CSS-Module class names which will never match inside the iframe.
 *
 * Cascade isolation via @layer
 * ────────────────────────────
 * This style element is intentionally UNLAYERED. ClassStyleInjector and
 * UserStylesheetInjector both wrap their content in `@layer user-authored`,
 * making all author CSS lower-priority than any unlayered rule. The chrome CSS
 * wins over author rules without needing !important — user stylesheets cannot
 * bleed into placeholder / slot-boundary chrome even at high specificity.
 *
 * Mount order inside the portal:
 *   <EditorChromeInjector>   ← <style id="instatic-editor-chrome">  (unlayered)
 *   <ClassStyleInjector>     ← <style id="mc-classes">        (@layer user-authored)
 *   <UserStylesheetInjector> ← <style id="mc-user-styles">    (@layer user-authored)
 *   {children}
 *
 * Each iframe mounts its own instance of this component (and of the author
 * CSS injectors) — one IframeFrameSurface = one set of <style> elements.
 */

import { useEffect } from 'react'

const STYLE_TAG_ID = 'instatic-editor-chrome'

/**
 * Design tokens to forward from the parent document's :root onto the iframe's
 * :root. These are exactly the tokens referenced in CHROME_RULES below.
 * Copying at runtime keeps globals.css as the single source of truth — no
 * duplicated literal values anywhere.
 */
const CHROME_TOKENS = [
  '--radius',
  '--radius-sm',
  '--text-subtle',
  '--text-disabled',
  '--text-muted',
  '--text',
  '--text-bright',
  '--canvas-placeholder-bg',
  '--bg-surface',
  '--bg-surface-2',
  '--bg-surface-3',
  '--bg-body',
  '--border-muted',
  '--border',
  '--danger',
] as const

/**
 * Admin typography and spacing tokens, forwarded into the iframe for CHROME
 * elements ONLY.
 *
 * Read from the parent's admin tokens but WRITTEN under chrome-namespaced
 * variables. Setting `--font-sans` or `--text-s` itself on the iframe `:root`
 * or `--space-s` itself on the iframe `:root` clobbers the SITE's matching
 * Framework tokens — the chrome injector is unlayered, and unlayered always
 * beats the site's tokens in `@layer user-authored`.
 */
const CHROME_TOKEN_ALIASES = [
  ['--font-sans', '--chrome-font-sans'],
  ['--text-3xs', '--chrome-text-3xs'],
  ['--text-2xs', '--chrome-text-2xs'],
  ['--text-xs', '--chrome-text-xs'],
  ['--text-s', '--chrome-text-s'],
  ['--text-m', '--chrome-text-m'],
  ['--text-l', '--chrome-text-l'],
  ['--text-xl', '--chrome-text-xl'],
  ['--text-2xl', '--chrome-text-2xl'],
  ['--text-3xl', '--chrome-text-3xl'],
  ['--text-4xl', '--chrome-text-4xl'],
  ['--text-5xl', '--chrome-text-5xl'],
  ['--text-6xl', '--chrome-text-6xl'],
  ['--text-7xl', '--chrome-text-7xl'],
  ['--space-px', '--chrome-space-px'],
  ['--space-4xs', '--chrome-space-4xs'],
  ['--space-3xs', '--chrome-space-3xs'],
  ['--space-2xs', '--chrome-space-2xs'],
  ['--space-xs', '--chrome-space-xs'],
  ['--space-s', '--chrome-space-s'],
  ['--space-m', '--chrome-space-m'],
  ['--space-l', '--chrome-space-l'],
  ['--space-xl', '--chrome-space-xl'],
  ['--space-2xl', '--chrome-space-2xl'],
  ['--space-3xl', '--chrome-space-3xl'],
  ['--space-4xl', '--chrome-space-4xl'],
  ['--space-5xl', '--chrome-space-5xl'],
  ['--space-6xl', '--chrome-space-6xl'],
  ['--space-7xl', '--chrome-space-7xl'],
  ['--space-8xl', '--chrome-space-8xl'],
  ['--space-9xl', '--chrome-space-9xl'],
  ['--space-10xl', '--chrome-space-10xl'],
  ['--space-11xl', '--chrome-space-11xl'],
  ['--space-12xl', '--chrome-space-12xl'],
] as const

interface EditorChromeInjectorProps {
  /** The iframe document to inject the chrome stylesheet into. */
  targetDocument: Document
  /** The parent (editor) document to read design tokens from. */
  parentDocument: Document
}

/**
 * Read the listed tokens from parentDoc's computed :root and return a
 * `:root { ... }` block that sets them on the iframe's root. Only tokens
 * that resolve to a non-empty value are included. Admin typography aliases are
 * mapped onto chrome-namespaced variables so they never override the site's own
 * Framework tokens.
 *
 * Module-scope so the React Compiler doesn't flag the getComputedStyle call
 * as a side-effect inside a component body.
 */
function buildTokenBlock(parentDoc: Document): string {
  const parentStyles = getComputedStyle(parentDoc.documentElement)
  const declarations = CHROME_TOKENS.flatMap((token) => {
    const value = parentStyles.getPropertyValue(token).trim()
    return value ? [`  ${token}: ${value};`] : []
  })
  for (const [source, target] of CHROME_TOKEN_ALIASES) {
    const value = parentStyles.getPropertyValue(source).trim()
    if (value) declarations.push(`  ${target}: ${value};`)
  }
  if (declarations.length === 0) return ''
  return `:root {\n${declarations.join('\n')}\n}`
}

/**
 * Editor-chrome CSS rules targeting stable data-* attributes.
 *
 * Every inheritable CSS property the chrome cares about (color, font-family,
 * font-size, font-weight, font-style, line-height, letter-spacing,
 * text-align, text-transform, white-space) is set EXPLICITLY on each chrome
 * element so nothing inherits from ancestor user elements. This is the second
 * isolation mechanism alongside the unlayered-vs-@layered cascade.
 *
 * Module-scope constant: stable across renders, not captured into closures.
 */
const CHROME_RULES = `
/* ── CanvasModulePlaceholder ───────────────────────────────────────────────
 * Reproduced from CanvasModulePlaceholder.module.css using stable
 * data-attribute selectors (data-canvas-module-placeholder, data-variant,
 * data-instatic-placeholder-*) added to the component alongside the existing
 * CSS-Module class names. The CSS-Module classes still style the component
 * when it renders outside the iframe (e.g. in tests); the data-attribute
 * hooks give the iframe chrome CSS a stable target.
 */

[data-canvas-module-placeholder] {
  display: block;
  box-sizing: border-box;
  min-width: 0;
  border-radius: var(--radius);
  background: var(--canvas-placeholder-bg);
  color: var(--text-subtle);
  font-size: var(--chrome-text-s);
  font-family: var(--chrome-font-sans);
  font-weight: 400;
  font-style: normal;
  line-height: 1.4;
  letter-spacing: normal;
  text-align: left;
  text-transform: none;
  white-space: normal;
  user-select: none;
}

[data-canvas-module-placeholder][data-variant="block"] {
  display: grid;
  place-items: center;
  width: 100%;
  min-height: 100px;
  padding: var(--chrome-space-xl);
  text-align: center;
}

[data-canvas-module-placeholder][data-variant="inline"] {
  display: inline-grid;
  align-items: center;
  min-height: 32px;
  padding: var(--chrome-space-xs) var(--chrome-space-m);
}

[data-canvas-module-placeholder] [data-instatic-placeholder-content] {
  box-sizing: border-box;
  min-width: 0;
  margin: 0;
  padding: 0;
  pointer-events: none;
}

[data-canvas-module-placeholder][data-variant="block"] [data-instatic-placeholder-content] {
  display: grid;
  justify-items: center;
  align-content: center;
  row-gap: var(--chrome-space-s);
}

[data-canvas-module-placeholder][data-variant="block"][data-layout="row"] [data-instatic-placeholder-content] {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: var(--chrome-space-s);
}

[data-canvas-module-placeholder][data-variant="inline"] [data-instatic-placeholder-content] {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: var(--chrome-space-xs);
}

[data-canvas-module-placeholder] [data-instatic-placeholder-icon] {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  margin: 0;
  padding: 0;
  color: var(--text-disabled);
  font-size: inherit;
  font-weight: inherit;
  line-height: 1;
  letter-spacing: normal;
  text-transform: none;
  white-space: normal;
}

[data-canvas-module-placeholder] [data-instatic-placeholder-icon] > svg {
  display: block;
  flex: 0 0 auto;
  margin: 0;
  padding: 0;
}

[data-canvas-module-placeholder] [data-instatic-placeholder-label] {
  display: block;
  margin: 0;
  padding: 0;
  color: var(--text-muted);
  font-size: var(--chrome-text-s);
  font-family: var(--chrome-font-sans);
  font-weight: 600;
  font-style: normal;
  line-height: 1.4;
  letter-spacing: normal;
  text-align: inherit;
  text-transform: none;
  white-space: normal;
}

[data-canvas-module-placeholder][data-variant="inline"] [data-instatic-placeholder-label] {
  font-weight: 500;
}

[data-canvas-module-placeholder] [data-instatic-placeholder-description] {
  max-width: 36ch;
  margin: 0;
  padding: 0;
  color: var(--text-subtle);
  font-size: var(--chrome-text-xs);
  font-family: var(--chrome-font-sans);
  font-weight: 500;
  font-style: normal;
  line-height: 1.4;
  letter-spacing: normal;
  text-align: inherit;
  text-transform: none;
  white-space: normal;
}

[data-canvas-module-placeholder] [data-instatic-placeholder-actions] {
  display: inline-flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: var(--chrome-space-xs);
  margin-top: var(--chrome-space-3xs);
  pointer-events: auto;
}

[data-canvas-module-placeholder] [data-instatic-placeholder-actions] button {
  height: 28px;
  padding: 0 var(--chrome-space-xl);
  border: 1px solid color-mix(in srgb, var(--text) 14%, transparent);
  border-radius: 999px;
  background: var(--bg-surface);
  color: var(--text-bright);
  font-size: var(--chrome-text-xs);
  font-family: var(--chrome-font-sans);
  font-weight: 600;
  font-style: normal;
  letter-spacing: 0.01em;
  text-transform: none;
  cursor: default;
}

[data-canvas-module-placeholder] [data-instatic-placeholder-actions] button:hover {
  background: var(--bg-surface-2);
  border-color: color-mix(in srgb, var(--text) 22%, transparent);
}

[data-canvas-module-placeholder] [data-instatic-placeholder-actions] button:active {
  background: var(--bg-surface-3);
}

/* ── base.slot-instance ─────────────────────────────────────────────────────
 * Reproduced from SlotInstance.module.css using stable data-attribute selectors
 * (data-instatic-slot-instance, data-instatic-slot-instance-header, data-instatic-slot-label,
 * data-instatic-slot-instance-content) added to SlotInstanceEditor.tsx alongside
 * the existing CSS-Module class names.
 *
 * Uses the forwarded global border tokens so slot chrome matches the parent
 * editor document without duplicating literal values in this iframe stylesheet.
 */

[data-instatic-slot-instance] {
  border: 1px solid var(--border-muted);
  border-radius: var(--radius);
  background: var(--bg-surface);
  overflow: hidden;
  box-sizing: border-box;
  color: var(--text-subtle);
  font-size: var(--chrome-text-xs);
  font-family: var(--chrome-font-sans);
  font-weight: 400;
  font-style: normal;
  letter-spacing: normal;
  text-transform: none;
}

[data-instatic-slot-instance-header] {
  display: flex;
  align-items: center;
  gap: var(--chrome-space-2xs);
  padding: var(--chrome-space-4xs) var(--chrome-space-s);
  background: var(--bg-body);
  border-bottom: 1px dashed var(--border);
  color: var(--text-subtle);
  font-size: var(--chrome-text-xs);
  font-family: var(--chrome-font-sans);
  font-weight: 400;
  font-style: normal;
  line-height: 1.5;
  letter-spacing: normal;
  text-align: left;
  text-transform: none;
  white-space: normal;
  user-select: none;
  pointer-events: none;
}

[data-instatic-slot-instance-header] [data-instatic-slot-label] {
  color: var(--text-muted);
  font-size: var(--chrome-text-xs);
  font-style: italic;
  font-family: var(--chrome-font-sans);
  font-weight: 400;
  line-height: inherit;
  letter-spacing: normal;
  text-transform: none;
  white-space: normal;
}

[data-instatic-slot-instance-content] {
  min-height: 24px;
  padding: var(--chrome-space-3xs);
}

/* ── base.list placeholder ──────────────────────────────────────────────────
 * Reproduced from list.module.css .placeholder using the stable
 * data-instatic-list-placeholder attribute added to ListEditor.tsx.
 */

[data-instatic-list-placeholder] {
  color: var(--text-subtle);
  margin-bottom: var(--chrome-space-xs);
  font-family: var(--chrome-font-sans);
  font-weight: initial;
  font-style: initial;
  font-size: initial;
  letter-spacing: normal;
  text-transform: none;
}

/* ── NodeRenderer unknown-module fallback ───────────────────────────────────
 * Reproduced from NodeRenderer.module.css .unknownModule using the stable
 * data-instatic-unknown-module attribute added to NodeRenderer.tsx.
 */

[data-instatic-unknown-module] {
  outline: 1px dashed var(--danger);
  padding: var(--chrome-space-3xs);
  color: var(--text-subtle);
  font-family: var(--chrome-font-sans);
  font-size: var(--chrome-text-s);
  font-weight: 400;
  font-style: normal;
  letter-spacing: normal;
  text-transform: none;
  white-space: normal;
}
`.trim()

export function EditorChromeInjector({ targetDocument, parentDocument }: EditorChromeInjectorProps) {
  useEffect(() => {
    let styleEl = targetDocument.getElementById(STYLE_TAG_ID) as HTMLStyleElement | null
    if (!styleEl) {
      styleEl = targetDocument.createElement('style')
      styleEl.id = STYLE_TAG_ID
      styleEl.setAttribute('data-source', 'EditorChromeInjector')
      // Prepend before author CSS injectors (ClassStyleInjector, UserStylesheetInjector)
      // so source order inside the head is tidy. The unlayered-vs-@layered cascade
      // is what actually ensures chrome wins — source order is secondary.
      targetDocument.head.insertBefore(styleEl, targetDocument.head.firstChild)
    }
    const tokenBlock = buildTokenBlock(parentDocument)
    styleEl.textContent = tokenBlock ? `${tokenBlock}\n\n${CHROME_RULES}` : CHROME_RULES
  }, [targetDocument, parentDocument])

  // Cleanup: remove the style element when the component unmounts or when
  // targetDocument changes. Captures the current doc value so cleanup always
  // targets the document this effect installed to.
  useEffect(() => {
    const targetDoc = targetDocument
    return () => {
      targetDoc.getElementById(STYLE_TAG_ID)?.remove()
    }
  }, [targetDocument])

  return null
}
