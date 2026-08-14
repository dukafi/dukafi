/**
 * Item parsing for `base.list`, shared by the publisher `render()` path
 * (`index.ts`) and the canvas preview (`ListEditor.tsx`).
 *
 * The two paths must split the textarea value into list items identically or
 * the canvas would show a different set of `<li>`s than the published page.
 * They used to carry byte-for-byte copies of this function because Constraint
 * #309 forbids the editor `.tsx` from exporting non-component values — so the
 * shared logic lives here, in a non-component `.ts` leaf both can import.
 */

/**
 * Split a newline-separated textarea value into trimmed, non-empty list items.
 * Blank lines are dropped so a stray empty line never produces an empty `<li>`.
 */
export function parseItems(raw: string): string[] {
  return raw
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}
