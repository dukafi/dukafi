/**
 * Editor layout persistence + grouped sidebar integration tests.
 *
 * These cover the user-facing layout contract: panel open/closed state is
 * restored from localStorage on refresh, and the grouped left sidebar can
 * reopen closed panels without using the top toolbar.
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { readFileSync } from 'fs'
import { join } from 'path'
import { MemoryRouter } from '@admin/lib/routing'
import { AdminCanvasLayout } from '@admin/layouts/AdminCanvasLayout'
import { AdminSessionProvider } from '@admin/session'
import { StepUpProvider } from '@admin/shared/StepUp'
import { useEditorStore } from '@site/store/store'
import { makeNode, makePage, makeSite } from '../fixtures'
import type { CmsCurrentUser } from '@core/persistence'
import { pageToCells } from '@core/data/pageFromRow'
import '@modules/base/index'

const LAYOUT_STORAGE_KEY = 'dukafi-editor-layout-v2'
const SRC_ROOT = join(import.meta.dir, '../..')

const originalFetch = globalThis.fetch

/**
 * AdminCanvasLayout's mount fires `/admin/api/cms/plugins` and
 * `/admin/api/cms/site` through usePluginEventBridge / usePersistence. Most
 * tests in this file don't care about the result — they only care about
 * layout/panel behaviour — so provide a default fetch that answers those
 * endpoints with safe empty values. Tests that need bespoke responses still
 * override `globalThis.fetch` directly.
 */
