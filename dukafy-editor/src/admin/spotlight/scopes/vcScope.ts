/**
 * Visual Components scope — lists site Visual Components for selection.
 *
 * Returns synchronous commands from the editor store's current state.
 * Each command opens the selected VC for editing.
 */

import type { Scope, Command } from '../types'

function getVCCommands(): Command[] {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useEditorStore } = require('@site/store/store') as typeof import('@site/store/store')
    const state = useEditorStore.getState()
    const { site, activeDocument } = state
    if (!site) return []
    const vcs = site.visualComponents || []
    const activeVcId = activeDocument?.kind === 'visualComponent'
      ? activeDocument.vcId
      : null

    return vcs.map((vc): Command => ({
      id: `visualComponents.open.${vc.id}`,
      title: vc.name,
      subtitle: 'Visual Component',
      group: 'visualComponents',
      iconName: 'box-stack-solid',
      keywords: [vc.name.toLowerCase(), 'visual component', 'vc', 'component'],
      workspaces: ['site'],
      priorityBoost: activeVcId === vc.id ? 1.5 : 1.0,
      run: async (ctx) => {
        ctx.closeSpotlight()
        const { useEditorStore: store } = await import('@site/store/store')
        store.getState().setActiveDocument({ kind: 'visualComponent', vcId: vc.id })
      },
    }))
  } catch {
    return []
  }
}

export const vcScope: Scope = {
  id: 'visualComponents',
  title: 'Open Visual Component',
  placeholder: 'Search Visual Components…',
  commands: getVCCommands,
}
