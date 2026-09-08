import { describe, it, expect } from 'bun:test'
import { filterMediaAssets } from '@admin/pages/media/utils/filters'
import type { CmsMediaAsset } from '@core/persistence/cmsMedia'

function asset(id: string, origin: 'upload' | 'ai' | 'import' = 'upload'): CmsMediaAsset {
  return {
    id, filename: `${id}.png`, mimeType: 'image/png', sizeBytes: 1, publicPath: `/uploads/${id}.png`,
    uploadedByUserId: null, createdAt: '2026-01-01', altText: '', caption: '',
    title: '', tags: [], width: null, height: null, durationMs: null,
    dominantColor: null, deletedAt: null, replacedAt: null, folderIds: [],
    blurHash: null, variants: [], posterPath: null, origin,
  }
}

describe('filterMediaAssets origin', () => {
  const assets = [asset('up', 'upload'), asset('ai', 'ai'), asset('imp', 'import')]

  it('filters to AI-generated assets', () => {
    expect(filterMediaAssets(assets, { origin: 'ai' }).map((row) => row.id)).toEqual(['ai'])
  })

  it('filters to uploads (non-ai)', () => {
    expect(filterMediaAssets(assets, { origin: 'upload' }).map((row) => row.id).sort()).toEqual(['imp', 'up'])
  })

  it('origin all returns everything', () => {
    expect(filterMediaAssets(assets, { origin: 'all' }).length).toBe(3)
  })
})
