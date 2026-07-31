/**
 * Pure helper that diffs the new manifest's requested permissions against
 * the previously-granted set on an upgrade. Lives in its own file so the
 * `.tsx` component file stays Fast-Refresh-friendly (only-component-exports
 * rule).
 *
 *   • `new`      — in `requested` but NOT in `previouslyGranted`
 *   • `existing` — in both sets
 *   • `dropped`  — in `previouslyGranted` but NOT in `requested`
 *
 * Order of rows: new first (most important to surface), existing second,
 * dropped last.
 */
import type { PluginPermission } from '@core/plugin-sdk'

export type PermissionDiffStatus = 'new' | 'existing' | 'dropped'

export interface PermissionDiffRow {
  permission: PluginPermission
  status: PermissionDiffStatus
}

export function computePermissionDiff(
  requested: PluginPermission[],
  previouslyGranted: PluginPermission[] | undefined,
): PermissionDiffRow[] {
  const granted = new Set(previouslyGranted ?? [])
  const requestedSet = new Set(requested)

  const rows: PermissionDiffRow[] = []
  // First: NEW permissions (most important to surface).
  for (const permission of requested) {
    if (!granted.has(permission)) {
      rows.push({ permission, status: 'new' })
    }
  }
  // Then: previously-approved permissions still in this manifest.
  for (const permission of requested) {
    if (granted.has(permission)) {
      rows.push({ permission, status: 'existing' })
    }
  }
  // Finally: dropped permissions (informational only).
  for (const permission of granted) {
    if (!requestedSet.has(permission)) {
      rows.push({ permission, status: 'dropped' })
    }
  }
  return rows
}
