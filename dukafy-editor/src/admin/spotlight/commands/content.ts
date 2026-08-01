/**
 * Content workspace commands — §4.8 of the Command Spotlight master plan.
 *
 * Most content-document flows live in dialogs owned by Content page tabs.
 * Spotlight-from-anywhere commands queue a pending action and navigate; the
 * Content page consumes the action on mount and pops the right dialog.
 */

import type { Command } from '../types'
import { queuePendingAction } from '../pendingAction'

export function getContentCommands(): Command[] {
  return [
    // ── New content document ────────────────────────────────────────────────
    {
      id: 'content.newDocument',
      title: 'New content document…',
      subtitle: 'Create a new blog post, article, or content entry',
      group: 'content',
      iconName: 'file-plus-solid',
      keywords: ['content', 'post', 'article', 'document', 'entry', 'blog', 'new', 'create', 'add'],
      workspaces: ['any'],
      capability: 'content.create',
      run: (ctx) => {
        if (ctx.workspace !== 'content') {
          queuePendingAction('content.newDocument')
          ctx.navigate('/admin/content')
        } else {
          queuePendingAction('content.newDocument')
          // Trigger a hash change so the Content page's mount-effect re-runs.
          ctx.navigate('/admin/content')
        }
      },
    },

    // ── New collection ──────────────────────────────────────────────────────
    {
      id: 'content.newCollection',
      title: 'New content collection…',
      subtitle: 'Create a new collection (group of documents)',
      group: 'content',
      iconName: 'box-stack-solid',
      keywords: ['content', 'collection', 'group', 'new', 'create', 'add'],
      workspaces: ['any'],
      capability: 'content.manage',
      run: (ctx) => {
        queuePendingAction('content.newCollection')
        ctx.navigate('/admin/content')
      },
    },
  ]
}
