/**
 * Visual Components commands — §4.7 of the Command Spotlight master plan.
 *
 * - Open a Visual Component (push vcScope)
 * - Create a new Visual Component (arg: name)
 * - Exit Visual Component edit mode (go back to page canvas)
 */

import type { Command } from '../types'
import { queuePendingAction } from '../pendingAction'

export function getVisualComponentsCommands(): Command[] {
  return [
    // ── Open Visual Component ────────────────────────────────────────────────
    {
      id: 'visualComponents.open',
      title: 'Open Visual Component…',
      subtitle: 'Open a Visual Component for editing',
      group: 'visualComponents',
      iconName: 'box-stack-solid',
      keywords: ['visual component', 'vc', 'component', 'open', 'edit'],
      workspaces: ['site'],
      capability: 'site.structure.edit',
      run: (ctx) => {
        ctx.pushScope('visualComponents')
      },
    },

    // ── New Visual Component ──────────────────────────────────────────────
    // Available everywhere — when invoked from a non-site workspace we queue
    // a pending action and navigate; SitePage's pending-action consumer
    // creates the VC once the editor store has hydrated.
    {
      id: 'visualComponents.create',
      title: 'New Visual Component…',
      subtitle: 'Add a new reusable Visual Component to the site',
      group: 'visualComponents',
      iconName: 'box-solid',
      keywords: ['visual component', 'vc', 'component', 'create', 'new', 'add'],
      workspaces: ['any'],
      capability: 'site.structure.edit',
      args: [
        {
          id: 'name',
          label: 'Component name',
          type: 'text',
          placeholder: 'e.g. HeroSection',
          required: true,
        },
      ],
      run: async (ctx) => {
        const name = ctx.args['name']?.trim()
        if (!name) return

        if (ctx.workspace === 'site') {
          try {
            const { useEditorStore } = await import('@site/store/store')
            const store = useEditorStore.getState()
            if (store.site) {
              const vcId = store.createVisualComponent(name)
              store.setActiveDocument({ kind: 'visualComponent', vcId })
              return
            }
          } catch (err) {
            console.error('[spotlight] createVisualComponent failed:', err)
          }
        }

        queuePendingAction('site.newVisualComponent', { name })
        ctx.navigate('/admin/site')
      },
    },

    // ── Exit Visual Component mode ───────────────────────────────────────────
    {
      id: 'visualComponents.exitMode',
      title: 'Exit Visual Component mode',
      subtitle: 'Return to the page canvas',
      group: 'visualComponents',
      iconName: 'arrow-up',
      keywords: ['visual component', 'vc', 'exit', 'close', 'back', 'page'],
      workspaces: ['site'],
      capability: 'site.read',
      when: (ctx) => ctx.editor?.activeDocument?.kind === 'visualComponent',
      priorityBoost: 1.3,
      run: async (ctx) => {
        ctx.closeSpotlight()
        try {
          const { useEditorStore } = await import('@site/store/store')
          useEditorStore.getState().exitVisualComponentMode()
        } catch (err) {
          console.error('[spotlight] exitVisualComponentMode failed:', err)
        }
      },
    },
  ]
}
