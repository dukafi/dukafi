import { describe, expect, it } from 'bun:test'
import { ApiError } from '@core/http'
import type { FontEntry } from '@core/fonts'
import {
  installCmsGoogleFont,
  listCmsGoogleFonts,
  registerCustomFont,
} from '@core/persistence/cmsFonts'

const VALID_FONT: FontEntry = {
  id: 'inter',
  source: 'google',
  family: 'Inter',
  variants: ['400'],
  subsets: ['latin'],
  files: [
    {
      variant: '400',
      subset: 'latin',
      path: '/uploads/fonts/inter/400.woff2',
      format: 'woff2',
    },
  ],
  createdAt: 1,
  updatedAt: 2,
}

describe('cmsFonts client — envelope hardening (F3 Type-B + F4 cast removal)', () => {
  it('installCmsGoogleFont round-trips a fully-validated FontEntry on success', async () => {
    const result = await installCmsGoogleFont(
      { family: 'Inter', variants: ['400'], subsets: ['latin'] },
      async () => new Response(JSON.stringify({ font: VALID_FONT }), { status: 200 }),
    )
    expect(result).toEqual(VALID_FONT)
  })

  // F3 Type-B: cmsFonts used to `throw new Error(...)` on a non-ok response, so
  // callers branching on `err instanceof ApiError` / `err.status` silently
  // failed to match. After migrating to readEnvelope it MUST throw ApiError
  // carrying the HTTP status, with the server `{ error }` message surfaced.
  it('installCmsGoogleFont throws ApiError with .status on a non-ok response', async () => {
    let caught: unknown
    try {
      await installCmsGoogleFont(
        { family: 'Inter', variants: ['400'], subsets: ['latin'] },
        async () => new Response(JSON.stringify({ error: 'step_up_required' }), { status: 401 }),
      )
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(ApiError)
    expect((caught as ApiError).status).toBe(401)
    expect((caught as ApiError).message).toBe('step_up_required')
  })

  it('listCmsGoogleFonts throws ApiError with .status on a non-ok response', async () => {
    let caught: unknown
    try {
      await listCmsGoogleFonts(
        async () => new Response(JSON.stringify({ error: 'boom' }), { status: 500 }),
      )
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(ApiError)
    expect((caught as ApiError).status).toBe(500)
  })

  it('registerCustomFont throws ApiError with .status on a non-ok response', async () => {
    let caught: unknown
    try {
      await registerCustomFont(
        { family: 'Inter', files: [{ mediaAssetId: 'm1', variant: '400' }] },
        async () => new Response(JSON.stringify({ error: 'forbidden' }), { status: 403 }),
      )
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(ApiError)
    expect((caught as ApiError).status).toBe(403)
  })

  // F4: the inner `font` is now validated against FontEntrySchema instead of
  // being cast `as FontEntry`. A server response with a type-drifted field must
  // be rejected at the boundary, not silently cast into undefined-in-UI.
  it('installCmsGoogleFont rejects a FontEntry whose field fails the schema', async () => {
    const badFont = { ...VALID_FONT, createdAt: 'not-a-number' }
    await expect(
      installCmsGoogleFont(
        { family: 'Inter', variants: ['400'], subsets: ['latin'] },
        async () => new Response(JSON.stringify({ font: badFont }), { status: 200 }),
      ),
    ).rejects.toThrow()
  })
})
