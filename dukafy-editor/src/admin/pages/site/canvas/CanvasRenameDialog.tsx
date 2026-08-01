/**
 * CanvasRenameDialog — modal used by the canvas/context-menu rename action.
 *
 * State lives in `useCanvasRenameDialog`; this component is pure JSX. Keeping
 * the dialog out of `CanvasRoot` shrinks the parent and makes the rename UX a
 * one-file change going forward.
 */

import { useId, useRef, type FormEvent, type RefObject } from 'react'
import { Button } from '@ui/components/Button'
import { Dialog } from '@ui/components/Dialog'
import { Input } from '@ui/components/Input'
import type { CanvasRenameDialogState } from './useCanvasRenameDialog'
import styles from './CanvasRoot.module.css'

interface CanvasRenameDialogProps {
  state: CanvasRenameDialogState
  onChange: (next: CanvasRenameDialogState) => void
  onCommit: () => void
  onClose: () => void
}

export function CanvasRenameDialog({
  state,
  onChange,
  onCommit,
  onClose,
}: CanvasRenameDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null) as RefObject<HTMLInputElement>
  const nameId = useId()

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    onCommit()
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Rename element"
      size="sm"
      initialFocusRef={inputRef}
      footer={
        <>
          <Button variant="secondary" size="sm" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            type="button"
            onClick={onCommit}
            disabled={!state.value.trim()}
          >
            Save
          </Button>
        </>
      }
    >
      <form className={styles.renameForm} onSubmit={handleSubmit}>
        <div className={styles.renameField}>
          <label htmlFor={nameId} className={styles.renameLabel}>Name</label>
          <Input
            id={nameId}
            ref={inputRef}
            fieldSize="sm"
            value={state.value}
            autoComplete="off"
            spellCheck={false}
            invalid={Boolean(state.error)}
            aria-describedby={state.error ? 'canvas-rename-error' : undefined}
            onChange={(event) => {
              onChange({ ...state, value: event.currentTarget.value, error: null })
            }}
          />
        </div>
        {state.error && (
          <p id="canvas-rename-error" role="alert" className={styles.renameError}>
            {state.error}
          </p>
        )}
      </form>
    </Dialog>
  )
}
