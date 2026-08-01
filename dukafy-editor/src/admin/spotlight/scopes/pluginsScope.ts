/**
 * Plugins scope — list installed plugins and their admin pages.
 *
 * Phase 3: wires pluginPagesProvider plus static commands for installing
 * plugins and navigating to the plugins workspace.
 * Phase 4: "Run plugin command…" now pushes the pluginCommands scope instead
 * of navigating away — all registered PluginCommands are listed there.
 */

import type { Scope, Command } from '../types'
import { pluginPagesProvider } from '../providers/pluginPagesProvider'

function getPluginsScopeCommands(): Command[] {
  return [
    {
      id: 'plugins.install',
      title: 'Install plugin…',
      subtitle: 'Upload a plugin package (.zip)',
      group: 'plugins',
      iconName: 'download-solid',
      keywords: ['install', 'add', 'plugin', 'package', 'zip'],
      workspaces: ['plugins'],
      run: (ctx) => {
        ctx.closeSpotlight()
        ctx.navigate('/admin/plugins?action=install')
      },
    },
    {
      id: 'plugins.runCommand',
      title: 'Run plugin command…',
      subtitle: 'Browse and execute registered plugin commands',
      group: 'plugins',
      iconName: 'play-solid',
      keywords: ['run', 'execute', 'plugin', 'command', 'action'],
      workspaces: ['any'],
      run: (ctx) => {
        ctx.pushScope('pluginCommands')
      },
    },
  ]
}

export const pluginsScope: Scope = {
  id: 'plugins',
  title: 'Open plugin',
  placeholder: 'Search plugins…',
  commands: getPluginsScopeCommands,
  providers: [pluginPagesProvider],
}
