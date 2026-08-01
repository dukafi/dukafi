import type { Command, ScopeFrame } from './types'

export interface ArgModeState {
  command: Command
  argIndex: number
  values: Record<string, string>
}

export interface SpotlightOpenState {
  phase: 'open'
  query: string
  /** Stack of active scopes; top of stack = active scope. Default: ['root']. */
  scopeStack: ScopeFrame[]
  highlightedIndex: number
  /** Async provider results keyed by providerId (Phase 3). */
  asyncResults: Record<string, Command[]>
  /** Provider ids currently in-flight (Phase 3). */
  loadingProviders: Set<string>
  /**
   * Phase 2: Arg-collection mode. Non-null when a command with `args` has been
   * selected and we're collecting one argument at a time via the input.
   */
  argMode: ArgModeState | null
  /**
   * Phase 2: ID of the destructive command awaiting a second Enter to confirm.
   * Cleared by CLEAR_PENDING_CONFIRM (timeout or Escape or second Enter runs).
   */
  pendingConfirm: string | null
}

export type SpotlightState =
  | { phase: 'closed' }
  | SpotlightOpenState

export type SpotlightAction =
  | { type: 'OPEN' }
  | { type: 'CLOSE' }
  | { type: 'TOGGLE' }
  | { type: 'SET_QUERY'; query: string }
  | { type: 'SET_HIGHLIGHTED'; index: number }
  | { type: 'HIGHLIGHT_NEXT' }
  | { type: 'HIGHLIGHT_PREV' }
  | { type: 'PUSH_SCOPE'; scopeId: string; pendingArgs?: Record<string, string> }
  | { type: 'POP_SCOPE' }
  | { type: 'SET_ASYNC_RESULTS'; providerId: string; results: Command[] }
  | { type: 'SET_LOADING_PROVIDER'; providerId: string; loading: boolean }
  /** Phase 3: reset all async results and loading state (scope change / close). */
  | { type: 'ASYNC_RESET' }
  | { type: 'RESULT_COUNT_CHANGED'; count: number }
  | { type: 'ENTER_ARG_MODE'; command: Command }
  | { type: 'SAVE_ARG_AND_ADVANCE'; argId: string; value: string }
  | { type: 'BACK_ARG' }
  | { type: 'EXIT_ARG_MODE' }
  | { type: 'SET_PENDING_CONFIRM'; commandId: string }
  | { type: 'CLEAR_PENDING_CONFIRM' }
