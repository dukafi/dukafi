/**
 * The Connect screen — where a merchant mints a token for an AI client.
 *
 * The property that matters: the plaintext token is shown ONCE, at creation,
 * because only its SHA-256 is stored server-side. If the copy-ready command
 * were built from the LIST instead, it would silently contain a truncated
 * prefix and every merchant who used it would get a 401 with no clue why.
 */
import { describe, expect, it, mock, beforeEach, afterEach } from 'bun:test'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConnectSection } from '@admin/pages/dashboard/sections/ConnectSection'

const PLAINTEXT = 'dkf_averyrealisticlookingtokenvalue0123456789'

function listResponse(tokens: unknown[]) {
  return new Response(JSON.stringify({ tokens }), {
    status: 200, headers: { 'content-type': 'application/json' },
  })
}

function existing(overrides: Record<string, unknown> = {}) {
  return {
    id: '1', name: 'Cursor', tokenPrefix: 'dkf_abc12345',
    lastUsedAt: null, revokedAt: null, createdAt: '2026-08-15T10:00:00Z',
    ...overrides,
  }
}

let originalFetch: typeof fetch

beforeEach(() => { originalFetch = globalThis.fetch })
afterEach(() => { globalThis.fetch = originalFetch })

describe('ConnectSection', () => {
  it('lists existing tokens by their prefix, never a full secret', async () => {
    globalThis.fetch = mock(async () => listResponse([existing()])) as unknown as typeof fetch

    render(<ConnectSection />)

    await waitFor(() => expect(screen.getByText('Cursor')).toBeDefined())
    expect(screen.getByText(/dkf_abc12345/)).toBeDefined()
    expect(screen.getByText('Active')).toBeDefined()
  })

  it('shows the token and a ready-to-paste command after creating one', async () => {
    globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'POST') {
        return new Response(
          JSON.stringify({ token: { ...existing({ name: 'Claude Code' }), token: PLAINTEXT } }),
          { status: 201, headers: { 'content-type': 'application/json' } },
        )
      }
      return listResponse([])
    }) as unknown as typeof fetch

    render(<ConnectSection />)
    await waitFor(() => expect(screen.getByText('No tokens yet')).toBeDefined())

    await userEvent.click(screen.getByRole('button', { name: 'New token' }))
    await userEvent.type(screen.getByLabelText('Token name'), 'Claude Code')
    await userEvent.click(screen.getByRole('button', { name: 'Create token' }))

    const panel = await screen.findByTestId('issued-token')
    // The full secret, exactly once.
    expect(panel.textContent).toContain(PLAINTEXT)
    // And the command a merchant can paste without editing it.
    expect(panel.textContent).toContain('claude mcp add --transport http dukafi')
    expect(panel.textContent).toContain(`Authorization: Bearer ${PLAINTEXT}`)
  })

  it('points clients at this store rather than a hardcoded address', async () => {
    globalThis.fetch = mock(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'POST') {
        return new Response(
          JSON.stringify({ token: { ...existing(), token: PLAINTEXT } }),
          { status: 201, headers: { 'content-type': 'application/json' } },
        )
      }
      return listResponse([])
    }) as unknown as typeof fetch

    render(<ConnectSection />)
    await waitFor(() => expect(screen.getByText('No tokens yet')).toBeDefined())
    await userEvent.click(screen.getByRole('button', { name: 'New token' }))
    await userEvent.type(screen.getByLabelText('Token name'), 'Anything')
    await userEvent.click(screen.getByRole('button', { name: 'Create token' }))

    const panel = await screen.findByTestId('issued-token')
    expect(panel.textContent).toContain(`${window.location.origin}/admin/api/mcp`)
  })

  it('cannot create an unnamed token', async () => {
    globalThis.fetch = mock(async () => listResponse([])) as unknown as typeof fetch

    render(<ConnectSection />)
    await waitFor(() => expect(screen.getByText('No tokens yet')).toBeDefined())

    await userEvent.click(screen.getByRole('button', { name: 'New token' }))

    // Naming the tool and machine is what makes a token revocable later with
    // any confidence about what breaks.
    expect((screen.getByRole('button', { name: 'Create token' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('does not show Claude connector instructions on the page', async () => {
    globalThis.fetch = mock(async () => listResponse([])) as unknown as typeof fetch

    render(<ConnectSection />)
    await waitFor(() => expect(screen.getByText('No tokens yet')).toBeDefined())

    expect(screen.queryByText(/Claude’s own connectors/)).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Claude connectors' })).toBeNull()
  })

  it('offers no revoke action for a token that is already revoked', async () => {
    globalThis.fetch = mock(async () =>
      listResponse([existing({ revokedAt: '2026-08-15T11:00:00Z' })])) as unknown as typeof fetch

    render(<ConnectSection />)

    await waitFor(() => expect(screen.getByText('Revoked')).toBeDefined())
    expect(screen.queryByRole('button', { name: 'Revoke' })).toBeNull()
  })

  it('surfaces a failure instead of silently showing an empty list', async () => {
    globalThis.fetch = mock(async () =>
      new Response(JSON.stringify({ error: { message: 'Nope' } }), {
        status: 500, headers: { 'content-type': 'application/json' },
      })) as unknown as typeof fetch

    render(<ConnectSection />)

    await waitFor(() => expect(screen.getByRole('alert')).toBeDefined())
  })
})
