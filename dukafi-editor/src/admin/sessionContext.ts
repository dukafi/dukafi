import { createContext, use } from 'react'
import type { CmsCurrentUser } from '@core/persistence'

interface AdminSessionValue {
  user: CmsCurrentUser | null
  /**
   * Replace the cached current user. Called after self-mutations
   * (avatar upload/remove, future display-name edit) so the toolbar
   * trigger and every other consumer of `useAuthenticatedAdminUser`
   * re-renders with the fresh row from the server.
   */
  setUser: (user: CmsCurrentUser) => void
}

export const AdminSessionContext = createContext<AdminSessionValue | null>(null)

/**
 * Loose accessor — returns `null` when called outside `AdminSessionProvider`.
 *
 * Used by components that legitimately render with or without a session
 * (the toolbar's section navigation, capability-aware admin shells that
 * need an "unrestricted" preview mode in tests). For components that only
 * render under the authenticated branch use `useAuthenticatedAdminUser`.
 */
export function useCurrentAdminUser(): CmsCurrentUser | null {
  const value = use(AdminSessionContext)
  return value?.user ?? null
}

/**
 * Strict accessor — guarantees a non-null user. Throws when called outside
 * `AdminSessionProvider`, so the type system can stop carrying around a
 * "but what if it's null" branch in components that only ever render once
 * `AdminEntry`'s session check has resolved (Account page, account menu,
 * everything in the authenticated admin shell).
 *
 * Mirrors the pattern used by router hooks (`useNavigate` etc.) — the
 * provider is part of the contract; reaching for the hook outside it is a
 * programming error, not a soft-fail.
 */
export function useAuthenticatedAdminUser(): CmsCurrentUser {
  const value = use(AdminSessionContext)
  if (!value?.user) {
    throw new Error(
      'useAuthenticatedAdminUser must be called inside <AdminSessionProvider>',
    )
  }
  return value.user
}

/**
 * Setter half of the session context. Returns a noop when called outside
 * the provider — keeps the API symmetric and lets test fixtures opt out
 * of plumbing a real setter when they only render a single tab.
 */
export function useAdminSessionSetter(): (user: CmsCurrentUser) => void {
  const value = use(AdminSessionContext)
  return value?.setUser ?? (() => {})
}
