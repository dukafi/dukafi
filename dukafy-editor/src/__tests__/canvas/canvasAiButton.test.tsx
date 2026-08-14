/**
 * "Ask AI" in the canvas selection toolbar.
 *
 * The toolbar's other actions are fixed verbs — drag, insert, duplicate,
 * delete. This is the open one, so what matters is that it sends the sentence
 * and that the reply has somewhere visible to land.
 *
 * There is deliberately no node id in the payload: `buildAiContext` already
 * tells the model which uid is selected, and the toolbar only exists while
 * something is. A second source of "which element" could disagree with the
 * first.
 */

import { afterEach, describe, expect, it } from 'bun:test'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { CanvasAiButton } from '@site/canvas/CanvasAiButton'
import { useEditorStore } from '@site/store/store'

afterEach(cleanup)

function reset() {
  const sent: string[] = []
  useEditorStore.setState({
    aiPending: false,
    aiPanelOpen: false,
    sendAiMessage: async (text: string) => { sent.push(text) },
  } as unknown as Parameters<typeof useEditorStore.setState>[0])
  return sent
}

function openDialog() {
  fireEvent.click(screen.getByTestId('canvas-ai-trigger'))
  return screen.getByLabelText('Describe the change') as HTMLTextAreaElement
}

describe('CanvasAiButton', () => {
  it('sends what the merchant typed', () => {
    const sent = reset()
    render(<CanvasAiButton />)

    fireEvent.change(openDialog(), { target: { value: 'make this heading bigger' } })
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }))

    expect(sent).toEqual(['make this heading bigger'])
  })

  // The dialog closes on send, so a refusal (no model configured, provider
  // down) would otherwise vanish with it.
  it('opens the transcript so the reply and any failure are visible', () => {
    reset()
    render(<CanvasAiButton />)

    fireEvent.change(openDialog(), { target: { value: 'delete this' } })
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }))

    expect(useEditorStore.getState().aiPanelOpen).toBe(true)
  })

  it('sends on Enter and allows Shift+Enter for a new line', () => {
    const sent = reset()
    render(<CanvasAiButton />)

    const input = openDialog()
    fireEvent.change(input, { target: { value: 'add a button below' } })
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true })
    expect(sent).toEqual([])

    fireEvent.keyDown(input, { key: 'Enter' })
    expect(sent).toEqual(['add a button below'])
  })

  it('refuses to send an empty ask', () => {
    const sent = reset()
    render(<CanvasAiButton />)

    const input = openDialog()
    fireEvent.change(input, { target: { value: '   ' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(sent).toEqual([])
    expect(screen.getByRole('button', { name: /^send$/i }).hasAttribute('disabled')).toBe(true)
  })

  it('discards the draft on cancel', () => {
    const sent = reset()
    render(<CanvasAiButton />)

    fireEvent.change(openDialog(), { target: { value: 'never mind' } })
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))

    expect(sent).toEqual([])
    expect(screen.queryByTestId('canvas-ai-dialog')).toBeNull()
  })

  // One request at a time: the panel and the canvas share one conversation.
  //
  // The trigger carries a tooltip, and `Button` converts `disabled` to
  // `aria-disabled` in that case so the tooltip can still appear (native
  // disabled swallows pointer events). It intercepts the click itself, so the
  // guard is real — asserted here rather than trusted.
  it('is disabled while a request is in flight', () => {
    reset()
    useEditorStore.setState({ aiPending: true } as Parameters<typeof useEditorStore.setState>[0])
    render(<CanvasAiButton />)

    const trigger = screen.getByTestId('canvas-ai-trigger')
    expect(trigger.getAttribute('aria-disabled')).toBe('true')

    fireEvent.click(trigger)
    expect(screen.queryByTestId('canvas-ai-dialog')).toBeNull()
  })
})
