/**
 * Fonts — runtime-only type declarations.
 *
 * These types describe runtime structures that have no Zod schema equivalent
 * (they are derived from external sources, not persisted data).
 * Persisted font types (FontEntry, FontFile, FontSource, SiteFontsSettings)
 * live in `./schemas` — that is the source of truth for those shapes.
 */

/**
 * Parsed variant — `weight` is the numeric CSS font-weight; `italic` is true
 * when the variant tag ends in "italic".
 */
export interface ParsedVariant {
  weight: number
  italic: boolean
}

/**
 * Bundled Google Fonts directory entry — the shape produced by
 * `scripts/build-google-fonts.ts` and consumed by the editor UI.
 */
export interface GoogleFontFamily {
  family: string
  category: string
  subsets: string[]
  variants: string[]
  popularity: number
}

export interface GoogleFontDirectory {
  fetchedAt: string
  families: GoogleFontFamily[]
}
