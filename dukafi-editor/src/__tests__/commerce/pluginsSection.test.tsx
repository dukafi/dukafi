/**
 * PluginsSection — the schema-driven plugin settings form.
 *
 * Regression cover for a bug found in the browser, not by tests: the field's
 * onChange read `event.currentTarget` inside a functional setState. React
 * clears `currentTarget` once the handler returns, so the updater — which
 * runs later — threw "Cannot read properties of null" on the first keystroke,
 * making every settings field unusable.
 */
import { describe, it, expect, afterEach } from 'bun:test'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { PluginsSection } from '@admin/pages/dashboard/sections/PluginsSection'
import type { CommerceData } from '@admin/pages/dashboard/hooks/useCommerceData'
import type { Plugin } from '@admin/pages/dashboard/types'

afterEach(cleanup)

const PAYHERO: Plugin = {
  id: 'payhero',
  name: 'PayHero (M-Pesa)',
  version: '1.0.0',
  configured: false,
  paymentProviders: ['payhero'],
  settings: [
    { key: 'api_token', label: 'Basic auth token', type: 'string', secret: true, isSet: false, value: null },
    { key: 'channel_id', label: 'Payment channel ID', type: 'integer', secret: false, isSet: true, value: '133' },
  ],
}

function makeData(plugins: Plugin[]): CommerceData {
  return {
    products: [], collections: [], orders: [], plugins,
    loading: false, error: null, setError: () => {}, refresh: async () => {},
  }
}

function openConfigure(plugin: Plugin = PAYHERO) {
  render(<PluginsSection data={makeData([plugin])} />)
  fireEvent.click(screen.getByTestId(`plugin-configure-${plugin.id}`))
}

describe('PluginsSection', () => {
  it('accepts typing into a secret field without throwing', () => {
    openConfigure()
    const token = screen.getByLabelText(/basic auth token/i) as HTMLInputElement

    // The reported crash happened on the very first keystroke.
    fireEvent.change(token, { target: { value: 'live-token-abc' } })

    expect(token.value).toBe('live-token-abc')
  })

  it('renders each declared setting with a field type matching its schema', () => {
    openConfigure()

    // Secrets are masked; the form is generated from the plugin's own schema,
    // so a future plugin needs no UI code of its own.
    expect((screen.getByLabelText(/basic auth token/i) as HTMLInputElement).type).toBe('password')
    expect((screen.getByLabelText(/payment channel id/i) as HTMLInputElement).type).toBe('number')
  })

  it('never prefills a secret, but does prefill non-secret values', () => {
    openConfigure()

    // A stored secret is reported as set, never shown — the API does not
    // return its value at all.
    const token = screen.getByLabelText(/basic auth token/i) as HTMLInputElement
    expect(token.value).toBe('')
    expect((screen.getByLabelText(/payment channel id/i) as HTMLInputElement).value).toBe('133')
  })

  it('tells the user that leaving a saved secret blank keeps it', () => {
    openConfigure({
      ...PAYHERO,
      settings: PAYHERO.settings.map((field) =>
        field.key === 'api_token' ? { ...field, isSet: true } : field),
    })

    const token = screen.getByLabelText(/basic auth token/i) as HTMLInputElement
    expect(token.placeholder).toMatch(/leave blank to keep/i)
  })

  it('lists plugins with their configured state as a badge', () => {
    render(<PluginsSection data={makeData([PAYHERO])} />)

    expect(screen.getByText('PayHero (M-Pesa)')).toBeDefined()
    expect(screen.getByText(/needs setup/i)).toBeDefined()
  })

  it('opens configure from the cog button', () => {
    render(<PluginsSection data={makeData([PAYHERO])} />)
    expect(screen.getByRole('button', { name: /configure payhero/i })).toBeDefined()
    fireEvent.click(screen.getByTestId('plugin-configure-payhero'))
    expect(screen.getByLabelText(/basic auth token/i)).toBeDefined()
  })

  it('opens export with name and version prefilled', () => {
    render(<PluginsSection data={makeData([PAYHERO])} />)
    fireEvent.click(screen.getByTestId('plugin-export-payhero'))

    expect((screen.getByLabelText(/^name$/i) as HTMLInputElement).value).toBe('PayHero (M-Pesa)')
    expect((screen.getByLabelText(/^version$/i) as HTMLInputElement).value).toBe('1.0.0')
  })

  it('asks before deleting a plugin', () => {
    render(<PluginsSection data={makeData([PAYHERO])} />)
    fireEvent.click(screen.getByTestId('plugin-delete-payhero'))

    expect(screen.getByRole('heading', { name: /delete plugin\?/i })).toBeDefined()
    expect(screen.getByRole('button', { name: /delete plugin/i })).toBeDefined()
  })

  it('opens the registry catalogue to install a plugin', async () => {
    const restore = stubCatalogue({
      plugins: [{
        id: 'acme-shipping', name: 'Acme Shipping', description: 'Live rates from Acme.',
        version: '1.2.0', author: 'Acme', category: 'shipping',
        licensed: false, installed: false, purchaseUrl: '',
      }],
      total: 1,
    })

    try {
      render(<PluginsSection data={makeData([PAYHERO])} />)
      fireEvent.click(screen.getByTestId('plugin-catalogue-open'))
      await waitFor(() => {
        expect(screen.getByText('Acme Shipping')).toBeDefined()
      })
      expect(screen.getByTestId('plugin-install-acme-shipping')).toBeDefined()
      fireEvent.click(screen.getByTestId('plugin-details-acme-shipping'))
      expect(screen.getByText('Live rates from Acme.')).toBeDefined()
    } finally {
      restore()
    }
  })

  it('searches, filters and pages the registry catalogue', async () => {
    const urls: string[] = []
    const restore = stubCatalogue({
      plugins: [{
        id: 'acme-shipping', name: 'Acme Shipping', description: '',
        version: '1.2.0', author: 'Acme', category: 'shipping',
        licensed: false, installed: false, purchaseUrl: '',
      }],
      total: 40,
    }, urls)

    try {
      render(<PluginsSection data={makeData([PAYHERO])} />)
      fireEvent.click(screen.getByTestId('plugin-catalogue-open'))
      await waitFor(() => {
        expect(screen.getByText('Acme Shipping')).toBeDefined()
      })

      fireEvent.change(screen.getByTestId('plugin-catalogue-search'), { target: { value: 'ship' } })
      await waitFor(() => {
        expect(urls.some((url) => url.includes('q=ship'))).toBe(true)
      })

      fireEvent.change(document.querySelector('#plugin-catalogue-category-native') as HTMLSelectElement, {
        target: { value: 'shipping' },
      })
      await waitFor(() => {
        expect(urls.some((url) => url.includes('category=shipping'))).toBe(true)
      })

      fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
      await waitFor(() => {
        expect(urls.some((url) => url.includes('offset=25'))).toBe(true)
      })
    } finally {
      restore()
    }
  })
})

function stubCatalogue(
  page: { plugins: unknown[]; total: number },
  urls: string[] = [],
) {
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.includes('/admin/api/cms/plugins/catalogue')) {
      urls.push(url)
      return new Response(JSON.stringify({
        plugins: page.plugins,
        total: page.total,
        limit: 25,
        offset: 0,
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    return originalFetch(input)
  }) as typeof fetch
  return () => { globalThis.fetch = originalFetch }
}
