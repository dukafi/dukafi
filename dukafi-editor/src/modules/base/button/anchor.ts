/**
 * Element decision for `base.button`, shared by the publisher `render()` path
 * (`index.ts`) and the canvas preview (`ButtonEditor.tsx`).
 *
 * A button renders as an `<a>` only when its `href` survives URL sanitisation
 * as something other than the inert `#`; otherwise it is a real `<button>`.
 * Running both paths through the same `safeUrl` here means the canvas shows the
 * exact element the published page will emit — a raw or `javascript:` href that
 * collapses to `#` renders as a `<button>` in both, instead of the editor
 * optimistically showing an `<a>` the publisher would never produce.
 *
 * Non-component `.ts` leaf so the editor component can import it without
 * breaking React Fast Refresh (Constraint #309).
 */
import { safeUrl } from '@modules/base/utils/escape'

/**
 * Resolve a button's `href` prop to an anchor target. Returns the sanitised
 * href when the button should be an `<a>`, or `null` when it should be a
 * `<button>` (no href, or an href that sanitises to the inert `#`).
 */
export function resolveButtonAnchor(rawHref: unknown): { href: string } | null {
  const href = safeUrl(String(rawHref ?? ''))
  return href && href !== '#' ? { href } : null
}
