/**
 * pathValidation — SiteFile path safety checks.
 *
 * Architecture source: Contribution #595 §1.4 + msg #1844 amendments.
 *
 * Rules enforced by isSafePath():
 *  1. Path must not be empty.
 *  2. POSIX forward slashes only — no backslashes.
 *  3. Path must NOT start with `/`.
 *  4. Path must NOT contain `..` segments (directory traversal, CWE-22).
 *  5. Path must NOT begin with `src/pages/` (reserved for virtual page projection).
 *  6. Dot-segments (`.`) are normalized away by normalizePath() before validation
 *     so `src/./foo.ts` → `src/foo.ts` → valid.
 *
 * Path uniqueness (throw on collision) is enforced at the slice level in
 * filesSlice.ts, not here, because it requires access to the existing files list.
 *
 * Usage:
 *   const safe = normalizePath(raw)       // collapse dot-segments
 *   if (!isSafePath(safe)) throw ...      // reject invalid paths
 *   // use `safe` from here on
 */

const RESERVED_PREFIX = 'src/pages/'

/**
 * Collapse single-dot segments from a POSIX path.
 * Does NOT resolve `..` — those are rejected outright by isSafePath().
 *
 * Examples:
 *   "src/./foo.ts"     → "src/foo.ts"
 *   "src/./bar/./baz"  → "src/bar/baz"
 *   "package.json"     → "package.json"
 */
export function normalizePath(path: string): string {
  const segments = path.split('/')
  const result: string[] = []
  for (const seg of segments) {
    if (seg === '.') continue
    result.push(seg)
  }
  return result.join('/')
}

/**
 * Return true if `path` is safe to use as a SiteFile path.
 * The caller is responsible for normalizing the path first via normalizePath().
 *
 * @param path — should already be normalized (no `.` segments)
 */
export function isSafePath(path: string): boolean {
  // Rule 1 — must not be empty
  if (!path || path.length === 0) return false

  // Rule 2 — POSIX only, no backslashes
  if (path.includes('\\')) return false

  // Rule 3 — must not start with `/`
  if (path.startsWith('/')) return false

  // Rule 4 — no `..` segments anywhere
  const segments = path.split('/')
  for (const seg of segments) {
    if (seg === '..') return false
  }

  // Rule 5 — reserved prefix
  if (path === RESERVED_PREFIX.replace(/\/$/, '') || path.startsWith(RESERVED_PREFIX)) {
    return false
  }

  return true
}
