/**
 * Plugin host import boundaries.
 *
 * The worker transport is deliberately lower-level than API dispatch. If the
 * pool imports apiDispatch, and dispatch imports handlers that call back into
 * worker RPC helpers, fallow reports a circular dependency cluster.
 */

import { describe, expect, it } from 'bun:test'
import { readFile, readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const HOST_DIR = join(ROOT, 'server/plugins/host')

async function read(relative: string): Promise<string> {
  return await readFile(join(ROOT, relative), 'utf-8')
}

describe('plugin host import boundaries', () => {
  it('keeps worker transport below API dispatch and replies', async () => {
    const workerPool = await read('server/plugins/host/workerPool.ts')
    const apiDispatch = await read('server/plugins/host/apiDispatch.ts')
    const apiReplies = await read('server/plugins/host/apiReplies.ts')

    expect(workerPool).not.toContain("from './apiDispatch'")
    expect(apiDispatch).not.toContain("from './workerPool'")
    expect(apiDispatch).toContain("from './apiReplies'")
    expect(apiReplies).toContain("from './workerState'")
  })

  it('keeps host handlers from importing workerPool directly', async () => {
    const handlersDir = join(HOST_DIR, 'handlers')
    const handlerFiles = (await readdir(handlersDir)).filter((name) => name.endsWith('.ts'))

    for (const file of handlerFiles) {
      const source = await readFile(join(handlersDir, file), 'utf-8')
      expect({
        file,
        importsWorkerPool: source.includes("from '../workerPool'"),
      }).toEqual({ file, importsWorkerPool: false })
    }
  })
})
