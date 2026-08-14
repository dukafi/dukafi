/**
 * SpotlightControls — shape of the SpotlightContext value held by
 * <SpotlightRoot> and consumed inside the spotlight feature.
 */

import type { SpotlightState } from './state'

export interface SpotlightControls {
  state: SpotlightState
  open: () => void
  close: () => void
  toggle: () => void
  runShortcut: (event: KeyboardEvent) => boolean
  pushScope: (scopeId: string, args?: Record<string, string>) => void
  popScope: () => void
}
