/**
 * Content-source decision for `base.link`, shared by the publisher `render()`
 * path (`index.ts`) and the canvas preview (`LinkEditor.tsx`) so the two cannot
 * drift.
 *
 * Rule: a link renders its children whenever it HAS children; otherwise it
 * falls back to the `text` prop. "Has children" means a non-empty collection.
 * A `children ?? text` short-circuit is WRONG here because the renderer always
 * passes a children array — an empty array is not nullish, so `??` would render
 * an empty link on one path and the fallback text on the other. Encoding the
 * rule as an explicit count keeps both paths honest.
 *
 * Non-component `.ts` leaf so the editor component can import it without
 * breaking React Fast Refresh (Constraint #309).
 */

/**
 * Whether the link should render its own children (`true`) or fall back to the
 * `text` prop (`false`), given how many rendered children it has.
 */
export function linkUsesChildren(childCount: number): boolean {
  return childCount > 0
}
