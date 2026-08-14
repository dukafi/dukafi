/**
 * AiPanel — ask for a change, get it.
 *
 * There is no approve step and no diff to read: the reply lands on the canvas
 * and the toast says Cmd+Z. That is a deliberate choice about what this feature
 * is for. A confirmation dialog on every turn makes the assistant slower than
 * dragging a module in by hand, which is the only bar it has to clear.
 *
 * The composer is a textarea, not an Input: describing a section is two or
 * three lines of prose, and Enter sends while Shift+Enter breaks the line —
 * the convention every chat surface shares.
 */

import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useEditorStore } from '@site/store/store'
import { Panel, useAutoFocusPanel, type DockablePanelProps } from '@admin/shared/Panel'
import { Button } from '@ui/components/Button'
import { EmptyState } from '@ui/components/EmptyState'
import { Alert } from '@ui/components/Alert'
import { SparklesSolidIcon } from 'pixel-art-icons/icons/sparkles-solid'
import { AiSettingsPopover } from './AiSettingsPopover'
import styles from './AiPanel.module.css'

const PLACEHOLDER = 'Describe a change — "add a centered hero with a heading and a button to /products"'

export function AiPanel({ mode = 'docked', dragHandleProps, onToggleMode }: DockablePanelProps) {
  const isOpen = useEditorStore((s) => s.aiPanelOpen)
  const setAiPanelOpen = useEditorStore((s) => s.setAiPanelOpen)
  const messages = useEditorStore((s) => s.aiMessages)
  const pending = useEditorStore((s) => s.aiPending)
  const notConfigured = useEditorStore((s) => s.aiNotConfigured)
  const error = useEditorStore((s) => s.aiError)
  const sendAiMessage = useEditorStore((s) => s.sendAiMessage)
  const clearAiConversation = useEditorStore((s) => s.clearAiConversation)
  const setAiNotConfigured = useEditorStore((s) => s.setAiNotConfigured)

  const panelRef = useRef<HTMLElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const [draft, setDraft] = useState('')

  useAutoFocusPanel(panelRef, isOpen)

  // Keep the newest turn in view. A reply can be several lines and the
  // interesting part is always the end.
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
  }, [messages, pending])

  if (!isOpen) return null

  function send() {
    const text = draft.trim()
    if (text.length === 0 || pending) return
    setDraft('')
    void sendAiMessage(text)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      send()
    }
  }

  return (
    <Panel
      ref={panelRef}
      panelId="ai"
      title="Assistant"
      testId="ai-panel"
      onClose={() => setAiPanelOpen(false)}
      mode={mode}
      dragHandleProps={dragHandleProps}
      onToggleMode={onToggleMode}
      dockLocation="left sidebar"
      headerActions={messages.length > 0 ? (
        <Button variant="ghost" size="xs" onClick={clearAiConversation}>Clear</Button>
      ) : undefined}
    >
      <div className={styles.panel}>
        <div className={styles.messages} ref={listRef} data-testid="ai-messages">
          {messages.length === 0 && !notConfigured && (
            <EmptyState
              title="Ask for a change"
              description="It edits the page you have open. Changes apply straight away — press Cmd+Z to undo."
            />
          )}

          {notConfigured && (
            <Alert tone="info" title="No model configured">
              Open the settings button next to Send and pick a provider and model.
              A local Ollama works with no API key.
            </Alert>
          )}

          {messages.map((message, index) => (
            <div
              // Messages are append-only and never reordered, so the index is a
              // stable identity here.
              key={index}
              className={message.role === 'user' ? styles.user : styles.assistant}
              data-role={message.role}
            >
              <p className={styles.text}>{message.content}</p>
              {message.applied !== undefined && (
                <p className={styles.applied}>
                  {message.applied === 1 ? 'Applied 1 change' : `Applied ${message.applied} changes`}
                </p>
              )}
            </div>
          ))}

          {pending && <p className={styles.thinking} role="status">Thinking…</p>}
          {error && <Alert tone="danger" title="That didn’t work">{error}</Alert>}
        </div>

        <div className={styles.composer}>
          <textarea
            className={styles.input}
            value={draft}
            onChange={(event) => setDraft(event.currentTarget.value)}
            onKeyDown={handleKeyDown}
            placeholder={PLACEHOLDER}
            rows={3}
            disabled={pending}
            aria-label="Message the assistant"
          />
          <div className={styles.composerActions}>
            {/* Model settings sit next to Send because picking a model is part
                of the conversation, not a one-time install step. */}
            <AiSettingsPopover onSaved={() => setAiNotConfigured(false)} />
            <Button
              variant="primary"
              size="sm"
              onClick={send}
              disabled={pending || draft.trim().length === 0}
            >
              <SparklesSolidIcon size={12} aria-hidden="true" />
              {pending ? 'Working…' : 'Send'}
            </Button>
          </div>
        </div>
      </div>
    </Panel>
  )
}
