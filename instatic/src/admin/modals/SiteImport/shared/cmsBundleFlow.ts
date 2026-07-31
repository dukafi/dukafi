import type {
  BundleImportSelection,
  BundleRowConflict,
  SiteBundle,
} from '@core/data/bundleSchema'
import type { ConflictResolution } from '@core/siteImport'

export function selectedCmsRowCount(selection: BundleImportSelection, bundle: SiteBundle): number {
  const rowsByTable = new Map<string, number>()
  for (const row of bundle.rows) {
    rowsByTable.set(row.tableId, (rowsByTable.get(row.tableId) ?? 0) + 1)
  }
  return selection.tables.reduce((sum, table) => (
    sum + (table.rowIds?.length ?? rowsByTable.get(table.tableId) ?? 0)
  ), 0)
}

export function selectedCmsMediaCount(selection: BundleImportSelection, mediaTotal: number): number {
  if (!selection.includeMedia) return 0
  return selection.mediaIds?.length ?? mediaTotal
}

export function selectedCmsMediaFolderCount(selection: BundleImportSelection, bundle: SiteBundle): number {
  return selection.includeMediaFolders ? bundle.mediaFolders?.length ?? 0 : 0
}

export function selectedCmsRedirectCount(selection: BundleImportSelection, bundle: SiteBundle): number {
  return selection.includeRedirects ? bundle.redirects?.length ?? 0 : 0
}

export function cmsRowConflictKey(conflict: BundleRowConflict): string {
  return `${conflict.tableId}:${conflict.rowId}`
}

export function defaultCmsRowConflictResolution(conflict: BundleRowConflict): ConflictResolution {
  return { action: 'auto-rename', resolvedSlug: conflict.suggestedSlug }
}

export function selectedCmsConflicts(
  selection: BundleImportSelection,
  bundle: SiteBundle,
  conflicts: readonly BundleRowConflict[],
): BundleRowConflict[] {
  return conflicts.filter((conflict) => isCmsRowSelected(selection, conflict, bundle))
}

export function withCmsConflictResolutions(
  selection: BundleImportSelection,
  bundle: SiteBundle,
  conflicts: readonly BundleRowConflict[],
  resolutions: Map<string, ConflictResolution>,
): BundleImportSelection {
  const skipped = new Set<string>()
  const rowSlugOverrides: NonNullable<BundleImportSelection['rowSlugOverrides']> = []

  for (const conflict of selectedCmsConflicts(selection, bundle, conflicts)) {
    const key = cmsRowConflictKey(conflict)
    const resolution = resolutions.get(key) ?? defaultCmsRowConflictResolution(conflict)
    if (resolution.action === 'skip') {
      skipped.add(key)
      continue
    }
    const slug = resolution.action === 'custom-rename'
      ? resolution.resolvedSlug
      : resolution.resolvedSlug ?? conflict.suggestedSlug
    if (slug && slug !== conflict.slug) {
      rowSlugOverrides.push({ tableId: conflict.tableId, rowId: conflict.rowId, slug })
    }
  }

  const tables = skipped.size === 0
    ? selection.tables
    : selection.tables.map((tableSelection) => {
        const tableRows = bundle.rows.filter((row) => row.tableId === tableSelection.tableId)
        const selectedRowIds = tableSelection.rowIds ?? tableRows.map((row) => row.id)
        return {
          ...tableSelection,
          rowIds: selectedRowIds.filter((rowId) => !skipped.has(`${tableSelection.tableId}:${rowId}`)),
        }
      }).filter((tableSelection) => tableSelection.rowIds.length > 0)

  return {
    ...selection,
    tables,
    rowSlugOverrides: rowSlugOverrides.length > 0 ? rowSlugOverrides : undefined,
  }
}

function isCmsRowSelected(selection: BundleImportSelection, conflict: BundleRowConflict, bundle: SiteBundle): boolean {
  const tableSelection = selection.tables.find((table) => table.tableId === conflict.tableId)
  if (!tableSelection) return false
  if (tableSelection.rowIds === undefined) {
    return bundle.rows.some((row) => row.tableId === conflict.tableId && row.id === conflict.rowId)
  }
  return tableSelection.rowIds.includes(conflict.rowId)
}
