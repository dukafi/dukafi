/**
 * Hook + types backing <VCDeletionConfirmProvider/>.
 *
 * Lives in its own (non-component) file so the provider component module can
 * keep Fast Refresh-friendly "components-only" exports. Same split-file layout
 * as `frameworkChangeConfirmHook.ts`; the shared pending / confirm / cancel
 * lifecycle comes from `createConfirmContext`.
 */

import type { VCDeletionImpact } from '@core/visualComponents'
import { createConfirmContext } from '../confirmContextFactory'

export interface ConfirmVCDeletionRequest {
  /** ID of the visual component to delete. */
  vcId: string
  /**
   * Executes the actual deletion (deleteVisualComponent + any post-delete cleanup
   * such as clearing activeDocument). Called only when the user confirms the dialog
   * or when there are no usages and confirmBeforeDelete is off.
   */
  commit: () => void
}

const vcDeletionConfirm = createConfirmContext<
  ConfirmVCDeletionRequest,
  VCDeletionImpact
>()

export const VCDeletionConfirmContext = vcDeletionConfirm.Context
export const useVCDeletionConfirmController = vcDeletionConfirm.useConfirmController

/**
 * Returns `confirmVCDeletion(request)` from the nearest
 * <VCDeletionConfirmProvider/>. The caller passes a `vcId` and a `commit`
 * callback that performs the actual store action; the hook handles the
 * preview / dialog / confirm dance.
 *
 * Falls back to immediate commit when no provider is mounted (test isolation).
 */
export const useVCDeletionConfirm = vcDeletionConfirm.useConfirm
