import type { AnyModuleDefinition } from '@core/module-engine'
import type { SavedLayout } from '@core/layouts'
import {
  DEFAULT_MODULE_INSERTER_PREFERENCE,
  type ModuleInserterItemRef,
} from '@core/persistence/userPreferences'
import { wouldCreateCycle, type VisualComponent } from '@core/visualComponents'
import { firstOutletId } from '@core/templates'
import {
  buildProductScaffoldSnapshot,
  buildRelationshipLoopSnapshot,
  buildCartScaffoldSnapshot,
} from '@site/store/commerceScaffold'
import {
  moduleWireForId,
  wireFromTree,
  type WireNode,
} from './moduleWireframes'

export type ModuleInserterAccent = 'mint' | 'lilac' | 'sky' | 'peach' | 'rose'
export type ModuleInserterSectionId =
  | 'modules'
  | 'layouts'
  | 'components'
  | 'recent'
type ModuleInserterItemKind = 'module' | 'savedLayout' | 'component' | 'commerceScaffold'
type ModuleInserterRecentRef = ModuleInserterItemRef

export interface RegistryModuleForInserter {
  id: string
  name: string
  category: string
  description?: string
}

interface BaseInserterItem {
  key: string
  id: string
  kind: ModuleInserterItemKind
  name: string
  description: string
  accent: ModuleInserterAccent
  wire: WireNode
  searchText: string
  /**
   * When set, the item renders greyed-out and cannot be inserted (click, Enter,
   * drag) — the string explains why, e.g. "Templates only". Disabled items stay
   * visible so authors learn the module exists and what unlocks it.
   */
  disabledReason?: string
}

interface ModuleInserterModuleItem<
  TModule extends RegistryModuleForInserter = AnyModuleDefinition,
> extends BaseInserterItem {
  kind: 'module'
  module: TModule
  category: string
}

interface ModuleInserterSavedLayoutItem extends BaseInserterItem {
  kind: 'savedLayout'
  layout: SavedLayout
  blocks: number
  /**
   * Owning plugin when the layout was installed by a pack (pack layout ids
   * are namespaced `<pluginId>/<rest>`; user-saved layouts use generated ids
   * that never contain a slash). Drives the per-plugin groups in the
   * inserter's Layouts section.
   */
  pluginId: string | null
}

interface ModuleInserterComponentItem extends BaseInserterItem {
  kind: 'component'
  component: VisualComponent
  uses: number
}

export type CommerceScaffoldId = 'product' | 'products-loop' | 'variants-loop' | 'cart'

interface ModuleInserterCommerceScaffoldItem extends BaseInserterItem {
  kind: 'commerceScaffold'
  scaffoldId: CommerceScaffoldId
}

export type ModuleInserterItem =
  | ModuleInserterModuleItem
  | ModuleInserterSavedLayoutItem
  | ModuleInserterComponentItem
  | ModuleInserterCommerceScaffoldItem

const HIDDEN_MODULE_IDS = new Set([
  'base.body',
  'base.visual-component-ref',
  'base.slot-instance',
  // Superseded by composable base.image/base.text scaffolds bound via
  // dynamicBindings, and by store.relationship-loop — kept registered
  // (Ruby + editor) so already-published documents keep rendering, but
  // never offered for new inserts.
  'store.product-card',
  // Superseded by the `cart.addItem` action, which attaches add-to-cart to
  // ANY node. This module emitted its own fixed <form>/<button>/<output>,
  // which was the last hardcoded commerce control.
  'store.buy-button',
  // Replaceable by a `base.select` containing a wrapper-less loop over
  // `currentEntry.variants` emitting bound `base.option`s — the merchant's own
  // markup, styled however they like.
  'store.variant-picker',
  'store.image-gallery',
  'store.collection-loop',
  // Instatic-era generic loop: its `data.rows` source targets a generic
  // data_tables/data_rows system Dukafy never implemented, and Ruby's
  // publisher has no registered renderer for this id at all — inserting
  // one doesn't just render empty, it raises an uncaught KeyError and
  // crashes the bake. store.relationship-loop is the working replacement.
  'base.loop',
])

export const DEFAULT_MODULE_INSERTER_FAVORITES =
  DEFAULT_MODULE_INSERTER_PREFERENCE.favorites

export function moduleAccentForCategory(category: string): ModuleInserterAccent {
  if (category === 'Forms') return 'mint'
  if (category === 'Media') return 'sky'
  if (category === 'Typography') return 'peach'
  if (category === 'Interactive' || category === 'CMS') return 'rose'
  return 'lilac'
}

/**
 * Where the picker is inserting into — drives per-module availability
 * (hidden / disabled-with-reason / insertable).
 */
