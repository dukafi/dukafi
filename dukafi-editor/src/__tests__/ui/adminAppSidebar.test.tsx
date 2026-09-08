import { afterEach, describe, expect, it } from 'bun:test'
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from '@admin/lib/routing'
import { AdminSessionProvider } from '@admin/session'
import { AdminAppSidebar } from '@admin/shared/AdminAppSidebar'
import { PackageSolidIcon } from 'pixel-art-icons/icons/package-solid'
import type { CmsCurrentUser } from '@core/persistence'
import type { ReactNode } from 'react'

const now = '2026-09-08T10:00:00.000Z'

function sidebarUser(capabilities: string[]): CmsCurrentUser {
  return {
    id: 'sidebar-user',
    email: 'admin@example.com',
    displayName: 'Admin',
    status: 'active',
    role: {
      id: 'admin',
      slug: 'admin',
      name: 'Admin',
      description: '',
      isSystem: true,
      capabilities,
    },
    capabilities,
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

function Wrapper({
  children,
  capabilities,
}: {
  children: ReactNode
  capabilities: string[]
}) {
  return (
    <MemoryRouter>
      <AdminSessionProvider user={sidebarUser(capabilities)}>
        {children}
      </AdminSessionProvider>
    </MemoryRouter>
  )
}

afterEach(cleanup)

describe('AdminAppSidebar', () => {
  it('puts workspace destinations and extra items into labeled groups', () => {
    render(
      <Wrapper capabilities={['content.manage', 'site.read', 'media.read']}>
        <AdminAppSidebar
          workspace="dashboard"
          brand="Main duka"
          groups={[{
            id: 'store',
            label: 'Store',
            items: [{
              id: 'products',
              label: 'Products',
              icon: PackageSolidIcon,
              href: '/admin/dashboard/products',
              active: true,
              testId: 'dashboard-nav-products',
            }],
          }]}
        />
      </Wrapper>,
    )

    expect(screen.getByText('Main duka')).toBeDefined()
    expect(screen.getByTestId('admin-sidebar-group-workspace')).toBeDefined()
    expect(screen.getByTestId('admin-sidebar-group-store')).toBeDefined()
    expect(screen.getByTestId('admin-sidebar-workspace-dashboard').getAttribute('aria-current')).toBe('page')
    expect(screen.getByRole('link', { name: 'Site' }).getAttribute('href')).toBe('/admin/site')
    expect(screen.getByRole('link', { name: 'Media' }).getAttribute('href')).toBe('/admin/media')
    expect(screen.getByTestId('dashboard-nav-products').getAttribute('aria-current')).toBe('page')
  })

  it('hides workspaces the current user cannot access', () => {
    render(
      <Wrapper capabilities={['site.read']}>
        <AdminAppSidebar workspace="site" />
      </Wrapper>,
    )

    const nav = screen.getByRole('navigation', { name: 'Admin' })
    expect(within(nav).getByTestId('admin-sidebar-workspace-site').getAttribute('aria-current')).toBe('page')
    expect(within(nav).queryByRole('link', { name: 'Dashboard' })).toBeNull()
    expect(within(nav).queryByRole('link', { name: 'Media' })).toBeNull()
  })
})
