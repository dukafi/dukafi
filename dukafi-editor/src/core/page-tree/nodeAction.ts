/**
 * NodeAction — a behaviour overlay on an ordinary node.
 *
 * The sibling of `dynamicBindings`: that one says where a node's DATA comes
 * from, this one says what the node DOES when clicked. Both exist so a
 * merchant can build commerce UI out of plain `base.*` nodes instead of
 * opaque components — Dukafi ships the verbs, the merchant ships the design.
 *
 * Cart actions only resolve inside a `cartItems` relationship loop, because
 * that is where the line's SKU comes from. A merchant cannot hand-write
 * "this line's SKU" into htmlAttributes, which is exactly why this overlay
 * exists rather than leaving people to wire htmx attributes themselves.
 *
 * Constraint #269: no imports from editor / editor-store here.
 */

import { Type, type Static } from '@core/utils/typeboxHelpers'
import { asPlainObject } from './parseHelpers'

const NodeActionTypeSchema = Type.Union([
  Type.Literal('cart.addItem'),
  Type.Literal('cart.removeItem'),
  Type.Literal('cart.setQuantity'),
  Type.Literal('cart.clear'),
  Type.Literal('cart.createOrder'),
  Type.Literal('payment.initiate'),
  Type.Literal('account.register'),
  Type.Literal('account.login'),
  Type.Literal('account.logout'),
  // Open or close an overlay. `target` is the uid of the container marked as
  // one; omitted on close means "the overlay I am inside", which is what a
  // close button in a drawer wants.
  Type.Literal('overlay.open'),
  Type.Literal('overlay.close'),
])

export type NodeActionType = Static<typeof NodeActionTypeSchema>

export const NodeActionSchema = Type.Object({
  type: NodeActionTypeSchema,
  /** Absolute quantity for `cart.setQuantity`. Ignored when `delta` is set. */
  quantity: Type.Optional(Type.Number()),
  /**
   * Relative step for `cart.setQuantity` (a stepper's +1 / -1). Resolved
   * server-side against the current quantity — the browser can't know it
   * without racing another tab.
   */
  delta: Type.Optional(Type.Number()),
  /**
   * Where to send the visitor after `cart.createOrder` succeeds. Same-origin
   * paths only — the server rejects anything else.
   */
  redirect: Type.Optional(Type.String()),
  /** Which registered payment provider `payment.initiate` should use. */
  provider: Type.Optional(Type.String()),
  /**
   * `cart.addItem` overrides. Both optional: with neither, the product comes
   * from the entry in scope (a product loop, a product template) and the
   * variant from the surrounding form.
   */
  productSlug: Type.Optional(Type.String()),
  variantSku: Type.Optional(Type.String()),
  /** Node id of the overlay `overlay.open` / `overlay.close` acts on. */
  target: Type.Optional(Type.String()),
})

export type NodeAction = Static<typeof NodeActionSchema>

/**
 * Node-level behaviour map.
 *
 * `click` is a verb the node performs. `region` is different: it marks a node
 * as the live area a flow re-renders into — the payment region is what the
 * status fragment swaps, and the only place `payment.*` bindings resolve.
 *
 * A `cart` region is the same idea for the cart. It exists because a baked
 * page is one file served to every visitor, so `cart.count` / `cart.subtotal`
 * CANNOT be baked — they need a spot the browser re-fetches per visitor.
 * The cart-items loop is already such a spot, but everything in it repeats
 * per line, which is wrong for a cart-wide total. Marking an enclosing node
 * as the cart region gives those values somewhere to live.
 *
 * A `form` region is where a form's OUTCOME lands — the error banner, the
 * "signed in" state. It exists for a different reason to the other two: the
 * failing request itself cannot deliver it, because htmx throws away 4xx
 * bodies. So the POST fires an event, the region hears it, and re-renders
 * itself with `form.hasError` and `form.error` in scope. Unlike a cart region
 * it renders its contents at bake time too — a login form is the same for
 * everybody, and blanking it would make it flash in on every load.
 */
export const NodeActionsSchema = Type.Object({
  click: Type.Optional(NodeActionSchema),
  region: Type.Optional(Type.Union([
    Type.Literal('payment'),
    Type.Literal('cart'),
    Type.Literal('form'),
  ])),
  /**
   * Marks this container as an overlay: hidden until something opens it,
   * published as a `<dialog>`.
   *
   * A flag rather than a module, for the same reason `region` is: the contents
   * are ordinary nodes, so a loop, a cart region and a form all work inside a
   * drawer with no extra machinery. `modal` centres; the `sheet-*` variants
   * anchor to an edge. Position and animation are the merchant's Tailwind
   * classes — this only decides the open/close mechanics.
   */
  overlay: Type.Optional(Type.Union([
    Type.Literal('modal'),
    Type.Literal('sheet-left'),
    Type.Literal('sheet-right'),
    Type.Literal('sheet-bottom'),
  ])),
})

export type NodeActions = Static<typeof NodeActionsSchema>

const VALID_TYPES: NodeActionType[] = [
  'cart.addItem', 'cart.removeItem', 'cart.setQuantity', 'cart.clear', 'cart.createOrder', 'payment.initiate',
  'account.register', 'account.login', 'account.logout',
  'overlay.open', 'overlay.close',
]

export type NodeRegion = NonNullable<NodeActions['region']>

const VALID_REGIONS: NodeRegion[] = ['payment', 'cart', 'form']

export type NodeOverlay = NonNullable<NodeActions['overlay']>

const VALID_OVERLAYS: NodeOverlay[] = ['modal', 'sheet-left', 'sheet-right', 'sheet-bottom']

function parseNodeAction(raw: unknown): NodeAction | null {
  const r = asPlainObject(raw)
  if (!r) return null
  if (!VALID_TYPES.includes(r.type as NodeActionType)) return null

  const action: NodeAction = { type: r.type as NodeActionType }
  if (typeof r.quantity === 'number' && Number.isFinite(r.quantity)) action.quantity = r.quantity
  if (typeof r.delta === 'number' && Number.isFinite(r.delta)) action.delta = r.delta
  if (typeof r.redirect === 'string' && r.redirect.length > 0) action.redirect = r.redirect
  if (typeof r.provider === 'string' && r.provider.length > 0) action.provider = r.provider
  if (typeof r.productSlug === 'string' && r.productSlug.length > 0) action.productSlug = r.productSlug
  if (typeof r.variantSku === 'string' && r.variantSku.length > 0) action.variantSku = r.variantSku
  if (typeof r.target === 'string' && r.target.length > 0) action.target = r.target
  return action
}

/** Tolerant parse — an unrecognised action is dropped, never fatal. */
export function parseNodeActions(raw: unknown): NodeActions | undefined {
  const r = asPlainObject(raw)
  if (!r) return undefined

  const click = parseNodeAction(r.click)
  const region = VALID_REGIONS.includes(r.region as NodeRegion)
    ? (r.region as NodeRegion)
    : undefined
  const overlay = VALID_OVERLAYS.includes(r.overlay as NodeOverlay)
    ? (r.overlay as NodeOverlay)
    : undefined
  if (!click && !region && !overlay) return undefined
  return {
    ...(click ? { click } : {}),
    ...(region ? { region } : {}),
    ...(overlay ? { overlay } : {}),
  }
}
