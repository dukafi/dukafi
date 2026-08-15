/**
 * The Discounts screen.
 *
 * Two properties matter here, both about not lying to the merchant.
 *
 * `status` is derived by the server from the clock and the usage count — the
 * same answer `DiscountLookup` gives a customer at the cart. The screen must
 * render what it is told rather than recomputing from `endsAt`, or it will
 * eventually disagree with the cart about whether a code works.
 *
 * Deleting is not always deleting: a redeemed code is ended instead, because
 * orders record the code they were charged under. The screen therefore reloads
 * after a delete rather than dropping the row optimistically.
 */
import { describe, expect, it, mock, beforeEach, afterEach } from 'bun:test'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DiscountsSection } from '@admin/pages/dashboard/sections/DiscountsSection'
import type { CommerceData } from '@admin/pages/dashboard/hooks/useCommerceData'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { 'content-type': 'application/json' },
  })
}

function discount(overrides: Record<string, unknown> = {}) {
  return {
    id: '1', code: 'WEEKEND20', kind: 'percentage', value: 20, status: 'active',
    startsAt: '2026-08-01T00:00:00Z', endsAt: null, usageLimit: null,
    scope: { kind: 'catalogue', productSlugs: [], collectionSlugs: [] },
    redemptions: 0, ordersWithCode: 0, revenueCents: 0, discountedCents: 0,
    ...overrides,
  }
}

/** Only the two lists the scope picker reads. */
function commerceData(
  products: Array<{ slug: string; title: string }> = [],
  collections: Array<{ slug: string; title: string }> = [],
): CommerceData {
  return { products, collections } as unknown as CommerceData
}

function listOf(rows: unknown[], currency = 'KES') {
  return json({ discounts: rows, total: rows.length, currency })
}

let originalFetch: typeof fetch

beforeEach(() => { originalFetch = globalThis.fetch })
afterEach(() => { globalThis.fetch = originalFetch })

