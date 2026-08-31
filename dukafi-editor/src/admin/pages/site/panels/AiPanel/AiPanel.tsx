/**
 * AiPanel — Assist and Build share a composer; they do not share a safety model.
 *
 * Send (Assist) lands on the canvas immediately. Cmd+Z is the safety net.
 * A confirmation dialog on every Assist turn would make it slower than dragging
 * a module in by hand, which is the only bar it has to clear.
 *
 * Build is the other button on BYOK providers: elicit (if the business profile
 * is blank), plan, merchant approval, then the same apply path. Enter still
 * sends Assist. Dukafi AI has one path, so the composer shows one button.
 */

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { useEditorStore } from '@site/store/store'
import { Panel, useAutoFocusPanel, type DockablePanelProps } from '@admin/shared/Panel'
import { Button } from '@ui/components/Button'
import { EmptyState } from '@ui/components/EmptyState'
import { Alert } from '@ui/components/Alert'
import { FormField } from '@ui/components/FormField'
import { Input, Textarea } from '@ui/components/Input'
import { SparklesSolidIcon } from 'pixel-art-icons/icons/sparkles-solid'
import type { BuildPlan } from '@core/ai'
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
  const needProfile = useEditorStore((s) => s.aiNeedProfile)
  const plan = useEditorStore((s) => s.aiPlan)
  const provider = useEditorStore((s) => s.aiProvider)
  const sendAiMessage = useEditorStore((s) => s.sendAiMessage)
  const startAiBuild = useEditorStore((s) => s.startAiBuild)
  const dukafi = provider === 'dukafi'
  const submitAiProfile = useEditorStore((s) => s.submitAiProfile)
  const applyAiPlan = useEditorStore((s) => s.applyAiPlan)
  const cancelAiPlan = useEditorStore((s) => s.cancelAiPlan)
  const clearAiConversation = useEditorStore((s) => s.clearAiConversation)
  const setAiNotConfigured = useEditorStore((s) => s.setAiNotConfigured)
  const refreshAiConfig = useEditorStore((s) => s.refreshAiConfig)

  const panelRef = useRef<HTMLElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const [draft, setDraft] = useState('')
  const busy = pending || needProfile || plan !== null

  useAutoFocusPanel(panelRef, isOpen)

  useEffect(() => {
    if (isOpen) void refreshAiConfig()
  }, [isOpen, refreshAiConfig])

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
  }, [messages, pending, needProfile, plan])

  if (!isOpen) return null

  function send() {
    const text = draft.trim()
    if (text.length === 0 || busy) return
    setDraft('')
    void sendAiMessage(text)
  }

  function build() {
    const text = draft.trim()
    if (text.length === 0 || busy) return
    setDraft('')
    void startAiBuild(text)
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
          {messages.length === 0 && !notConfigured && !needProfile && !plan && (
            <EmptyState
              title="Ask for a change"
              description={dukafi
                ? 'Describe the change. The assistant edits this page. You can undo.'
                : 'Send applies straight away on the open page — press Cmd+Z to undo. Build proposes a section for you to approve first.'}
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
              key={index}
              className={
                message.kind === 'activity'
                  ? styles.activity
                  : message.role === 'user' ? styles.user : styles.assistant
              }
              data-role={message.role}
              data-kind={message.kind || 'reply'}
            >
              <p className={styles.text}>{message.content}</p>
              {message.applied !== undefined && (
                <p className={styles.applied}>
                  {message.applied === 1 ? 'Applied 1 change' : `Applied ${message.applied} changes`}
                </p>
              )}
            </div>
          ))}

          {needProfile && <ProfileElicit onSubmit={submitAiProfile} onCancel={cancelAiPlan} disabled={pending} />}
          {plan && <PlanReview plan={plan} onApply={applyAiPlan} onCancel={cancelAiPlan} />}

          {pending && !messages.some((message) => message.kind === 'activity') && (
            <p className={styles.thinking} role="status">Thinking…</p>
          )}
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
            disabled={busy}
            aria-label="Message the assistant"
          />
          <div className={styles.composerActions}>
            <AiSettingsPopover onSaved={() => { setAiNotConfigured(false); void refreshAiConfig() }} />
            <div className={styles.composerButtons}>
              {!dukafi && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={build}
                  disabled={busy || draft.trim().length === 0}
                  data-testid="ai-build"
                >
                  Build
                </Button>
              )}
              <Button
                variant="primary"
                size="sm"
                onClick={send}
                disabled={busy || draft.trim().length === 0}
              >
                <SparklesSolidIcon size={12} aria-hidden="true" />
                {pending ? 'Working…' : 'Send'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </Panel>
  )
}

