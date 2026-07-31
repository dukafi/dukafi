/**
 * Account commands — §4.13 of the Command Spotlight master plan.
 *
 * Sign out (destructive), navigate to account settings sections.
 */

import { logoutCms } from '@core/persistence'
import type { Command } from '../types'

export function getAccountCommands(): Command[] {
  return [
    {
      id: 'account.profile',
      title: 'Edit profile',
      subtitle: 'Update your name, email, and avatar',
      group: 'account',
      iconName: 'cursor-minimal-solid',
      keywords: ['account', 'profile', 'edit', 'name', 'email', 'avatar'],
      workspaces: ['any'],
      run: (ctx) => {
        ctx.closeSpotlight()
        ctx.navigate('/admin/account')
      },
    },

    {
      id: 'account.signOut',
      title: 'Sign out',
      subtitle: 'End your current session',
      group: 'account',
      iconName: 'power-off',
      keywords: ['sign out', 'logout', 'log out', 'session', 'exit'],
      workspaces: ['any'],
      destructive: true,
      run: async (ctx) => {
        ctx.closeSpotlight()
        try {
          await logoutCms()
          window.location.assign('/admin')
        } catch (err) {
          console.error('[spotlight] sign out failed:', err)
        }
      },
    },
  ]
}
