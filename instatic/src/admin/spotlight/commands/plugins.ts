/**
 * Plugin commands — §4.11 + §6.1 of the Command Spotlight master plan.
 *
 * All registered `PluginCommand`s from the plugin runtime are synthesized
 * into spotlight `Command` objects and surfaced under the 'plugins' group.
 * No extra plugin code is required — a basic `PluginCommand` (id/label/run)
 * is enough to appear in the palette.
 *
 * Extended fields (subtitle, iconName, keywords, destructive, args,
 * workspaces) flow through to the spotlight Command shape when present.
 */

import type { Command, CommandArg } from '../types'
import type { AdminWorkspace } from '@admin/workspace'
import { pluginRuntime } from '@core/plugins/runtime'
import { queuePendingAction } from '../pendingAction'

/**
 * Built-in plugin-related commands (currently just Install plugin). Kept
 * separate from `getPluginsCommands` so the plugin-runtime synthesis tests
 * stay focused on runtime-registered commands only.
 */
export function getBuiltInPluginCommands(): Command[] {
  return [
    {
      id: 'plugins.install',
      title: 'Install plugin…',
      subtitle: 'Upload and install a plugin package',
      group: 'plugins',
      iconName: 'package-solid',
      keywords: ['plugin', 'install', 'upload', 'extension', 'addon', 'new', 'add'],
      workspaces: ['any'],
      capability: 'plugins.install',
      run: (ctx) => {
        queuePendingAction('plugins.install')
        ctx.navigate('/admin/plugins')
      },
    },
  ]
}

/**
 * Returns synthesized spotlight Commands for every PluginCommand registered
 * in the plugin runtime at the moment this is called.
 *
 * Called lazily inside `getAllCommands()` on each palette open — O(n) over
 * however many plugin commands are registered, which is typically < 50.
 */
export function getPluginsCommands(): Command[] {
  return pluginRuntime.getPluginCommands().map(
    ({ pluginId, id: cmdId, label, subtitle, iconName, keywords, destructive, workspaces, args }): Command => {
      // Map PluginPaletteArg → CommandArg (subset of types — all compatible)
      const mappedArgs: CommandArg[] | undefined = args?.map((a): CommandArg => ({
        id: a.id,
        label: a.label,
        type: a.type, // 'text' | 'select' ⊆ 'text' | 'select' | 'pick'
        placeholder: a.placeholder,
        options: a.options,
      }))

      return {
        id: `plugin:${pluginId}.${cmdId}`,
        title: label,
        subtitle: subtitle ?? pluginId,
        group: 'plugins',
        iconName: iconName ?? 'plug',
        keywords,
        destructive,
        workspaces: workspaces as ReadonlyArray<AdminWorkspace | 'any'> | undefined,
        args: mappedArgs,
        run: async (ctx) => {
          ctx.closeSpotlight()
          try {
            await pluginRuntime.runCommand(cmdId)
          } catch (err) {
            console.error(`[spotlight:plugin:${pluginId}] command "${cmdId}" failed:`, err)
          }
        },
      }
    },
  )
}
