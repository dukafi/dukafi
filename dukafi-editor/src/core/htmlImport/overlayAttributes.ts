/**
 * Commerce overlays, written as HTML attributes.
 *
 * HTML can express structure and Tailwind classes, which is most of a page and
 * the part a language model writes best. It cannot express the three overlays
 * that make a Dukafi page a STORE: what a node does when clicked
 * (`actions`), whether it renders at all (`visibleWhen`), and where its text
 * comes from (`dynamicBindings`). Those live beside the node, not inside the
 * markup.
 *
 * So they get an attribute spelling. One payload stays one payload — an author
 * (or a model) writes HTML and nothing else:
 *
 *   <div  data-dukafy-region="cart">
 *   <button data-dukafy-action="cart.addItem"
 *           data-dukafy-action-quantity="1"
 *           data-dukafy-visible-when="currentEntry.inCart:isFalse">Add</button>
 *   <p data-dukafy-bind-text="currentEntry.cartQuantity"></p>
 *
 * The `data-dukafy-` vocabulary is not invented here: the Ruby publisher
 * already emits `data-dukafy-cart-region`, `data-dukafy-form-id` and friends on
 * the way out, so a merchant reading view-source and a merchant writing an
 * import see the same language.
 *
 * Every value is validated by the SAME parsers the persisted document uses
 * (`parseNodeActions`, `parseNodeVisibility`, `parseDynamicBindings`), so an
 * attribute cannot introduce an overlay that a hand-edited document could not.
 * Anything unrecognised is dropped rather than rejected — a typo in one
 * attribute must not cost the author the whole element.
 *
 * Constraint #269: no imports from editor / editor-store here.
 */

import {
  parseDynamicBindings,
  parseNodeActions,
  parseNodeVisibility,
  type DynamicPropBinding,
  type NodeActions,
  type NodeVisibility,
} from '@core/page-tree'

const PREFIX = 'data-dukafy-'

const ACTION = `${PREFIX}action`
const ACTION_PARAM = `${PREFIX}action-`
const REGION = `${PREFIX}region`
const VISIBLE_WHEN = `${PREFIX}visible-when`
const BIND = `${PREFIX}bind-`
const LOOP = `${PREFIX}loop`
const LOOP_PARAM = `${PREFIX}loop-`
const COMPONENT = `${PREFIX}component`
const OVERLAY = `${PREFIX}overlay`

/**
 * Attributes this module consumes, so `collectHtmlAttributes` can skip them.
 *
 * Without this they would ALSO survive as raw `htmlAttributes` and be re-emitted
 * on publish — duplicating the overlay in the markup, and in the case of
 * `data-dukafy-region` actively colliding with the attribute `RenderPage`
 * writes for the live region it drives.
 */
export function isOverlayAttribute(name: string): boolean {
  const lower = name.toLowerCase()
  return (
    lower === ACTION ||
    lower === REGION ||
    lower === VISIBLE_WHEN ||
    lower === LOOP ||
    lower === COMPONENT ||
    lower === OVERLAY ||
    lower.startsWith(ACTION_PARAM) ||
    lower.startsWith(LOOP_PARAM) ||
    lower.startsWith(BIND)
  )
}

export interface ImportedOverlays {
  actions?: NodeActions
  visibleWhen?: NodeVisibility
  dynamicBindings?: Record<string, DynamicPropBinding>
}

/** `add-to-cart` -> `addToCart`, for attribute-spelled prop and param names. */
function camel(value: string): string {
  return value.replace(/-([a-z0-9])/g, (_match, char: string) => char.toUpperCase())
}

/** `currentEntry.cartQuantity` -> `{ source, field }`; nested fields survive. */
function splitSourceField(raw: string): { source: string; field: string } | null {
  const trimmed = raw.trim()
  const dot = trimmed.indexOf('.')
  if (dot <= 0 || dot === trimmed.length - 1) return null
  return { source: trimmed.slice(0, dot), field: trimmed.slice(dot + 1) }
}

/**
 * `currentEntry.inCart:isTrue`, or `cart.count:greaterThan:0` when the operator
 * compares against a value. Colon-separated because a condition is three or
 * four small tokens and an attribute holding JSON is unreadable in view-source.
 */
function readVisibleWhen(raw: string): NodeVisibility | undefined {
  const [path, operator, ...rest] = raw.split(':')
  if (!path || !operator) return undefined
  const parts = splitSourceField(path)
  if (!parts) return undefined

  return parseNodeVisibility({
    source: parts.source,
    field: parts.field,
    operator: operator.trim(),
    // Rejoined: a compared value may legitimately contain a colon.
    ...(rest.length > 0 ? { value: rest.join(':') } : {}),
  })
}

