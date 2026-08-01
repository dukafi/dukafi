/**
 * Editor-only helpers that lazy-load Google Fonts CSS for in-picker previews.
 *
 * These previews are transient: when the user opens the Add-Font dropdown we
 * inject `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?...">`
 * tags so each family entry can render in its own font as the user scrolls.
 *
 * Important constraints:
 *   - These links live inside the editor session ONLY. Once the user confirms
 *     a font, the install endpoint downloads the woff2 file server-side and
 *     persists it under `/uploads/fonts/`. The published HTML never reaches
 *     out to fonts.googleapis.com — that's enforced by the publisher
 *     emitting only `/uploads/...` paths into `@font-face`.
 *   - Loaded link tags are kept around for the life of the editor session;
 *     re-opening the picker reuses cached entries. This is fine because the
 *     browser caches them too and there are no mutations that depend on them.
 */

import { variantsToCss2Axis } from './variants'

const PREVIEW_LINK_PREFIX = 'instatic-font-preview-'
const PREVIEW_VARIANTS_LINK_PREFIX = 'instatic-font-preview-variants-'

/** Render a CSS-safe ID for a family name. */
function previewLinkId(family: string, prefix: string): string {
  return `${prefix}${family.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
}

/**
 * Inject a `<link rel="stylesheet">` for one family at preview weights/subsets.
 * Idempotent — calling twice for the same family is a no-op (we look up by id).
 *
 * The preview always loads only the `400` weight at the `latin` subset — that
 * keeps the picker dropdown's footprint small even when the user scrolls
 * through hundreds of families.
 */
export function loadFontPreview(family: string): void {
  if (typeof document === 'undefined') return
  if (!family) return
  const id = previewLinkId(family, PREVIEW_LINK_PREFIX)
  if (document.getElementById(id)) return

  const link = document.createElement('link')
  link.id = id
  link.rel = 'stylesheet'
  link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@400&display=swap`
  link.setAttribute('data-source', 'instatic-font-preview')
  document.head.appendChild(link)
}

/**
 * Load every advertised variant of a family at the latin subset — used by
 * the variants picker step so each row renders in its own weight/style.
 *
 * Idempotent per family. The picker step calls this once when the user selects
 * a family. Like `loadFontPreview`, this is a transient editor-only resource;
 * the published page never sees these CDN URLs.
 */
export function loadFontPreviewWithVariants(family: string, variants: readonly string[]): void {
  if (typeof document === 'undefined') return
  if (!family) return
  const id = previewLinkId(family, PREVIEW_VARIANTS_LINK_PREFIX)
  if (document.getElementById(id)) return
  const axis = variantsToCss2Axis(variants)
  if (!axis) return

  const link = document.createElement('link')
  link.id = id
  link.rel = 'stylesheet'
  link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:${axis}&display=swap`
  link.setAttribute('data-source', 'instatic-font-preview-variants')
  document.head.appendChild(link)
}

