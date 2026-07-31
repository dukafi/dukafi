/**
 * Files Data Layer — upload helpers.
 *
 * Architecture source: Contribution #613 §A.1 (Amendment to Contribution #595)
 * Task #431 — Gate 10
 *
 * Provides pure helpers with no store dependency. Consumed by the CMS media upload UI.
 *
 * Dependency direction: MUST NOT import from editor/.
 */
// checkSizeLimit — soft (10 MB) and hard (50 MB) upload limits

const SOFT_LIMIT_BYTES = 10 * 1024 * 1024  // 10 MB
const HARD_LIMIT_BYTES = 50 * 1024 * 1024  // 50 MB

interface SizeLimitResult {
  ok: boolean
  level: 'none' | 'soft' | 'hard'
  message?: string
}

/**
 * Check whether a file size is within acceptable limits.
 *
 * @param sizeBytes  File size in bytes
 * @returns  { ok: true, level: 'none' }          — under 10 MB, no warning
 *           { ok: true, level: 'soft', message }  — 10–49 MB, soft warning
 *           { ok: false, level: 'hard', message } — ≥50 MB, hard limit exceeded
 */
export function checkSizeLimit(sizeBytes: number): SizeLimitResult {
  if (sizeBytes >= HARD_LIMIT_BYTES) {
    return {
      ok: false,
      level: 'hard',
      message: `File exceeds the 50 MB hard limit (${formatBytes(sizeBytes)}). Please reduce the file size before uploading.`,
    }
  }
  if (sizeBytes >= SOFT_LIMIT_BYTES) {
    return {
      ok: true,
      level: 'soft',
      message: `Large file (${formatBytes(sizeBytes)}). Files over 10 MB may slow editor performance.`,
    }
  }
  return { ok: true, level: 'none' }
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${bytes} B`
}
