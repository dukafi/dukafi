/**
 * Spotlight state machine — §3.4 of the Command Spotlight master plan.
 *
 * A useReducer atom (not a Zustand slice) so spotlight state is isolated from
 * the editor store. The reducer is pure — all side effects live in the host
 * component (SpotlightRoot).
 *
 * The reducer itself only handles the three phase transitions (OPEN / CLOSE /
 * TOGGLE). Every other action requires `phase === 'open'` and is routed to
 * `applyOpenAction` in `stateHandlers.ts`, which dispatches to one tiny pure
 * helper per action type. Adding a new action = add a variant to
 * `SpotlightAction`, add a handler in `stateHandlers.ts`, add a case in
 * `applyOpenAction`. No giant switch to edit.
 *
 * Phase 2 additions:
 *   - argMode: tracks argument-collection flow for commands with args
 *   - pendingConfirm: tracks first-Enter on a destructive command (5 s window)
 */
import { applyOpenAction } from './stateHandlers'
import type { SpotlightAction, SpotlightOpenState, SpotlightState } from './stateTypes'
export type { ArgModeState, SpotlightAction, SpotlightOpenState, SpotlightState } from './stateTypes'

// ─── Initial state ────────────────────────────────────────────────────────────

export const initialState: SpotlightState = { phase: 'closed' }

function makeOpenState(): SpotlightOpenState {
  return {
    phase: 'open',
    query: '',
    scopeStack: [{ scopeId: 'root', pendingArgs: {} }],
    highlightedIndex: 0,
    asyncResults: {},
    loadingProviders: new Set(),
    argMode: null,
    pendingConfirm: null,
  }
}

// ─── Reducer ──────────────────────────────────────────────────────────────────

export function spotlightReducer(
  state: SpotlightState,
  action: SpotlightAction,
): SpotlightState {
  switch (action.type) {
    case 'OPEN':
      return state.phase === 'open' ? state : makeOpenState()
    case 'CLOSE':
      return { phase: 'closed' }
    case 'TOGGLE':
      return state.phase === 'closed' ? makeOpenState() : { phase: 'closed' }
    default:
      // Every remaining action requires the palette to be open. If it isn't,
      // the action is a no-op and we preserve the closed-state reference.
      if (state.phase !== 'open') return state
      return applyOpenAction(state, action)
  }
}
