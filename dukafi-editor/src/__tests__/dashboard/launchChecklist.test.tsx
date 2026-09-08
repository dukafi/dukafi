import { describe, it, expect, afterEach, mock } from 'bun:test'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { LaunchChecklist } from '@admin/pages/dashboard/sections/LaunchChecklist'
import type { CommerceData } from '@admin/pages/dashboard/hooks/useCommerceData'

afterEach(() => {
  cleanup()
  mock.restore()
})

function data(overrides: Partial<CommerceData> = {}): CommerceData {
  return {
    products: [], collections: [], orders: [], plugins: [],
    loading: false, error: null, setError: () => {}, refresh: async () => {},
    ...overrides,
  }
}

describe('LaunchChecklist', () => {
  it('lists items and navigates deep links', async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({
        hasPublishedVersion: false,
        draftMatchesPublished: false,
        draftPages: 1,
        publishedPages: 0,
      }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      })) as typeof fetch

    const navigate = mock(() => {})
    render(<LaunchChecklist data={data()} navigate={navigate} />)

    await waitFor(() => expect(screen.getByLabelText('Launch checklist')).toBeDefined())
    expect(screen.getByText('Add a product')).toBeDefined()
    expect(screen.getByText('Connect a payment provider')).toBeDefined()
    expect(screen.getByText('Connect email')).toBeDefined()
    expect(screen.getByText('Publish your storefront')).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: 'Add a product' }))
    expect(navigate).toHaveBeenCalledWith('/admin/dashboard/products')
  })

  it('hides when every item is done', async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({
        hasPublishedVersion: true,
        draftMatchesPublished: true,
        draftPages: 1,
        publishedPages: 1,
      }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      })) as typeof fetch

    const { container } = render(<LaunchChecklist data={data({
      products: [{ id: 1 } as never],
      plugins: [
        { id: 'pay', configured: true, paymentProviders: ['pay'], mailProviders: [] } as never,
        { id: 'mail', configured: true, paymentProviders: [], mailProviders: ['smtp'] } as never,
      ],
    })} navigate={() => {}} />)

    await waitFor(() => expect(container.querySelector('[aria-label="Launch checklist"]')).toBeNull())
  })
})
