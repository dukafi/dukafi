/**
 * SiteExportModal — the global host for the Export dialog.
 *
 * Mounted once at the admin shell (like SiteImportModal) and driven by
 * `useAdminUi().siteExport`, so **Export site** is reachable from anywhere:
 * the Data workspace buttons and the Spotlight (cmd+k) command both call
 * `openSiteExport(...)`. The host loads the table list before mounting the
 * dialog, so the dialog always opens with its full set of content tables.
 */

import { useEffect, useState } from 'react'
import { useAdminUi } from '@admin/state/adminUi'
import { listCmsDataTables } from '@core/persistence/cmsData'
import type { DataTableListItem } from '@core/data/schemas'
import { ExportDialog } from '@admin/pages/data/components/ExportDialog/ExportDialog'

export function SiteExportModal() {
  const siteExport = useAdminUi((s) => s.siteExport)
  const closeSiteExport = useAdminUi((s) => s.closeSiteExport)
  const [tables, setTables] = useState<DataTableListItem[] | null>(null)

  // Load tables on open. The shell only mounts this host while `siteExport` is
  // non-null (it unmounts on close), so `tables` resets to null on the next
  // open and the dialog always mounts with an up-to-date table set.
  useEffect(() => {
    if (!siteExport) return undefined
    let cancelled = false
    listCmsDataTables()
      .then((loaded) => { if (!cancelled) setTables(loaded) })
      .catch((err) => {
        if (cancelled) return
        console.error('[SiteExportModal] Failed to load tables:', err)
        setTables([])
      })
    return () => { cancelled = true }
  }, [siteExport])

  if (!siteExport || tables === null) return null

  return (
    <ExportDialog
      open
      onClose={closeSiteExport}
      tables={tables}
      activeTableId={siteExport.activeTableId}
      selectedRowIds={siteExport.selectedRowIds}
      initialScope={siteExport.initialScope}
    />
  )
}
