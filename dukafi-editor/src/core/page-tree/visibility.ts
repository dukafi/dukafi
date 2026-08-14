/**
 * `visibleWhen` — whether a node renders at all.
 *
 * The third overlay on an ordinary node, alongside `dynamicBindings` (where
 * a node's DATA comes from) and `actions` (what the node DOES). This one says
 * whether the node is there.
 *
 * It exists so a merchant can build two-state UI out of plain nodes instead of
 * waiting for Dukafi to ship a component for each state. "Add to cart" with
 * `currentEntry.inCart is false`, next to an "In cart — 3" box with
 * `currentEntry.inCart is true`, and the product card has a real add/update
 * state that nobody had to hard-code.
 *
 * Reads exactly the same frames as a binding (shared `VALID_BINDING_SOURCES`),
 * so anything you can bind to, you can condition on.
 *
 * Mirrors `node_visible?` in `dukafi/publisher/render_page.rb`.
 *
 * Constraint #269: no imports from editor / editor-store here.
 */

import { Type, type Static } from '@core/utils/typeboxHelpers'
import {
  DynamicBindingSourceSchema,
  VALID_BINDING_SOURCES,
  type DynamicBindingSource,
} from './dynamicBinding'
import { asPlainObject } from './parseHelpers'

const ConditionOperatorSchema = Type.Union([
  Type.Literal('isTrue'),
  Type.Literal('isFalse'),
  Type.Literal('equals'),
  Type.Literal('notEquals'),
  Type.Literal('greaterThan'),
  Type.Literal('lessThan'),
  Type.Literal('isEmpty'),
  Type.Literal('isNotEmpty'),
])

export type ConditionOperator = Static<typeof ConditionOperatorSchema>

export const VALID_CONDITION_OPERATORS: ConditionOperator[] = [
  'isTrue', 'isFalse', 'equals', 'notEquals', 'greaterThan', 'lessThan', 'isEmpty', 'isNotEmpty',
]

/** Operators that compare against a value the author types. */
export const CONDITION_OPERATORS_WITH_VALUE: ConditionOperator[] = [
  'equals', 'notEquals', 'greaterThan', 'lessThan',
]

export const NodeVisibilitySchema = Type.Object({
  source: DynamicBindingSourceSchema,
  field: Type.String({ minLength: 1 }),
  operator: ConditionOperatorSchema,
  /** Only meaningful for the comparison operators; ignored by the rest. */
  value: Type.Optional(Type.String()),
})

export type NodeVisibility = Static<typeof NodeVisibilitySchema>

/**
 * Tolerant parse. An unrecognised condition is DROPPED, which leaves the node
 * visible — the same choice the publisher makes. A node that silently vanishes
 * because its condition failed to parse is the worst outcome: it looks like
 * the node was deleted, with nothing to debug.
 */
export function parseNodeVisibility(raw: unknown): NodeVisibility | undefined {
  const r = asPlainObject(raw)
  if (!r) return undefined
  if (!VALID_BINDING_SOURCES.includes(r.source as DynamicBindingSource)) return undefined
  if (typeof r.field !== 'string' || r.field.length === 0) return undefined
  if (!VALID_CONDITION_OPERATORS.includes(r.operator as ConditionOperator)) return undefined

  const operator = r.operator as ConditionOperator
  return {
    source: r.source as DynamicBindingSource,
    field: r.field,
    operator,
    ...(typeof r.value === 'string' && CONDITION_OPERATORS_WITH_VALUE.includes(operator)
      ? { value: r.value }
      : {}),
  }
}
