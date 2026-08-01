/**
 * Tree builder — composes Visual Component trees as nested JS calls instead
 * of hand-rolled flat-map JSON.
 *
 *   import { h, vc } from '@instatic/plugin-sdk'
 *
 *   export const hero = vc('hero', 'Hero (Centered)', () =>
 *     h.container({ tag: 'section', classIds: [ns.classRef('hero')] }, [
 *       h.text({ tag: 'h1', text: 'Build pages your team is proud of.' }),
 *       h.text({ tag: 'p',  text: 'Subhead' }),
 *       h.container({ tag: 'div' }, [
 *         h.button({ label: 'Get started', href: '#start' }),
 *       ]),
 *     ]),
 *   )
 *
 * Internally each node gets a stable, content-derived id so re-running the
 * builder produces the same flat-map every time (re-installing a pack
 * doesn't churn ids and break editor selections). IDs are short prefixed
 * tokens — long enough not to collide within one VC tree.
 *
 * Output shape conforms to the host `BaseNode` schema.
 */

import type { VisualComponent, VCNode } from '@core/visualComponents'
import { reindexNodeParents } from '@core/page-tree'

let counter = 0
function nextId(prefix: string): string {
  counter += 1
  return `${prefix}-${counter.toString(36)}`
}

interface NodeBuilder {
  readonly moduleId: string
  readonly props: Record<string, unknown>
  readonly classIds: string[]
  readonly children: NodeBuilder[]
  readonly idHint: string
}

function builder(
  moduleId: string,
  idHint: string,
  props: Record<string, unknown>,
  options: { classIds?: string[]; children?: NodeBuilder[] } = {},
): NodeBuilder {
  return {
    moduleId,
    idHint,
    props,
    classIds: options.classIds ?? [],
    children: options.children ?? [],
  }
}

/**
 * `h.*` — one helper per built-in module. Each returns a `NodeBuilder` that
 * the `vc()` function flattens into a `NodeTree<VCNode>`.
 *
 * `h.custom` is the escape hatch for plugin-provided modules; pass the
 * module id and props directly.
 */
export const h = {
  container(
    options: { tag?: string; classIds?: string[] } = {},
    children: NodeBuilder[] = [],
  ): NodeBuilder {
    return builder(
      'base.container',
      'cnt',
      { tag: options.tag ?? 'div' },
      { classIds: options.classIds, children },
    )
  },

  text(options: {
    tag?: string
    text: string
    classIds?: string[]
  }): NodeBuilder {
    return builder(
      'base.text',
      'txt',
      { tag: options.tag ?? 'p', text: options.text },
      { classIds: options.classIds },
    )
  },

  button(options: {
    label: string
    href?: string
    classIds?: string[]
  }): NodeBuilder {
    return builder(
      'base.button',
      'btn',
      { label: options.label, href: options.href ?? '' },
      { classIds: options.classIds },
    )
  },

  image(options: {
    src: string
    classIds?: string[]
  }): NodeBuilder {
    return builder(
      'base.image',
      'img',
      { src: options.src },
      { classIds: options.classIds },
    )
  },

  link(options: {
    href: string
    text: string
    classIds?: string[]
  }): NodeBuilder {
    return builder(
      'base.link',
      'lnk',
      { href: options.href, text: options.text },
      { classIds: options.classIds },
    )
  },

  vcRef(options: {
    componentId: string
    classIds?: string[]
  }): NodeBuilder {
    return builder(
      'base.visual-component-ref',
      'vcr',
      { componentId: options.componentId },
      { classIds: options.classIds },
    )
  },

  /**
   * Plugin-provided custom module. Caller supplies the registered moduleId
   * and props bag — typing is up to the caller.
   */
  custom(
    moduleId: string,
    props: Record<string, unknown>,
    options: { classIds?: string[]; children?: NodeBuilder[] } = {},
  ): NodeBuilder {
    return builder(moduleId, 'mod', props, options)
  },
}

/**
 * Flatten a `NodeBuilder` tree into a `{ rootNodeId, nodes }` flat map.
 * Generates short, deterministic ids per build — running this with the same
 * inputs on the same plugin install reproduces the same ids.
 */
function flattenTree(root: NodeBuilder): {
  rootNodeId: string
  nodes: Record<string, VCNode>
} {
  // Reset counter at the start of each tree build so the same VC produces
  // the same ids on every install (idempotent).
  counter = 0
  const nodes: Record<string, VCNode> = {}

  function visit(b: NodeBuilder): string {
    const id = nextId(b.idHint)
    const childIds = b.children.map(visit)
    const node: VCNode = {
      id,
      moduleId: b.moduleId,
      props: { ...b.props },
      breakpointOverrides: {},
      children: childIds,
      classIds: [...b.classIds],
    }
    nodes[id] = node
    return id
  }

  const rootNodeId = visit(root)
  reindexNodeParents(nodes)
  return { rootNodeId, nodes }
}

/**
 * Build a `VisualComponent` document from an id, name, and a tree
 * factory. The factory returns a single `NodeBuilder` (the root); we
 * flatten it into the canonical NodeTree shape.
 */
export function defineComponent(
  id: string,
  name: string,
  factory: () => NodeBuilder,
): VisualComponent {
  const tree = flattenTree(factory())
  // Collect every classId referenced in the tree so the VisualComponent's
  // `classIds` field surfaces them for display in the editor.
  const usedClassIds = new Set<string>()
  for (const node of Object.values(tree.nodes)) {
    for (const cid of node.classIds) usedClassIds.add(cid)
  }
  return {
    id,
    name,
    tree,
    params: [],
    classIds: [...usedClassIds],
    createdAt: 0,
  }
}

/**
 * Convenience for `defineComponent(ns.vc(name), label, factory)` — the most
 * common spelling in plugin code.
 */
export function vc(
  fullId: string,
  name: string,
  factory: () => NodeBuilder,
): VisualComponent {
  return defineComponent(fullId, name, factory)
}
