/**
 * Insights click-through — the merchant path, not just the URL map.
 *
 * Opens Overview, switches the period, then walks Sales → Bestsellers →
 * Traffic via the sidebar. Traffic must stay an honest empty, not invented
 * visitor numbers.
 */
import { afterEach, describe, expect, it } from 'bun:test'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from '@admin/lib/routing'
import { AdminSessionProvider } from '@admin/session'
import { StepUpProvider } from '@admin/shared/StepUp'
import { DashboardPage } from '@admin/pages/dashboard/DashboardPage'
import type { CmsCurrentUser } from '@core/persistence'
import type { CommerceStats } from '@admin/pages/dashboard/types'

afterEach(() => {
  cleanup()
  globalThis.fetch = originalFetch
})

const now = '2026-09-09T09:00:00.000Z'
const originalFetch = globalThis.fetch

function adminUser(): CmsCurrentUser {
  return {
    id: 'insights-user',
    email: 'admin@example.com',
    displayName: 'Admin',
    status: 'active',
    role: {
      id: 'admin',
      slug: 'admin',
      name: 'Admin',
      description: '',
      isSystem: true,
      capabilities: ['content.manage', 'site.read', 'media.read'],
    },
    capabilities: ['content.manage', 'site.read', 'media.read'],
    lastLoginAt: null,
    failedLoginCount: 0,
    lockedUntil: null,
    passwordUpdatedAt: null,
    mfaEnabled: false,
    mfaEnabledAt: null,
    mfaRecoveryCodesRemaining: 0,
    stepUpAuthMode: 'required',
    stepUpWindowMinutes: 15,
    avatarMediaId: null,
    avatarUrl: null,
    gravatarHash: '',
    createdAt: now,
    updatedAt: now,
  }
}

function statsFor(period: CommerceStats['period']): CommerceStats {
  return {
    period,
    currency: 'KES',
    overview: {
      revenueCents: 27900,
      orders: 3,
      aovCents: 9300,
      units: 5,
      previous: { revenueCents: 20000, orders: 2, aovCents: 10000, units: 3 },
      deltas: { revenuePct: 39.5, ordersPct: 50, aovPct: -7, unitsPct: 66.7 },
      series: { revenue: [10000, 17900], orders: [1, 2], units: [2, 3] },
    },
    ordersByStatus: { pending: 0, paid: 2, fulfilled: 1, shipped: 0, refunded: 0 },
    paymentsByStatus: { succeeded: 3, failed: 1 },
    paymentsByProvider: [{ provider: 'payhero', attempts: 4, succeeded: 3, amountCents: 27900 }],
    topProducts: [{ title: 'Notebook', sku: 'NB-1', revenueCents: 15000, units: 3 }],
    topCollections: [{ title: 'Featured', slug: 'featured', revenueCents: 15000, units: 3 }],
    abandonedCarts: { count: 2, olderThanHours: 24 },
    discounts: {
      ordersWithCode: 1,
      discountCents: 500,
      revenueCents: 8000,
      codes: [{ code: 'WELCOME', orders: 1, discountCents: 500, revenueCents: 8000 }],
    },
    traffic: { available: false },
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function stubCommerceFetch() {
  const requested: string[] = []
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input)
    requested.push(url)
    if (url.includes('/commerce/stats')) {
      const period = (url.match(/period=([^&]+)/)?.[1] ?? '30d') as CommerceStats['period']
      return json({ stats: statsFor(period) })
    }
    if (url.includes('/commerce/products')) return json({ products: [] })
    if (url.includes('/commerce/collections')) return json({ collections: [] })
    if (url.includes('/commerce/orders')) return json({ orders: [] })
    if (url.includes('/cms/plugins')) return json({ plugins: [] })
    if (url.includes('/cms/site') || url.includes('/cms/pages')
      || url.includes('/cms/components') || url.includes('/cms/layouts')) {
      return json({}, 404)
    }
    return json({})
  }) as typeof fetch
  return requested
}

function InsightsRoute() {
  return (
    <StepUpProvider>
      <DashboardPage />
    </StepUpProvider>
  )
}

function renderInsights(path = '/admin/dashboard/analytics') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AdminSessionProvider user={adminUser()}>
        <Routes>
          <Route path="/admin/dashboard/:dashboardSection" element={<InsightsRoute />} />
          <Route path="/admin/dashboard" element={<InsightsRoute />} />
        </Routes>
      </AdminSessionProvider>
    </MemoryRouter>,
  )
}

describe('Insights click-through', () => {
  it('walks Overview, period, Sales, Bestsellers, and Traffic from the sidebar', async () => {
    const requested = stubCommerceFetch()
    renderInsights()

    await waitFor(() => expect(screen.getByRole('heading', { level: 2, name: 'Overview' })).toBeDefined())
    expect(screen.getByTestId('admin-sidebar-group-insights')).toBeDefined()
    expect(screen.getByText('Revenue')).toBeDefined()
    expect(screen.getByText('KES 279.00')).toBeDefined()
    expect(screen.queryByText('Notebook')).toBeNull()

    fireEvent.click(screen.getByRole('combobox', { name: 'Period' }))
    fireEvent.click(screen.getByRole('option', { name: 'Last 7 days' }))
    await waitFor(() => expect(requested.some((url) => url.includes('period=7d'))).toBe(true))

    fireEvent.click(screen.getByTestId('dashboard-nav-analytics-sales'))
    await waitFor(() => expect(screen.getByRole('heading', { level: 2, name: 'Sales' })).toBeDefined())
    expect(screen.getByText('Abandoned carts')).toBeDefined()
    expect(screen.getByText('WELCOME')).toBeDefined()
    expect(screen.queryByRole('heading', { level: 2, name: 'Overview' })).toBeNull()

    fireEvent.click(screen.getByTestId('dashboard-nav-analytics-products'))
    await waitFor(() => expect(screen.getByRole('heading', { level: 2, name: 'Bestsellers' })).toBeDefined())
    expect(screen.getByText('Notebook')).toBeDefined()
    expect(screen.getByText('Featured')).toBeDefined()
    expect(screen.queryByText('Abandoned carts')).toBeNull()

    fireEvent.click(screen.getByTestId('dashboard-nav-analytics-traffic'))
    await waitFor(() => expect(screen.getByRole('heading', { level: 2, name: 'Traffic' })).toBeDefined())
    expect(screen.getByTestId('analytics-traffic-empty').textContent).toContain('Page views are not tracked.')
    expect(screen.queryByText('KES 279.00')).toBeNull()

    fireEvent.click(screen.getByTestId('dashboard-nav-analytics'))
    await waitFor(() => expect(screen.getByRole('heading', { level: 2, name: 'Overview' })).toBeDefined())
    expect(screen.getByText('Revenue')).toBeDefined()
  })
})
