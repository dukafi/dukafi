import { describe, expect, it } from 'bun:test'
import { ApiError } from '@core/http'
import { createCmsDataTable, listCmsDataTables } from '@core/persistence/cmsData'
import { setUserPreference } from '@core/persistence/userPreferences'

/**
 * Locks in the persistence-layer migration to the canonical `apiRequest`
 * client (@core/http). Every persistence helper used to hand-roll
 * `fetchImpl(url, { credentials, headers, body: JSON.stringify(...) })` +
 * `readEnvelope`. After the migration they all funnel through `apiRequest`,
 * which is the single owner of transport policy:
 *
 *   • credentials default to 'include' (session cookie always attached),
 *   • a non-FormData body is JSON.stringify-ed with a Content-Type header,
 *   • the success body is validated against the supplied TypeBox schema,
 *   • a non-OK response throws a typed ApiError carrying the HTTP status.
 *
 * These invariants are transport-level, so one representative migrated
 * function exercises the whole layer.
 */
describe('persistence → apiRequest migration invariants', () => {
  it('sends credentials:include + JSON Content-Type and validates the body via the schema', async () => {
    const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = []
    const input = {
      name: 'Products',
      slug: 'products',
      kind: 'postType' as const,
      routeBase: '/products',
      singularLabel: 'Product',
      pluralLabel: 'Products',
      primaryFieldId: 'title',
      fields: [{ type: 'text', id: 'title', label: 'Title', required: true, builtIn: true }],
    }

    const table = await createCmsDataTable(input, async (requestInput, init) => {
      calls.push({ input: requestInput, init })
      return new Response(
        JSON.stringify({
          table: {
            id: 'products',
            name: 'Products',
            slug: 'products',
            kind: 'postType',
            routeBase: '/products',
            singularLabel: 'Product',
            pluralLabel: 'Products',
            primaryFieldId: 'title',
            fields: input.fields,
            system: false,
            rowCount: 0,
            createdByUserId: null,
            updatedByUserId: null,
            createdAt: '2026-05-01T10:00:00.000Z',
            updatedAt: '2026-05-01T10:00:00.000Z',
          },
        }),
        { status: 201 },
      )
    })

    // Schema-validated success body reaches the caller as a typed value.
    expect(table.id).toBe('products')

    // apiRequest owns the transport policy: include + JSON serialization.
    expect(calls[0].input).toBe('/admin/api/cms/data/tables')
    expect(calls[0].init).toMatchObject({
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    })
    expect(calls[0].init?.body).toBe(JSON.stringify(input))
  })

  it('rejects a schema-invalid success body at the boundary', async () => {
    await expect(
      listCmsDataTables(async () =>
        new Response(JSON.stringify({ tables: [{ id: 'bad', slug: 'bad' }] }), { status: 200 }),
      ),
    ).rejects.toThrow('/tables/0')
  })

  it('surfaces a non-OK response as ApiError carrying the HTTP status', async () => {
    let caught: unknown
    try {
      await listCmsDataTables(async () =>
        new Response(JSON.stringify({ error: 'step_up_required' }), { status: 401 }),
      )
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(ApiError)
    expect((caught as ApiError).status).toBe(401)
    expect((caught as ApiError).message).toBe('step_up_required')
  })

  it('standardizes user preferences on credentials:include (previously same-origin)', async () => {
    const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = []
    await setUserPreference(
      'module-inserter',
      { favorites: [{ kind: 'module', id: 'base.text' }] },
      async (input, init) => {
        calls.push({ input, init })
        return new Response(
          JSON.stringify({ value: { favorites: [{ kind: 'module', id: 'base.text' }] } }),
          { status: 200 },
        )
      },
    )

    expect(calls[0].input).toBe('/admin/api/cms/me/preferences/module-inserter')
    expect(calls[0].init).toMatchObject({ method: 'PUT', credentials: 'include' })
  })
})
