/**
 * Spotlight context definitions — kept in a .ts file (not .tsx) so that
 * React Fast Refresh doesn't complain about mixing context exports with
 * component exports (react-refresh/only-export-components rule).
 *
 * SpotlightContext       — palette controls produced by <SpotlightRoot>.
 * SpotlightInternalContext — private API consumed by <Spotlight> dialog.
 */

import { createContext } from 'react'
import type { SpotlightState } from './state'
import type { SpotlightAction } from './state'
import type { Command, CommandContext } from './types'
import type { SpotlightControls } from './spotlightControls'

/** Palette controls context produced by <SpotlightRoot>. */
export const SpotlightContext = createContext<SpotlightControls | null>(null)

/**
 * Internal context consumed by the <Spotlight> dialog component only.
 * Carries state, dispatch, the command context snapshot, and run functions.
 *
 * Phase 2: adds `runCommandWithArgs` for executing commands after arg collection.
 */
export interface SpotlightInternalContextValue {
  state: SpotlightState
  dispatch: (action: SpotlightAction) => void
  commandContext: CommandContext | null
  /** Run a command with no pre-collected args (opens arg mode if args exist). */
  runCommand: (command: Command) => Promise<void>
  /** Run a command with the given collected args (skips arg mode). */
  runCommandWithArgs: (command: Command, args: Record<string, string>) => Promise<void>
}

export const SpotlightInternalContext =
  createContext<SpotlightInternalContextValue | null>(null)
