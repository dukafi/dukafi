/**
 * scripts/build-google-fonts.ts
 *
 * Fetches the public Google Fonts metadata directory (no API key required) and
 * writes a compact snapshot to `src/core/fonts/google-fonts.json`. The snapshot
 * is consumed by the Fonts section in the editor's Typography panel — the
 * editor never reaches Google directly, only this bundled list.
 *
 * Run with `bun scripts/build-google-fonts.ts` to refresh.
 *
 * Why a bundled snapshot rather than a runtime fetch:
 * - Works offline / in air-gapped self-hosted installs
 * - No API key required (the metadata endpoint is public, but the official
 *   Web Fonts Developer API requires GOOGLE_FONTS_API_KEY)
 * - Snapshot is deterministic — refreshes are tracked in git
 *
 * Source: https://fonts.google.com/metadata/fonts
 */

import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const METADATA_URL = 'https://fonts.google.com/metadata/fonts'
const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUTPUT_PATH = join(PROJECT_ROOT, 'src/core/fonts/google-fonts.json')

interface RawFamily {
  family: string
  category: string
  subsets: string[]
  fonts: Record<string, unknown>
  popularity?: number
  defaultSort?: number
}

interface RawDirectory {
  familyMetadataList: RawFamily[]
}

/**
 * Convert Google's compact variant tag ("400", "400i") into a stable variant
 * identifier ("400", "400italic"). The trailing `i` flag denotes italic.
 */
function normalizeVariant(tag: string): string {
  if (!/^\d+i?$/.test(tag)) return tag
  if (tag.endsWith('i')) return `${tag.slice(0, -1)}italic`
  return tag
}

function stripJsonAntiHijack(raw: string): string {
  // Google sometimes wraps JSON responses with ")]}'\n" to defeat JSON hijacking.
  if (raw.startsWith(")]}'")) return raw.slice(raw.indexOf('\n') + 1)
  return raw
}

async function main(): Promise<void> {
  const res = await fetch(METADATA_URL)
  if (!res.ok) {
    throw new Error(`Failed to fetch Google Fonts metadata: HTTP ${res.status}`)
  }
  const text = stripJsonAntiHijack(await res.text())
  const data = JSON.parse(text) as RawDirectory

  const families = (data.familyMetadataList ?? [])
    .map((entry) => ({
      family: entry.family,
      category: entry.category,
      // Google ships a synthetic 'menu' subset that points to a glyph subset
      // used for their picker UI — strip it so users only see real subsets.
      subsets: (entry.subsets ?? []).filter((s) => s && s !== 'menu').sort(),
      variants: Object.keys(entry.fonts ?? {}).map(normalizeVariant).sort(sortVariants),
      popularity: entry.popularity ?? entry.defaultSort ?? 9999,
    }))
    .filter((entry) => entry.variants.length > 0 && entry.subsets.length > 0)
    .sort((a, b) => (a.popularity ?? 9999) - (b.popularity ?? 9999))

  const snapshot = {
    fetchedAt: new Date().toISOString(),
    families,
  }

  await mkdir(dirname(OUTPUT_PATH), { recursive: true })
  await writeFile(OUTPUT_PATH, JSON.stringify(snapshot) + '\n', 'utf-8')

  console.log(
    `[build-google-fonts] wrote ${families.length} families to ${OUTPUT_PATH} (${(JSON.stringify(snapshot).length / 1024).toFixed(1)} KiB)`,
  )
}

/**
 * Sort variants in canonical order: weight ascending, normal before italic at the
 * same weight. Non-weight axes (e.g. opsz, wdth) sink to the end alphabetically.
 */
function sortVariants(a: string, b: string): number {
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

function parseVariant(tag: string): { weight: number; italic: boolean } | null {
  const match = /^(\d+)(italic)?$/.exec(tag)
  if (!match) return null
  return { weight: Number(match[1]), italic: Boolean(match[2]) }
}

main().catch((err) => {
  console.error('[build-google-fonts]', err)
  process.exit(1)
})
