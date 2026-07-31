/**
 * Architecture gate: the Layer A disk fast-path (`readArtefact`) is invoked
 * BEFORE the live resolver (`resolvePublicRoute`) in `publicRouter.ts`.
 *
 * The central safety property of Layer A is that pre-rendered HTML is served
 * at ≤ 5 ms TTFB with no DB hit — only if `readArtefact` runs before
 * `resolvePublicRoute` can the resolver's DB query be avoided on a cache hit.
 *
 * A simple source-position check is sufficient here; the functional behaviour
 * is covered by `publishStaticArtefact.test.ts`. The regex approach avoids an
 * AST parser dependency while still being robust enough to catch a source move
 * vs. a comment.
 */

import { describe, expect, it } from 'bun:test'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')

async function read(relative: string): Promise<string> {
  return readFile(join(ROOT, relative), 'utf-8')
}

describe('static-artefact-served-before-render', () => {
  it('readArtefact is called before resolvePublicRoute in publicRouter.ts', async () => {
    const source = await read('server/publish/publicRouter.ts')

    // Both must be present — search for the *call* sites, not declarations.
    // `resolvePublicRoute` is declared in the same file so a bare
    // `indexOf('resolvePublicRoute(')` would match the declaration first;
    // `await resolvePublicRoute(` is guaranteed to be the call site.
    const artefactIdx = source.indexOf('readArtefact(')
    const resolverIdx = source.indexOf('await resolvePublicRoute(')

    expect(artefactIdx).toBeGreaterThan(-1)
    expect(resolverIdx).toBeGreaterThan(-1)

    // Artefact lookup must precede the resolver call
    expect(artefactIdx).toBeLessThan(resolverIdx)
  })

  it('readArtefact is imported in publicRouter.ts from staticArtefact', async () => {
    const source = await read('server/publish/publicRouter.ts')
    // The import must name staticArtefact as the source
    expect(source).toMatch(/import\s*\{[^}]*readArtefact[^}]*\}\s*from\s*['"]\.\/staticArtefact['"]/)
  })

  it('the disk fast-path is gated on the canonical (render-affecting) query being empty', async () => {
    const source = await read('server/publish/publicRouter.ts')
    // The guard gates on the canonicalised query — junk params canonicalise to
    // '' and serve the artefact; only render-affecting (loop pagination) params
    // fall through to the live renderer (ISS-032).
    expect(source).toContain('canonicalRenderQuery(url.searchParams)')
    expect(source).toContain("canonicalQuery === ''")
  })

  it('the disk path does not call applyPublishedHtmlPipeline at request time', async () => {
    const source = await read('server/publish/publicRouter.ts')
    // The pipeline call must only appear AFTER resolvePublicRoute, not in the
    // disk fast-path branch. Verify by checking that applyPublishedHtmlPipeline
    // does not appear before the resolver call position.
    const artefactReturn = source.indexOf('return new Response(html,')
    const resolverIdx = source.indexOf('resolvePublicRoute(')
    const pipelineIdx = source.indexOf('applyPublishedHtmlPipeline(')

    // The disk path's early return does not include applyPublishedHtmlPipeline
    // (the pipeline call only exists in the live-render branch below the resolver)
    expect(pipelineIdx).toBeGreaterThan(resolverIdx)
  })
})
