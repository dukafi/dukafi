/**
 * Architecture gate: every render-time materialisation of a media asset
 * runs through `materializeAssetForClient` (or its batch variants) so the
 * `media.url.transform` filter chain takes effect on every surface — the
 * publisher, the editor preview iframe, and the admin media library.
 *
 * Without this gate it's easy to add a new render path that bypasses the
 * filter and silently shows local-disk URLs in one place while a CDN
 * plugin rewrites them elsewhere. The dev/prod skew that creates is one
 * of the worst kinds of "works on my machine".
 */

import { describe, expect, it } from 'bun:test'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')

async function read(relative: string): Promise<string> {
  return await readFile(join(ROOT, relative), 'utf-8')
}

describe('media presentation pipeline', () => {
  it('mediaPrefetch.ts runs every asset through materializeAssetMapForClient', async () => {
    const source = await read('server/publish/mediaPrefetch.ts')
    expect(source).toContain("from './mediaPresentation'")
    expect(source).toContain('materializeAssetMapForClient(map)')
  })

  it('admin media list endpoint runs assets through materializeAssetListForClient', async () => {
    const source = await read('server/handlers/cms/media.ts')
    expect(source).toContain('materializeAssetListForClient')
    // It must call the materialiser on the FINAL `assets` slice (after
    // query / limit filters), not on the raw repo result. We assert by
    // looking for the call right before the jsonResponse.
    expect(source).toMatch(/materializeAssetListForClient\(assets\)[\s\S]*?return jsonResponse\(/)
  })

  it('media.url.transform filter chain is the only render-time URL rewrite', async () => {
    // Catch a future regression where someone bypasses the filter chain
    // with an ad-hoc regex on `/uploads/`. The renderer itself must NOT
    // know about CDN URLs — that's the entire reason the filter exists.
    const renderer = await read('src/core/publisher/render.ts')
    expect(renderer).not.toMatch(/cdn\./i)
    expect(renderer).not.toContain('https://cdn')
  })
})

describe('variant delegate election', () => {
  it('processImageVariants short-circuits when a delegate is elected', async () => {
    const source = await read('server/handlers/cms/mediaVariants.ts')
    // The host-side variant pipeline MUST check the elected delegate
    // before running sharp. Without this, an elected delegate plus
    // local generation would race + double-write.
    expect(source).toContain('getElectedVariantDelegate(db)')
    expect(source).toMatch(/if \(delegate\)[\s\S]*?buildDelegateVariants/)
  })

  it('virtual variants (delegate:<id>) are never sent through dispatchDelete', async () => {
    const source = await read('server/handlers/cms/mediaVariants.ts')
    // The delete path tags virtual variants with `delegate:` and skips
    // dispatchDelete for them — no bytes exist to delete on the host.
    expect(source).toMatch(/storageAdapterId\.startsWith\(['"]delegate:['"]\)/)
  })

  it('the variant delegate registry is torn down on plugin disable/uninstall/crash', async () => {
    // Three teardown sites spread across the host modules:
    //   - host/rpc.ts: loadPluginInWorker (reset before reload) and unloadPluginInWorker
    //   - host/crashRecovery.ts: handleWorkerCrash
    const rpcSource = await read('server/plugins/host/rpc.ts')
    const crashSource = await read('server/plugins/host/crashRecovery.ts')
    const combined = rpcSource + crashSource
    const teardowns = combined.match(/mediaVariantDelegateRegistry\.unregisterPlugin/g) ?? []
    expect(teardowns.length).toBeGreaterThanOrEqual(3)
  })
})

describe('CSP origin aggregation', () => {
  it('elected media storage adapters contribute origins to the page CSP', async () => {
    const source = await read('server/publish/frontendInjections.ts')
    expect(source).toContain('collectMediaAdapterCspOrigins')
    expect(source).toContain('listElectedAdapters')
    // Only ELECTED adapters contribute — installed-but-inactive adapters
    // must not pollute the published-page CSP.
    expect(source).toMatch(/Only ELECTED adapters/i)
  })
})
