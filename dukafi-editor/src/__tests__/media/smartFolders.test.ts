import { describe, expect, it } from 'bun:test'
import {
  SMART_MISSING_ALT,
  SMART_MISSING_TITLE,
  smartFolderPredicate,
} from '@admin/pages/media/utils/smartFolders'
import type { CmsMediaAsset } from '@core/persistence/cmsMedia'

function asset(overrides: Partial<CmsMediaAsset> = {}): CmsMediaAsset {
  return {
    id: 'asset_1',
    filename: 'asset.png',
    mimeType: 'image/png',
    sizeBytes: 1,
    publicPath: '/uploads/asset.png',
    uploadedByUserId: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    altText: '',
    caption: '',
    title: '',
    tags: [],
    width: null,
    height: null,
    durationMs: null,
    dominantColor: null,
    deletedAt: null,
    replacedAt: null,
    folderIds: [],
    blurHash: null,
    variants: [],
    posterPath: null,
    ...overrides,
  }
}

describe('media smart folders', () => {
  it('limits missing alt text to image assets', () => {
    const matches = smartFolderPredicate(SMART_MISSING_ALT)

    expect(matches(asset({ mimeType: 'image/png', altText: '' }))).toBe(true)
    expect(matches(asset({ mimeType: 'image/png', altText: 'Hero image' }))).toBe(false)
    expect(matches(asset({ mimeType: 'font/woff2', altText: '' }))).toBe(false)
  })

  it('limits missing title to image assets', () => {
    const matches = smartFolderPredicate(SMART_MISSING_TITLE)

    expect(matches(asset({ mimeType: 'image/png', title: '' }))).toBe(true)
    expect(matches(asset({ mimeType: 'image/png', title: 'Hero image' }))).toBe(false)
    expect(matches(asset({ mimeType: 'font/woff2', title: '' }))).toBe(false)
  })
})
