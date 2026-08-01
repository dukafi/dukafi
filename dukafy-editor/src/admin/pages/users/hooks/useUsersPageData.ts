/**
 * useUsersPageData — central data store for the Users workspace.
 *
 * Loads users, roles, and audit events in parallel from the CMS API, gated
 * by the caller-supplied `access` flags. The Users tab needs `users` and
 * `roles`; the Roles tab needs `roles`; the Audit tab needs `events` plus
 * `users`/`roles` to enrich the displayed labels. Loading them all at once
 * keeps tab-switching instant and matches the per-tab capability gates
 * applied by the page shell.
 *
 * Returns mutable state setters so each tab can do optimistic updates after
 * a successful save (avoids the round-trip flicker), then call `refresh()`
 * to reconcile authoritative state from the server.
 */
import { useCallback, useEffect, useState } from 'react'
import {
  listCmsAuditEvents,
  listCmsRoles,
  listCmsUsers,
  type CmsAuditEvent,
  type CmsCurrentUser,
  type CmsRole,
} from '@core/persistence'
import type { WorkspaceLoadState } from '@admin/lib/workspaceLoadState'
import { emptyUserForm, type UsersPageLoadAccess } from '../types'
import { getErrorMessage } from '@core/utils/errorMessage'

interface LoadedData {
  users: CmsCurrentUser[]
  roles: CmsRole[]
  events: CmsAuditEvent[]
}

export interface UsersPageData extends WorkspaceLoadState {
  users: CmsCurrentUser[]
  roles: CmsRole[]
  events: CmsAuditEvent[]
  /**
   * The first role id that admins can assign to a user (i.e. excludes the
   * Owner role). Used to seed the create-user dialog so it never opens
   * with a stale or impossible role selection.
   */
  defaultAssignableRoleId: string
  setUsers: (updater: (current: CmsCurrentUser[]) => CmsCurrentUser[]) => void
  setRoles: (updater: (current: CmsRole[]) => CmsRole[]) => void
  setError: (value: string | null) => void
  refresh: () => Promise<void>
}

async function loadUsersPageData(access: UsersPageLoadAccess): Promise<LoadedData> {
  const [users, roles, events] = await Promise.all([
    access.canManageUsers ? listCmsUsers() : Promise.resolve([]),
    access.canReadRoleOptions ? listCmsRoles() : Promise.resolve([]),
    access.canReadAudit ? listCmsAuditEvents() : Promise.resolve([]),
  ])
  return { users, roles, events }
}

export function useUsersPageData(access: UsersPageLoadAccess): UsersPageData {
  const [users, setUsers] = useState<CmsCurrentUser[]>([])
  const [roles, setRoles] = useState<CmsRole[]>([])
  const [events, setEvents] = useState<CmsAuditEvent[]>([])
  // `loading` flips to false only after the FIRST round-trip completes.
  // Without this, the page would render the "No users yet" empty state for
  // the ~50-200 ms window between mount and first response — visually
  // identical to a fresh install and tragic UX.
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Exception #1 (react-hooks/exhaustive-deps): feeds the load effect's
  // dep array, so it needs a stable identity the static lint can see.
  const loadAccess = useCallback(
    (): UsersPageLoadAccess => ({
      canManageUsers: access.canManageUsers,
      canReadRoleOptions: access.canReadRoleOptions,
      canReadAudit: access.canReadAudit,
    }),
    [access.canManageUsers, access.canReadRoleOptions, access.canReadAudit],
  )

  // Exception #1 (react-hooks/exhaustive-deps): feeds the load effect's
  // dep array, so it needs a stable identity the static lint can see.
  const applyLoadedData = useCallback((data: LoadedData) => {
    setUsers(data.users)
    setRoles(data.roles)
    setEvents(data.events)
  }, [])

  const refresh = async () => {
    setError(null)
    try {
      applyLoadedData(await loadUsersPageData(loadAccess()))
    } catch (err) {
      setError(getErrorMessage(err, 'Could not load users'))
    }
  }

  // Not useAsyncResource: this is an optimistic collection with custom load
  // semantics, not a plain read-only resource. (1) `users`/`roles`/`events`
  // are mutated in place by the tabs via setUsers/setRoles for instant
  // save/delete feedback, then reconciled by refresh(); (2) `loading` flips
  // false only after the FIRST load and refresh() never re-raises it, so an
  // optimistic save doesn't flash the tab skeletons — useAsyncResource raises
  // loading on every load; (3) `error` is a shared channel for both load and
  // mutation failures. Forcing the single-resource hook here would regress UX.
  useEffect(() => {
    let cancelled = false
    void loadUsersPageData(loadAccess())
      .then((data) => {
        if (!cancelled) applyLoadedData(data)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(getErrorMessage(err, 'Could not load users'))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [applyLoadedData, loadAccess])

  const defaultAssignableRoleId =
    roles.find((role) => role.id !== 'owner')?.id ?? emptyUserForm.roleId

  return {
    users,
    roles,
    events,
    loading,
    error,
    defaultAssignableRoleId,
    setUsers,
    setRoles,
    setError,
    refresh,
  }
}
