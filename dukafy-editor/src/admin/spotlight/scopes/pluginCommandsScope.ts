/**
 * Plugin commands scope — lists all commands registered by installed plugins.
 *
 * Pushed onto the scope stack when the user selects "Run plugin command…"
 * from the plugins scope. Delegates to `getPluginsCommands()` which reads
 * live from the plugin runtime each time `commands()` is called, so newly
 * activated plugins appear without needing to reopen the spotlight.
 */

import type { Scope } from '../types'
import { getPluginsCommands } from '../commands/plugins'

export const pluginCommandsScope: Scope = {
  id: 'pluginCommands',
  title: 'Run plugin command',
  placeholder: 'Search plugin commands…',
  commands: getPluginsCommands,
}
