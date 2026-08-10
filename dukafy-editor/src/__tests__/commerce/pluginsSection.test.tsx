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
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { PluginsSection } from '@admin/pages/commerce/sections/PluginsSection'
import type { CommerceData } from '@admin/pages/commerce/hooks/useCommerceData'
import type { Plugin } from '@admin/pages/commerce/types'

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

  it('lists plugins with their configured state', () => {
    render(<PluginsSection data={makeData([PAYHERO])} />)

    expect(screen.getByText('PayHero (M-Pesa)')).toBeDefined()
    expect(screen.getByText(/needs setup/i)).toBeDefined()
  })
})
