/**
 * Canonical slug helper used by both the CMS server and the admin UI.
 *
 * Strips quotes (so titles like `"Don't"` become `dont` rather than
 * `don-t`), lower-cases, collapses any non-alphanumeric run into a single
 * hyphen, trims leading/trailing hyphens, and falls back to `untitled`
 * when the result would otherwise be empty.
 *
 * For the stricter page-slug semantics (which surface validation errors
 * to the user instead of silently substituting `untitled`) see
 * `src/core/page-tree/slugs.ts::normalizePageSlug`.
 */
export function slugFromTitle(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'untitled'
}
