/**
 * Resolve the display-only HTML-tag badge for a module node.
 *
 * `ModuleDefinition.htmlTag` is polymorphic — `undefined`, a literal string, or
 * a `(props) => string | null` function. Every consumer that wants to show the
 * `<tag>` badge in the DOM / layers panel needs the same three-case dispatch,
 * so it lives here next to the field's type definition instead of being
 * re-inlined per consumer.
 *
 * Returns a safe lowercase tag name, or `null` when the module declared no
 * `htmlTag` hint or its function returned a non-string (the signal to omit the
 * badge for modules that don't emit a single deterministic root element —
 * visual-component-ref, slot-outlet, loop, …).
 *
 * NOT consumed by the publisher — `render()` remains the source of truth for
 * emitted HTML. This is pure metadata for editor display.
 */
import type { AnyModuleDefinition } from './types'

export function resolveHtmlTagBadge(
  def: Pick<AnyModuleDefinition, 'htmlTag'> | undefined,
  props: Record<string, unknown>,
): string | null {
  const hint = def?.htmlTag
  if (hint === undefined) return null

  const raw = typeof hint === 'function' ? hint(props) : hint
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  return trimmed.length > 0 ? trimmed.toLowerCase() : null
}
