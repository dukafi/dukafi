/**
 * Content scope — search content documents (data rows) via contentProvider.
 *
 * Phase 3: wires the live server-backed content provider plus static commands
 * for creating/managing content.
 */

import type { Scope, Command } from '../types'
import { contentProvider } from '../providers/contentProvider'

function getContentScopeCommands(): Command[] {
  return [
    {
      id: 'content.newDocument',
      title: 'New content document…',
      subtitle: 'Create a new untitled document in the current collection',
      group: 'content',
      iconName: 'file-plus-solid',
      keywords: ['new', 'create', 'document', 'content', 'entry'],
      workspaces: ['content'],
      run: (ctx) => {
        ctx.closeSpotlight()
        // The content page listens for this URL param to auto-create a row.
        ctx.navigate('/admin/content?action=new')
      },
    },
    {
      id: 'content.createCollection',
      title: 'Create collection…',
      subtitle: 'Add a new content collection',
      group: 'content',
      iconName: 'folder-solid',
      keywords: ['new', 'create', 'collection', 'table', 'post type'],
      workspaces: ['content'],
      run: (ctx) => {
        ctx.closeSpotlight()
        ctx.navigate('/admin/content?action=createCollection')
      },
    },
    {
      id: 'content.openMedia',
      title: 'Open Media picker…',
      subtitle: 'Browse and insert media assets',
      group: 'content',
      iconName: 'image-solid',
      keywords: ['media', 'image', 'file', 'asset', 'picker'],
      workspaces: ['content'],
      run: (ctx) => {
        ctx.closeSpotlight()
        ctx.navigate('/admin/content?action=media')
      },
    },
  ]
}

export const contentScope: Scope = {
  id: 'content',
  title: 'Open content document',
  placeholder: 'Search content…',
  commands: getContentScopeCommands,
  providers: [contentProvider],
}