function readActions(el: Element): NodeActions | undefined {
  const raw: Record<string, unknown> = {}

  const type = el.getAttribute(ACTION)?.trim()
  if (type) {
    const click: Record<string, unknown> = { type }
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase()
      if (!name.startsWith(ACTION_PARAM)) continue

      const key = camel(name.slice(ACTION_PARAM.length))
      if (!key) continue
      // `quantity` and `delta` are numbers in the schema; everything else is a
      // string. A non-numeric value is left as-is so the parser drops it,
      // rather than silently becoming NaN.
      const value = attr.value.trim()
      const numeric = Number(value)
      raw.click = click
      click[key] = (key === 'quantity' || key === 'delta') && value !== '' && Number.isFinite(numeric)
        ? numeric
        : value
    }
    raw.click = click
  }

  const region = el.getAttribute(REGION)?.trim()
  if (region) raw.region = region

  // A sheet or modal. Lives on `actions` beside `region` because it is the
  // same kind of thing: a marker that changes how the container behaves,
  // leaving its contents ordinary nodes.
  const overlay = el.getAttribute(OVERLAY)?.trim()
  if (overlay) raw.overlay = overlay

  return Object.keys(raw).length > 0 ? parseNodeActions(raw) : undefined
}

function readBindings(el: Element): Record<string, DynamicPropBinding> | undefined {
  const raw: Record<string, unknown> = {}
  for (const attr of Array.from(el.attributes)) {
    const name = attr.name.toLowerCase()
    if (!name.startsWith(BIND)) continue

    const propKey = camel(name.slice(BIND.length))
    const parts = splitSourceField(attr.value)
    if (!propKey || !parts) continue

    raw[propKey] = { source: parts.source, field: parts.field }
  }
  return Object.keys(raw).length > 0 ? parseDynamicBindings(raw) : undefined
}

/** Read every overlay an element declares. Returns `{}` when it declares none. */
export function readOverlayAttributes(el: Element): ImportedOverlays {
  const overlays: ImportedOverlays = {}

  const actions = readActions(el)
  if (actions) overlays.actions = actions

  const rawCondition = el.getAttribute(VISIBLE_WHEN)
  if (rawCondition) {
    const visibleWhen = readVisibleWhen(rawCondition)
    if (visibleWhen) overlays.visibleWhen = visibleWhen
  }

  const dynamicBindings = readBindings(el)
  if (dynamicBindings) overlays.dynamicBindings = dynamicBindings

  return overlays
}

// ---------------------------------------------------------------------------
// Module overrides
// ---------------------------------------------------------------------------

/**
 * Two things HTML has no element for, and which the assistant could not
 * otherwise build at all: a product loop and a reference to a saved component.
 *
 * Both change WHICH MODULE the element becomes, not just what rides on it, so
 * they are applied before the node is created rather than merged onto it after.
 *
 *   <div data-dukafy-loop="products" data-dukafy-loop-per-page="8">…</div>
 *   <div data-dukafy-component="cmp_123"></div>
 *
 * Without the first, "make a category page listing the featured products" was
 * impossible to express — the prompt had to tell the model to give up and ask
 * the merchant to add the loop by hand.
 */
export interface ModuleOverride {
  moduleId: string
  props: Record<string, unknown>
}

/** Loop sources the publisher can resolve. `collections/<slug>.products` too. */
const LOOP_SOURCE = /^(?:products|collections|reviews|orders|paymentProviders|cart\.items|current-query|data\/[a-z0-9-]+|(?:currentEntry|parentEntry)\.[a-zA-Z]+|(?:products|collections)\/[a-z0-9-]+\.[a-zA-Z]+)$/

const LOOP_ORDER = new Set(['manual', 'price', 'title', 'newest'])

export function readModuleOverride(el: Element): ModuleOverride | null {
  const componentId = el.getAttribute(COMPONENT)?.trim()
  if (componentId) {
    return { moduleId: 'base.visual-component-ref', props: { componentId } }
  }

  const source = el.getAttribute(LOOP)?.trim()
  // An unrecognised source would render an empty loop with no hint why, so the
  // element stays whatever its tag made it.
  if (!source || !LOOP_SOURCE.test(source)) return null

  const props: Record<string, unknown> = { source }

  const perPage = Number(el.getAttribute(`${LOOP_PARAM}per-page`))
  if (Number.isFinite(perPage) && perPage > 0) props.perPage = Math.min(perPage, 100)

  const orderBy = el.getAttribute(`${LOOP_PARAM}order-by`)?.trim()
  if (orderBy && LOOP_ORDER.has(orderBy)) props.orderBy = orderBy

  if (el.getAttribute(`${LOOP_PARAM}direction`)?.trim() === 'desc') props.direction = 'desc'

  // `wrapper: none` is required where HTML forbids a <div> between parent and
  // children — a <select> of looped <option>s being the case that matters.
  if (el.getAttribute(`${LOOP_PARAM}wrapper`)?.trim() === 'none') props.wrapper = 'none'

  return { moduleId: 'store.relationship-loop', props }
}
