import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import React, { type ReactNode } from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from '@admin/lib/routing'
import { Toolbar } from '@site/toolbar/Toolbar'
import { AdminSessionProvider } from '@admin/session'
import { StepUpProvider } from '@admin/shared/StepUp'
import { useAdminUi } from '@admin/state/adminUi'
import type { CmsCurrentUser } from '@core/persistence'

const now = '2026-05-07T10:00:00.000Z'

function toolbarUser(): CmsCurrentUser {
  return {
    id: 'toolbar-user',
    email: 'admin@example.com',
    displayName: 'Admin',
    status: 'active',
    role: {
      id: 'admin',
      slug: 'admin',
      name: 'Admin',
      description: '',
      isSystem: true,
      capabilities: ['site.read', 'site.structure.edit','site.content.edit','site.style.edit', 'pages.edit', 'pages.publish'],
    },
    capabilities: ['site.read', 'site.structure.edit','site.content.edit','site.style.edit', 'pages.edit', 'pages.publish'],
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

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <MemoryRouter>
      <AdminSessionProvider user={toolbarUser()}>
        <StepUpProvider>{children}</StepUpProvider>
      </AdminSessionProvider>
    </MemoryRouter>
  )
}

beforeEach(() => {
  localStorage.clear()
  // OpenLivePageButton reads `activeLivePath` from adminUi (NOT the
  // editor store) so the same button can be mounted on every admin
  // layout — including AdminPageLayout, which never loads the editor
  // store. Tests set the full path directly here to simulate "the
  // canvas is open at <path>".
  useAdminUi.setState({ activeLivePath: null })
})

afterEach(() => {
  useAdminUi.setState({ activeLivePath: null })
  cleanup()
})

describe('Toolbar — Open live page icon button', () => {
  it('opens the active page in a new tab when a page is open in the editor', () => {
    useAdminUi.setState({ activeLivePath: '/pricing' })

    const originalOpen = window.open
    const openCalls: unknown[] = []
    window.open = ((...args: unknown[]) => {
      openCalls.push(args)
      return null
    }) as typeof window.open

    try {
      // The "Open live page" icon button is rendered by the Toolbar
      // itself (not the layout-supplied rightSlot) so every admin route
      // gets it without per-layout wiring. We render the Toolbar with no
      // rightSlot here — the icon must still appear.
      render(
        <Wrapper>
          <Toolbar />
        </Wrapper>,
      )

      const toolbar = screen.getByTestId('toolbar')
      const openButton = within(toolbar).getByTestId('toolbar-open-live-page-btn')
      fireEvent.click(openButton)

      expect(openCalls).toEqual([['/pricing', '_blank', 'noopener,noreferrer']])
    } finally {
      window.open = originalOpen
    }
  })

  it('falls back to the site root when no page is active (non-editor routes)', () => {
    // No activeLivePath set — this is the state on AdminPageLayout routes
    // like /admin/plugins, /admin/users, /admin/account, etc.
    const originalOpen = window.open
    const openCalls: unknown[] = []
    window.open = ((...args: unknown[]) => {
      openCalls.push(args)
      return null
    }) as typeof window.open

    try {
      render(
        <Wrapper>
          <Toolbar />
        </Wrapper>,
      )

      const toolbar = screen.getByTestId('toolbar')
      const openButton = within(toolbar).getByTestId('toolbar-open-live-page-btn')
      fireEvent.click(openButton)

      expect(openCalls).toEqual([['/', '_blank', 'noopener,noreferrer']])
    } finally {
      window.open = originalOpen
    }
  })

  it('opens "/" when the active page is the home page', () => {
    // The layout publishes the full path; for the home page the path is
    // simply "/" — the live URL of a published home page is the site
    // root, not "/index".
    useAdminUi.setState({ activeLivePath: '/' })

    const originalOpen = window.open
    const openCalls: unknown[] = []
    window.open = ((...args: unknown[]) => {
      openCalls.push(args)
      return null
    }) as typeof window.open

    try {
      render(
        <Wrapper>
          <Toolbar />
        </Wrapper>,
      )

      const toolbar = screen.getByTestId('toolbar')
      fireEvent.click(within(toolbar).getByTestId('toolbar-open-live-page-btn'))

      expect(openCalls).toEqual([['/', '_blank', 'noopener,noreferrer']])
    } finally {
      window.open = originalOpen
    }
  })

  it('opens a content entry path when editing a post in the Content workspace', () => {
    // The Content workspace publishes the entry's full route-base + slug
    // path (e.g. `/blog/getting-started`). The toolbar button just opens
    // whatever path is set — the path field is workspace-agnostic.
    useAdminUi.setState({ activeLivePath: '/blog/getting-started' })

    const originalOpen = window.open
    const openCalls: unknown[] = []
    window.open = ((...args: unknown[]) => {
      openCalls.push(args)
      return null
    }) as typeof window.open

    try {
      render(
        <Wrapper>
          <Toolbar />
        </Wrapper>,
      )

      const toolbar = screen.getByTestId('toolbar')
      fireEvent.click(within(toolbar).getByTestId('toolbar-open-live-page-btn'))

      expect(openCalls).toEqual([['/blog/getting-started', '_blank', 'noopener,noreferrer']])
    } finally {
      window.open = originalOpen
    }
  })
})