export interface ModuleInsertionContext {
  /** The active document is a Visual Component definition tree. */
  isVCMode: boolean
  /** The open VC's id in VC mode; null in page mode. Feeds cycle checks. */
  activeVcId: string | null
  /** The active document is a template page (`template.enabled`). */
  isTemplate: boolean
  /** The active document tree already contains a `base.outlet`. */
  hasOutlet: boolean
}

type ModuleAvailability =
  | { kind: 'insertable' }
  | { kind: 'hidden' }
  | { kind: 'disabled'; reason: string }

/**
 * Editor insertion rules for a registry module in the given context.
 *
 * - Auto-materialized internals (`base.body`, VC refs, slot instances) are
 *   never user-insertable → hidden.
 * - `base.slot-outlet` only means something inside a VC definition → hidden
 *   in page mode.
 * - `base.outlet` only means something on a template page (matched content
 *   flows into it), and a document holds at most one. Outside that context it
 *   stays VISIBLE but disabled with a reason, so authors discover the module
 *   and learn what unlocks it instead of hitting a blocked insert.
 */
export function moduleAvailability(
  mod: RegistryModuleForInserter,
  context: ModuleInsertionContext,
): ModuleAvailability {
  if (HIDDEN_MODULE_IDS.has(mod.id)) return { kind: 'hidden' }
  if (mod.id === 'base.slot-outlet' && !context.isVCMode) return { kind: 'hidden' }
  if (mod.id === 'base.outlet') {
    if (context.isVCMode) {
      return {
        kind: 'disabled',
        reason: 'Templates only — a component has no matched content to flow in.',
      }
    }
    if (!context.isTemplate) {
      return {
        kind: 'disabled',
        reason: 'Templates only — mark this page "Use as template" to place a content outlet.',
      }
    }
    if (context.hasOutlet) {
      return {
        kind: 'disabled',
        reason: 'This template already has a content outlet — matched content flows into just one.',
      }
    }
  }
  return { kind: 'insertable' }
}

export function getVisibleModuleItems<TModule extends RegistryModuleForInserter>(
  modules: readonly TModule[],
  context: ModuleInsertionContext,
): ModuleInserterModuleItem<TModule>[] {
  const items: ModuleInserterModuleItem<TModule>[] = []
  for (const mod of modules) {
    const availability = moduleAvailability(mod, context)
    if (availability.kind === 'hidden') continue
    const description = mod.description ?? `${mod.name} module`
    items.push({
      key: recentKey({ kind: 'module', id: mod.id }),
      id: mod.id,
      kind: 'module',
      name: mod.name,
      description,
      category: mod.category,
      accent: moduleAccentForCategory(mod.category),
      module: mod,
      wire: moduleWireForId(mod.id, mod.category),
      searchText: searchText([mod.name, mod.id, mod.category, description]),
      ...(availability.kind === 'disabled' ? { disabledReason: availability.reason } : {}),
    })
  }
  return items
}

/** Component ids referenced by `base.visual-component-ref` nodes in a snapshot. */
function referencedVcIdsInLayout(layout: SavedLayout): string[] {
  const ids = new Set<string>()
  for (const node of Object.values(layout.nodes)) {
    if (node.moduleId !== 'base.visual-component-ref') continue
    const componentId = node.props.componentId
    if (typeof componentId === 'string' && componentId) ids.add(componentId)
  }
  return [...ids]
}

/**
 * Availability for a SAVED layout in the given context. Two snapshot-borne
 * hazards make an item disabled-with-reason (never hidden — authors should
 * see the layout exists and learn what unlocks it):
 *   - The snapshot carries a `base.outlet`: same placement rules as the
 *     outlet module itself (templates only, at most one per document).
 *   - VC mode + the snapshot references a component that (transitively)
 *     references the open component — inserting it would create a cycle.
 */
function savedLayoutDisabledReason(
  layout: SavedLayout,
  context: ModuleInsertionContext,
  visualComponents: readonly VisualComponent[],
): string | undefined {
  if (firstOutletId(layout.nodes) !== null) {
    if (context.isVCMode) {
      return 'Includes a content outlet — a component has no matched content to flow in.'
    }
    if (!context.isTemplate) {
      return 'Includes a content outlet — mark this page "Use as template" to insert it.'
    }
    if (context.hasOutlet) {
      return 'Includes a content outlet and this document already has one.'
    }
  }
  if (context.isVCMode && context.activeVcId) {
    for (const refId of referencedVcIdsInLayout(layout)) {
      if (wouldCreateCycle([...visualComponents], context.activeVcId, refId)) {
        return 'Includes a component that references the component being edited.'
      }
    }
  }
  return undefined
}

