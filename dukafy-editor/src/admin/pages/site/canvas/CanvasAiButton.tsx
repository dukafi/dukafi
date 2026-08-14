/**
 * CanvasAiButton — "Ask AI" in the canvas selection toolbar, beside drag,
 * insert, duplicate and delete.
 *
 * Those four are the fixed verbs. This is the open one: describe what you want
 * done to the thing you have selected, and it becomes an edit — a rewrite, a
 * deletion, or something new added inside or after it.
 *
 * The selected node needs no plumbing here. `buildAiContext` already tells the
 * model which `uid` the merchant has selected, so "make this bigger" resolves
 * against the same selection the toolbar is floating over. This component only
 * has to collect a sentence.
 *
 * A DIALOG, not an anchored popover — for the reason documented on
 * `CanvasInsertModuleButton`: anchored dropdowns mis-position against the
 * zoom/transform-scaled canvas and its breakpoint iframes.
 */

import { useRef, useState, type KeyboardEvent } from 'react'
import { SparklesSolidIcon } from 'pixel-art-icons/icons/sparkles-solid'
import { Button } from '@ui/components/Button'
import { Dialog } from '@ui/components/Dialog'
import { useEditorStore } from '@site/store/store'
import styles from './CanvasAiButton.module.css'

interface CanvasAiButtonProps {
  /** Class applied to the trigger so it matches the toolbar chrome. */
  buttonClassName?: string
}

export function CanvasAiButton({ buttonClassName }: CanvasAiButtonProps) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const triggerRef = useRef<HTMLButtonElement>(null)

  const sendAiMessage = useEditorStore((s) => s.sendAiMessage)
  const setAiPanelOpen = useEditorStore((s) => s.setAiPanelOpen)
  const pending = useEditorStore((s) => s.aiPending)

  function close() {
    setOpen(false)
    triggerRef.current?.focus()
  }

  function send() {
    const text = draft.trim()
    if (text.length === 0) return
    setDraft('')
    setOpen(false)
    // Open the transcript so the reply, and any failure, has somewhere to
    // land — otherwise a rejected request would be invisible from here.
    setAiPanelOpen(true)
    void sendAiMessage(text)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      send()
    }
  }

  return (
    <>
      <Button
        ref={triggerRef}
        variant="secondary"
        size="xs"
        iconOnly
        aria-label="Ask AI about this element"
        aria-haspopup="dialog"
        aria-expanded={open}
        tooltip="Ask AI"
        className={buttonClassName}
        disabled={pending}
        onClick={() => setOpen(true)}
        data-testid="canvas-ai-trigger"
      >
        <SparklesSolidIcon size={13} color="var(--text)" />
      </Button>

      {open && (
        <Dialog
          open
          title="Ask AI about this element"
          onClose={close}
          size="sm"
          footer={
            <>
              <Button variant="secondary" size="sm" onClick={close}>Cancel</Button>
              <Button variant="primary" size="sm" onClick={send} disabled={draft.trim().length === 0}>
                Send
              </Button>
            </>
          }
        >
          <div className={styles.body} data-testid="canvas-ai-dialog">
            <textarea
              className={styles.input}
              value={draft}
              onChange={(event) => setDraft(event.currentTarget.value)}
              onKeyDown={handleKeyDown}
              placeholder="Make this heading bigger · Delete this · Add a button below linking to /products"
              rows={3}
              autoFocus
              aria-label="Describe the change"
            />
            <p className={styles.hint}>
              Applies straight away to the selected element. Press Cmd+Z to undo.
            </p>
          </div>
        </Dialog>
      )}
    </>
  )
}