describe('DiscountsSection', () => {
  it('shows what a code is worth and what it has earned', async () => {
    globalThis.fetch = mock(async () => listOf([
      discount({ code: 'FIVEOFF', kind: 'fixed', value: 500, redemptions: 3, usageLimit: 10,
                 ordersWithCode: 3, revenueCents: 24_000, discountedCents: 1_500 }),
    ])) as unknown as typeof fetch

    render(<DiscountsSection data={commerceData()} />)

    await waitFor(() => expect(screen.getByText('FIVEOFF')).toBeDefined())
    // A fixed amount is money, so it is rendered in the store's currency and
    // not as a bare number of cents.
    expect(screen.getByText('KES 5.00 off')).toBeDefined()
    expect(screen.getByText('3 / 10')).toBeDefined()
    expect(screen.getByText('KES 240.00')).toBeDefined()
    expect(screen.getByText('KES 15.00')).toBeDefined()
  })

  it('renders the status the server derived, not one of its own', async () => {
    // No end date, so a screen computing this itself would say "active".
    // The server says exhausted because the usage limit is reached, which is
    // exactly what the cart will tell a customer.
    globalThis.fetch = mock(async () => listOf([
      discount({ code: 'CAPPED', status: 'exhausted', usageLimit: 5, redemptions: 5 }),
    ])) as unknown as typeof fetch

    render(<DiscountsSection data={commerceData()} />)

    await waitFor(() => expect(screen.getByText('exhausted')).toBeDefined())
  })

  it('says a code with no scope covers the whole catalogue', async () => {
    globalThis.fetch = mock(async () => listOf([discount()])) as unknown as typeof fetch

    render(<DiscountsSection data={commerceData()} />)

    await waitFor(() => expect(screen.getByText('Whole catalogue')).toBeDefined())
  })

  it('summarises a scoped code by what it covers', async () => {
    globalThis.fetch = mock(async () => listOf([
      discount({ scope: { kind: 'mixed', productSlugs: ['mug'], collectionSlugs: ['clearance'] } }),
    ])) as unknown as typeof fetch

    render(<DiscountsSection data={commerceData()} />)

    await waitFor(() => expect(screen.getByText('mug + clearance collection')).toBeDefined())
  })

  // Both keys go every time. The server reads an omitted key as "leave the
  // scope alone", so sending them only when non-empty would make narrowing a
  // code and then widening it again impossible.
  it('sends both scope lists, even when nothing is picked', async () => {
    const posted: Array<Record<string, unknown>> = []
    globalThis.fetch = mock(async (input: string | URL | Request, init?: RequestInit) => {
      if ((init?.method ?? 'GET') === 'POST') {
        posted.push(JSON.parse(String(init?.body)))
        return json({ discount: discount() }, 201)
      }
      return listOf([])
    }) as unknown as typeof fetch

    render(<DiscountsSection data={commerceData([{ slug: 'mug', title: 'Mug' }], [{ slug: 'clearance', title: 'Clearance' }])} />)

    await userEvent.click(screen.getByRole('button', { name: /new discount/i }))
    await userEvent.type(screen.getByLabelText('Code'), 'WIDE')
    await userEvent.click(screen.getByRole('button', { name: /create this discount/i }))

    await waitFor(() => expect(posted.length).toBe(1))
    expect(posted[0].productSlugs).toEqual([])
    expect(posted[0].collectionSlugs).toEqual([])
  })

  it('scopes a code to the products and collections ticked', async () => {
    const posted: Array<Record<string, unknown>> = []
    globalThis.fetch = mock(async (input: string | URL | Request, init?: RequestInit) => {
      if ((init?.method ?? 'GET') === 'POST') {
        posted.push(JSON.parse(String(init?.body)))
        return json({ discount: discount() }, 201)
      }
      return listOf([])
    }) as unknown as typeof fetch

    render(<DiscountsSection data={commerceData(
      [{ slug: 'mug', title: 'Mug' }, { slug: 'sofa', title: 'Sofa' }],
      [{ slug: 'clearance', title: 'Clearance' }],
    )} />)

    await userEvent.click(screen.getByRole('button', { name: /new discount/i }))
    await userEvent.type(screen.getByLabelText('Code'), 'MUGONLY')
    await userEvent.click(screen.getByRole('checkbox', { name: /^Mug$/i }))
    await userEvent.click(screen.getByRole('checkbox', { name: /Clearance collection/i }))
    await userEvent.click(screen.getByRole('button', { name: /create this discount/i }))

    await waitFor(() => expect(posted.length).toBe(1))
    expect(posted[0].productSlugs).toEqual(['mug'])
    expect(posted[0].collectionSlugs).toEqual(['clearance'])
  })

  it('creates a code from the dialog', async () => {
    const posted: Array<Record<string, unknown>> = []
    globalThis.fetch = mock(async (input: string | URL | Request, init?: RequestInit) => {
      if ((init?.method ?? 'GET') === 'POST') {
        posted.push(JSON.parse(String(init?.body)))
        return json({ discount: discount({ code: 'LAUNCH10' }) }, 201)
      }
      return listOf([])
    }) as unknown as typeof fetch

    render(<DiscountsSection data={commerceData()} />)

    await userEvent.click(screen.getByRole('button', { name: /new discount/i }))
    await userEvent.type(screen.getByLabelText('Code'), 'launch10')
    await userEvent.click(screen.getByRole('button', { name: /create this discount/i }))

    await waitFor(() => expect(posted.length).toBe(1))
    expect(posted[0].code).toBe('launch10')
    expect(posted[0].kind).toBe('percentage')
    // Blank date fields mean "now" and "no end" — sent as null rather than an
    // empty string, which the server would have to guess at.
    expect(posted[0].startsAt).toBeNull()
    expect(posted[0].endsAt).toBeNull()
    expect(posted[0].usageLimit).toBeNull()
  })

  // The row must not disappear on a code the server kept. Reloading is the
  // only way the screen can be right about which of the two happened.
  it('reloads after deleting rather than dropping the row', async () => {
    let deleted = false
    const calls: string[] = []
    globalThis.fetch = mock(async (input: string | URL | Request, init?: RequestInit) => {
      const method = init?.method ?? 'GET'
      calls.push(method)
      if (method === 'DELETE') {
        deleted = true
        // A redeemed code: ended, not gone.
        return json({ discount: discount({ code: 'USED10', status: 'expired', redemptions: 2 }), deleted: false })
      }
      return listOf([discount({ code: 'USED10', redemptions: 2, status: deleted ? 'expired' : 'active' })])
    }) as unknown as typeof fetch

    render(<DiscountsSection data={commerceData()} />)
    await waitFor(() => expect(screen.getByText('active')).toBeDefined())

    await userEvent.click(screen.getByRole('button', { name: /actions for USED10/i }))
    await userEvent.click(screen.getByRole('menuitem', { name: /delete/i }))
    // The confirm says which will actually happen, because this code has uses.
    expect(screen.getByText(/kept and ended rather than deleted/i)).toBeDefined()
    await userEvent.click(screen.getByRole('button', { name: /end it now/i }))

    await waitFor(() => expect(screen.getByText('expired')).toBeDefined())
    expect(calls.filter((method) => method === 'GET').length).toBe(2)
    expect(screen.getByText('USED10')).toBeDefined()
  })
})