/** Owning plugin id for a pack-installed layout, or null for user layouts. */
export function layoutPluginId(layout: SavedLayout): string | null {
  const slash = layout.id.indexOf('/')
  return slash > 0 ? layout.id.slice(0, slash) : null
}

export function getSavedLayoutItems(
  layouts: readonly SavedLayout[],
  context: ModuleInsertionContext,
  visualComponents: readonly VisualComponent[],
): ModuleInserterSavedLayoutItem[] {
  return layouts.map((layout) => {
    const disabledReason = savedLayoutDisabledReason(layout, context, visualComponents)
    const pluginId = layoutPluginId(layout)
    return {
      key: recentKey({ kind: 'savedLayout', id: layout.id }),
      id: layout.id,
      kind: 'savedLayout',
      name: layout.name,
      description: pluginId ? 'Plugin layout' : 'Saved layout',
      accent: 'sky',
      layout,
      blocks: Object.keys(layout.nodes).length,
      pluginId,
      wire: wireFromTree({ nodes: layout.nodes, rootNodeId: layout.rootNodeId }),
      searchText: searchText([
        layout.name,
        layout.id,
        pluginId ? `plugin layout ${pluginId}` : 'saved layout',
      ]),
      ...(disabledReason ? { disabledReason } : {}),
    }
  })
}

/**
 * Compose the Layouts section: the user's saved layouts first, then one group
 * per plugin (labelled with the plugin's display name). Every layout is a
 * `SavedLayout` row in `data_rows` — there are no code-defined presets. Group
 * labels render only when more than one group is present; `labelByKey` keys
 * each label to its group's first item.
 */
export function composeLayoutsSection(
  savedItems: readonly ModuleInserterSavedLayoutItem[],
  pluginNameFor: (pluginId: string) => string | null,
): {
  items: ModuleInserterSavedLayoutItem[]
  labelByKey: Map<string, string>
} {
  const userItems = savedItems.filter((item) => item.pluginId === null)
  const byPlugin = new Map<string, ModuleInserterSavedLayoutItem[]>()
  for (const item of savedItems) {
    if (item.pluginId === null) continue
    const group = byPlugin.get(item.pluginId) ?? []
    group.push(item)
    byPlugin.set(item.pluginId, group)
  }
  const pluginGroups = [...byPlugin.entries()]
    .map(([pluginId, items]) => ({
      label: pluginNameFor(pluginId) ?? pluginId,
      items,
    }))
    .sort((a, b) => a.label.localeCompare(b.label))

  const groupCount = (userItems.length > 0 ? 1 : 0) + pluginGroups.length

  const items = [
    ...userItems,
    ...pluginGroups.flatMap((group) => group.items),
  ]
  const labelByKey = new Map<string, string>()
  if (groupCount > 1) {
    if (userItems.length > 0) labelByKey.set(userItems[0].key, 'Saved')
    for (const group of pluginGroups) labelByKey.set(group.items[0].key, group.label)
  }
  return { items, labelByKey }
}

function getComponentItems(
  components: readonly VisualComponent[],
): ModuleInserterComponentItem[] {
  return components.map((component) => ({
    key: recentKey({ kind: 'component', id: component.id }),
    id: component.id,
    kind: 'component',
    name: component.name,
    description: 'Saved Visual Component',
    accent: 'mint',
    component,
    uses: 0,
    wire: wireFromTree(component.tree),
    searchText: searchText([component.name, component.id, 'visual component']),
  }))
}

/**
 * Fixed "Insert product" / "Insert collection" / "Insert variant list" items.
 * Each wraps a code-defined scaffold (`@site/store/commerceScaffold`) — a
 * plain, composable node tree bound via `dynamicBindings`, not an opaque
 * card component. Built once per call (cheap — three small literal trees);
 * not context-gated like `moduleAvailability`, since a scaffold is just a
 * plain subtree and is always insertable.
 */
function getCommerceScaffoldItems(): ModuleInserterCommerceScaffoldItem[] {
  const definitions: Array<{ scaffoldId: CommerceScaffoldId; name: string; description: string; wire: WireNode }> = [
    {
      scaffoldId: 'product',
      name: 'Insert product',
      description: 'Bound image, title, and price — linked to the product page.',
      wire: wireFromTree(toWireTree(buildProductScaffoldSnapshot())),
    },
    {
      scaffoldId: 'products-loop',
      name: 'Insert collection',
      description: 'Repeats a product row for a collection’s products.',
      wire: wireFromTree(toWireTree(buildRelationshipLoopSnapshot('products'))),
    },
    {
      scaffoldId: 'variants-loop',
      name: 'Insert variant list',
      description: 'Repeats a title/price row for a product’s variants.',
      wire: wireFromTree(toWireTree(buildRelationshipLoopSnapshot('variants'))),
    },
    {
      scaffoldId: 'cart',
      name: 'Insert cart',
      description: 'Cart lines plus a subtotal — every part editable and rebindable.',
      wire: wireFromTree(toWireTree(buildCartScaffoldSnapshot())),
    },
  ]
  return definitions.map(({ scaffoldId, name, description, wire }) => ({
    key: recentKey({ kind: 'commerceScaffold', id: scaffoldId }),
    id: scaffoldId,
    kind: 'commerceScaffold',
    scaffoldId,
    name,
    description,
    accent: moduleAccentForCategory('Commerce'),
    wire,
    searchText: searchText([name, scaffoldId, 'commerce', description]),
  }))
}

