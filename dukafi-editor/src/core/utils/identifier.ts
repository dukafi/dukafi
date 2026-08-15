/**
 * `value` is typed as a string, but the documents this runs against are not
 * all authored by the editor: the HTML importer, MCP edits and server-side
 * seeds all produce nodes, and a node written without a prop has `undefined`
 * where the schema promised a string. That used to throw inside `.replace`
 * and take the whole canvas subtree down with a "Render failed in
 * node-renderer" — a missing prop should degrade to the fallback, not crash
 * the page being edited.
 */
export function normalizeIdentifierInput(value: string): string {
  return String(value ?? '')
    .replace(/\s+/g, '-')
    .replace(/[^A-Za-z0-9_-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^[-_]+/, '')
}

export function normalizeIdentifierValue(value: string, fallback = ''): string {
  return normalizeIdentifierInput(value).replace(/[-_]+$/, '') || fallback
}
