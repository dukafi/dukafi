/**
 * collectSameOriginDocuments — the given document plus every same-origin
 * iframe document reachable from it (recursively).
 *
 * Portal-based overlays (context menus, dropdowns) attach their
 * dismiss-on-outside-click listeners to `document`. When the app embeds
 * same-origin iframes — e.g. the canvas editor's per-breakpoint preview
 * frames — a pointer event inside an iframe fires on the *iframe's* own
 * document and never bubbles to the parent listener, so the overlay never
 * dismisses. Attaching the same listener to each reachable iframe document
 * closes that gap.
 *
 * Cross-origin iframes are skipped: reading their `contentDocument` throws
 * (or returns null), and their events are unreachable from this realm
 * anyway, so there is nothing to listen to.
 */
/**
 * isNode — cross-realm-safe `Node` check.
 *
 * A DOM node that lives inside an iframe is an instance of *that iframe's*
 * `Node` constructor, not the parent realm's, so `target instanceof Node`
 * returns `false` for it. When an outside-click listener is attached to an
 * iframe document, its event targets come from the iframe realm — so the
 * usual `instanceof Node` guard would wrongly reject them. Checking for a
 * numeric `nodeType` is structural and works regardless of realm.
 */
export function isNode(target: EventTarget | null): target is Node {
  return target !== null && typeof (target as Node).nodeType === 'number'
}

export function collectSameOriginDocuments(root: Document = document): Document[] {
  const docs: Document[] = [root]
  for (const iframe of root.querySelectorAll('iframe')) {
    let childDoc: Document | null
    try {
      // Throws for cross-origin frames; may be null before load.
      childDoc = iframe.contentDocument
    } catch {
      // Cross-origin — not reachable from this realm, so nothing to listen to.
      childDoc = null
    }
    if (childDoc) docs.push(...collectSameOriginDocuments(childDoc))
  }
  return docs
}
