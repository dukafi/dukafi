/**
 * Viewport commands — §4.5 of the Command Spotlight master plan.
 *
 * - Switch viewport → pushes 'breakpoints' scope
 */

import type { Command } from '../types'

export function getBreakpointsCommands(): Command[] {
  return [
    // ── Switch viewport ──────────────────────────────────────────────────────
    {
      id: 'breakpoints.switch',
      title: 'Switch viewport…',
      subtitle: 'Change the active canvas viewport',
      group: 'editor',
      iconName: 'arrows-horizontal',
      keywords: ['breakpoint', 'switch', 'responsive', 'viewport', 'mobile', 'desktop', 'tablet'],
      workspaces: ['site'],
      capability: 'site.read',
      run: (ctx) => {
        ctx.pushScope('breakpoints')
      },
    },
  ]
}
