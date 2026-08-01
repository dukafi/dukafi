/**
 * Preview commands — §4.2 (canvas mode / preview) of the master plan.
 *
 * Toggle preview overlay, switch canvas mode, control zoom.
 * All gated to workspace: ['site'] and capability `site.read` — these are
 * pure viewing affordances against the canvas.
 */

import type { Command } from '../types'

const PREVIEW_CAPABILITY = 'site.read'

export function getPreviewCommands(): Command[] {
  return [
    // ── Toggle preview ───────────────────────────────────────────────────────
    {
      id: 'preview.toggle',
      title: 'Toggle preview',
      subtitle: 'Switch between edit and preview mode',
      group: 'preview',
      iconName: 'eye-solid',
      keywords: ['preview', 'toggle', 'view', 'live', 'read-only'],
      workspaces: ['site'],
      capability: PREVIEW_CAPABILITY,
      run: async (ctx) => {
        ctx.closeSpotlight()
        try {
          const { useEditorStore } = await import('@site/store/store')
          const store = useEditorStore.getState()
          if (store.previewOpen) {
            store.closePreview()
          } else {
            store.openPreview()
          }
        } catch (err) {
          console.error('[spotlight] togglePreview failed:', err)
        }
      },
    },

    // ── Select mode ──────────────────────────────────────────────────────────
    {
      id: 'preview.modeSelect',
      title: 'Switch to Select mode',
      subtitle: 'Use the pointer to select and edit layers',
      group: 'preview',
      iconName: 'pointer-solid',
      keywords: ['mode', 'select', 'pointer', 'cursor', 'canvas'],
      workspaces: ['site'],
      capability: PREVIEW_CAPABILITY,
      run: async (ctx) => {
        ctx.closeSpotlight()
        try {
          const { useEditorStore } = await import('@site/store/store')
          useEditorStore.getState().setCanvasMode('select')
        } catch (err) {
          console.error('[spotlight] setCanvasMode select failed:', err)
        }
      },
    },

    // ── Pan mode ─────────────────────────────────────────────────────────────
    {
      id: 'preview.modePan',
      title: 'Switch to Pan mode',
      subtitle: 'Use the hand tool to pan the canvas',
      group: 'preview',
      iconName: 'hand-grab-solid',
      keywords: ['mode', 'pan', 'hand', 'drag', 'canvas', 'scroll'],
      workspaces: ['site'],
      capability: PREVIEW_CAPABILITY,
      run: async (ctx) => {
        ctx.closeSpotlight()
        try {
          const { useEditorStore } = await import('@site/store/store')
          useEditorStore.getState().setCanvasMode('pan')
        } catch (err) {
          console.error('[spotlight] setCanvasMode pan failed:', err)
        }
      },
    },

    // ── Zoom in ──────────────────────────────────────────────────────────────
    {
      id: 'preview.zoomIn',
      title: 'Zoom in',
      subtitle: 'Increase canvas zoom level',
      group: 'preview',
      iconName: 'plus',
      keywords: ['zoom', 'in', 'enlarge', 'magnify', 'canvas'],
      workspaces: ['site'],
      capability: PREVIEW_CAPABILITY,
      keepOpenAfterRun: false,
      run: async (ctx) => {
        ctx.closeSpotlight()
        try {
          const { useEditorStore } = await import('@site/store/store')
          useEditorStore.getState().zoomIn()
        } catch (err) {
          console.error('[spotlight] zoomIn failed:', err)
        }
      },
    },

    // ── Zoom out ─────────────────────────────────────────────────────────────
    {
      id: 'preview.zoomOut',
      title: 'Zoom out',
      subtitle: 'Decrease canvas zoom level',
      group: 'preview',
      iconName: 'proportions-solid',
      keywords: ['zoom', 'out', 'shrink', 'canvas'],
      workspaces: ['site'],
      capability: PREVIEW_CAPABILITY,
      keepOpenAfterRun: false,
      run: async (ctx) => {
        ctx.closeSpotlight()
        try {
          const { useEditorStore } = await import('@site/store/store')
          useEditorStore.getState().zoomOut()
        } catch (err) {
          console.error('[spotlight] zoomOut failed:', err)
        }
      },
    },

    // ── Reset zoom ───────────────────────────────────────────────────────────
    {
      id: 'preview.zoomReset',
      title: 'Reset zoom to 100%',
      subtitle: 'Reset the canvas to 1:1 zoom',
      group: 'preview',
      iconName: 'laptop-solid',
      keywords: ['zoom', 'reset', '100%', 'actual size', 'canvas'],
      workspaces: ['site'],
      capability: PREVIEW_CAPABILITY,
      keepOpenAfterRun: false,
      run: async (ctx) => {
        ctx.closeSpotlight()
        try {
          const { useEditorStore } = await import('@site/store/store')
          useEditorStore.getState().setZoom(1)
        } catch (err) {
          console.error('[spotlight] setZoom reset failed:', err)
        }
      },
    },
  ]
}
