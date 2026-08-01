/**
 * Regression coverage for the CMS-handler error-message + boundary cleanup:
 *
 *  1. Handlers now route `catch (err)` values through the canonical
 *     `getErrorMessage(err, fallback)` extractor instead of the hand-rolled
 *     `err instanceof Error ? err.message : '…'` idiom. The hand-rolled form
 *     skipped getErrorMessage's empty-message guard, so an `Error` with a
 *     blank message used to surface as a literal `''` to the client. We assert
 *     the fallback wins for an empty-message Error via `lifecycleErrorMessage`
 *     (a representative handler-path helper) while non-empty messages pass
 *     through unchanged.
 *
 *  2. `loadPublicSiteIdentity` (the public-site route) now parses
 *     `settings_json` through a TypeBox boundary instead of an untrusted
 *     `(stored as Record<…>).site.settings.faviconUrl as string` cast chain.
 *     A well-formed payload yields the favicon; an empty or malformed payload
 *     resolves to `null` with no throw and no silently-wrong value.
 */
import { describe, expect, it } from 'bun:test'
import { createTestDb } from '../helpers/createTestDb'
import { createSite } from '../../../server/repositories/setup'
import { handleSetupRoutes } from '../../../server/handlers/cms/setup'
import { lifecycleErrorMessage } from '../../../server/handlers/cms/plugins/shared'

async function readPublicSite(
  db: Parameters<typeof handleSetupRoutes>[1],
): Promise<{ name: string | null; faviconUrl: string | null }> {
  const req = new Request('http://localhost/admin/api/cms/public-site', { method: 'GET' })
  const res = await handleSetupRoutes(req, db)
  expect(res).not.toBeNull()
  expect(res!.status).toBe(200)
  return res!.json() as Promise<{ name: string | null; faviconUrl: string | null }>
}

describe('CMS handler error-message extraction', () => {
  it('surfaces the fallback for an empty / whitespace-only Error message', () => {
    expect(lifecycleErrorMessage(new Error(''))).toBe('Plugin lifecycle hook failed')
    expect(lifecycleErrorMessage(new Error('   '))).toBe('Plugin lifecycle hook failed')
  })

  it('preserves a non-empty Error message unchanged', () => {
    expect(lifecycleErrorMessage(new Error('boom'))).toBe('boom')
  })

  it('falls back for a non-Error thrown value', () => {
    expect(lifecycleErrorMessage('weird')).toBe('Plugin lifecycle hook failed')
  })
})

describe('loadPublicSiteIdentity favicon resolution (boundary-parsed settings_json)', () => {
  it('returns the favicon URL for a well-formed settings_json', async () => {
    const { db, cleanup } = await createTestDb()
    try {
      await createSite(db, 'Brand Site', {
        cmsSiteSchemaVersion: 1,
        site: { settings: { faviconUrl: 'https://cdn.test/favicon.png', shortcuts: {} } },
      })
      expect(await readPublicSite(db)).toEqual({
        name: 'Brand Site',
        faviconUrl: 'https://cdn.test/favicon.png',
      })
    } finally {
      await cleanup()
    }
  })

  it('returns the favicon even when stored settings lack a shortcuts field', async () => {
    // Raw storage is not guaranteed to carry `shortcuts` (parseSiteSettings
    // backfills it on the read path). The narrow boundary schema must not
    // require the full SiteSettings shape, or a valid favicon silently
    // disappears from the public login page.
    const { db, cleanup } = await createTestDb()
    try {
      await createSite(db, 'No-Shortcuts Site', {
        site: { settings: { faviconUrl: 'https://x/f.png' } },
      })
      expect(await readPublicSite(db)).toEqual({
        name: 'No-Shortcuts Site',
        faviconUrl: 'https://x/f.png',
      })
    } finally {
      await cleanup()
    }
  })

  it('returns null favicon for an empty settings_json (fresh install)', async () => {
    const { db, cleanup } = await createTestDb()
    try {
      await createSite(db, 'Bare Site', {})
      expect(await readPublicSite(db)).toEqual({ name: 'Bare Site', faviconUrl: null })
    } finally {
      await cleanup()
    }
  })

  it('returns null favicon for a malformed settings_json without throwing', async () => {
    const { db, cleanup } = await createTestDb()
    try {
      // faviconUrl is the wrong type and shortcuts is absent — the settings
      // sub-object fails validation, so the route must resolve to null rather
      // than coercing 42 into the response or throwing.
      await createSite(db, 'Broken Site', {
        site: { settings: { faviconUrl: 42 } },
      })
      expect(await readPublicSite(db)).toEqual({ name: 'Broken Site', faviconUrl: null })
    } finally {
      await cleanup()
    }
  })
})
