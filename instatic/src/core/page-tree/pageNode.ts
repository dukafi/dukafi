/**
 * PageNode — BaseNode plus an optional `dynamicBindings` map for CMS template
 * pages. Pages use a flat `nodes: Record<string, PageNode>` map (same as
 * `NodeTreeSchema.nodes`) — nodes are stored in a flat ID-keyed map.
 *
 * The `dynamicBindings` overlay is applied at render time when the page is
 * used as a CMS content template. Static props remain stored as fallback
 * values.
 *
 * Constraint #269: no imports from editor / editor-store here.
 */

import { Type, type Static } from '@core/utils/typeboxHelpers'
import { BaseNodeSchema, parseBaseNodeFields } from './baseNode'
import { DynamicPropBindingSchema, parseDynamicBindings } from './dynamicBinding'
import { asPlainObject } from './parseHelpers'

// ---------------------------------------------------------------------------
// PageNodeSchema
// ---------------------------------------------------------------------------

export const PageNodeSchema = Type.Object({
  ...BaseNodeSchema.properties,
  /**
   * Template-only prop bindings.
   * Static props remain stored as fallback values; dynamicBindings overlay them
   * at render time when a page is used as a CMS content template.
   * Silently dropped if invalid — handled in parsePageNode.
   */
  dynamicBindings: Type.Optional(Type.Record(Type.String(), DynamicPropBindingSchema)),
})

export type PageNode = Static<typeof PageNodeSchema>

// ---------------------------------------------------------------------------
// Tolerant parsing
// ---------------------------------------------------------------------------

/**
 * Parse a single PageNode, throwing `Error('<nodePath>.<field>: <message>')` on
 * required-field failures so parsePage/parseSiteDocument can report the exact
 * invalid path.
 *
 * Replicates the Zod `.catch()` fallback behaviour for `withFallback()` fields
 * (props, breakpointOverrides, classIds) so nodes missing these fields are
 * still accepted with sensible defaults rather than rejected.
 *
 * PageNode is a flat node (no recursive nesting). Pages use a flat
 * `nodes: Record<string, PageNode>` map, iterated directly in parsePage.
 */
export function parsePageNode(raw: unknown, nodePath: string): PageNode {
  const r = asPlainObject(raw)
  if (!r) throw new Error(`${nodePath}: not an object`)

  // Shared BaseNode fields (id/moduleId/children/props/breakpointOverrides/
  // classIds/inlineStyles/propBindings) come from the one tolerant base parser.
  const base = parseBaseNodeFields(r, nodePath)

  // Page-only overlay: template data-binding map. Silently dropped if invalid.
  const dynamicBindings = parseDynamicBindings(r.dynamicBindings)

  return {
    ...base,
    ...(dynamicBindings !== undefined ? { dynamicBindings } : {}),
  }
}
