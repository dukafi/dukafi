/**
 * Unit tests for `createConfirmContext` — the shared "preview impact, then
 * fast-commit or defer to a confirmation dialog" machinery behind both
 * <FrameworkChangeConfirmProvider/> and <VCDeletionConfirmProvider/>.
 *
 * The factory owns the pending / confirm / cancel lifecycle; each provider
 * supplies only a `resolve` (impact computation) and the dialog body. These
 * tests exercise the factory directly with a tiny generic harness so the
 * lifecycle is verified once, independent of either concrete dialog.
 */

import { afterEach, describe, expect, it } from 'bun:test'
import { useEffect, type ReactNode } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import {
  createConfirmContext,
  type ConfirmResolution,
} from '@admin/shared/dialogs/confirmContextFactory'

interface TestRequest {
  commit: () => void
}

interface TestImpact {
  label: string
}

const { Context, useConfirm, useConfirmController } = createConfirmContext<
  TestRequest,
  TestImpact
>()

interface ProviderProps {
  resolve: (request: TestRequest) => ConfirmResolution<TestImpact>
  children: ReactNode
}

function TestProvider({ resolve, children }: ProviderProps) {
  const { confirm, pending, handleCancel, handleConfirm } = useConfirmController(resolve)
  return (
    <Context.Provider value={{ confirm }}>
      {children}
      {pending && (
        <div role="dialog">
          <span>{pending.impact.label}</span>
          <button type="button" onClick={handleConfirm}>
            confirm
          </button>
          <button type="button" onClick={handleCancel}>
            cancel
          </button>
        </div>
      )}
    </Context.Provider>
  )
}

interface HarnessProps {
  request: TestRequest
  onMounted: (trigger: () => void) => void
}

function Harness({ request, onMounted }: HarnessProps) {
  const confirm = useConfirm()
  useEffect(() => {
    onMounted(() => confirm(request))
  }, [confirm, request, onMounted])
  return null
}

afterEach(cleanup)

describe('createConfirmContext', () => {
  it('fast-commits and shows no dialog when resolve reports no impact', () => {
    let trigger: (() => void) | null = null
    let committed = false

    // Mirrors the framework no-impact path: resolve commits immediately and
    // reports it handled the request, so the factory never opens a dialog.
    const request: TestRequest = { commit: () => { committed = true } }
    const resolve = (req: TestRequest): ConfirmResolution<TestImpact> => {
      req.commit()
      return { status: 'handled' }
    }

    render(
      <TestProvider resolve={resolve}>
        <Harness request={request} onMounted={(t) => { trigger = t }} />
      </TestProvider>,
    )

    act(() => trigger!())

    expect(committed).toBe(true)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('defers to the dialog on impact, and cancel clears without committing', () => {
    let trigger: (() => void) | null = null
    let committed = false

    const request: TestRequest = { commit: () => { committed = true } }
    const resolve = (): ConfirmResolution<TestImpact> => ({
      status: 'confirm',
      impact: { label: 'two elements affected' },
    })

    render(
      <TestProvider resolve={resolve}>
        <Harness request={request} onMounted={(t) => { trigger = t }} />
      </TestProvider>,
    )

    act(() => trigger!())

    const dialog = screen.getByRole('dialog')
    expect(dialog.textContent).toContain('two elements affected')
    expect(committed).toBe(false)

    fireEvent.click(screen.getByRole('button', { name: 'cancel' }))

    expect(committed).toBe(false)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('defers to the dialog on impact, and confirm commits then clears', () => {
    let trigger: (() => void) | null = null
    let committed = false

    const request: TestRequest = { commit: () => { committed = true } }
    const resolve = (): ConfirmResolution<TestImpact> => ({
      status: 'confirm',
      impact: { label: 'one element affected' },
    })

    render(
      <TestProvider resolve={resolve}>
        <Harness request={request} onMounted={(t) => { trigger = t }} />
      </TestProvider>,
    )

    act(() => trigger!())

    expect(screen.getByRole('dialog')).toBeDefined()
    expect(committed).toBe(false)

    fireEvent.click(screen.getByRole('button', { name: 'confirm' }))

    expect(committed).toBe(true)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('falls back to immediate commit when no provider is mounted', () => {
    let trigger: (() => void) | null = null
    let committed = false

    const request: TestRequest = { commit: () => { committed = true } }

    render(<Harness request={request} onMounted={(t) => { trigger = t }} />)

    act(() => trigger!())

    expect(committed).toBe(true)
  })
})
