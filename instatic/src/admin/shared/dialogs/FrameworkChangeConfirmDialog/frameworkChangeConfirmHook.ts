/**
 * Hook + types backing <FrameworkChangeConfirmProvider/>.
 *
 * Lives in its own (non-component) file so the provider component module can
 * keep Fast Refresh-friendly "components-only" exports. The shared pending /
 * confirm / cancel lifecycle comes from `createConfirmContext`; this module
 * only pins the request + impact types and re-exports the consumer hook.
 */

import type { FrameworkChangeImpact } from '@core/framework'
import type { SiteDocument } from '@core/page-tree'
import { createConfirmContext } from '../confirmContextFactory'

export interface ConfirmFrameworkChangeRequest {
  /**
   * Pure mutation function that mirrors what `commit` will do at the
   * framework-settings level (toggle a flag, delete a token, drop a
   * class generator…). Run against a clone — must not mutate anything
   * the caller still references.
   */
  applyChange: (site: SiteDocument) => void
  /**
   * Action verb used in the dialog's title and confirm button (e.g.
   * "Disable tints", "Delete primary token"). Keep under ~24 chars.
   */
  actionLabel: string
  /**
   * Performs the actual store action when the user confirms (or when
   * there is no destructive impact and no dialog is shown).
   */
  commit: () => void
}

const frameworkChangeConfirm = createConfirmContext<
  ConfirmFrameworkChangeRequest,
  FrameworkChangeImpact
>()

export const FrameworkChangeConfirmContext = frameworkChangeConfirm.Context
export const useFrameworkChangeConfirmController = frameworkChangeConfirm.useConfirmController

/**
 * Returns `confirmFrameworkChange(request)` from the nearest
 * <FrameworkChangeConfirmProvider/>. The caller passes the same kind of
 * mutation it would normally dispatch through the store, plus a commit
 * callback that performs the actual store action; the hook handles the
 * preview / dialog / confirm dance.
 *
 * If no provider is mounted (the editor wraps its sidebar so this is the
 * production path; tests that render a panel in isolation are the only
 * exception), the hook degrades to immediate commit — destructive changes
 * still happen, the user just doesn't see the dialog.
 */
export const useFrameworkChangeConfirm = frameworkChangeConfirm.useConfirm
