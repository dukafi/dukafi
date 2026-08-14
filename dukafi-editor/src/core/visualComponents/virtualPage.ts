/**
 * Virtual-page synthesis for Visual Components.
 *
 * The canvas + publisher both speak the `Page` shape. When the editor is in
 * VC canvas mode (`activeDocument.kind === 'visualComponent'`) the surface
 * still renders a `Page`, but it's *synthesized* from the VC's tree so the
 * rest of the rendering pipeline (NodeRenderer, BreakpointFrame, the
 * runtime-preview server) can stay tree-agnostic.
 *
 * The synthesis lives here, in `@core`, rather than in the admin store
 * because the server's `/admin/api/cms/runtime/preview` endpoint also needs
 * to materialize a virtual page when the client previews a VC. Both ends
 * use the same prefix and the same flatten function so the round-trip
 * through `pageId` stays unambiguous.
 *
 * The id format is `vc-virtual:<vcId>` — `vcId` lives in `site.visualComponents`
 * so the server can look it up directly. There is no URL encoding (vc ids are
 * generated from `crypto.randomUUID()` and never collide with the prefix).
 */

import type { Page, PageNode } from '@core/page-tree-schema'
import type { VisualComponent } from './schemas'

/**
 * Prefix that distinguishes a virtual VC page from a real page. Real page
 * ids never collide with this prefix because they are generated from
 * `crypto.randomUUID()` (32 hex chars + dashes).
 */
const VC_VIRTUAL_PAGE_PREFIX = 'vc-virtual:'

/**
 * Build the synthetic page id used by the canvas / runtime preview when
 * the user is editing a VC.
 */
function virtualPageIdForVC(vcId: string): string {
  return `${VC_VIRTUAL_PAGE_PREFIX}${vcId}`
}

/**
 * Inverse of `virtualPageIdForVC`. Returns the underlying `vcId` if `pageId`
 * is a virtual VC page id, otherwise `null`.
 */
export function parseVirtualVCPageId(pageId: string): string | null {
  if (!pageId.startsWith(VC_VIRTUAL_PAGE_PREFIX)) return null
  return pageId.slice(VC_VIRTUAL_PAGE_PREFIX.length)
}

/**
 * Flatten a Visual Component's tree into a virtual `Page` so the canvas
 * and publisher can render it through the existing page pipeline.
 *
 * `VCNode` (= `BaseNode`) is structurally compatible with `PageNode`
 * (which adds only optional `dynamicBindings`), so the cast is safe.
 */
export function flattenVCToVirtualPage(vc: VisualComponent): Page {
  return {
    id: virtualPageIdForVC(vc.id),
    title: vc.name,
    slug: `components/${vc.name}`,
    rootNodeId: vc.tree.rootNodeId,
    nodes: vc.tree.nodes as Record<string, PageNode>,
  }
}
