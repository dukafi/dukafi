/**
 * NodeActionsPanel — attach a behaviour to an ordinary node.
 *
 * Dukafi ships no buy button, no stepper, no remove button. It ships VERBS,
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
  NodeOverlay,
  NodeRegion,
  NodeVisibility,
} from '@core/page-tree'
import { CONDITION_OPERATORS_WITH_VALUE } from '@core/page-tree'
import { ControlRow } from '@ui/components/ControlRow'
import { Select } from '@ui/components/Select'
import { Input } from '@ui/components/Input'
import { EmptyState } from '@ui/components/EmptyState'
import { Tooltip } from '@ui/components/Tooltip'
import { Button } from '@ui/components/Button'
import { CircleAlertSolidIcon } from 'pixel-art-icons/icons/circle-alert-solid'
import styles from './NodeActionsPanel.module.css'

/**
 * The explanatory notes on this panel are long — they have to be, because
 * "cart region" and "inCart" are not guessable — but three paragraphs of prose
 * stacked between four selects buries the controls. So the prose lives behind
 * an affordance next to the label it explains.
 *
 * Tooltip wires `role="tooltip"` + `aria-describedby` onto the trigger, and
 * `openOnFocus` means keyboard users reach the text the same way pointer users
 * do — the note is the only place this information exists, so it must not be
 * hover-only.
 *
 * The glyph is `circle-alert-solid` because the vendored icon set is a curated
 * subset (see `scripts/sync-icons.ts`) synced from a private upstream and
 * carries no dedicated info glyph; muted and small, a circled mark reads as
 * "there is a note here" rather than as a warning.
 *
 * Wrapped in `Tooltip` by hand rather than using `Button`'s own `tooltip`
 * prop: that path forwards neither `size="wide"` nor `openOnFocus`, and these
 * notes are long enough to need the wide bubble and important enough to need
 * to be reachable without a mouse.
 */
function HintTip({ label, text }: { label: string; text: string }) {
  return (
    <Tooltip content={text} size="wide" openOnFocus>
      <Button
        variant="ghost"
        size="sm"
        iconOnly
        aria-label={`About ${label}`}
        className={styles.hintTip}
      >
        <CircleAlertSolidIcon size={12} aria-hidden="true" />
      </Button>
    </Tooltip>
  )
}

interface NodeActionsPanelProps {
  nodeId: string
  actions: { click?: NodeAction; region?: NodeRegion; overlay?: NodeOverlay } | undefined
  visibleWhen?: NodeVisibility
  readOnly: boolean
}

const CONDITION_SOURCES: Array<{ value: NodeVisibility['source']; label: string }> = [
  { value: 'currentEntry', label: 'This item' },
  { value: 'parentEntry', label: 'The item around it' },
  { value: 'cart', label: 'The cart' },
  { value: 'payment', label: 'The payment' },
  { value: 'form', label: 'The form result' },
  { value: 'loop', label: 'This loop’s pager' },
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
  { label: 'The form came back with an error', condition: { source: 'form', field: 'hasError', operator: 'isTrue' } },
  { label: 'The visitor IS signed in', condition: { source: 'form', field: 'signedIn', operator: 'isTrue' } },
  { label: 'The visitor is NOT signed in', condition: { source: 'form', field: 'signedIn', operator: 'isFalse' } },
  { label: 'There IS a previous page', condition: { source: 'loop', field: 'hasPrevious', operator: 'isTrue' } },
  { label: 'There IS a next page', condition: { source: 'loop', field: 'hasNext', operator: 'isTrue' } },
]

const DEFAULT_CONDITION: NodeVisibility = CONDITION_PRESETS[0].condition

const CONDITION_NOTE =
  'When this is false the element and everything inside it renders nothing at all — '
  + 'no empty box left behind. Pair two elements with opposite conditions to build an '
  + 'either/or. Cart conditions need a cart in scope, so put the element inside a node '
  + 'marked as the Cart live region above — otherwise it always sees an empty cart.'

const REGION_OPTIONS: Array<{ value: '' | NodeRegion; label: string }> = [
  { value: '', label: 'No' },
  { value: 'cart', label: 'Cart — re-renders per visitor' },
  { value: 'payment', label: 'Payment — swapped by status updates' },
  { value: 'form', label: 'Form — shows errors and who is signed in' },
]

/**
 * A sheet or modal is a flag on a container, not a module: its contents stay
 * ordinary nodes, so a loop, a cart region and a form all work inside one.
 */
const OVERLAY_OPTIONS: Array<{ value: '' | NodeOverlay; label: string }> = [
  { value: '', label: 'No' },
  { value: 'modal', label: 'Modal — centred' },
  { value: 'sheet-right', label: 'Sheet — from the right' },
  { value: 'sheet-left', label: 'Sheet — from the left' },
  { value: 'sheet-bottom', label: 'Sheet — from the bottom' },
]

