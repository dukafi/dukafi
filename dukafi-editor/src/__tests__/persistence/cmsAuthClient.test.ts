import { describe, expect, it } from 'bun:test'
import {
  getCurrentCmsUser,
  getCmsSetupStatus,
  loginCms,
  logoutCms,
  probeCmsSession,
  setupCms,
} from '@core/persistence/cmsAuth'

describe('CMS auth client', () => {
  it('loads setup status from the CMS API', async () => {
    const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = []
    const status = await getCmsSetupStatus(async (input, init) => {
      calls.push({ input, init })
      return new Response(JSON.stringify({ hasSite: false, hasAdmin: false, needsSetup: true }))
    })

    expect(status).toEqual({ hasSite: false, hasAdmin: false, needsSetup: true })
    expect(calls[0]).toMatchObject({
      input: '/admin/api/cms/setup/status',
      init: { method: 'GET', credentials: 'include' },
    })
  })

  it('creates the initial site and admin account', async () => {
    const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = []

    await setupCms({
      siteName: 'Studio Site',
      email: 'owner@example.com',
      password: 'long-enough-password',
    }, async (input, init) => {
      calls.push({ input, init })
      return new Response(JSON.stringify({ ok: true }), { status: 201 })
    })

    expect(calls[0].input).toBe('/admin/api/cms/setup')
    expect(calls[0].init).toMatchObject({
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    })
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({
      siteName: 'Studio Site',
      email: 'owner@example.com',
      password: 'long-enough-password',
    })
  })

  it('logs in and out with session credentials', async () => {
    const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = []

    await loginCms({
      email: 'owner@example.com',
      password: 'long-enough-password',
    }, async (input, init) => {
      calls.push({ input, init })
      return new Response(JSON.stringify({ ok: true }))
    })

    await logoutCms(async (input, init) => {
      calls.push({ input, init })
      return new Response(JSON.stringify({ ok: true }))
    })

    expect(calls[0]).toMatchObject({
      input: '/admin/api/cms/login',
      init: { method: 'POST', credentials: 'include' },
    })
    expect(calls[1]).toMatchObject({
      input: '/admin/api/cms/logout',
      init: { method: 'POST', credentials: 'include' },
    })
  })

  it('probes the current-user endpoint for authenticated sessions', async () => {
    const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = []

    await expect(probeCmsSession(async () =>
      new Response(JSON.stringify({ user: { id: 'user_1' } }), { status: 200 }),
    )).resolves.toBe(true)

    await expect(probeCmsSession(async () =>
      new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
    )).resolves.toBe(false)

    await probeCmsSession(async (input, init) => {
      calls.push({ input, init })
      return new Response(JSON.stringify({ user: { id: 'user_1' } }), { status: 200 })
    })
    expect(calls[0]).toMatchObject({
      input: '/admin/api/cms/me',
      init: { method: 'GET', credentials: 'include' },
    })
  })

  it('rejects malformed current-user payloads at the HTTP boundary', async () => {
    await expect(
      getCurrentCmsUser(async () =>
        new Response(JSON.stringify({
          user: {
            id: 'user_1',
            email: 'owner@example.com',
          },
        }), { status: 200 })),
    ).rejects.toThrow('/user')
  })
})
