/**
 * Page settings — the access half.
 *
 * Access is not document content: it decides which directory the page bakes
 * into and whether the storefront checks for a session first. So it is loaded
 * and saved through its own endpoint, and the properties worth pinning are
 * the two ways this could quietly do the wrong thing — reporting a save that
 * failed, and letting a page be both gated and the way in.
 */
import { describe, expect, it, mock, beforeEach, afterEach } from 'bun:test'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PageSettingsDialog } from '@admin/shared/dialogs/PageSettingsDialog'
import type { Page } from '@core/page-tree'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { 'content-type': 'application/json' },
  })
}

const page = {
  id: '7', slug: 'checkout', title: 'Checkout', nodes: {}, rootNodeId: 'body',
} as unknown as Page

function accessBody(overrides: Record<string, unknown> = {}) {
  return { access: 'public', authRedirect: false, signInPageSlug: 'login', ...overrides }
}

let originalFetch: typeof fetch

beforeEach(() => { originalFetch = globalThis.fetch })
afterEach(() => { globalThis.fetch = originalFetch })

describe('PageSettingsDialog access', () => {
  it('shows the access the server reports, not a default', async () => {
    globalThis.fetch = mock(async () => json(accessBody({ access: 'customer' }))) as unknown as typeof fetch

    render(<PageSettingsDialog page={page} pages={[page]} onCancel={() => {}} onSave={() => {}} />)

    await waitFor(() => {
      expect((screen.getByLabelText('Who can see this') as HTMLInputElement).value)
        .toBe('Signed-in customers only')
    })
    // And it says where signed-out visitors will actually end up.
    expect(screen.getByText(/Signed-out visitors go to “login”/)).toBeDefined()
  })

  it('warns when gating a page with no sign-in page set', async () => {
    globalThis.fetch = mock(async () =>
      json(accessBody({ access: 'customer', signInPageSlug: null }))) as unknown as typeof fetch

    render(<PageSettingsDialog page={page} pages={[page]} onCancel={() => {}} onSave={() => {}} />)

    // A gated page with nowhere to send people is a 404, and saying so here
    // is cheaper than the merchant discovering it on the storefront.
    await waitFor(() => expect(screen.getByText(/will be a 404 for signed-out visitors/)).toBeDefined())
  })

  it('saves access alongside the rename', async () => {
    const patched: Array<Record<string, unknown>> = []
    globalThis.fetch = mock(async (input: string | URL | Request, init?: RequestInit) => {
      if ((init?.method ?? 'GET') === 'PATCH') {
        patched.push(JSON.parse(String(init?.body)))
        return json(accessBody({ access: 'customer' }))
      }
      return json(accessBody())
    }) as unknown as typeof fetch

    const saved: unknown[] = []
    render(<PageSettingsDialog page={page} pages={[page]} onCancel={() => {}} onSave={(payload) => saved.push(payload)} />)

    await waitFor(() => expect(screen.getByLabelText('Who can see this')).toBeDefined())
    await userEvent.click(screen.getByLabelText('Who can see this'))
    await userEvent.click(await screen.findByRole('option', { name: 'Signed-in customers only' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(patched.length).toBe(1))
    expect(patched[0].access).toBe('customer')
    expect(saved.length).toBe(1)
  })

  // Access is only written when it CHANGED, so a rename still works on a
  // store where the access endpoint is unreachable.
  it('does not touch the access endpoint for a plain rename', async () => {
    const methods: string[] = []
    globalThis.fetch = mock(async (input: string | URL | Request, init?: RequestInit) => {
      methods.push(init?.method ?? 'GET')
      return json(accessBody())
    }) as unknown as typeof fetch

    const saved: unknown[] = []
    render(<PageSettingsDialog page={page} pages={[page]} onCancel={() => {}} onSave={(payload) => saved.push(payload)} />)

    await waitFor(() => expect(screen.getByLabelText('Who can see this')).toBeDefined())
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(saved.length).toBe(1))
    expect(methods).not.toContain('PATCH')
  })

  // The dialog must not close on a failed save: leaving a page public when
  // the merchant asked to gate it, silently, is the one failure that matters.
  it('reports a failed access save and stays open', async () => {
    globalThis.fetch = mock(async (input: string | URL | Request, init?: RequestInit) => {
      if ((init?.method ?? 'GET') === 'PATCH') {
        return json({ error: { code: 'invalid_access', message: 'access must be one of: public, customer' } }, 422)
      }
      return json(accessBody())
    }) as unknown as typeof fetch

    const saved: unknown[] = []
    render(<PageSettingsDialog page={page} pages={[page]} onCancel={() => {}} onSave={(payload) => saved.push(payload)} />)

    await waitFor(() => expect(screen.getByLabelText('Who can see this')).toBeDefined())
    // Change it first — an unchanged save never reaches the endpoint.
    await userEvent.click(screen.getByLabelText('Who can see this'))
    await userEvent.click(await screen.findByRole('option', { name: 'Signed-in customers only' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(screen.getByRole('alert')).toBeDefined())
    expect(screen.getByRole('alert').textContent).toContain('access must be one of')
    expect(saved.length).toBe(0)
  })

  // A page cannot both require sign-in and be where people go to sign in.
  it('takes the gate off when a page becomes the sign-in destination', async () => {
    globalThis.fetch = mock(async () => json(accessBody({ access: 'customer' }))) as unknown as typeof fetch

    render(<PageSettingsDialog page={page} pages={[page]} onCancel={() => {}} onSave={() => {}} />)

    await waitFor(() => {
      expect((screen.getByLabelText('Who can see this') as HTMLInputElement).value)
        .toBe('Signed-in customers only')
    })
    await userEvent.click(screen.getByRole('checkbox'))

    expect((screen.getByLabelText('Who can see this') as HTMLInputElement).value).toBe('Anyone')
  })
})
