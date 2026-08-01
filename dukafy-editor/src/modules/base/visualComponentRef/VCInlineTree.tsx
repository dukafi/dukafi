/**
 * VCInlineTree — render an instantiated Visual Component node map inline.
 *
 * Architecture source: Contribution #619 §8.5
 *
 * A thin, VC-named wrapper over the shared `ReadOnlyNodeTree` renderer. The VC
 * ref node's own classIds (`rootMcClassName`) and editor wrapper bag
 * (`rootNodeWrapperProps`) are forwarded onto the VC's first rendered root
 * element — same contract as the publisher's `injectClassIntoRootElement` — so
 * the rendered ref carries the single selection overlay while every node inside
 * the VC body stays non-selectable.
 *
 * `base.visual-component-ref` nodes nested inside the VC body resolve back to
 * `VisualComponentRefEditor` via the registry, giving natural recursive
 * rendering with cycle safety guaranteed by the write-boundary recursion guard.
 */

import type { NodeWrapperProps as NodeWrapperPropsType } from '@core/module-engine'
import type { VCNode } from '@core/visualComponents'
import type { StyleRuleRegistry } from '@core/page-tree'
import { ReadOnlyNodeTree, type ReadOnlyRegion } from '@modules/base/utils/ReadOnlyNodeTree'

interface VCInlineTreeProps {
  /** Flat node map from instantiateVCAtRef */
  nodes: Record<string, VCNode>
  /** ID of the root node — entry point for traversal */
  rootNodeId: string
  /** Site class registry — used to resolve each node's classIds → class names */
  classes: StyleRuleRegistry
  /** Class string from the page-level ref node — merged onto the first rendered root */
  rootMcClassName?: string
  /** Editor wrapper bag for the PAGE-LEVEL ref node — forwarded onto the VC's first rendered root */
  rootNodeWrapperProps?: NodeWrapperPropsType
  /** Read-only source descriptor (the component) for the hover/double-click hint. */
  readonly?: ReadOnlyRegion
}

export function VCInlineTree({
  nodes,
  rootNodeId,
  classes,
  rootMcClassName,
  rootNodeWrapperProps,
  readonly,
}: VCInlineTreeProps) {
  return (
    <ReadOnlyNodeTree
      nodes={nodes}
      rootNodeId={rootNodeId}
      classes={classes}
      rootMcClassName={rootMcClassName}
      rootNodeWrapperProps={rootNodeWrapperProps}
      readonly={readonly}
    />
  )
}
