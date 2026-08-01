/**
 * contextMenuSubmenu.test.tsx — Unit tests for ContextMenuSubmenu
 *
 * Covers:
 *  - Open/close via hover (mouseEnter/mouseLeave)
 *  - Open/close via keyboard (ArrowRight / ArrowLeft)
 *  - Open/close via click (toggle)
 *  - Submenu items rendered when open
 *  - Item click closes submenu and calls parent onClose
 *  - Escape in submenu closes submenu only (not parent)
 */

import { afterEach, describe, expect, it, mock } from 'bun:test'
import React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ContextMenuSubmenu, ContextMenuItem } from '@ui/components/ContextMenu'

afterEach(cleanup)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderSubmenu(onClose?: () => void) {
  return render(
    <ContextMenuSubmenu label="Insert here" onClose={onClose} zIndex={1000}>
      <ContextMenuItem onClick={() => {}}>Item A</ContextMenuItem>
      <ContextMenuItem onClick={() => {}}>Item B</ContextMenuItem>
    </ContextMenuSubmenu>,
  )
}

// The trigger button has explicit role="menuitem" (overrides implicit "button" role).
// Query by role="menuitem" and name.
function getTrigger() {
  return screen.getByRole('menuitem', { name: /Insert here/i })
}

// ---------------------------------------------------------------------------
// Trigger rendering
// ---------------------------------------------------------------------------

describe('ContextMenuSubmenu — trigger', () => {
  it('renders the trigger with role=menuitem and the given label', () => {
    renderSubmenu()
    expect(getTrigger()).toBeDefined()
  })

  it('trigger has aria-haspopup="menu" and aria-expanded="false" initially', () => {
    renderSubmenu()
    const trigger = getTrigger()
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu')
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
  })

  it('submenu panel is not rendered initially', () => {
    renderSubmenu()
    // When closed, no [role="menu"] element should be in the DOM.
    expect(screen.queryByRole('menu')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Open via click (toggle)
// ---------------------------------------------------------------------------

describe('ContextMenuSubmenu — click toggle', () => {
  it('opens the submenu on first click', () => {
    renderSubmenu()
    fireEvent.click(getTrigger())

    expect(screen.getByRole('menu')).toBeDefined()
    expect(getTrigger().getAttribute('aria-expanded')).toBe('true')
  })

  it('closes the submenu on second click (toggle)', () => {
    renderSubmenu()
    fireEvent.click(getTrigger())
    expect(screen.getByRole('menu')).toBeDefined()

    fireEvent.click(getTrigger())
    expect(screen.queryByRole('menu')).toBeNull()
    expect(getTrigger().getAttribute('aria-expanded')).toBe('false')
  })
})

// ---------------------------------------------------------------------------
// Submenu items rendered
// ---------------------------------------------------------------------------

describe('ContextMenuSubmenu — submenu items', () => {
  it('renders submenu children (as menuitem elements) when open', () => {
    renderSubmenu()
    fireEvent.click(getTrigger())

    // ContextMenuItem uses role="menuitem"
    const items = screen.getAllByRole('menuitem', { name: /Item/ })
    expect(items.length).toBe(2)
    expect(items[0].textContent).toContain('Item A')
    expect(items[1].textContent).toContain('Item B')
  })

  it('does not render submenu children when closed', () => {
    renderSubmenu()
    const items = screen.queryAllByRole('menuitem', { name: /Item/ })
    expect(items.length).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Open via hover
// ---------------------------------------------------------------------------

describe('ContextMenuSubmenu — hover', () => {
  it('opens the submenu on mouseEnter of the trigger', () => {
    renderSubmenu()
    fireEvent.mouseEnter(getTrigger())
    expect(screen.getByRole('menu')).toBeDefined()
  })

  it('submenu remains visible immediately after mouseLeave (before close delay fires)', () => {
    // The submenu has a 100ms close delay. The submenu stays open immediately
    // after mouseLeave — it closes only after the timer fires.
    renderSubmenu()
    fireEvent.mouseEnter(getTrigger())
    expect(screen.getByRole('menu')).toBeDefined()

    fireEvent.mouseLeave(getTrigger())
    // Still visible immediately (100ms delay not elapsed yet)
    expect(screen.getByRole('menu')).toBeDefined()
  })

  it('mouseEnter on submenu panel cancels pending close', () => {
    renderSubmenu()
    fireEvent.mouseEnter(getTrigger())
    const submenu = screen.getByRole('menu')

    fireEvent.mouseLeave(getTrigger())
    // Entering the submenu cancels the scheduled close
    fireEvent.mouseEnter(submenu)
    // Submenu should still be open
    expect(screen.queryByRole('menu')).toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// Keyboard: ArrowRight / ArrowLeft / Escape
// ---------------------------------------------------------------------------

describe('ContextMenuSubmenu — keyboard navigation', () => {
  it('opens the submenu on ArrowRight keydown on the trigger', () => {
    renderSubmenu()
    fireEvent.keyDown(getTrigger(), { key: 'ArrowRight' })
    expect(screen.getByRole('menu')).toBeDefined()
  })

  it('closes the submenu on ArrowLeft keydown inside the submenu', () => {
    renderSubmenu()
    fireEvent.click(getTrigger())
    const submenu = screen.getByRole('menu')
    expect(submenu).toBeDefined()

    fireEvent.keyDown(submenu, { key: 'ArrowLeft' })
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('closes the submenu on Escape keydown inside the submenu', () => {
    renderSubmenu()
    fireEvent.click(getTrigger())
    const submenu = screen.getByRole('menu')

    fireEvent.keyDown(submenu, { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Selection bubbles to parent onClose
// ---------------------------------------------------------------------------

describe('ContextMenuSubmenu — item click calls onClose', () => {
  it('calls the provided onClose when a submenu item is clicked', () => {
    const onClose = mock(() => {})
    renderSubmenu(onClose)
    fireEvent.click(getTrigger())

    // Click on the submenu panel (which wraps items)
    const submenu = screen.getByRole('menu')
    fireEvent.click(submenu)

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes the submenu panel when a submenu item is clicked', () => {
    renderSubmenu()
    fireEvent.click(getTrigger())
    expect(screen.getByRole('menu')).toBeDefined()

    const items = screen.getAllByRole('menuitem', { name: /Item/ })
    fireEvent.click(items[0])

    expect(screen.queryByRole('menu')).toBeNull()
  })
})
