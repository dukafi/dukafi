import { describe, it, expect, afterEach } from 'bun:test'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
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
  ],
}

describe('PluginsSection scheduled jobs', () => {
  it('shows Scheduled jobs from /plugins/jobs', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      if (String(input).includes('/admin/api/cms/plugins/jobs')) {
        return new Response(JSON.stringify({
          jobs: [{ pluginId: 'payhero', name: 'reconcile', every: '15m', lastRunAt: null, due: true }],
        }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      return new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }) as typeof fetch

    try {
      const data: CommerceData = {
        products: [], collections: [], orders: [], plugins: [PAYHERO],
        loading: false, error: null, setError: () => {}, refresh: async () => {},
      }
      render(<PluginsSection data={data} />)
      await waitFor(() => expect(screen.getByText('Scheduled jobs')).toBeDefined())
      expect(screen.getByText('reconcile')).toBeDefined()
      expect(screen.getByText('15m')).toBeDefined()
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})
