/**
 * `definePluginCanvasOverlay` — type-safe canvas overlay entrypoint.
 *
 *   import { definePluginCanvasOverlay } from '@instatic/plugin-sdk'
 *   import { useCanvasNodeRect, useEditorStore } from '@instatic/host-hooks'
 *
 *   function PluginPin() {
 *     const selectedId = useEditorStore((s) => s.selectedNodeId)
 *     const rect = useCanvasNodeRect(selectedId)
 *     if (!rect) return null
 *     return (
 *       <div style={{
 *         position: 'absolute',
 *         top: rect.top - 24,
 *         left: rect.left,
 *         pointerEvents: 'auto',
 *       }}>
 *         <span>📍 selected</span>
 *       </div>
 *     )
 *   }
 *
 *   export default definePluginCanvasOverlay({
 *     id: 'acme.workflow.pin',
 *     component: PluginPin,
 *   })
 *
 *   // wire it into the plugin's editor entrypoint
 *   export default {
 *     activate(api) {
 *       api.editor.canvas.registerOverlay(myOverlay)
 *     },
 *   }
 *
 * The overlay layer:
 *   • Is `position: absolute; inset: 0; pointer-events: none;` over the canvas
 *   • Children opt into pointer events via `pointer-events: auto`
 *   • Lives in screen coordinates — use `useCanvasNodeRect(id)` to position
 *     against rendered nodes regardless of canvas zoom / scroll
 *   • Each plugin's overlay is wrapped in an ErrorBoundary so a crash
 *     stays contained
 *
 * The plugin's bundle externalizes `react` / `@instatic/host-ui` /
 * `@instatic/host-hooks` / `@instatic/plugin-sdk` like every other
 * editor surface — same import-map resolution, same single-React guarantee.
 */

import type { ComponentType } from 'react'
import type { PluginCanvasOverlay } from '../types'

export interface PluginCanvasOverlayProps {
  overlay: { id: string; pluginId: string }
}

export type PluginCanvasOverlayComponent = ComponentType<PluginCanvasOverlayProps>

export interface DefinePluginCanvasOverlayConfig {
  id: string
  component: PluginCanvasOverlayComponent
}

const OVERLAY_ID_PATTERN = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/

/**
 * Identity wrapper — validates the id at definition time so authoring errors
 * surface during `instatic-plugin build`, not at editor activation.
 */
export function definePluginCanvasOverlay(
  config: DefinePluginCanvasOverlayConfig,
): PluginCanvasOverlay {
  if (!OVERLAY_ID_PATTERN.test(config.id)) {
    throw new Error(
      `[plugin-sdk] Canvas overlay id "${config.id}" must be a lowercase dotted/dashed identifier (e.g. "acme.workflow.pin").`,
    )
  }
  if (!config.id.includes('.')) {
    throw new Error(
      `[plugin-sdk] Canvas overlay id "${config.id}" must be namespaced under the plugin id (e.g. "acme.workflow.pin").`,
    )
  }
  return {
    id: config.id,
    component: config.component,
  }
}
