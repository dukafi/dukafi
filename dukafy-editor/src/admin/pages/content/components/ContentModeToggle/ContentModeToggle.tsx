/**
 * Write / Live segmented switch for the content editor.
 *
 * Mirrors `CanvasModeToggle` from the site editor: a small two-tab pill
 * that floats at the top of the document canvas. The two modes are:
 *
 *   - **Write** — the bare Tiptap surface optimised for fast text input.
 *     This is the editor we ship today: tall content column, no template
 *     chrome, no published CSS.
 *
 *   - **Live** — the entry rendered against its actual entry template
 *     inside a sandboxed iframe, with the site's real reset / framework /
 *     style bundle applied. The body region stays inline-editable via
 *     Tiptap mounted directly into the iframe document.
 *
 * The toggle owns no app state — `mode` + `onChange` are passed in.
 */

import { type SyntheticEvent } from 'react'
import { cn } from '@ui/cn'
import { Tooltip } from '@ui/components/Tooltip'
import { TextStartTIcon } from 'pixel-art-icons/icons/text-start-t'
import { EyeSolidIcon } from 'pixel-art-icons/icons/eye-solid'
import styles from './ContentModeToggle.module.css'

export type ContentMode = 'write' | 'live'

interface ContentModeToggleProps {
  mode: ContentMode
  onChange: (mode: ContentMode) => void
}

export function ContentModeToggle({ mode, onChange }: ContentModeToggleProps) {
  // The toggle lives on the canvas surface, which has its own click /
  // keyboard handlers (deselect, shortcuts). Stop propagation so the
  // tab buttons feel like chrome, not "clicks on empty canvas".
  const stopCanvasInteraction = (event: SyntheticEvent) => {
    event.stopPropagation()
  }

  return (
    <div
      className={styles.shell}
      role="tablist"
      aria-label="Content editor mode"
      data-testid="content-mode-toggle"
      onClick={stopCanvasInteraction}
    >
      <Tooltip content="Write mode (plain editor surface)">
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'write'}
          aria-label="Write"
          data-testid="content-mode-toggle-write"
          className={cn(styles.tab, mode === 'write' && styles.tabActive)}
          onClick={() => onChange('write')}
        >
          <TextStartTIcon size={14} aria-hidden="true" />
        </button>
      </Tooltip>
      <Tooltip content="Live mode (edit inside the rendered template)">
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'live'}
          aria-label="Live"
          data-testid="content-mode-toggle-live"
          className={cn(styles.tab, mode === 'live' && styles.tabActive)}
          onClick={() => onChange('live')}
        >
          <EyeSolidIcon size={14} aria-hidden="true" />
        </button>
      </Tooltip>
    </div>
  )
}
