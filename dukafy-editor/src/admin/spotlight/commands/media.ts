/**
 * Media workspace commands — §4.10 of the Command Spotlight master plan.
 */

import type { Command } from '../types'
import { queuePendingAction } from '../pendingAction'

export function getMediaCommands(): Command[] {
  return [
    // ── Upload media ────────────────────────────────────────────────────────
    {
      id: 'media.upload',
      title: 'Upload media…',
      subtitle: 'Upload images, videos, or other files',
      group: 'media',
      iconName: 'image-solid',
      keywords: ['media', 'upload', 'file', 'image', 'video', 'asset', 'new', 'add'],
      workspaces: ['any'],
      capability: 'media.write',
      run: (ctx) => {
        queuePendingAction('media.upload')
        ctx.navigate('/admin/media')
      },
    },

    // ── New folder ──────────────────────────────────────────────────────────
    {
      id: 'media.newFolder',
      title: 'New media folder…',
      subtitle: 'Create a folder to organize uploaded files',
      group: 'media',
      iconName: 'box-stack-solid',
      keywords: ['media', 'folder', 'directory', 'organize', 'new', 'create', 'add'],
      workspaces: ['any'],
      capability: 'media.write',
      run: (ctx) => {
        queuePendingAction('media.newFolder')
        ctx.navigate('/admin/media')
      },
    },
  ]
}
