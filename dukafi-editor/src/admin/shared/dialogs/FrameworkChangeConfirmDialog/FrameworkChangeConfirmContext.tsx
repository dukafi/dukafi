/**
 * FrameworkChangeConfirmProvider — single-instance dialog host.
 *
 * Provides `confirmFrameworkChange()` to any descendant component. The
 * caller passes a small mutation function describing the framework
 * change plus a commit callback that performs the actual store action.
 * The provider asks the editor store to preview the impact, and:
 *   - if no framework class becomes orphaned (or all orphans are
 *     unused), commits immediately;
 *   - otherwise mounts <FrameworkChangeConfirmDialog/>, lets the user
 *     review per-element usage, and commits only on explicit confirm.
 *
 * One provider mounted near the editor root replaces N ad-hoc dialog
 * states across panels (Colors, Typography, Spacing).
 *
 * The shared pending / confirm / cancel lifecycle lives in
 * `createConfirmContext`; this module supplies only the impact computation
 * (`resolve`) and the dialog body. The hook + types + context object live
 * next door in `frameworkChangeConfirmHook.ts` so this file remains a pure
 * component module (Fast Refresh requires component files to export only
 * components).
 */

import { type ReactNode } from 'react'
import { useEditorStore } from '@site/store/store'
import { FrameworkChangeConfirmDialog } from './FrameworkChangeConfirmDialog'
import {
  FrameworkChangeConfirmContext,
  useFrameworkChangeConfirmController,
  type ConfirmFrameworkChangeRequest,
} from './frameworkChangeConfirmHook'

export function FrameworkChangeConfirmProvider({ children }: { children: ReactNode }) {
  const previewFrameworkChange = useEditorStore((s) => s.previewFrameworkChange)

  const { confirm, pending, handleCancel, handleConfirm } =
    useFrameworkChangeConfirmController((request: ConfirmFrameworkChangeRequest) => {
      const impact = previewFrameworkChange(request.applyChange)
      if (!impact) {
        request.commit()
        return { status: 'handled' }
      }
      return { status: 'confirm', impact }
    })

  return (
    <FrameworkChangeConfirmContext.Provider value={{ confirm }}>
      {children}
      {pending && (
        <FrameworkChangeConfirmDialog
          impact={pending.impact}
          actionLabel={pending.request.actionLabel}
          onCancel={handleCancel}
          onConfirm={handleConfirm}
        />
      )}
    </FrameworkChangeConfirmContext.Provider>
  )
}
