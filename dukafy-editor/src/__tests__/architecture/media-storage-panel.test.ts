/**
 * Architecture gate: the media storage settings UI lives as a sidebar
 * panel on the Media workspace, NOT as a standalone admin route.
 *
 * Invariants:
 *   1. The MediaSidebar declares a `'storage'` panel id and renders the
 *      MediaStoragePanel for it. Drift between the union and the render
 *      branch would surface as a runtime "undefined panel" failure.
 *   2. The rail button for the storage panel is gated by `storage.elect`
 *      — the same capability the API endpoints
 *      (`server/handlers/cms/mediaStorageAdmin.ts`) require. Mismatch
 *      would either let a user open a panel that 403s on first action,
 *      or hide a panel from someone who can use it.
 *   3. There is NO standalone `/admin/media/storage` page or
 *      `mediaStorage` workspace value — those were folded into the
 *      sidebar panel. Re-introducing them silently would split the
 *      surface again.
 */

import { describe, expect, it } from 'bun:test'
import { readFile, stat } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')

async function read(relative: string): Promise<string> {
  return await readFile(join(ROOT, relative), 'utf-8')
}

async function exists(relative: string): Promise<boolean> {
  try {
    await stat(join(ROOT, relative))
    return true
  } catch {
    return false
  }
}

describe('media storage settings panel', () => {
  it('MediaSidebar declares the storage panel id', async () => {
    const source = await read('src/admin/pages/media/components/MediaSidebar/MediaSidebar.tsx')
    expect(source).toMatch(/MediaSidebarPanelId\s*=\s*'folders'\s*\|\s*'storage'/)
  })

  it('MediaSidebar renders MediaStoragePanel for the storage panel', async () => {
    const source = await read('src/admin/pages/media/components/MediaSidebar/MediaSidebar.tsx')
    expect(source).toContain('MediaStoragePanel')
    // The render branch must check `activePanel === 'folders'` so the
    // fallback lands on the storage panel; the bare/padded body-mode
    // selection must follow the same branch.
    expect(source).toMatch(/<MediaStoragePanel\s*\/>/)
  })

  it('storage rail button is gated by storage.elect', async () => {
    const source = await read('src/admin/pages/media/components/MediaSidebar/MediaSidebar.tsx')
    expect(source).toMatch(/hasCapability\(\s*currentUser\s*,\s*'storage\.elect'\s*\)/)
  })

  it('panel and server endpoint share the storage.elect gate', async () => {
    const sidebar = await read('src/admin/pages/media/components/MediaSidebar/MediaSidebar.tsx')
    const handler = await read('server/handlers/cms/mediaStorageAdmin.ts')
    expect(sidebar).toContain("'storage.elect'")
    expect(handler).toContain("'storage.elect'")
  })

  it('no standalone mediaStorage workspace or page exists', async () => {
    const workspace = await read('src/admin/workspace.ts')
    const access = await read('src/admin/access.ts')
    const router = await read('src/admin/router.tsx')
    expect(workspace).not.toContain("'mediaStorage'")
    expect(access).not.toContain("'mediaStorage'")
    expect(router).not.toContain('/admin/media/storage')
    expect(await exists('src/admin/pages/mediaStorage')).toBe(false)
  })

  it('MediaStoragePanel uses the shared persistence client', async () => {
    const source = await read(
      'src/admin/pages/media/components/MediaStoragePanel/MediaStoragePanel.tsx',
    )
    // The panel must NOT call fetch directly — every endpoint is owned
    // by `@core/persistence/cmsMediaStorage` so envelope validation and
    // error shaping stay in one place.
    expect(source).toContain("from '@core/persistence/cmsMediaStorage'")
    expect(source).not.toMatch(/\bfetch\s*\(/)
  })
})