function installAmbientFetch() {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.endsWith('/admin/api/cms/plugins')) {
      return new Response(JSON.stringify({ plugins: [], adminPages: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }
    if (url.endsWith('/admin/api/cms/site')) {
      return new Response(JSON.stringify({ error: 'no draft site' }), { status: 404 })
    }
    if (url.endsWith('/admin/api/cms/pages')) {
      return new Response(JSON.stringify({ rows: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }
    if (url.endsWith('/admin/api/cms/layouts')) {
      return new Response(JSON.stringify({ rows: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }
    if (url.endsWith('/admin/api/cms/publish/status')) {
      return new Response(JSON.stringify({
        hasPublishedVersion: false,
        draftMatchesPublished: false,
        draftPages: 0,
        publishedPages: 0,
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }
    if (url.endsWith('/admin/api/cms/me/preferences/module-inserter')) {
      return new Response(JSON.stringify({ value: null }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }
    if (url.endsWith('/admin/api/ai/defaults')) {
      return new Response(JSON.stringify({ defaults: {} }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }
    return new Response(JSON.stringify({ error: `Unhandled ${url}` }), { status: 500 })
  }) as typeof fetch
}

afterEach(() => {
  cleanup()
  globalThis.fetch = originalFetch
})

function resetStore() {
  localStorage.clear()
  useEditorStore.setState({
    site: null,
    activePageId: null,
    selectedNodeId: null,
    selectedNodeIds: [],
    hoveredNodeId: null,
    activeBreakpointId: 'desktop',
    propertiesPanel: { collapsed: false, x: 0, y: 0, width: 360 },
    propertiesPanelMode: 'docked',
    leftSidebarWidth: 320,
    leftSidebarMode: 'docked',
    focusedPanel: 'canvas',
    explorerPanelOpen: true,
    explorerPanelTab: 'layers',
    frameworkPanelOpen: false,
    codeEditorPanelOpen: false,
    activeEditorFileId: null,
    _historyPast: [],
    _historyFuture: [],
    canUndo: false,
    canRedo: false,
    hasUnsavedChanges: false,
  } as Parameters<typeof useEditorStore.setState>[0])
}

const now = '2026-05-07T10:00:00.000Z'

function currentUser(capabilities: string[]): CmsCurrentUser {
  return {
    id: 'current-user',
    email: 'current@example.com',
    displayName: 'Current User',
    status: 'active',
    role: {
      id: 'custom',
      slug: 'custom',
      name: 'Custom',
      description: '',
      isSystem: false,
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

function renderEditorLayout({
  preloadSite = true,
  user = null,
}: {
  preloadSite?: boolean
  user?: CmsCurrentUser | null
} = {}) {
  if (preloadSite && !useEditorStore.getState().site) {
    loadSiteWithSelectedHeading()
  }
  // AdminCanvasLayout renders the Toolbar (AccountMenuButton -> useStepUp +
  // useAuthenticatedAdminUser). Each test that previously rendered without a
  // session is updated to pass a sensible default user; tests that opt in to a
  // custom user keep that. The default mirrors an Editor — all sidebar
  // capabilities present — so the grouped sidebar renders editor items. Tests
  // that need a restricted view (e.g. read-only) pass an explicit `user`.
  const sessionUser = user ?? currentUser([
    'site.read',
    'site.structure.edit',
    'site.content.edit',
    'site.style.edit',
    'pages.edit',
    'pages.publish',
    'media.read',
    'media.write',
    'media.replace',
    'media.delete',
    'plugins.read',
    'plugins.configure',
    'plugins.install',
    'plugins.lifecycle',
    'ai.chat',
  ])
  render(
    <MemoryRouter>
      <AdminSessionProvider user={sessionUser}>
        <StepUpProvider>
          <AdminCanvasLayout />
        </StepUpProvider>
      </AdminSessionProvider>
    </MemoryRouter>,
  )
}

function loadSiteWithSelectedHeading() {
  const rootId = 'root-1'
  const nodeId = 'heading-1'
  const rootNode = makeNode({ id: rootId, moduleId: 'base.body', children: [nodeId] })
  const headingNode = makeNode({
    id: nodeId,
    moduleId: 'base.text',
    props: { text: 'Hello', tag: 'h2', align: 'left' },
    children: [],
  })
  const page = makePage({
    id: 'page-1',
    rootNodeId: rootId,
    nodes: { [rootId]: rootNode, [nodeId]: headingNode },
  })
  const site = makeSite({ pages: [page] })
  useEditorStore.setState({
    site,
    activePageId: 'page-1',
    selectedNodeId: nodeId,
  } as Parameters<typeof useEditorStore.setState>[0])
}

beforeEach(() => {
  resetStore()
  installAmbientFetch()
})

describe('AdminCanvasLayout — CMS site hydration gate', () => {
  it('keeps the editor shell mounted while the CMS site hydrates', async () => {
    const loaded = makeSite({ name: 'Hydrated Site' })
    const originalFetch = globalThis.fetch
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const { pages, ...shell } = loaded
      if (url.includes('/admin/api/cms/pages')) {
        const rows = pages.map((page) => ({
          id: page.id,
          tableId: 'pages',
          cells: pageToCells(page),
          slug: page.slug,
          status: 'draft',
          authorUserId: null,
          createdByUserId: null,
          updatedByUserId: null,
          publishedByUserId: null,
          author: null,
          createdBy: null,
          updatedBy: null,
          publishedBy: null,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
          publishedAt: null,
          scheduledPublishAt: null,
          deletedAt: null,
        }))
        return new Response(JSON.stringify({ rows }), { status: 200 })
      }
      if (url.includes('/admin/api/cms/components')) {
        return new Response(JSON.stringify({ rows: [] }), { status: 200 })
      }
      if (url.includes('/admin/api/cms/layouts')) {
        return new Response(JSON.stringify({ rows: [] }), { status: 200 })
      }
      if (url.includes('/admin/api/cms/site')) {
        return new Response(JSON.stringify({ site: shell }), { status: 200 })
      }
      return originalFetch(input, init)
    }) as typeof fetch

    try {
      renderEditorLayout({ preloadSite: false })

      expect(screen.getByTestId('toolbar')).toBeDefined()
      expect(screen.getByRole('status', { name: 'Loading editor' })).toBeDefined()
      expect(screen.getByTestId('canvas-loading-frame-desktop')).toBeDefined()
      expect(await screen.findByTestId('left-sidebar')).toBeDefined()
      expect(screen.getByTestId('canvas-root')).toBeDefined()
      expect(screen.getByTestId('right-sidebar')).toBeDefined()
      expect(screen.queryByRole('status', { name: 'Loading editor' })).toBeNull()
      expect(screen.queryByRole('status', { name: /loading site editor/i })).toBeNull()
      expect(screen.queryByTestId('admin-site-loading-toolbar')).toBeNull()
      expect(screen.queryByTestId('admin-site-loading-left-panel')).toBeNull()
      expect(screen.queryByTestId('admin-site-loading-canvas')).toBeNull()
      expect(screen.queryByTestId('admin-site-loading-right-panel')).toBeNull()

      expect((await screen.findByTestId('toolbar-site-brand')).textContent).toBe('Hydrated Site')
      expect(screen.queryByRole('status', { name: /loading site editor/i })).toBeNull()
      expect(screen.queryByText(/loading site/i)).toBeNull()
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('does not overwrite an existing in-memory site when AdminCanvasLayout remounts during HMR', async () => {
    const existing = makeSite({ name: 'Existing HMR Site' })
    useEditorStore.setState({
      site: existing,
      activePageId: existing.pages[0].id,
    } as Parameters<typeof useEditorStore.setState>[0])

    let siteFetchCalls = 0
    const originalFetch = globalThis.fetch
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes('/admin/api/cms/site')) {
        siteFetchCalls += 1
        return new Response(JSON.stringify({ error: 'draft site not found' }), { status: 404 })
      }
      return originalFetch(input, init)
    }) as typeof fetch

    try {
      renderEditorLayout({ preloadSite: false })

      expect(screen.getByTestId('toolbar-site-brand').textContent).toBe('Existing HMR Site')
      await new Promise((resolve) => setTimeout(resolve, 20))
      expect(siteFetchCalls).toBe(0)
      expect(useEditorStore.getState().site?.name).toBe('Existing HMR Site')
      expect(screen.queryByText(/loading site/i)).toBeNull()
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})

describe('AdminCanvasLayout — persisted panel layout', () => {
  it('restores panel visibility from the site workspace layout on mount', async () => {
    localStorage.setItem(
      LAYOUT_STORAGE_KEY,
      JSON.stringify({
        version: 2,
        workspaces: {
          site: {
            leftWidth: 410,
            rightWidth: 390,
            rightOpen: true,
            propertiesPanelMode: 'floating',
            leftSidebarMode: 'floating',
            activeLeftPanel: 'explorer',
            explorerPanelTab: 'code',
            codeEditorPanelOpen: true,
            activeEditorFileId: 'file-1',
          },
        },
      }),
    )
    loadSiteWithSelectedHeading()

    renderEditorLayout()

    await waitFor(() => {
      const state = useEditorStore.getState()
      expect(state.explorerPanelOpen).toBe(true)
      expect(state.explorerPanelTab).toBe('code')
      expect(state.propertiesPanel.collapsed).toBe(false)
      expect(state.propertiesPanelMode).toBe('floating')
      expect(state.leftSidebarMode).toBe('floating')
      expect(state.propertiesPanel.width).toBe(390)
      expect(state.leftSidebarWidth).toBe(410)
      expect(state.codeEditorPanelOpen).toBe(true)
      expect(state.activeEditorFileId).toBe('file-1')
      expect(state.frameworkPanelOpen).toBe(false)
    }, { timeout: 150 })
  })
})

describe('AdminCanvasLayout — grouped sidebar', () => {
  it('renders site-read users in a read-only editor shell', async () => {
    renderEditorLayout({ user: currentUser(['site.read']) })

    const canvas = await screen.findByTestId('canvas-root')
    expect(within(canvas).queryByRole('button', { name: /add text/i })).toBeNull()
    expect(within(canvas).queryByRole('button', { name: /add container/i })).toBeNull()
    expect(screen.queryByTestId('right-sidebar-panel-slot')).toBeNull()

    const sidebar = await screen.findByTestId('left-sidebar')
    const nav = within(sidebar).getByRole('navigation', { name: /^admin$/i })
    // Read-only callers see Layers / Pages / Code / Media — but none of the
    // structural / style / agent editing items.
    expect(within(nav).getByRole('button', { name: 'Layers' })).toBeDefined()
    expect(within(nav).queryByRole('button', { name: 'Framework' })).toBeNull()
    expect(within(nav).queryByRole('button', { name: 'Assistant' })).toBeNull()

    const tree = within(sidebar).getByRole('tree', { name: /page element tree/i })
    const treeRows = within(tree).getAllByRole('treeitem')
    const selectedTreeRow =
      treeRows.find((row) => row.getAttribute('aria-selected') === 'true') ??
      treeRows[0]
    if (!selectedTreeRow) throw new Error('Expected at least one DOM tree row')
    fireEvent.keyDown(selectedTreeRow, { key: 'F2' })
    expect(within(selectedTreeRow).queryByRole('textbox')).toBeNull()
    fireEvent.contextMenu(selectedTreeRow, { clientX: 12, clientY: 12 })
    expect(screen.queryByRole('menu')).toBeNull()

    const beforeNodeIds = Object.keys(useEditorStore.getState().site?.pages[0]?.nodes ?? {})
    fireEvent.keyDown(canvas, { key: 'Backspace' })
    expect(Object.keys(useEditorStore.getState().site?.pages[0]?.nodes ?? {})).toEqual(beforeNodeIds)

    // Layers is a navigation surface available to read-only callers. Close
    // via the panel chrome, then reopen from the sidebar.
    fireEvent.click(within(sidebar).getByRole('button', { name: /close layers panel/i }))
    expect(useEditorStore.getState().explorerPanelOpen).toBe(false)
    fireEvent.click(within(nav).getByRole('button', { name: 'Layers' }))
    expect(useEditorStore.getState().explorerPanelOpen).toBe(true)
  })

  it('does not render the deferred timeline shell or rail button', async () => {
    renderEditorLayout()

    await screen.findByTestId('left-sidebar')
    expect(screen.queryByTestId('timeline-panel')).toBeNull()
    expect(screen.queryByTestId('panel-rail-timeline')).toBeNull()
  })

  it('opens Explorer views from the grouped sidebar without toggling them closed', async () => {
    renderEditorLayout()

    const nav = await screen.findByRole('navigation', { name: /^admin$/i })

    const layersButton = within(nav).getByRole('button', { name: 'Layers' })
    expect(layersButton.getAttribute('aria-pressed')).toBe('true')
    expect(within(nav).queryByRole('button', { name: /properties panel/i })).toBeNull()
    expect(within(nav).queryByRole('button', { name: /code editor/i })).toBeNull()

    fireEvent.click(layersButton)
    expect(useEditorStore.getState().explorerPanelOpen).toBe(true)
    expect(layersButton.getAttribute('aria-pressed')).toBe('true')

    fireEvent.click(within(nav).getByRole('button', { name: 'Framework' }))
    expect(useEditorStore.getState().explorerPanelOpen).toBe(false)
    expect(useEditorStore.getState().frameworkPanelOpen).toBe(true)
    expect(layersButton.getAttribute('aria-pressed')).toBe('false')
  })

  it('docks left sidebar panels into an expanding sidebar and switches between them', async () => {
    renderEditorLayout()

    const sidebar = await screen.findByTestId('left-sidebar')
    const nav = within(sidebar).getByRole('navigation', { name: /^admin$/i })

    expect(sidebar.getAttribute('data-expanded')).toBe('true')
    expect(sidebar.getAttribute('data-active-panel')).toBe('explorer')
    expect(sidebar.getAttribute('style')).toContain('--left-sidebar-panel-width: 320px')
    expect(within(sidebar).getByRole('separator', { name: /resize left sidebar/i })).toBeDefined()
    expect(within(sidebar).getByLabelText('DOM tree panel')).toBeDefined()

    fireEvent.click(within(sidebar).getByRole('button', { name: /close layers panel/i }))

    expect(sidebar.getAttribute('data-expanded')).toBe('false')
    expect(sidebar.getAttribute('data-active-panel')).toBe('none')
    expect(sidebar.style.getPropertyValue('--left-sidebar-panel-width')).toBe('0px')
    expect(sidebar.style.getPropertyValue('--left-sidebar-panel-layout-width')).toBe('0px')
    expect(useEditorStore.getState().explorerPanelOpen).toBe(false)

    fireEvent.click(within(nav).getByRole('button', { name: 'Framework' }))

    expect(sidebar.getAttribute('data-expanded')).toBe('true')
    expect(sidebar.getAttribute('data-active-panel')).toBe('framework')
    expect(useEditorStore.getState().frameworkPanelOpen).toBe(true)
    expect(useEditorStore.getState().explorerPanelOpen).toBe(false)
    expect(within(sidebar).getByTestId('framework-panel')).toBeDefined()

    fireEvent.click(within(nav).getByRole('button', { name: 'Layers' }))

    expect(sidebar.getAttribute('data-expanded')).toBe('true')
    expect(sidebar.getAttribute('data-active-panel')).toBe('explorer')
    expect(useEditorStore.getState().explorerPanelOpen).toBe(true)
    expect(useEditorStore.getState().frameworkPanelOpen).toBe(false)
    expect(within(sidebar).getByTestId('explorer-panel')).toBeDefined()

    expect(sidebar.getAttribute('style')).toContain('--left-sidebar-panel-width: 320px')

    expect(sidebar.getAttribute('data-active-panel')).toBe('explorer')
    expect(useEditorStore.getState().explorerPanelOpen).toBe(true)
    expect(within(sidebar).getByTestId('explorer-panel')).toBeDefined()
  })

  it('docks Properties into the right sidebar by default and can switch to floating mode', async () => {
    loadSiteWithSelectedHeading()
    renderEditorLayout()

    const rightSidebar = await screen.findByTestId('right-sidebar')

    await waitFor(() => {
      expect(rightSidebar.getAttribute('data-expanded')).toBe('true')
      expect(rightSidebar.getAttribute('data-mode')).toBe('docked')
    }, { timeout: 150 })

    expect(rightSidebar.getAttribute('style')).toContain('--right-sidebar-panel-width: 360px')
    expect(within(rightSidebar).getByTestId('properties-panel').getAttribute('data-variant')).toBe('docked')

    fireEvent.click(within(rightSidebar).getByRole('button', { name: /unpin properties panel/i }))

    await waitFor(() => {
      expect(useEditorStore.getState().propertiesPanelMode).toBe('floating')
      expect(rightSidebar.getAttribute('data-expanded')).toBe('false')
    }, { timeout: 150 })
    expect(rightSidebar.style.getPropertyValue('--right-sidebar-panel-width')).toBe('0px')
    expect(rightSidebar.style.getPropertyValue('--right-sidebar-panel-layout-width')).toBe('360px')

    const floatingPanel = screen.getByTestId('properties-panel')
    expect(floatingPanel.getAttribute('data-variant')).toBe('floating')
    const propertiesResizeHandle = within(floatingPanel).getByRole('separator', {
      name: /resize properties panel/i,
    })
    fireEvent.keyDown(propertiesResizeHandle, { key: 'ArrowRight' })
    fireEvent.keyDown(propertiesResizeHandle, { key: 'ArrowDown', shiftKey: true })

    await waitFor(() => {
      expect(floatingPanel.style.getPropertyValue('--panel-w')).toBe('370px')
      expect(floatingPanel.style.getPropertyValue('--panel-h')).toBe('720px')
      const stored = JSON.parse(localStorage.getItem(LAYOUT_STORAGE_KEY) ?? '{}')
      expect(stored.panelSizes?.properties).toEqual({ width: 370, height: 720 })
    }, { timeout: 150 })

    fireEvent.click(within(floatingPanel).getByRole('button', { name: /dock properties panel/i }))

    await waitFor(() => {
      expect(useEditorStore.getState().propertiesPanelMode).toBe('docked')
      expect(rightSidebar.getAttribute('data-expanded')).toBe('true')
      expect(within(rightSidebar).getByTestId('properties-panel').getAttribute('data-variant')).toBe('docked')
    }, { timeout: 150 })
  })

  it('can unpin hosted left-rail panels and keeps switching in the floating host', async () => {
    renderEditorLayout()

    const sidebar = await screen.findByTestId('left-sidebar')
    const nav = within(sidebar).getByRole('navigation', { name: /^admin$/i })
    const panelSlot = within(sidebar).getByTestId('left-sidebar-panel-slot')

    fireEvent.click(within(sidebar).getByRole('button', { name: /unpin layers panel/i }))

    await waitFor(() => {
      expect(useEditorStore.getState().leftSidebarMode).toBe('floating')
      expect(sidebar.getAttribute('data-expanded')).toBe('false')
      expect(panelSlot.getAttribute('data-mode')).toBe('floating')
    }, { timeout: 150 })

    const explorerResizeHandle = within(panelSlot).getByRole('separator', {
      name: /resize explorer panel/i,
    })
    fireEvent.keyDown(explorerResizeHandle, { key: 'ArrowRight' })
    fireEvent.keyDown(explorerResizeHandle, { key: 'ArrowUp' })

    await waitFor(() => {
      expect(panelSlot.style.getPropertyValue('--panel-w')).toBe('330px')
      expect(panelSlot.style.getPropertyValue('--panel-h')).toBe('510px')
      const stored = JSON.parse(localStorage.getItem(LAYOUT_STORAGE_KEY) ?? '{}')
      expect(stored.panelSizes?.site).toEqual({ width: 330, height: 510 })
    }, { timeout: 150 })

    const railTargets = [
      ['framework', 'framework-panel'],
    ] as const

    for (const [label, testId] of railTargets) {
      fireEvent.click(within(nav).getByRole('button', { name: new RegExp(`^${label}$`, 'i') }))
      expect(within(panelSlot).getByTestId(testId)).toBeDefined()
      expect(within(panelSlot).getByRole('button', { name: new RegExp(`dock ${label} panel`, 'i') })).toBeDefined()
      expect(sidebar.getAttribute('data-expanded')).toBe('false')
    }

    fireEvent.click(within(panelSlot).getByRole('button', { name: /dock framework panel/i }))

    await waitFor(() => {
      expect(useEditorStore.getState().leftSidebarMode).toBe('docked')
      expect(sidebar.getAttribute('data-expanded')).toBe('true')
      expect(panelSlot.getAttribute('data-mode')).toBe('docked')
    }, { timeout: 150 })
  })

  it('marks the canvas stage while the right sidebar is open', async () => {
    loadSiteWithSelectedHeading()
    renderEditorLayout()

    const canvasStage = (await screen.findByTestId('canvas-root')).closest('[data-right-sidebar-expanded]')
    expect(canvasStage).not.toBeNull()

    await waitFor(() => {
      expect(canvasStage!.getAttribute('data-right-sidebar-expanded')).toBe('true')
    }, { timeout: 150 })

    const rightSidebar = screen.getByTestId('right-sidebar')
    fireEvent.click(within(rightSidebar).getByRole('button', { name: /unpin properties panel/i }))

    await waitFor(() => {
      expect(canvasStage!.getAttribute('data-right-sidebar-expanded')).toBe('false')
    }, { timeout: 150 })
  })

  it('resizes both sidebars with keyboard-accessible handles and persists the widths', async () => {
    loadSiteWithSelectedHeading()
    localStorage.setItem(
      LAYOUT_STORAGE_KEY,
      JSON.stringify({
        version: 2,
        workspaces: {
          site: {
            leftWidth: 410,
            rightWidth: 420,
            rightOpen: true,
            activeLeftPanel: 'explorer',
            propertiesPanelMode: 'docked',
          },
        },
      }),
    )

    renderEditorLayout()

    const leftSidebar = await screen.findByTestId('left-sidebar')
    const rightSidebar = await screen.findByTestId('right-sidebar')

    await waitFor(() => {
      expect(leftSidebar.getAttribute('style')).toContain('--left-sidebar-panel-width: 410px')
      expect(rightSidebar.getAttribute('style')).toContain('--right-sidebar-panel-width: 420px')
    }, { timeout: 150 })

    fireEvent.keyDown(within(leftSidebar).getByRole('separator', { name: /resize left sidebar/i }), {
      key: 'ArrowRight',
    })
    fireEvent.keyDown(within(rightSidebar).getByRole('separator', { name: /resize right sidebar/i }), {
      key: 'ArrowLeft',
    })

    await waitFor(() => {
      const state = useEditorStore.getState()
      expect(state.leftSidebarWidth).toBe(420)
      expect(state.propertiesPanel.width).toBe(430)
      const stored = JSON.parse(localStorage.getItem(LAYOUT_STORAGE_KEY) ?? '{}')
      expect(stored.workspaces.site.leftWidth).toBe(420)
      expect(stored.workspaces.site.rightWidth).toBe(430)
    }, { timeout: 150 })
  })

  it('keeps the Properties panel disconnected from the left rail', async () => {
    renderEditorLayout()

    const sidebar = await screen.findByTestId('left-sidebar')
    const nav = within(sidebar).getByRole('navigation', { name: /^admin$/i })

    // Properties lives in the right sidebar, never as a left sidebar item.
    expect(within(nav).queryByRole('button', { name: /properties panel/i })).toBeNull()
    expect(sidebar.getAttribute('data-active-panel')).toBe('explorer')
  })
})
