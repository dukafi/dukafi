export function normalizeIdentifierInput(value: string): string {
  return value
    .replace(/\s+/g, '-')
    .replace(/[^A-Za-z0-9_-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^[-_]+/, '')
}

export function normalizeIdentifierValue(value: string, fallback = ''): string {
  return normalizeIdentifierInput(value).replace(/[-_]+$/, '') || fallback
}
