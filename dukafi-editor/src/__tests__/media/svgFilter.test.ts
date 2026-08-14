/**
 * svgFilter.test.ts — the dedicated SVG media filter.
 *
 * SVGs bucket as images (so the Images tab still includes them), but the SVG
 * tab / `mediaKind: 'svg'` picker narrows to `image/svg+xml` only.
 */

import { describe, it, expect } from 'bun:test'
import {
  isSvgMime,
  bucketForMime,
  filterMediaAssets,
  SVG_MIME,
} from '@admin/pages/media/utils/filters'
import type { CmsMediaAsset } from '@core/persistence/cmsMedia'

function asset(
  id: string,
  mimeType: string,
  filename: string,
  folderIds: string[] = [],
): CmsMediaAsset {
  return {
    id, filename, mimeType, sizeBytes: 1, publicPath: `/uploads/${filename}`,
    uploadedByUserId: null, createdAt: '2026-01-01', altText: '', caption: '',
    title: '', tags: [], width: null, height: null, durationMs: null,
    dominantColor: null, deletedAt: null, replacedAt: null, folderIds,
    blurHash: null, variants: [], posterPath: null,
  }
}

const ASSETS = [
  asset('1', 'image/png', 'photo.png'),
  asset('2', SVG_MIME, 'logo.svg'),
  asset('3', 'image/svg+xml', 'icon.svg'),
  asset('4', 'video/mp4', 'clip.mp4'),
  asset('5', 'application/pdf', 'doc.pdf'),
]

describe('isSvgMime', () => {
  it('matches only image/svg+xml', () => {
    expect(isSvgMime('image/svg+xml')).toBe(true)
    expect(isSvgMime('image/png')).toBe(false)
  })
})

describe('bucketForMime keeps SVG in the image bucket', () => {
  it('svg still buckets as image (Images tab keeps showing it)', () => {
    expect(bucketForMime(SVG_MIME)).toBe('image')
  })
})

describe('filterMediaAssets type: "svg"', () => {
  it('returns only SVG files', () => {
    const out = filterMediaAssets(ASSETS, { type: 'svg' })
    expect(out.map((a) => a.id).sort()).toEqual(['2', '3'])
  })

  it('type "image" still includes SVGs (broader view)', () => {
    const out = filterMediaAssets(ASSETS, { type: 'image' })
    expect(out.map((a) => a.id).sort()).toEqual(['1', '2', '3'])
  })

  it('type "all" returns everything', () => {
    expect(filterMediaAssets(ASSETS, { type: 'all' }).length).toBe(5)
  })
})

describe('filterMediaAssets folder views', () => {
  it('treats folderId null as the root folder and hides foldered assets', () => {
    const out = filterMediaAssets([
      asset('root', 'image/png', 'root.png'),
      asset('nested', 'image/png', 'nested.png', ['folder-assets']),
    ], { folderId: null })

    expect(out.map((a) => a.id)).toEqual(['root'])
  })
})
