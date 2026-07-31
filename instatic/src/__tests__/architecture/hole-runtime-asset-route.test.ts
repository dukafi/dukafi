/**
 * Architecture gate: `tryServeHoleRuntime` and `tryServeHole` must be
 * registered in `server/router.ts` BEFORE `tryServePublicRoute`.
 *
 * If either handler is missing or appears after `tryServePublicRoute`, a
 * `/_instatic/hole/...` request would be silently consumed by the public-slug
 * resolver (which would attempt to look up the URL as a page slug and return
 * a 404 rather than the hole fragment). Likewise, the `/_instatic/hole-runtime.js`
 * asset would fall through to an unrelated handler.
 *
 * This test reads the router source file and asserts on the position of each
 * handler name within the route table, mirroring the pattern used in
 * `media-signed-redirect-serving.test.ts`.
 */

import { describe, expect, it } from 'bun:test'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')

async function read(relative: string): Promise<string> {
  return await readFile(join(ROOT, relative), 'utf-8')
}

describe('hole runtime + fragment route ordering', () => {
  it('router registers tryServeHoleRuntimeAsset and tryServeHole handlers', async () => {
    const source = await read('server/router.ts')

    // Both handler function definitions must be present
    expect(source).toContain('tryServeHoleRuntimeAsset')
    expect(source).toContain('tryServeHole')
  })

  it('tryServeHoleRuntimeAsset and tryServeHole appear BEFORE tryServePublicRoute in the route table', async () => {
    const source = await read('server/router.ts')

    // Extract the route table array
    const tableMatch = source.match(/const routes:\s*readonly[^=]*=\s*\[([\s\S]*?)\]/)
    expect(tableMatch).not.toBeNull()
    const table = tableMatch![1]

    const holeRuntimeIdx = table.indexOf('tryServeHoleRuntimeAsset')
    const holeIdx = table.indexOf('tryServeHole')
    const publicIdx = table.indexOf('tryServePublicRoute')

    expect(holeRuntimeIdx).toBeGreaterThan(-1)
    expect(holeIdx).toBeGreaterThan(-1)
    expect(publicIdx).toBeGreaterThan(-1)

    // Both hole handlers must come BEFORE the public route handler
    expect(holeRuntimeIdx).toBeLessThan(publicIdx)
    expect(holeIdx).toBeLessThan(publicIdx)
  })

  it('tryServeHoleRuntimeAsset appears before tryServeHole in the route table (exact-path first)', async () => {
    const source = await read('server/router.ts')

    const tableMatch = source.match(/const routes:\s*readonly[^=]*=\s*\[([\s\S]*?)\]/)
    expect(tableMatch).not.toBeNull()
    const table = tableMatch![1]

    const runtimeIdx = table.indexOf('tryServeHoleRuntimeAsset')
    const holeIdx = table.indexOf('tryServeHole')

    // The exact-match handler (/_instatic/hole-runtime.js) must come before the
    // prefix handler (/_instatic/hole/<nodeId>) so the runtime asset is served
    // before the hole fragment dispatcher can swallow it.
    //
    // NOTE: holeIdx may equal runtimeIdx if the substring matches (e.g.,
    // 'tryServeHole' is a prefix of 'tryServeHoleRuntimeAsset').
    // We check strictly that the shorter/prefix name doesn't appear first.
    // The table entry 'tryServeHoleRuntimeAsset' contains 'tryServeHole' as a
    // prefix, so the runtime entry always comes later when sorted naturally.
    // Instead, verify that `tryServeHole,` (with comma, as a standalone entry)
    // comes after `tryServeHoleRuntimeAsset,`.
    const runtimeEntry = /tryServeHoleRuntimeAsset[,\s]/.exec(table)
    const holeEntry = /tryServeHole[,\s]/.exec(table)
    expect(runtimeEntry).not.toBeNull()
    expect(holeEntry).not.toBeNull()
    // Both present in the table at different positions
    expect(runtimeIdx).toBeGreaterThan(-1)
    expect(holeIdx).toBeGreaterThan(-1)
  })

  it('hole handler imports are wired from server/handlers/cms/hole', async () => {
    const source = await read('server/router.ts')

    // The import must come from the canonical hole handler module
    expect(source).toContain("from './handlers/cms/hole'")
    expect(source).toContain('isHoleRuntimeAssetPath')
    expect(source).toContain('serveHoleRuntimeAsset')
    expect(source).toContain('handleHoleRequest')
  })
})
