/**
 * The Reviews screen — typing in something a customer said elsewhere.
 *
 * The property that matters: creating never publishes. The POST that records a
 * review always produces a PENDING row, and putting it on the storefront is a
 * separate approve call. If "publish now" were folded into the create request,
 * the one rule protecting a public page from other people's words would exist
 * in the UI only, and every other way in (MCP, a form) would need its own copy.
 */
import { describe, expect, it, mock, beforeEach, afterEach } from 'bun:test'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ReviewsSection } from '@admin/pages/dashboard/sections/ReviewsSection'
import type { CommerceData } from '@admin/pages/dashboard/hooks/useCommerceData'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { 'content-type': 'application/json' },
  })
}

function review(overrides: Record<string, unknown> = {}) {
  return {
    id: '7', authorName: 'Achieng', rating: 5, body: 'Arrived the next morning.',
    status: 'pending', verified: false, productSlug: null,
    createdAt: '2026-08-15T10:00:00Z', ...overrides,
  }
}

/** Only what ReviewsSection reads; the hook's other fields are irrelevant here. */
function commerceData(products: Array<{ slug: string; title: string }> = []): CommerceData {
  return { products, collections: [] } as unknown as CommerceData
}

let originalFetch: typeof fetch

beforeEach(() => { originalFetch = globalThis.fetch })
afterEach(() => { globalThis.fetch = originalFetch })

describe('ReviewsSection', () => {
  it('creates pending, then approves as a second call when asked', async () => {
    const calls: Array<{ url: string; method: string; body: unknown }> = []
    globalThis.fetch = mock(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input)
      const method = init?.method ?? 'GET'
      calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : null })
      if (method === 'POST' && url.endsWith('/reviews')) return json({ review: review() })
      if (method === 'POST') return json({ ok: true })
      return json({ reviews: [], total: 0, pending: 0 })
    }) as unknown as typeof fetch

    render(<ReviewsSection data={commerceData([{ slug: 'kettle', title: 'Kettle' }])} />)

    await userEvent.click(screen.getByRole('button', { name: /new review/i }))
    await userEvent.type(screen.getByLabelText('Customer'), 'Achieng')
    await userEvent.type(screen.getByLabelText('What they said'), 'Arrived the next morning.')
    await userEvent.click(screen.getByRole('checkbox'))
    await userEvent.click(screen.getByRole('button', { name: /add this review/i }))

    await waitFor(() => expect(calls.some((call) => call.url.includes('/approve'))).toBe(true))

    const created = calls.find((call) => call.method === 'POST' && call.url.endsWith('/reviews'))
    expect(created).toBeDefined()
    // The create request carries no approval of any kind — not a status, not a
    // flag. Whatever the merchant ticked, the row lands pending.
    expect(JSON.stringify(created?.body)).not.toContain('approve')
    expect(JSON.stringify(created?.body)).not.toContain('publish')
    expect((created?.body as Record<string, unknown>).authorName).toBe('Achieng')

    // And the approve came after it, against the id the server returned.
    const approve = calls.find((call) => call.url.includes('/approve'))
    expect(approve?.url).toContain('/reviews/7/approve')
    expect(calls.indexOf(created!)).toBeLessThan(calls.indexOf(approve!))
  })

  it('leaves a review pending when the box is not ticked', async () => {
    const calls: string[] = []
    globalThis.fetch = mock(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input)
      if ((init?.method ?? 'GET') === 'POST') calls.push(url)
      if ((init?.method ?? 'GET') === 'POST') return json({ review: review() })
      return json({ reviews: [], total: 0, pending: 0 })
    }) as unknown as typeof fetch

    render(<ReviewsSection data={commerceData()} />)

    await userEvent.click(screen.getByRole('button', { name: /new review/i }))
    await userEvent.type(screen.getByLabelText('Customer'), 'Wanjiru')
    await userEvent.type(screen.getByLabelText('What they said'), 'Good service.')
    await userEvent.click(screen.getByRole('button', { name: /add this review/i }))

    await waitFor(() => expect(calls.length).toBe(1))
    expect(calls[0]).toContain('/reviews')
    expect(calls[0]).not.toContain('/approve')
  })

  it('offers the products as what a review can be about', async () => {
    globalThis.fetch = mock(async () => json({ reviews: [], total: 0, pending: 0 })) as unknown as typeof fetch

    render(<ReviewsSection data={commerceData([{ slug: 'kettle', title: 'Kettle' }])} />)

    await userEvent.click(screen.getByRole('button', { name: /new review/i }))

    // A review of nothing in particular is the default — most praise is about
    // the shop, not one SKU.
    const about = screen.getByLabelText('About') as HTMLInputElement
    expect(about.value).toBe('The store as a whole')

    await userEvent.click(about)
    await waitFor(() => expect(screen.getByRole('option', { name: 'Kettle' })).toBeDefined())
  })
})
