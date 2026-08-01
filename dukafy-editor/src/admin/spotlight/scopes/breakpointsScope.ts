/**
 * Viewports scope — lists site viewport contexts for selection.
 *
 * Returns synchronous commands from the editor store's current state.
 * Each command switches the active canvas viewport.
 */

import type { Scope, Command } from '../types'
import { useEditorStore } from '@site/store/store'

function getBreakpointCommands(): Command[] {
  const state = useEditorStore.getState()
  const { site, activeBreakpointId } = state
  if (!site) return []
  const breakpoints = site.breakpoints

  return breakpoints.map((bp): Command => ({
    id: `breakpoints.switch.${bp.id}`,
    title: bp.label,
    subtitle: `${bp.width}px`,
    group: 'editor',
    iconName: bp.icon,
    keywords: [bp.label.toLowerCase(), `${bp.width}px`, 'breakpoint', 'viewport', 'responsive'],
    workspaces: ['site'],
    priorityBoost: activeBreakpointId === bp.id ? 1.5 : 1.0,
    run: (ctx) => {
      useEditorStore.getState().setActiveBreakpoint(bp.id)
      ctx.closeSpotlight()
    },
  }))
}

export const breakpointsScope: Scope = {
  id: 'breakpoints',
  title: 'Switch viewport',
  placeholder: 'Search viewports…',
  commands: getBreakpointCommands,
}
