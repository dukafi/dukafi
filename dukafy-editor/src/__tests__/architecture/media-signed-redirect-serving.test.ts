/**
 * Architecture gates for serving media stored on `signed-redirect`
 * adapters (private S3 buckets, signed-URL CDNs, etc.).
 *
 * Two pieces have to agree:
 *
 *   1. The host-side router exposes a `/_instatic/media/<adapterId>/<storagePath>`
 *      route that looks up the adapter, calls `getReadUrl`, and 302-redirects.
 *      This is the read-side of any adapter whose servingMode isn't
 *      `'public-url'`.
 *
 *   2. `dispatchUpload` SUBSTITUTES the plugin's returned publicUrl with the
 *      host-owned `/_instatic/media/...` URL for those adapters — so the plugin
 *      doesn't have to know the host's resolution URL shape, and (more
 *      importantly) the stored `media_assets.public_path` never holds a
 *      time-expiring signed URL.
 *
 * Without either piece, S3 plugins are limited to public buckets / CDNs —
 * a major real-world use case (private buckets) wouldn't work end-to-end.
 */

import { describe, expect, it } from 'bun:test'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')

async function read(relative: string): Promise<string> {
  return await readFile(join(ROOT, relative), 'utf-8')
}

describe('media signed-redirect serving', () => {
  it('router exposes /_instatic/media/<adapterId>/<storagePath> with 302 redirect', async () => {
    const source = await read('server/router.ts')
    expect(source).toContain('tryServeMediaRedirect')
    expect(source).toContain("'/_instatic/media/'")
    expect(source).toContain('mediaStorageRegistry')
    // The route must hit the adapter's getReadUrl and emit a 302. Without
    // these the route would 200 / 404 silently and signed-redirect would
    // appear to "work" in dev but not in production.
    expect(source).toMatch(/getReadUrl\(\s*storagePath\s*,\s*\d+\s*\)/)
    expect(source).toMatch(/status:\s*302/)
    expect(source).toContain("'no-store'")
  })

  it('the redirect route is registered in the route table', async () => {
    const source = await read('server/router.ts')
    // The route must be listed BEFORE tryServeUpload (the /uploads/* path)
    // and BEFORE tryServePublicRoute (the public-slug + content-row
    // fallthrough) so a namespace clash can't accidentally consume it.
    const tableMatch = source.match(/const routes:\s*readonly[^=]*=\s*\[([\s\S]*?)\]/)
    expect(tableMatch).not.toBeNull()
    const table = tableMatch![1]
    const mediaIdx = table.indexOf('tryServeMediaRedirect')
    const uploadIdx = table.indexOf('tryServeUpload')
    const publicIdx = table.indexOf('tryServePublicRoute')
    expect(mediaIdx).toBeGreaterThan(-1)
    expect(uploadIdx).toBeGreaterThan(mediaIdx)
    expect(publicIdx).toBeGreaterThan(mediaIdx)
  })

  it('dispatchUpload substitutes the host-owned URL for non-public-url adapters', async () => {
    const source = await read('server/handlers/cms/mediaUploadDispatch.ts')
    expect(source).toContain('buildSignedRedirectUrl')
    // The substitution must branch on the adapter's servingMode — not blindly
    // override every adapter (that would break public-url adapters where
    // the renderer needs the absolute URL).
    expect(source).toMatch(
      /adapter\.servingMode === 'public-url'[\s\S]*?result\.publicUrl[\s\S]*?buildSignedRedirectUrl/,
    )
    // The built URL must match the router's expected shape.
    expect(source).toMatch(/`\/_instatic\/media\/\$\{encodeURIComponent\(adapterId\)\}\/\$\{encodeURIComponent\(storagePath\)\}`/)
  })

  it('the route encoding round-trips correctly', async () => {
    // The router decodes with decodeURIComponent, the dispatcher encodes
    // with encodeURIComponent. If these two ever drift (one switches to
    // raw URL escaping, the other to a different alphabet), signed-redirect
    // would 404 silently. Lock it down.
    const router = await read('server/router.ts')
    const dispatch = await read('server/handlers/cms/mediaUploadDispatch.ts')
    // Two occurrences of decodeURIComponent in the route handler — one for
    // adapterId, one for storagePath.
    expect((router.match(/decodeURIComponent\(match\[\d+\]\)/g) ?? []).length).toBeGreaterThanOrEqual(2)
    expect(dispatch).toContain('encodeURIComponent(adapterId)')
    expect(dispatch).toContain('encodeURIComponent(storagePath)')
  })

  it('signed redirect responses use no-store cache header', async () => {
    const source = await read('server/router.ts')
    // The redirect target is a signed URL with an expiry. Caching the 302
    // would mean reusing a stale signed URL after it expires — broken
    // serves once the cache survives the TTL. Lock 'no-store' in.
    const handlerSlice = source.slice(
      source.indexOf('function tryServeMediaRedirect'),
      source.indexOf('async function tryServeStaticAsset'),
    )
    expect(handlerSlice).toMatch(/'cache-control':\s*'no-store'/)
  })
})