function toWireTree(snapshot: { rootNodeIds: string[]; nodes: Record<string, import('@core/page-tree').PageNode> }) {
  return { rootNodeId: snapshot.rootNodeIds[0], nodes: snapshot.nodes }
}

interface BuiltModuleInserterItems {
  moduleItems: ModuleInserterModuleItem[]
  /** User-saved layouts (`SavedLayout` rows) — the sole source of the Layouts section. */
  savedLayoutItems: ModuleInserterSavedLayoutItem[]
  componentItems: ModuleInserterComponentItem[]
  commerceScaffoldItems: ModuleInserterCommerceScaffoldItem[]
  /** Every visible item — including disabled ones (carrying `disabledReason`). */
  allItems: ModuleInserterItem[]
}

export function buildModuleInserterItems({
  modules,
  context,
  savedLayouts,
  visualComponents,
}: {
  modules: readonly AnyModuleDefinition[]
  context: ModuleInsertionContext
  savedLayouts: readonly SavedLayout[]
  visualComponents: readonly VisualComponent[]
}): BuiltModuleInserterItems {
  const moduleItems = getVisibleModuleItems(modules, context)
  const savedLayoutItems = getSavedLayoutItems(savedLayouts, context, visualComponents)
  const componentItems = getComponentItems(visualComponents)
  const commerceScaffoldItems = getCommerceScaffoldItems()
  return {
    moduleItems,
    savedLayoutItems,
    componentItems,
    commerceScaffoldItems,
    allItems: [
      ...moduleItems,
      ...savedLayoutItems,
      ...componentItems,
      ...commerceScaffoldItems,
    ],
  }
}

export function filterInserterItems<TItem extends ModuleInserterItem>(
  items: readonly TItem[],
  query: string,
): TItem[] {
  const q = query.trim().toLowerCase()
  if (!q) return [...items]
  return items.filter((item) => item.searchText.includes(q))
}

export function recentRefForItem(item: ModuleInserterItem): ModuleInserterRecentRef {
  return { kind: item.kind, id: item.id }
}

export function resolveRecentItems(
  recent: readonly ModuleInserterRecentRef[],
  items: readonly ModuleInserterItem[],
): ModuleInserterItem[] {
  return resolveInserterRefs(recent, items)
}

export function resolveInserterRefs(
  refs: readonly ModuleInserterItemRef[],
  items: readonly ModuleInserterItem[],
): ModuleInserterItem[] {
  const byKey = new Map(items.map((item) => [item.key, item]))
  const resolved: ModuleInserterItem[] = []
  const seen = new Set<string>()
  for (const ref of refs) {
    const key = recentKey(ref)
    if (seen.has(key)) continue
    const item = byKey.get(key)
    if (!item) continue
    resolved.push(item)
    seen.add(key)
  }
  return resolved
}

export function dedupeModuleInserterRefs(
  refs: readonly ModuleInserterItemRef[],
): ModuleInserterItemRef[] {
  const deduped: ModuleInserterItemRef[] = []
  const seen = new Set<string>()
  for (const ref of refs) {
    const key = recentKey(ref)
    if (seen.has(key)) continue
    deduped.push(ref)
    seen.add(key)
  }
  return deduped
}

export function itemDescription(item: ModuleInserterItem): string {
  // A disabled item's most useful description is WHY it can't be inserted here.
  if (item.disabledReason) return item.disabledReason
  if (item.kind === 'savedLayout') {
    return item.blocks === 1 ? `1 block · ${item.description}` : `${item.blocks} blocks · ${item.description}`
  }
  if (item.kind === 'component') {
    const count = item.component.params.length
    return count === 1 ? '1 param · Saved component' : `${count} params · Saved component`
  }
  return item.description
}

export function recentKey(ref: ModuleInserterItemRef): string {
  return `${ref.kind}:${ref.id}`
}

function searchText(parts: readonly string[]): string {
  return parts.join(' ').toLowerCase()
}
