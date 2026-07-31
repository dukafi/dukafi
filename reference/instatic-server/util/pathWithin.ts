import { isAbsolute, relative } from 'node:path'

/**
 * Defense-in-depth filesystem path containment. Schema-level patterns may
 * exclude `..` segments and absolute paths, but filesystem sinks recompose
 * paths via `path.join` — so re-assert the resolved `child` stays strictly
 * under `rootDir` after composition. Throws on the root itself, any `..`
 * escape, or an absolute path that lands outside the root.
 *
 * Used by every untrusted-path write sink: plugin asset extraction
 * (`server/plugins/runtime.ts`, `pack.ts`), the plugin admin upload route,
 * and site-bundle media import.
 */
export function assertPathWithin(rootDir: string, child: string): void {
  const rel = relative(rootDir, child)
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error(`Path "${child}" escapes root "${rootDir}"`)
  }
}
