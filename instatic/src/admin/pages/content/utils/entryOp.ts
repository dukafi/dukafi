/**
 * The save-state machine shared by every async entry handler in ContentPage.
 *
 * Before this helper, each of the dozen `handleXxx` handlers re-implemented the
 * same five-step sequence by hand — permission check → `setSaveMessage('saving')`
 * → `try` → apply result → `setSaveMessage('saved' | 'error')` — so a handler
 * that forgot the `catch` would leave the toolbar stuck on "Saving…". `runEntryOp`
 * owns the sequence once: callers pass the async op plus the few knobs that vary
 * (permission gate, save-state phase labels, whether to re-throw for dialogs).
 *
 * Kept as a standalone function taking its setters as `deps` so it is unit
 * testable without mounting the whole page.
 */
import { getErrorMessage } from '@core/utils/errorMessage'
import type { SaveMessage } from '../hooks/useContentEntryDraft'

export interface EntryOpDeps {
  setSaveMessage: (message: SaveMessage) => void
  setError: (message: string | null) => void
}

export interface EntryOpOptions<T> {
  /** Permission gate. When `false`, surface `permMsg` and skip the op entirely. */
  permitted?: boolean
  /** Message surfaced when `permitted` is `false`. */
  permMsg?: string
  /** Fallback error text when the op throws a value without a usable message. */
  fallback: string
  /** Apply the op's successful result (e.g. push it into the draft). */
  apply?: (result: T) => void
  /**
   * Save-state phase labels. When set, the toolbar shows `pending` while the
   * op runs and `done` on success (errors always flip to 'error'). Omit for
   * ops that don't drive the save toast (deletes, collection edits).
   */
  phase?: { pending: SaveMessage; done: SaveMessage }
  /**
   * Re-throw the error after surfacing it. Dialog-driven callers rely on the
   * returned promise rejecting so they can keep their dialog open on failure.
   */
  rethrow?: boolean
}

export async function runEntryOp<T>(
  deps: EntryOpDeps,
  fn: () => Promise<T>,
  options: EntryOpOptions<T>,
): Promise<void> {
  if (options.permitted === false) {
    deps.setError(options.permMsg ?? 'You do not have permission to do that')
    return
  }
  if (options.phase) deps.setSaveMessage(options.phase.pending)
  deps.setError(null)
  try {
    const result = await fn()
    options.apply?.(result)
    if (options.phase) deps.setSaveMessage(options.phase.done)
  } catch (err) {
    if (options.phase) deps.setSaveMessage('error')
    deps.setError(getErrorMessage(err, options.fallback))
    if (options.rethrow) throw err
  }
}
