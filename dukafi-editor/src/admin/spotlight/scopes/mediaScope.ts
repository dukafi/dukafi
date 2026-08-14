/**
 * Media scope — search media files via mediaProvider.
 *
 * Phase 3: wires the live server-backed media provider plus static commands
 * for uploading files and creating folders.
 */

import type { Scope, Command } from '../types'
import { mediaProvider } from '../providers/mediaProvider'

function getMediaScopeCommands(): Command[] {
  return [
    {
      id: 'media.uploadFile',
      title: 'Upload file…',
      subtitle: 'Upload a new image, video, or document',
      group: 'media',
      iconName: 'upload-solid',
      keywords: ['upload', 'file', 'image', 'video', 'media', 'add'],
      workspaces: ['media'],
      run: (ctx) => {
        ctx.closeSpotlight()
        ctx.navigate('/admin/media?action=upload')
      },
    },
    {
      id: 'media.newFolder',
      title: 'New folder…',
      subtitle: 'Create a new folder in the media library',
      group: 'media',
      iconName: 'folder-solid',
      keywords: ['new', 'create', 'folder', 'directory', 'organize'],
      workspaces: ['media'],
      args: [
        {
          id: 'name',
          label: 'Folder name',
          type: 'text',
          placeholder: 'My folder',
          required: true,
        },
      ],
      run: (ctx) => {
        ctx.closeSpotlight()
        const name = ctx.args['name']
        if (name) {
          ctx.navigate(`/admin/media?action=newFolder&name=${encodeURIComponent(name)}`)
        } else {
          ctx.navigate('/admin/media?action=newFolder')
        }
      },
    },
  ]
}

export const mediaScope: Scope = {
  id: 'media',
  title: 'Open file',
  placeholder: 'Search media files…',
  commands: getMediaScopeCommands,
  providers: [mediaProvider],
}
