/**
 * VCDeletionConfirmProvider — single-instance dialog host for Visual Component
 * deletion with impact confirmation.
 *
 * Provides `confirmVCDeletion()` to any descendant component. The caller passes
 * a `vcId` and a `commit` callback. The provider:
 *
 *   1. Reads the current site from the editor store.
 *   2. Calls `previewVCDeletion(site, vcId)`.
 *   3. If no usages (null) → delegates to the generic `ConfirmDeleteProvider`
 *      flow via `useConfirmDelete()`, respecting the `confirmBeforeDelete`
 *      preference.
 *   4. If usages exist → mounts `<VCDeletionConfirmDialog/>` showing every
 *      reference. Commits only after the user confirms.
 *
 * One provider mounted alongside `<FrameworkChangeConfirmProvider/>` in the
 * left sidebar replaces any ad-hoc confirmation state in SiteExplorerPanel.
 *
 * The shared pending / confirm / cancel lifecycle lives in
 * `createConfirmContext`; this module supplies only the impact computation
 * (`resolve`) and the dialog body. The hook + types + context object live next
 * door in `vcDeletionConfirmHook.ts` so this file remains a pure component
 * module (Fast Refresh requires component files to export only components).
 */

import { type ReactNode } from 'react'
import { useEditorStore } from '@site/store/store'
import { useConfirmDelete } from '@admin/shared/dialogs/ConfirmDeleteDialog'
import { previewVCDeletion } from '@core/visualComponents'
import { VCDeletionConfirmDialog } from './VCDeletionConfirmDialog'
import {
  VCDeletionConfirmContext,
  useVCDeletionConfirmController,
  type ConfirmVCDeletionRequest,
} from './vcDeletionConfirmHook'

export function VCDeletionConfirmProvider({ children }: { children: ReactNode }) {
  const site = useEditorStore((s) => s.site)
  const confirmDelete = useConfirmDelete()

  const { confirm, pending, handleCancel, handleConfirm } =
    useVCDeletionConfirmController((request: ConfirmVCDeletionRequest) => {
      if (!site) {
        // No site loaded — commit immediately.
        request.commit()
        return { status: 'handled' }
      }

      const impact = previewVCDeletion(site, request.vcId)

      if (!impact) {
        // No usages — fall through to the generic confirm-delete flow which
        // respects the confirmBeforeDelete editor preference.
        confirmDelete({
          title: 'Delete component?',
          confirmLabel: 'Delete component',
          commit: request.commit,
        })
        return { status: 'handled' }
      }

      // Usages found — show the impact dialog.
      return { status: 'confirm', impact }
    })

  return (
    <VCDeletionConfirmContext.Provider value={{ confirm }}>
      {children}
      {pending && (
        <VCDeletionConfirmDialog
          impact={pending.impact}
          onCancel={handleCancel}
          onConfirm={handleConfirm}
        />
      )}
    </VCDeletionConfirmContext.Provider>
  )
}
