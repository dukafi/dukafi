/**
 * React renderer for the slash-command menu.
 *
 * Mounted by `TiptapBodyEditor` once per editor instance. The editor
 * holds the public API as a ref (`handleRef.current = { open, update,
 * close }`) so the SlashCommand extension's `render()` lifecycle can
 * drive the menu without dispatching React events on every key.
 *
 * Selection model is local: arrow-up / arrow-down move the active
 * index; Enter invokes the highlighted item's command; Escape closes.
 * The extension calls `onKeyDown` for any key while the menu is open;
 * we return `true` to swallow handled keys.
 */

import { useImperativeHandle, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import type { Editor, Range } from '@tiptap/core'
import { Button } from '@ui/components/Button'
import type { SlashCommandItem } from './SlashCommand'
import styles from './BodySlashMenu.module.css'

interface MenuPosition {
  x: number
  y: number
}

export interface SlashMenuHandle {
  open: (
    editor: Editor,
    range: Range,
    items: SlashCommandItem[],
    rect: DOMRect | null,
  ) => void
  update: (range: Range, items: SlashCommandItem[], rect: DOMRect | null) => void
  close: () => void
  /** Returns true if the key was handled and should be swallowed. */
  onKeyDown: (event: KeyboardEvent) => boolean
  isOpen: () => boolean
}

interface BodySlashMenuProps {
  handleRef: RefObject<SlashMenuHandle | null>
}

interface MenuState {
  editor: Editor
  range: Range
  items: SlashCommandItem[]
  position: MenuPosition
}

export function BodySlashMenu({ handleRef }: BodySlashMenuProps) {
  const [state, setState] = useState<MenuState | null>(null)
  const [activeIndex, setActiveIndex] = useState(0)

  // Derived: clamp the active index to the items range without writing
  // back to state, so re-renders don't cascade through an effect.
  const clampedActiveIndex =
    state && state.items.length > 0
      ? Math.min(Math.max(activeIndex, 0), state.items.length - 1)
      : 0

  useImperativeHandle(
    handleRef,
    (): SlashMenuHandle => ({
      open: (editor, range, items, rect) => {
        setState({ editor, range, items, position: rectToPosition(rect) })
        setActiveIndex(0)
      },
      update: (range, items, rect) => {
        setState((current) =>
          current ? { ...current, range, items, position: rectToPosition(rect) } : current,
        )
      },
      close: () => setState(null),
      isOpen: () => state !== null,
      onKeyDown: (event) => {
        if (!state) return false
        const itemCount = state.items.length
        if (event.key === 'ArrowDown') {
          event.preventDefault()
          setActiveIndex((index) => (itemCount === 0 ? 0 : (index + 1) % itemCount))
          return true
        }
        if (event.key === 'ArrowUp') {
          event.preventDefault()
          setActiveIndex((index) => (itemCount === 0 ? 0 : (index - 1 + itemCount) % itemCount))
          return true
        }
        if (event.key === 'Enter') {
          const item = state.items[clampedActiveIndex]
          if (!item) return false
          event.preventDefault()
          item.command({ editor: state.editor, range: state.range })
          setState(null)
          return true
        }
        if (event.key === 'Escape') {
          event.preventDefault()
          setState(null)
          return true
        }
        return false
      },
    }),
    [clampedActiveIndex, state],
  )

  if (!state || typeof document === 'undefined') return null

  return createPortal(
    <div
      className={styles.menu}
      role="listbox"
      aria-label="Insert block"
      data-testid="content-slash-menu"
      style={{ top: state.position.y, left: state.position.x }}
    >
      {state.items.length === 0 ? (
        <div className={styles.empty}>No matches</div>
      ) : (
        state.items.map((item, index) => (
          <SlashMenuRow
            key={item.id}
            label={item.label}
            description={item.description}
            active={index === clampedActiveIndex}
            onPointerEnter={() => setActiveIndex(index)}
            onClick={() => {
              item.command({ editor: state.editor, range: state.range })
              setState(null)
            }}
          />
        ))
      )}
    </div>,
    document.body,
  )
}

interface SlashMenuRowProps {
  label: string
  description: string
  active: boolean
  onPointerEnter: () => void
  onClick: () => void
}

function SlashMenuRow({ label, description, active, onPointerEnter, onClick }: SlashMenuRowProps) {
  return (
    <Button
      variant="ghost"
      size="sm"
      role="option"
      aria-selected={active}
      data-active={active ? 'true' : undefined}
      className={styles.row}
      onPointerEnter={onPointerEnter}
      // The Suggestion plugin clears the menu when the editor loses focus.
      // Mouse-down on the menu would steal that focus before the click
      // fires, so we have to prevent the default focus shift explicitly.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      <span className={styles.label}>{label}</span>
      <span className={styles.description}>{description}</span>
    </Button>
  )
}

function rectToPosition(rect: DOMRect | null): MenuPosition {
  if (!rect) return { x: 0, y: 0 }
  // Anchor below the caret. The Suggestion plugin gives us the caret rect
  // via `clientRect()`; we add a small gap so the menu doesn't crowd the
  // text.
  return { x: Math.round(rect.left), y: Math.round(rect.bottom + 6) }
}

// `ReactNode` isn't imported here — the SlashMenuRow used to accept an
// optional `icon` ReactNode, but it isn't part of the v1 slash menu's
// row shape; keep this surface minimal.
