import { afterEach, describe, expect, it } from 'bun:test'
import { createSiteImportAdapter } from '@admin/modals/SiteImport/shared/createSiteImportAdapter'

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('createSiteImportAdapter', () => {
  it('uploads imported assets through the CMS media client contract', async () => {
    const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = []
    globalThis.fetch = async (input, init) => {
      calls.push({ input, init })
      const url = String(input)

      if (url === '/admin/api/cms/media') {
        return jsonResponse({
          asset: {
            id: 'asset/one',
            filename: 'hero.png',
            mimeType: 'image/png',
            sizeBytes: 12,
            publicPath: '/uploads/hero.png',
            uploadedByUserId: null,
            createdAt: '2026-01-03T00:00:00.000Z',
          },
        }, 201)
      }

      if (url === '/admin/api/cms/media/folders') {
        if (init?.method === 'GET') {
          return jsonResponse({ folders: [] })
        }
        return jsonResponse({
          folder: {
            id: 'folder-hero',
            name: 'images',
            slug: 'images',
            parentId: null,
            sortOrder: 0,
            createdByUserId: null,
            createdAt: '2026-01-03T00:00:00.000Z',
          },
        }, 201)
      }

      if (url === '/admin/api/cms/media/asset%2Fone/folders') {
        return jsonResponse({
          asset: {
            id: 'asset/one',
            filename: 'hero.png',
            mimeType: 'image/png',
            sizeBytes: 12,
            publicPath: '/uploads/hero.png',
            uploadedByUserId: null,
            createdAt: '2026-01-03T00:00:00.000Z',
            folderIds: ['folder-hero'],
          },
        })
      }

      return jsonResponse({ error: `Unexpected request: ${url}` }, 500)
    }

    const adapter = createSiteImportAdapter({ sessionId: 'test-session' })
    await expect(adapter.uploadAsset({
      path: 'images/hero.png',
      bytes: new Uint8Array([1, 2, 3]),
      mimeType: 'image/png',
    })).resolves.toBe('/uploads/hero.png')

    expect(calls).toHaveLength(4)
    expect(calls.map((call) => String(call.input))).toEqual([
      '/admin/api/cms/media',
      '/admin/api/cms/media/folders',
      '/admin/api/cms/media/folders',
      '/admin/api/cms/media/asset%2Fone/folders',
    ])
    for (const call of calls) {
      expect(call.init?.credentials).toBe('include')
    }
    expect(calls[0].init?.body).toBeInstanceOf(FormData)
    expect(calls[2].init?.body).toBe(JSON.stringify({ name: 'images', parentId: null }))
    expect(calls[3].init?.body).toBe(JSON.stringify({ add: ['folder-hero'] }))
  })
})