const OVERLAY_NOTE =
  'This box is hidden until something opens it, and publishes as a <dialog> — so the browser '
  + 'gives it a focus trap, Escape to close, a backdrop and an inert background. Point any '
  + 'element at it with the "Overlay — open" action. Position and animation are your own '
  + 'Tailwind classes; the variant only says which edge it belongs to.'

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
  form:
    'Put this AROUND your form. It re-renders after every sign-in or sign-up attempt, and is the only place form.* values resolve — {form.error} for the message, form.hasError for an error banner, form.signedIn to swap the form for a "Hi, {form.name}". Your form still shows immediately on load; only the result comes back from the server.',
}

const ACTION_OPTIONS: Array<{ value: '' | NodeActionType; label: string }> = [
  { value: '', label: 'Nothing' },
  { value: 'cart.addItem', label: 'Cart — add to cart' },
  { value: 'cart.setQuantity', label: 'Cart — change quantity' },
  { value: 'cart.removeItem', label: 'Cart — remove this line' },
  { value: 'cart.clear', label: 'Cart — empty the cart' },
  { value: 'cart.createOrder', label: 'Cart — place order' },
  { value: 'payment.initiate', label: 'Payment — start payment' },
  { value: 'account.login', label: 'Account — sign in' },
  { value: 'account.register', label: 'Account — create account' },
  { value: 'account.logout', label: 'Account — sign out' },
  { value: 'overlay.open', label: 'Overlay — open a sheet or modal' },
  { value: 'overlay.close', label: 'Overlay — close' },
  { value: 'loop.previous', label: 'Loop — previous page' },
  { value: 'loop.next', label: 'Loop — next page' },
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
  'cart.clear':
    'Empties the whole cart, and drops any discount code with it. Needs no line, so it works anywhere on the page.',
  'cart.createOrder':
    'Submits the fields of the form around it, so the field list is yours. Same-site redirects only.',
  'payment.initiate':
    'Submits the surrounding form and swaps the enclosing payment region for the live status.',
  'account.login':
    'Signs in with the email and password fields of the form around it. Put it on the form’s submit button — pressing Enter works too. The result lands in the enclosing Form live region.',
  'account.register':
    'Creates an account from the email, password and name fields of the form around it, and signs the visitor in. The result lands in the enclosing Form live region.',
  'account.logout':
    'Signs the visitor out. Needs no form and no fields.',
  'overlay.open':
    'Opens the sheet or modal you name below. Works on any element — a button, a box, an image.',
  'overlay.close':
    'Closes the overlay this element sits inside. Name one below only to close a different overlay.',
  'loop.previous':
    'Goes to the previous page of the enclosing product (or collection) loop. Put it on any element inside a pagination sibling — a link, a button, a div. Inert on page 1.',
  'loop.next':
    'Goes to the next page of the enclosing product (or collection) loop. Put it on any element inside a pagination sibling. Inert on the last page. The link keeps you on that section instead of jumping to the top of the page.',
}

export function NodeActionsPanel({ nodeId, actions, visibleWhen, readOnly }: NodeActionsPanelProps) {
  const setNodeAction = useEditorStore((s) => s.setNodeAction)
  const clearNodeAction = useEditorStore((s) => s.clearNodeAction)
  const setNodeRegion = useEditorStore((s) => s.setNodeRegion)
  const clearNodeRegion = useEditorStore((s) => s.clearNodeRegion)
  const setNodeOverlay = useEditorStore((s) => s.setNodeOverlay)
  const clearNodeOverlay = useEditorStore((s) => s.clearNodeOverlay)
  const setNodeVisibility = useEditorStore((s) => s.setNodeVisibility)
  const clearNodeVisibility = useEditorStore((s) => s.clearNodeVisibility)
  const click = actions?.click
  const region = actions?.region
  const overlay = actions?.overlay

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
    key: 'productSlug' | 'variantSku' | 'redirect' | 'target',
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
      <ControlRow
        propKey="node-action"
        inputId="node-action"
        label="On click"
        layout="stacked"
        labelSuffix={click ? <HintTip label={`the ${click.type} verb`} text={SCOPE_NOTE[click.type]} /> : undefined}
      >
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

      {(click?.type === 'overlay.open' || click?.type === 'overlay.close') &&
        textField('target', 'Overlay', click.type === 'overlay.close' ? 'Blank = the one around this' : 'Node id of the sheet')}

      {!click && (
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
        labelSuffix={region ? <HintTip label="live regions" text={REGION_NOTE[region]} /> : undefined}
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

      <ControlRow
        propKey="node-overlay"
        inputId="node-overlay"
        label="Sheet or modal"
        layout="stacked"
        labelSuffix={overlay ? <HintTip label="overlays" text={OVERLAY_NOTE} /> : undefined}
      >
        <Select
          id="node-overlay"
          value={overlay ?? ''}
          disabled={readOnly}
          onChange={(event) => {
            const value = event.currentTarget.value
            if (value === '') clearNodeOverlay(nodeId)
            else setNodeOverlay(nodeId, value as NodeOverlay)
          }}
        >
          {OVERLAY_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </Select>
      </ControlRow>

      <div className={styles.group}>
        <p className={styles.groupTitle}>Show only when</p>

        <ControlRow
          propKey="node-condition"
          inputId="node-condition"
          label="Condition"
          layout="stacked"
          labelSuffix={<HintTip label="render conditions" text={CONDITION_NOTE} />}
        >
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

      </div>
    </div>
  )
}
