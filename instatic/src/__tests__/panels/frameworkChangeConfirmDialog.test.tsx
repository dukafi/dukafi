/**
 * Integration test for the framework-change confirmation dialog.
 *
 * Exercises the full provider/hook path: a destructive store action is
 * requested through `useFrameworkChangeConfirm`, the provider asks the
 * editor store to preview the impact, and the dialog renders the per-
 * element usage breakdown. The test then verifies both confirm-and-
 * commit and cancel-without-committing flows.
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { useEffect, act } from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { useEditorStore } from '@site/store/store'
import { frameworkColorClassId } from '@core/framework'
import type { FrameworkColorToken } from '@core/framework-schema'
import { makeNode, makePage, makeSite } from '../fixtures'
import {
  FrameworkChangeConfirmProvider,
  useFrameworkChangeConfirm,
  type ConfirmFrameworkChangeRequest,
} from '@admin/shared/dialogs/FrameworkChangeConfirmDialog'

const TOKEN_ID = 'primary-token'

function makeSeedToken(): FrameworkColorToken {
  return {
    id: TOKEN_ID,
    category: '',
    slug: 'primary',
    lightValue: 'hsla(238, 100%, 62%, 1)',
    darkValue: 'hsla(238, 100%, 42%, 1)',
    darkModeEnabled: false,
    generateUtilities: { text: true, background: false, border: false, fill: false },
    generateTransparent: false,
    generateShades: { enabled: false, count: 0 },
    generateTints: { enabled: true, count: 2 },
    order: 0,
    createdAt: 1,
    updatedAt: 2,
  }
}

function seedSite(): void {
  const tintClassId = frameworkColorClassId(TOKEN_ID, 'tint-1', 'text')
  const page = makePage({
    id: 'page-1',
    rootNodeId: 'root',
    nodes: {
      root: makeNode({ id: 'root', moduleId: 'base.body', children: ['hero'] }),
      hero: makeNode({
        id: 'hero',
        moduleId: 'base.text',
        label: 'Hero text',
        classIds: [tintClassId],
      }),
    },
  })
  const site = makeSite({
    pages: [page],
    settings: {
      ...makeSite().settings,
      framework: { colors: { tokens: [makeSeedToken()] } },
    },
    styleRules: {},
  })
  useEditorStore.getState().loadSite(site)
}

beforeEach(seedSite)
afterEach(cleanup)

interface HarnessProps {
  request: ConfirmFrameworkChangeRequest
  onMounted?: (trigger: () => void) => void
}

function Harness({ request, onMounted }: HarnessProps) {
  const confirm = useFrameworkChangeConfirm()
  useEffect(() => {
    onMounted?.(() => confirm(request))
  }, [confirm, request, onMounted])
  return null
}

describe('FrameworkChangeConfirmProvider', () => {
  it('shows the dialog with per-element usage when a destructive change is requested', () => {
    let triggerChange: (() => void) | null = null
    let committed = false

    const request: ConfirmFrameworkChangeRequest = {
      actionLabel: 'Disable tints',
      applyChange: (draft) => {
        const tk = draft.settings.framework!.colors.tokens.find((t) => t.id === TOKEN_ID)
        if (tk) tk.generateTints = { enabled: false, count: 0 }
      },
      commit: () => {
        committed = true
        useEditorStore.getState().updateFrameworkColorToken(TOKEN_ID, {
          generateTints: { enabled: false, count: 0 },
        })
      },
    }

    render(
      <FrameworkChangeConfirmProvider>
        <Harness request={request} onMounted={(t) => { triggerChange = t }} />
      </FrameworkChangeConfirmProvider>,
    )

    act(() => triggerChange!())

    // Destructive confirmations use role=alertdialog (Dialog primitive,
    // tone="danger"). alertdialog is the correct ARIA role for prompts
    // that interrupt a workflow with a destructive action.
    const dialog = screen.getByRole('alertdialog')
    expect(within(dialog).getByText(/Disable tints\?/)).toBeDefined()
    // The 'Disable tints' confirm button (matched precisely so the
    // title doesn't leak into the role lookup).
    expect(within(dialog).getByRole('button', { name: 'Disable tints' })).toBeDefined()

    // Class name is shown as `.text-primary-l-1` and the page+node
    // label appear in the usage list.
    expect(within(dialog).getByText('.text-primary-l-1')).toBeDefined()
    expect(within(dialog).getByText('Hero text')).toBeDefined()
    expect(within(dialog).getByText('Home')).toBeDefined()

    // Pre-condition: nothing committed yet.
    expect(committed).toBe(false)
    expect(
      useEditorStore.getState().site!.settings.framework!.colors.tokens[0].generateTints.enabled,
    ).toBe(true)

    fireEvent.click(within(dialog).getByRole('button', { name: 'Disable tints' }))

    expect(committed).toBe(true)
    expect(
      useEditorStore.getState().site!.settings.framework!.colors.tokens[0].generateTints.enabled,
    ).toBe(false)
    // Dialog dismissed.
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  it('cancels the dialog without committing', () => {
    let triggerChange: (() => void) | null = null
    let committed = false

    const request: ConfirmFrameworkChangeRequest = {
      actionLabel: 'Disable tints',
      applyChange: (draft) => {
        const tk = draft.settings.framework!.colors.tokens.find((t) => t.id === TOKEN_ID)
        if (tk) tk.generateTints = { enabled: false, count: 0 }
      },
      commit: () => {
        committed = true
      },
    }

    render(
      <FrameworkChangeConfirmProvider>
        <Harness request={request} onMounted={(t) => { triggerChange = t }} />
      </FrameworkChangeConfirmProvider>,
    )

    act(() => triggerChange!())

    const dialog = screen.getByRole('alertdialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    expect(committed).toBe(false)
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  it('commits silently when the change does not remove anything in use', () => {
    let triggerChange: (() => void) | null = null
    let committed = false

    // Move from count=2 to count=4 — no classes are removed at all.
    const request: ConfirmFrameworkChangeRequest = {
      actionLabel: 'Increase tint count',
      applyChange: (draft) => {
        const tk = draft.settings.framework!.colors.tokens.find((t) => t.id === TOKEN_ID)
        if (tk) tk.generateTints = { enabled: true, count: 4 }
      },
      commit: () => {
        committed = true
      },
    }

    render(
      <FrameworkChangeConfirmProvider>
        <Harness request={request} onMounted={(t) => { triggerChange = t }} />
      </FrameworkChangeConfirmProvider>,
    )

    act(() => triggerChange!())

    expect(committed).toBe(true)
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })
})
