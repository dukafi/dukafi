import { useEffect } from 'react'
import { useEditorStore } from '@site/store/store'
import {
  restorePersistedSiteEditorLayout,
  sameLayoutSelection,
  selectSiteLayoutState,
  writeSiteEditorLayout,
} from '@site/layout/siteEditorLayoutPersistence'

/**
 * Subscribe the Site editor store to Site-workspace layout persistence.
 *
 * Non-site canvas workspaces use `@admin/state/useWorkspaceLayoutPersistence`
 * so Content/Data/Media do not import the Site editor store for generic
 * sidebar chrome.
 */
export function useEditorLayoutPersistence(): void {
  useEffect(() => {
    restorePersistedSiteEditorLayout(useEditorStore)

    let prev = selectSiteLayoutState(useEditorStore.getState())
    const unsubscribe = useEditorStore.subscribe(
      selectSiteLayoutState,
      (selection) => {
        if (sameLayoutSelection(selection, prev)) return
        prev = selection
        writeSiteEditorLayout(selection)
      },
      { equalityFn: sameLayoutSelection, fireImmediately: true },
    )
    return unsubscribe
  }, [])
}
