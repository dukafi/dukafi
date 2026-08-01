/**
 * Module-scoped importmap builder for the editor's iframe sandbox.
 *
 * The host owns the URLs. When the site has resolved its runtime
 * dependencies (`Dependencies Panel → Resolve runtime`), the server
 * persists a `packageImportmap` on `site.runtime` whose entries point at
 * the host's own `/_instatic/runtime/cache/<lockHash>/<name>/<entry>` route.
 * This file does NOT invent URLs — it just narrows that site-wide map to
 * the entries each iframe actually needs.
 *
 * Why a per-module filter
 *   The iframe only ever imports the bare specifiers its sandbox source
 *   actually references (e.g. `three`, `three/examples/jsm/...`). Carrying
 *   the full site importmap would still work, but a focused map keeps the
 *   `srcDoc` size small and surfaces "you forgot to declare this dep" as
 *   a clear "Failed to resolve module specifier" error during development
 *   rather than a silent success that masks a future bug.
 *
 * Plugin authors write plain bare imports — `import * as THREE from 'three'`.
 * The host's importmap maps that to a locally-served file. No CDN URL ever
 * appears in plugin source or in this resolver.
 */
import type { AnyModuleDefinition } from './types'
import {
  getSiteDependencyVersion,
  normalizeModuleDependencies,
  type NormalizedModuleDependency,
} from './dependencies'
import type { SitePackageJson } from '@core/site-dependencies/manifest'
import type { RuntimePackageImportmap } from '@core/site-runtime-schema'

interface RuntimeResolverOptions {
  packageJson?: SitePackageJson
  /**
   * Drop dependencies from the map when they're not present in the site
   * manifest. The iframe sandbox uses this so a missing dep surfaces as a
   * declined render rather than a runtime "module not found".
   */
  strictSiteManifest?: boolean
  /**
   * Precomputed site-wide importmap from `site.runtime.packageImportmap`.
   * Required to actually build URLs — without it, this resolver returns an
   * empty map and the editor's `ModuleSandboxFrame` shows its
   * "missing-runtime" empty state instead of mounting the iframe.
   */
  siteImportmap?: RuntimePackageImportmap
}

interface ModuleImportMap {
  imports: Record<string, string>
}

/**
 * Pick the entries of `siteImportmap.imports` that match a single
 * dependency name. Each package contributes two keys to the iframe map:
 *
 *   - `<name>`   → entry-file URL (used by `import 'three'`)
 *   - `<name>/`  → package-root URL prefix (used by `import 'three/x.js'`)
 *
 * Both must be present so subpath imports work without re-hitting the
 * server.
 */
function pickImportEntries(
  imports: Record<string, string>,
  dependency: Pick<NormalizedModuleDependency, 'name'>,
): Array<[string, string]> {
  const out: Array<[string, string]> = []
  const root = imports[dependency.name]
  const prefix = imports[`${dependency.name}/`]
  if (root) out.push([dependency.name, root])
  if (prefix) out.push([`${dependency.name}/`, prefix])
  return out
}

export function createModuleImportMap(
  moduleDefinition: AnyModuleDefinition,
  options: RuntimeResolverOptions = {},
): ModuleImportMap {
  const imports: Record<string, string> = {}
  const siteImports = options.siteImportmap?.imports
  if (!siteImports) return { imports }

  for (const dependency of normalizeModuleDependencies(moduleDefinition.dependencies)) {
    if (dependency.dev) continue

    // strictSiteManifest gates the iframe — a module dep that isn't in the
    // site's package.json hasn't been adopted into the runtime yet, so we
    // refuse to build URLs for it. The host-side UI surfaces the
    // "missing dep" affordance instead.
    if (options.strictSiteManifest && options.packageJson
      && getSiteDependencyVersion(options.packageJson, dependency) === null) {
      continue
    }

    for (const [key, url] of pickImportEntries(siteImports, dependency)) {
      imports[key] = url
    }
  }

  return { imports }
}

/**
 * Single-package URL lookup. Returns null if the package isn't in the
 * site's importmap — callers should treat that as "not resolved yet" and
 * defer rendering.
 */
export function resolveDependencyUrl(
  dependency: Pick<NormalizedModuleDependency, 'name'>,
  options: { siteImportmap?: RuntimePackageImportmap } = {},
): string | null {
  return options.siteImportmap?.imports[dependency.name] ?? null
}
