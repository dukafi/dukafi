/**
 * slotOutletEditor.test.tsx
 *
 * Tests that the SlotOutletEditor only renders its dashed placeholder in
 * VC edit mode (activeDocument.kind === 'visualComponent'). In page mode
 * (activeDocument === null) it must return null so slot outlets don't render
 * UI chrome on the consumer page canvas.
 *
 * Task 5 — Step 6 (slot-outlet edit-mode gate).
 */

import { afterEach, describe, expect, it } from 'bun:test'
import React from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { useEditorStore } from '@site/store/store'
import { SlotOutletEditor } from '@modules/base/slotOutlet/SlotOutletEditor'

afterEach(cleanup)

const defaultProps = {
  props: { slotName: 'children' },
  children: [],
  breakpointId: undefined,
  nodeId: 'node-1',
}

function setPageMode() {
  useEditorStore.setState({ activeDocument: null } as Parameters<typeof useEditorStore.setState>[0])
}

function setVCMode(vcId = 'vc-test') {
  useEditorStore.setState({
    activeDocument: { kind: 'visualComponent', vcId },
  } as Parameters<typeof useEditorStore.setState>[0])
}

describe('SlotOutletEditor — edit-mode gating', () => {
  it('returns null (renders nothing) in page mode (activeDocument === null)', () => {
    setPageMode()
    const { container } = render(<SlotOutletEditor {...defaultProps} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders the dashed placeholder in VC edit mode', () => {
    setVCMode()
    render(<SlotOutletEditor {...defaultProps} />)
    // The placeholder contains the slot name text
    expect(screen.getByText(/Slot: children/i)).toBeDefined()
  })

  it('does not render when switching from VC mode to page mode', () => {
    setVCMode()
    const { container, rerender } = render(<SlotOutletEditor {...defaultProps} />)
    // Verify it renders in VC mode
    expect(container.firstChild).not.toBeNull()

    setPageMode()
    rerender(<SlotOutletEditor {...defaultProps} />)
    expect(container.firstChild).toBeNull()
  })
})
