import { useState, type ReactNode } from 'react'
import type { CmsCurrentUser } from '@core/persistence'
import { AdminSessionContext } from './sessionContext'

/**
 * Wraps the admin shell with the current user + a setter for self-mutations.
 *
 * The provider keeps the user in local state so children can update it
 * after the server confirms a change (avatar upload, display-name edit).
 * Without a state-owning provider, components like the Account page would
 * need to lift state into `AdminEntry` and pass setters down — every
 * mutation surface ends up plumbing through the root, which is the worst
 * shape for a frequently-edited per-user surface.
 *
 * `initialUser` is the seed handed in by `AdminEntry` after the `/me`
 * fetch resolves. After that point the provider owns the canonical user
 * object and the parent doesn't touch it again.
 */
export function AdminSessionProvider({
  user: initialUser,
  children,
}: {
  user: CmsCurrentUser
  children: ReactNode
}) {
  const [user, setUser] = useState<CmsCurrentUser>(initialUser)
  const value = { user, setUser }
  return (
    <AdminSessionContext.Provider value={value}>
      {children}
    </AdminSessionContext.Provider>
  )
}
