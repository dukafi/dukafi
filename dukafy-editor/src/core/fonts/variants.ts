/**
 * Variant identifier helpers for the fonts subsystem.
 *
 * Editor-side, every variant is stored as either `<weight>` (upright) or
 * `<weight>italic` (italic). This canonical form is used in `FontEntry.variants`,
 * `FontFile.variant`, and the bundled Google directory (the build script also
 * normalises Google's compact "400i" form into "400italic" up front).
 *
 * The two helpers below are the only place where weight/italic decoding lives.
 * Don't write ad-hoc `.endsWith('italic')` checks in callers — go through
 * `parseVariant`.
 */

import type { ParsedVariant } from './types'

const VARIANT_RE = /^(\d{3})(italic)?$/

/** Parse a canonical variant tag. Returns `null` for unrecognised forms. */
export function parseVariant(variant: string): ParsedVariant | null {
  const match = VARIANT_RE.exec(variant)
  if (!match) return null
  return { weight: Number(match[1]), italic: Boolean(match[2]) }
}

/** Re-encode a parsed variant. Inverse of `parseVariant`. */
export function formatVariant({ weight, italic }: ParsedVariant): string {
  return italic ? `${weight}italic` : String(weight)
}

/**
 * Sort variants in canonical order: weight ascending, then upright before italic
 * within the same weight. Unrecognised tags are alphabetised at the end.
 */
export function compareVariants(a: string, b: string): number {
  const parsedA = parseVariant(a)
  const parsedB = parseVariant(b)
  if (parsedA && parsedB) {
    if (parsedA.weight !== parsedB.weight) return parsedA.weight - parsedB.weight
    return Number(parsedA.italic) - Number(parsedB.italic)
  }
  if (parsedA) return -1
  if (parsedB) return 1
  return a.localeCompare(b)
}

/**
 * Convert a list of variants into the Google Fonts CSS2 `:ital,wght@...` axis
 * tuple. Used both server-side (when downloading woff2 files at install time)
 * and client-side (when loading transient previews in the picker dropdown).
 *
 * Returns `null` when no variants parse — caller should skip emitting a CSS link.
 */
export function variantsToCss2Axis(variants: readonly string[]): string | null {
  const parsed = variants
    .map(parseVariant)
    .filter((v): v is ParsedVariant => v !== null)
    .sort((a, b) => {
      if (a.italic !== b.italic) return Number(a.italic) - Number(b.italic)
      return a.weight - b.weight
    })
  if (parsed.length === 0) return null
  return `ital,wght@${parsed.map((v) => `${Number(v.italic)},${v.weight}`).join(';')}`
}
