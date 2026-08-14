const TRANSPARENT_CAPABLE_IMAGE_MIME_TYPES = new Set([
  'image/avif',
  'image/gif',
  'image/png',
  'image/svg+xml',
  'image/webp',
])

function normalizeMimeType(mimeType: string | null | undefined): string {
  return (mimeType ?? '').split(';', 1)[0].trim().toLowerCase()
}

export function shouldUseBlurPlaceholder(
  blurHash: string | null | undefined,
  mimeType: string | null | undefined,
): boolean {
  if (!blurHash) return false
  const normalized = normalizeMimeType(mimeType)
  if (!normalized) return true
  return !TRANSPARENT_CAPABLE_IMAGE_MIME_TYPES.has(normalized)
}
