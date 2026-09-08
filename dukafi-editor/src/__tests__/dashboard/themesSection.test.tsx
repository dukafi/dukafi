import { describe, it, expect, afterEach } from 'bun:test'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import { ThemesSection } from '@admin/pages/dashboard/sections/ThemesSection'

afterEach(cleanup)

describe('ThemesSection', () => {
  it('renders catalogue, degraded notice, and applied theme', async () => {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/themes/catalogue')) {
        return new Response(JSON.stringify({
          themes: [{
            id: 'duka-classic', name: 'Duka Classic', description: 'Starter',
            version: '1.0.0', contents: { pages: 1, products: 0, templates: 0, partials: 0, tables: 0, forms: 0, collections: 0, reviews: 0, media: 0 },
          }],
          degraded: true,
        }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      if (url.includes('/admin/api/cms/site')) {
        return new Response(JSON.stringify({
          site: { settings: { theme: { themeId: 'duka-classic', version: '1.0.0', appliedAt: '2026-01-01T00:00:00Z' } } },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      return new Response('{}', { status: 404 })
    }) as typeof fetch

    render(<ThemesSection />)
    await waitFor(() => expect(screen.getByText('Duka Classic')).toBeDefined())
    expect(screen.getByText(/Registry is unreachable/)).toBeDefined()
    expect(screen.getByTestId('applied-theme').textContent).toContain('duka-classic')
    expect(screen.getByRole('button', { name: 'Install' })).toBeDefined()
  })
})
