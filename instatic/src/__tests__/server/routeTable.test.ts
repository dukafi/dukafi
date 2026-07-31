import { describe, expect, it } from 'bun:test'
import {
  runRouteTable,
  type Route,
  type RouteParams,
} from '../../../server/handlers/cms/routeTable'
import type { DbClient } from '../../../server/db/client'

// runRouteTable never touches the db — it only forwards it to handlers. A bare
// sentinel is enough to assert the forwarding without standing up a real client.
const FAKE_DB = { dialect: 'sqlite' } as unknown as DbClient

function req(method: string, path: string): Request {
  return new Request(`http://localhost${path}`, { method })
}

function ok(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

describe('runRouteTable', () => {
  it('dispatches to the matching handler for the right method + path', async () => {
    let seen: RouteParams | null = null
    const routes: Route<[]>[] = [
      {
        method: 'GET',
        pattern: '/admin/api/cms/things',
        handler: async (_req, _db, params) => {
          seen = params
          return ok({ hit: 'list' })
        },
      },
    ]

    const res = await runRouteTable(req('GET', '/admin/api/cms/things'), FAKE_DB, routes)
    expect(res).not.toBeNull()
    expect(res!.status).toBe(200)
    expect(await res!.json()).toEqual({ hit: 'list' })
    // String patterns carry no params.
    expect(seen).toEqual({})
  })

  it('extracts named regex params and decodes them once', async () => {
    let seenId: string | undefined
    const routes: Route<[]>[] = [
      {
        method: 'PATCH',
        pattern: /^\/admin\/api\/cms\/things\/(?<id>[^/]+)$/,
        handler: async (_req, _db, params) => {
          seenId = params.id
          return ok({ id: params.id })
        },
      },
    ]

    // %20 → space, %2F is NOT present (a slash would break the [^/]+ segment),
    // so an encoded slug round-trips to its decoded form exactly once.
    const res = await runRouteTable(
      req('PATCH', '/admin/api/cms/things/my%20slug'),
      FAKE_DB,
      routes,
    )
    expect(res!.status).toBe(200)
    expect(seenId).toBe('my slug')
    expect(await res!.json()).toEqual({ id: 'my slug' })
  })

  it('returns 405 when a path matches but no route has that method', async () => {
    const routes: Route<[]>[] = [
      { method: 'GET', pattern: '/admin/api/cms/things', handler: async () => ok({}) },
      { method: 'POST', pattern: '/admin/api/cms/things', handler: async () => ok({}) },
    ]

    const res = await runRouteTable(req('DELETE', '/admin/api/cms/things'), FAKE_DB, routes)
    expect(res).not.toBeNull()
    expect(res!.status).toBe(405)
    expect(await res!.json()).toEqual({ error: 'Method not allowed' })
  })

  it('returns 405 for a wrong method on a parameterised path too', async () => {
    const routes: Route<[]>[] = [
      {
        method: 'DELETE',
        pattern: /^\/admin\/api\/cms\/things\/(?<id>[^/]+)$/,
        handler: async () => ok({}),
      },
    ]

    const res = await runRouteTable(req('GET', '/admin/api/cms/things/abc'), FAKE_DB, routes)
    expect(res!.status).toBe(405)
  })

  it('returns null when no route pattern matches (caller falls through to 404)', async () => {
    const routes: Route<[]>[] = [
      { method: 'GET', pattern: '/admin/api/cms/things', handler: async () => ok({}) },
    ]

    const res = await runRouteTable(req('GET', '/admin/api/cms/other'), FAKE_DB, routes)
    expect(res).toBeNull()
  })

  it('forwards extra per-request context verbatim to the handler', async () => {
    let seenExtra: string | undefined
    const routes: Route<[{ marker: string }]>[] = [
      {
        method: 'GET',
        pattern: '/admin/api/cms/ctx',
        handler: async (_req, _db, _params, extra) => {
          seenExtra = extra.marker
          return ok({})
        },
      },
    ]

    await runRouteTable(req('GET', '/admin/api/cms/ctx'), FAKE_DB, routes, { marker: 'xyz' })
    expect(seenExtra).toBe('xyz')
  })

  it('data/rows shape: a `$`-anchored sub-route is not swallowed by the bare item route', async () => {
    // Mirrors DATA_ROW_ROUTES: `/rows/:id/publish` (POST) and `/rows/:id`
    // (GET/PATCH). The `(?<id>[^/]+)` segment cannot span `/` and every pattern
    // is `$`-anchored, so the sub-route and the item route are disjoint.
    const calls: string[] = []
    const ITEM = '/admin/api/cms/data/rows/(?<id>[^/]+)'
    const routes: Route<[]>[] = [
      {
        method: 'POST',
        pattern: new RegExp(`^${ITEM}/publish$`),
        handler: async (_r, _d, p) => { calls.push(`publish:${p.id}`); return ok({}) },
      },
      {
        method: 'GET',
        pattern: new RegExp(`^${ITEM}$`),
        handler: async (_r, _d, p) => { calls.push(`get:${p.id}`); return ok({}) },
      },
      {
        method: 'PATCH',
        pattern: new RegExp(`^${ITEM}$`),
        handler: async (_r, _d, p) => { calls.push(`patch:${p.id}`); return ok({}) },
      },
    ]

    await runRouteTable(req('POST', '/admin/api/cms/data/rows/abc/publish'), FAKE_DB, routes)
    await runRouteTable(req('GET', '/admin/api/cms/data/rows/abc'), FAKE_DB, routes)
    expect(calls).toEqual(['publish:abc', 'get:abc'])

    // GET on the publish sub-route: the POST entry path-matches but method
    // doesn't, and the item route's `$` excludes the longer path → 405.
    const wrong = await runRouteTable(
      req('GET', '/admin/api/cms/data/rows/abc/publish'),
      FAKE_DB,
      routes,
    )
    expect(wrong!.status).toBe(405)
  })

  it('plugins shape: a reserved literal child is not claimed by the generic :id route', async () => {
    // Mirrors PLUGIN_ITEM_DISPATCH_PATTERN: the bare `/plugins/:id` route uses a
    // negative lookahead so it never claims the reserved literal `/plugins/events`,
    // which has its own exact GET route.
    const calls: string[] = []
    const routes: Route<[]>[] = [
      {
        method: 'GET',
        pattern: '/admin/api/cms/plugins/events',
        handler: async () => { calls.push('events'); return ok({}) },
      },
      {
        method: 'PATCH',
        pattern: /^\/admin\/api\/cms\/plugins\/(?<id>(?!events$)[^/]+)$/,
        handler: async (_r, _d, p) => { calls.push(`item:${p.id}`); return ok({}) },
      },
    ]

    // GET the reserved literal → its own handler.
    await runRouteTable(req('GET', '/admin/api/cms/plugins/events'), FAKE_DB, routes)
    // PATCH a real plugin id → the item route.
    await runRouteTable(req('PATCH', '/admin/api/cms/plugins/acme.workflow'), FAKE_DB, routes)
    expect(calls).toEqual(['events', 'item:acme.workflow'])

    // PATCH the reserved literal: the exact GET route path-matches but method
    // doesn't, and the lookahead keeps the item route from claiming it → 405,
    // NOT a stray dispatch to the item handler with id="events".
    const reserved = await runRouteTable(
      req('PATCH', '/admin/api/cms/plugins/events'),
      FAKE_DB,
      routes,
    )
    expect(reserved!.status).toBe(405)
    expect(calls).toEqual(['events', 'item:acme.workflow'])
  })

  it('matches routes in declaration order — first matching (method, path) wins', async () => {
    const calls: string[] = []
    const routes: Route<[]>[] = [
      {
        method: 'GET',
        pattern: /^\/admin\/api\/cms\/things\/(?<id>[^/]+)\/sub$/,
        handler: async () => {
          calls.push('sub')
          return ok({ which: 'sub' })
        },
      },
      {
        method: 'GET',
        pattern: /^\/admin\/api\/cms\/things\/(?<id>[^/]+)$/,
        handler: async () => {
          calls.push('item')
          return ok({ which: 'item' })
        },
      },
    ]

    const res = await runRouteTable(req('GET', '/admin/api/cms/things/abc/sub'), FAKE_DB, routes)
    expect(await res!.json()).toEqual({ which: 'sub' })
    expect(calls).toEqual(['sub'])
  })
})
