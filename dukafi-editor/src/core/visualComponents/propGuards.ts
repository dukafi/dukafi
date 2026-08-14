/**
 * Prop guards for the slot / visual-component-ref node families.
 *
 * Both the editor preview components and the publisher's specialised
 * `renderVisualComponentRef` walk raw, unvalidated `node.props` (they read the
 * page tree directly, not the validated render-time shape). They each need to
 * coerce two loosely-typed props into a trusted value:
 *
 *   - `slotName` — the named slot a `base.slot-instance` / `base.slot-outlet`
 *     fills. Missing / empty / non-string falls back to `'children'`.
 *   - `propOverrides` — the per-param override bag on a
 *     `base.visual-component-ref`. Anything that isn't a plain object (null,
 *     array, primitive) falls back to `{}`.
 *
 * These live here, dependency-light, so every consumer resolves them
 * identically instead of re-inlining the guard.
 */

/**
 * Resolve the slot name from a slot node's props. Returns `'children'` for a
 * missing, empty, or non-string `slotName`.
 */
export function resolveSlotName(props: Record<string, unknown> | undefined): string {
  const slotName = props?.slotName
  return typeof slotName === 'string' && slotName ? slotName : 'children'
}

/**
 * Resolve the per-param override bag from a visual-component-ref node's props.
 * Returns `{}` unless the value is a plain object (not null, not an array).
 */
export function safePropOverrides(
  props: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const overrides = props?.propOverrides
  return overrides !== null && typeof overrides === 'object' && !Array.isArray(overrides)
    ? (overrides as Record<string, unknown>)
    : {}
}
