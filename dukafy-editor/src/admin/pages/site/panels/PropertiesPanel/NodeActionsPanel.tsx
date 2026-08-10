/**
 * NodeActionsPanel — attach a behaviour to an ordinary node.
 *
 * Dukafy ships no buy button, no stepper, no remove button. It ships VERBS,
 * and this is where a merchant points their own element at one. Any node
 * works — a button, a container, an image.
 *
 * Node-level, like htmlAttributes — not a module prop — so it applies to
 * whatever element the merchant decided should be clickable.
 */
import { useEditorStore } from '@site/store/store'
import type {
  ConditionOperator,
  NodeAction,
  NodeActionType,
  NodeRegion,
  NodeVisibility,
} from '@core/page-tree'
import { CONDITION_OPERATORS_WITH_VALUE } from '@core/page-tree'
import { ControlRow } from '@ui/components/ControlRow'
import { Select } from '@ui/components/Select'
import { Input } from '@ui/components/Input'
import { EmptyState } from '@ui/components/EmptyState'
import styles from './NodeActionsPanel.module.css'

interface NodeActionsPanelProps {
  nodeId: string
  actions: { click?: NodeAction; region?: NodeRegion } | undefined
  visibleWhen?: NodeVisibility
  readOnly: boolean
}

const CONDITION_SOURCES: Array<{ value: NodeVisibility['source']; label: string }> = [
  { value: 'currentEntry', label: 'This item' },
  { value: 'parentEntry', label: 'The item around it' },
  { value: 'cart', label: 'The cart' },
  { value: 'payment', label: 'The payment' },
]

const OPERATOR_OPTIONS: Array<{ value: ConditionOperator; label: string }> = [
  { value: 'isTrue', label: 'is yes / has a value' },
  { value: 'isFalse', label: 'is no / is empty' },
  { value: 'equals', label: 'equals' },
  { value: 'notEquals', label: 'does not equal' },
  { value: 'greaterThan', label: 'is more than' },
  { value: 'lessThan', label: 'is less than' },
]

/**
 * Shortcuts for the conditions worth naming, because "inCart" is not something
 * a merchant can be expected to guess. Everything else stays reachable by
 * typing a field name directly.
 */
const CONDITION_PRESETS: Array<{ label: string; condition: NodeVisibility }> = [
  { label: 'This item IS in the cart', condition: { source: 'currentEntry', field: 'inCart', operator: 'isTrue' } },
  { label: 'This item is NOT in the cart', condition: { source: 'currentEntry', field: 'inCart', operator: 'isFalse' } },
  { label: 'The cart has something in it', condition: { source: 'cart', field: 'count', operator: 'isTrue' } },
  { label: 'The cart is empty', condition: { source: 'cart', field: 'isEmpty', operator: 'isTrue' } },
]

const DEFAULT_CONDITION: NodeVisibility = CONDITION_PRESETS[0].condition

const REGION_OPTIONS: Array<{ value: '' | NodeRegion; label: string }> = [
  { value: '', label: 'No' },
  { value: 'cart', label: 'Cart — re-renders per visitor' },
  { value: 'payment', label: 'Payment — swapped by status updates' },
]

/**
 * Why a merchant would ever reach for this.
 *
 * A published page is ONE file served to everybody, so nothing per-visitor can
 * be baked into it. `{cart.count}` on an ordinary node is therefore blank —
 * not broken, just unknowable at bake time. Marking an enclosing node as the
 * cart region makes the browser re-fetch that subtree with the real cart, and
 * keeps it in sync afterwards.
 */
const REGION_NOTE: Record<NodeRegion, string> = {
  cart:
    'This box and everything in it re-loads with the visitor’s own cart, and refreshes whenever the cart changes. Required for cart-wide values — {cart.count}, {cart.subtotalDisplay}, {cart.totalDisplay} — which cannot be baked into a shared page. Put it AROUND your cart lines loop, not inside it.',
  payment:
    'This box is what the payment status fragment swaps while an attempt is in flight, and the only place payment.* values resolve.',
}

const ACTION_OPTIONS: Array<{ value: '' | NodeActionType; label: string }> = [
  { value: '', label: 'Nothing' },
  { value: 'cart.addItem', label: 'Cart — add to cart' },
  { value: 'cart.setQuantity', label: 'Cart — change quantity' },
  { value: 'cart.removeItem', label: 'Cart — remove this line' },
  { value: 'cart.createOrder', label: 'Cart — place order' },
  { value: 'payment.initiate', label: 'Payment — start payment' },
]

