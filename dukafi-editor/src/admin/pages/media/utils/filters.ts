/**
 * Pure filter / sort helpers for the Media page.
 *
 * Kept here (not in the hook) so they're trivially testable and reusable
 * between the canvas grid, the bulk-edit floating window (M4), and the
 * smart-folder query runner (M6). Returns an unbounded array — pagination
 * lives in the canvas component because it owns the page-size knob.
 */
import type { CmsMediaAsset } from '@core/persistence/cmsMedia'

export type MediaSort = 'newest' | 'oldest' | 'largest' | 'smallest' | 'name-asc' | 'name-desc'
export type MediaType = 'all' | 'image' | 'video' | 'svg' | 'other'

/** The single MIME type for SVG — its own filter even though it buckets as image. */
export const SVG_MIME = 'image/svg+xml'

/** Whether an asset is an inline-able SVG file. */
export function isSvgMime(mimeType: string): boolean {
  return mimeType === SVG_MIME
}

export interface MediaFilters {
  /**
   * Filter by folder id. `undefined` keeps the asset list global, `null`
   * selects the root folder, and a string selects that concrete folder.
   */
  folderId?: string | null
  type?: MediaType
  /** Free-text query — matches filename, title, alt text, caption (case-insensitive). */
  q?: string
  /** Single-tag filter — asset's `tags` array must include this string. */
  tag?: string
  sort?: MediaSort
}

const VIDEO_PREFIX = 'video/'
const IMAGE_PREFIX = 'image/'

export function bucketForMime(mimeType: string): 'image' | 'video' | 'other' {
  if (mimeType.startsWith(IMAGE_PREFIX)) return 'image'
  if (mimeType.startsWith(VIDEO_PREFIX)) return 'video'
  return 'other'
}

function matchesType(asset: CmsMediaAsset, type: MediaType | undefined): boolean {
  if (!type || type === 'all') return true
  // `svg` is a narrower view than `image` (SVGs still bucket as images, so the
  // Images tab continues to include them).
  if (type === 'svg') return isSvgMime(asset.mimeType)
  return bucketForMime(asset.mimeType) === type
}

function matchesQuery(asset: CmsMediaAsset, q: string | undefined): boolean {
  if (!q) return true
  const needle = q.trim().toLowerCase()
  if (!needle) return true
  return (
    asset.filename.toLowerCase().includes(needle) ||
    asset.title.toLowerCase().includes(needle) ||
    asset.altText.toLowerCase().includes(needle) ||
    asset.caption.toLowerCase().includes(needle)
  )
}

function matchesTag(asset: CmsMediaAsset, tag: string | undefined): boolean {
  if (!tag) return true
  return asset.tags.includes(tag.toLowerCase())
}

function matchesFolder(asset: CmsMediaAsset, filter: MediaFilters['folderId']): boolean {
  if (filter === undefined) return true
  if (filter === null) return asset.folderIds.length === 0
  return asset.folderIds.includes(filter)
}

function compareAssets(a: CmsMediaAsset, b: CmsMediaAsset, sort: MediaSort): number {
  switch (sort) {
    case 'newest':
      return b.createdAt.localeCompare(a.createdAt)
    case 'oldest':
      return a.createdAt.localeCompare(b.createdAt)
    case 'largest':
      return b.sizeBytes - a.sizeBytes
    case 'smallest':
      return a.sizeBytes - b.sizeBytes
    case 'name-asc':
      return a.filename.localeCompare(b.filename, undefined, { sensitivity: 'base' })
    case 'name-desc':
      return b.filename.localeCompare(a.filename, undefined, { sensitivity: 'base' })
  }
}

export function filterMediaAssets(
  assets: CmsMediaAsset[],
  filters: MediaFilters,
): CmsMediaAsset[] {
  const filtered = assets.filter((asset) =>
    matchesType(asset, filters.type) &&
    matchesQuery(asset, filters.q) &&
    matchesTag(asset, filters.tag) &&
    matchesFolder(asset, filters.folderId),
  )
  const sort = filters.sort ?? 'newest'
  return filtered.slice().sort((a, b) => compareAssets(a, b, sort))
}

/**
 * Collect a deduped, sorted list of every tag currently used. Drives the
 * tag-filter autocomplete in the FilterBar.
 */
export function collectMediaTags(assets: CmsMediaAsset[]): string[] {
  const set = new Set<string>()
  for (const asset of assets) {
    for (const tag of asset.tags) set.add(tag)
  }
  return Array.from(set).sort()
}
