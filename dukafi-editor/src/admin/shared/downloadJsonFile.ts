/**
 * Trigger a native browser download of a JSON-serializable value. Same
 * Blob + `<a download>` technique as `agentImageActions.ts`'s
 * `downloadAgentImage` — the browser owns the final save location.
 */
export function downloadJsonFile(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const objectUrl = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = objectUrl
  link.download = filename
  link.hidden = true
  document.body.append(link)
  try {
    link.click()
  } finally {
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000)
  }
}

/** Lower-kebab-case-ish, filesystem-safe filename fragment. */
export function safeFilenameFragment(value: string): string {
  const slug = value
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/^-+|-+$/g, '')
  return slug || 'untitled'
}