function ProfileElicit({
  onSubmit,
  onCancel,
  disabled,
}: {
  onSubmit: (draft: { startedOn: string; audience: string; difference: string }) => Promise<void>
  onCancel: () => void
  disabled: boolean
}) {
  const [startedOn, setStartedOn] = useState('')
  const [audience, setAudience] = useState('')
  const [difference, setDifference] = useState('')

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (disabled) return
    void onSubmit({ startedOn, audience, difference })
  }

  return (
    <form className={styles.card} onSubmit={handleSubmit} data-testid="ai-elicit">
      <h3 className={styles.cardTitle}>A few facts about the business</h3>
      <p className={styles.cardBody}>
        Used so this section does not invent a founding story. Blank is fine — the store works either way.
      </p>
      <FormField label="When did you start?" htmlFor="ai-started-on" description="A year or a short phrase is enough.">
        <Input
          id="ai-started-on"
          value={startedOn}
          onChange={(event) => setStartedOn(event.currentTarget.value)}
          maxLength={80}
          disabled={disabled}
        />
      </FormField>
      <FormField label="Who do you sell to?" htmlFor="ai-audience">
        <Textarea
          id="ai-audience"
          value={audience}
          onChange={(event) => setAudience(event.currentTarget.value)}
          rows={2}
          maxLength={500}
          disabled={disabled}
        />
      </FormField>
      <FormField label="What makes you different?" htmlFor="ai-difference">
        <Textarea
          id="ai-difference"
          value={difference}
          onChange={(event) => setDifference(event.currentTarget.value)}
          rows={2}
          maxLength={500}
          disabled={disabled}
        />
      </FormField>
      <div className={styles.cardActions}>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={disabled}>Cancel</Button>
        <Button type="submit" variant="primary" size="sm" disabled={disabled}>Continue</Button>
      </div>
    </form>
  )
}

function PlanReview({
  plan,
  onApply,
  onCancel,
}: {
  plan: BuildPlan
  onApply: () => void
  onCancel: () => void
}) {
  const missed = plan.blocks.filter((block) => block.media?.missed)

  return (
    <div className={styles.card} data-testid="ai-plan">
      <h3 className={styles.cardTitle}>{plan.title}</h3>
      {plan.summary.length > 0 && <p className={styles.cardBody}>{plan.summary}</p>}
      {plan.blocks.length > 0 && (
        <ul className={styles.blockList}>
          {plan.blocks.map((block, index) => (
            <li key={index} className={styles.block}>
              <p className={styles.blockHeading}>{block.heading || 'Untitled'}</p>
              {block.body.length > 0 && <p className={styles.blockBody}>{block.body}</p>}
              {block.media && (
                <p className={styles.applied}>
                  {block.media.missed
                    ? `Photo not in the library (${block.media.description || block.media.query})`
                    : `Photo: ${block.media.altText || block.media.description}`}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
      {missed.length > 0 && (
        <p className={styles.missed}>
          Missing photos are left out — no placeholder image is invented.
        </p>
      )}
      <div className={styles.cardActions}>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
        <Button type="button" variant="primary" size="sm" onClick={onApply}>Apply</Button>
      </div>
    </div>
  )
}