/**
 * Where each verb finds the thing it acts ON.
 *
 * Stated explicitly because a verb that is inert on a given node just looks
 * broken: a remove button outside a cart loop has no line to remove and does
 * nothing on click, with no way to tell why.
 */
const SCOPE_NOTE: Record<NodeActionType, string> = {
  'cart.addItem':
    'Adds the product in scope — from a product loop or a product template. Submits the surrounding form too, so your own variant field is used.',
  'cart.setQuantity':
    'Acts on the cart line this node sits inside. Inert outside a cart loop.',
  'cart.removeItem':
    'Acts on the cart line this node sits inside. Inert outside a cart loop.',
  'cart.createOrder':
    'Submits the fields of the form around it, so the field list is yours. Same-site redirects only.',
  'payment.initiate':
    'Submits the surrounding form and swaps the enclosing payment region for the live status.',
}

export function NodeActionsPanel({ nodeId, actions, visibleWhen, readOnly }: NodeActionsPanelProps) {
  const setNodeAction = useEditorStore((s) => s.setNodeAction)
  const clearNodeAction = useEditorStore((s) => s.clearNodeAction)
  const setNodeRegion = useEditorStore((s) => s.setNodeRegion)
  const clearNodeRegion = useEditorStore((s) => s.clearNodeRegion)
  const setNodeVisibility = useEditorStore((s) => s.setNodeVisibility)
  const clearNodeVisibility = useEditorStore((s) => s.clearNodeVisibility)
  const click = actions?.click
  const region = actions?.region

  function patchCondition(next: Partial<NodeVisibility>) {
    setNodeVisibility(nodeId, { ...(visibleWhen ?? DEFAULT_CONDITION), ...next })
  }

  /** Which preset, if any, the current condition matches exactly. */
  const activePreset = visibleWhen
    ? CONDITION_PRESETS.findIndex(
        (preset) =>
          preset.condition.source === visibleWhen.source &&
          preset.condition.field === visibleWhen.field &&
          preset.condition.operator === visibleWhen.operator,
      )
    : -1

  function handleTypeChange(value: string) {
    if (value === '') {
      clearNodeAction(nodeId)
      return
    }
    const type = value as NodeActionType
    // Seed the common case so a freshly picked verb is already useful — a +1
    // stepper, a quantity of one — rather than a no-op the author must fix.
    if (type === 'cart.setQuantity') setNodeAction(nodeId, { type, delta: 1 })
    else if (type === 'cart.addItem') setNodeAction(nodeId, { type, quantity: 1 })
    else setNodeAction(nodeId, { type })
  }

  function patch(next: Partial<NodeAction>) {
    if (!click) return
    setNodeAction(nodeId, { ...click, ...next } as NodeAction)
  }

  function numberField(key: 'delta' | 'quantity', label: string) {
    const id = `node-action-${key}`
    return (
      <ControlRow propKey={id} inputId={id} label={label} layout="stacked">
        <Input
          id={id}
          type="number"
          step={1}
          value={String(click?.[key] ?? 1)}
          disabled={readOnly}
          onChange={(event) => {
            const parsed = Number.parseInt(event.currentTarget.value, 10)
            if (Number.isFinite(parsed)) patch({ [key]: parsed } as Partial<NodeAction>)
          }}
        />
      </ControlRow>
    )
  }

  function textField(
    key: 'productSlug' | 'variantSku' | 'redirect',
    label: string,
    placeholder: string,
  ) {
    const id = `node-action-${key}`
    return (
      <ControlRow propKey={id} inputId={id} label={label} layout="stacked">
        <Input
          id={id}
          type="text"
          placeholder={placeholder}
          value={click?.[key] ?? ''}
          disabled={readOnly}
          onChange={(event) => {
            const value = event.currentTarget.value
            patch({ [key]: value } as Partial<NodeAction>)
          }}
        />
      </ControlRow>
    )
  }

  return (
    <div className={styles.panel}>
      <ControlRow propKey="node-action" inputId="node-action" label="On click" layout="stacked">
        <Select
          id="node-action"
          value={click?.type ?? ''}
          disabled={readOnly}
          onChange={(event) => handleTypeChange(event.currentTarget.value)}
        >
          {ACTION_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </Select>
      </ControlRow>

      {click?.type === 'cart.setQuantity' && numberField('delta', 'Change by')}

      {click?.type === 'cart.addItem' && (
        <>
          {numberField('quantity', 'Quantity')}
          {textField('productSlug', 'Product', 'Blank = the product in scope')}
          {textField('variantSku', 'Variant SKU', 'Blank = taken from your form')}
        </>
      )}

      {click?.type === 'cart.createOrder' && textField('redirect', 'After ordering, go to', '/thank-you')}

      {click
        ? <p className={styles.hint}>{SCOPE_NOTE[click.type]}</p>
        : (
            <EmptyState
              title="No interaction"
              description="Pick a verb to make this element do something. Any element works — a button, a box, an image."
            />
          )}

      <ControlRow
        propKey="node-region"
        inputId="node-region"
        label="Live region"
        layout="stacked"
      >
        <Select
          id="node-region"
          value={region ?? ''}
          disabled={readOnly}
          onChange={(event) => {
            const value = event.currentTarget.value
            if (value === '') clearNodeRegion(nodeId)
            else setNodeRegion(nodeId, value as NodeRegion)
          }}
        >
          {REGION_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </Select>
      </ControlRow>

      {region && <p className={styles.hint}>{REGION_NOTE[region]}</p>}

      <div className={styles.group}>
        <p className={styles.groupTitle}>Show only when</p>

        <ControlRow propKey="node-condition" inputId="node-condition" label="Condition" layout="stacked">
          <Select
            id="node-condition"
            value={visibleWhen ? (activePreset >= 0 ? String(activePreset) : 'custom') : ''}
            disabled={readOnly}
            onChange={(event) => {
              const value = event.currentTarget.value
              if (value === '') clearNodeVisibility(nodeId)
              else if (value === 'custom') setNodeVisibility(nodeId, visibleWhen ?? DEFAULT_CONDITION)
              else setNodeVisibility(nodeId, CONDITION_PRESETS[Number(value)].condition)
            }}
          >
            <option value="">Always show</option>
            {CONDITION_PRESETS.map((preset, index) => (
              <option key={preset.label} value={String(index)}>{preset.label}</option>
            ))}
            <option value="custom">Custom…</option>
          </Select>
        </ControlRow>

        {visibleWhen && activePreset < 0 && (
          <>
            <ControlRow propKey="condition-source" inputId="condition-source" label="Look at" layout="stacked">
              <Select
                id="condition-source"
                value={visibleWhen.source}
                disabled={readOnly}
                onChange={(event) =>
                  patchCondition({ source: event.currentTarget.value as NodeVisibility['source'] })}
              >
                {CONDITION_SOURCES.map((source) => (
                  <option key={source.value} value={source.value}>{source.label}</option>
                ))}
              </Select>
            </ControlRow>

            <ControlRow propKey="condition-field" inputId="condition-field" label="Field" layout="stacked">
              <Input
                id="condition-field"
                type="text"
                placeholder="inCart"
                value={visibleWhen.field}
                disabled={readOnly}
                onChange={(event) => {
                  const value = event.currentTarget.value
                  if (value.length > 0) patchCondition({ field: value })
                }}
              />
            </ControlRow>

            <ControlRow propKey="condition-operator" inputId="condition-operator" label="Test" layout="stacked">
              <Select
                id="condition-operator"
                value={visibleWhen.operator}
                disabled={readOnly}
                onChange={(event) =>
                  patchCondition({ operator: event.currentTarget.value as ConditionOperator })}
              >
                {OPERATOR_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </Select>
            </ControlRow>

            {CONDITION_OPERATORS_WITH_VALUE.includes(visibleWhen.operator) && (
              <ControlRow propKey="condition-value" inputId="condition-value" label="Value" layout="stacked">
                <Input
                  id="condition-value"
                  type="text"
                  value={visibleWhen.value ?? ''}
                  disabled={readOnly}
                  onChange={(event) => patchCondition({ value: event.currentTarget.value })}
                />
              </ControlRow>
            )}
          </>
        )}

        <p className={styles.hint}>
          {visibleWhen
            ? 'When this is false the element and everything inside it renders nothing at all — no empty box left behind. Pair two elements with opposite conditions to build an either/or.'
            : 'Cart conditions need a cart in scope, so put this element inside a node marked as the Cart live region above — otherwise it always sees an empty cart.'}
        </p>
      </div>
    </div>
  )
}
