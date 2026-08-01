import { Type, type Static } from '@sinclair/typebox'
import { withFallback } from '@core/utils/typeboxHelpers'
import { isSafePackageName } from './packageNames'

// ---------------------------------------------------------------------------
// SitePackageJsonSchema — thin schema for the site's package manifest shape.
//
// NOTE: normalizeSitePackageJson (below) also filters unsafe package names via
// isSafePackageName(). That per-entry sanitisation is intentionally NOT in
// this schema because fallback handling would silently discard the entire
// dependencies map on any failure. Instead, name sanitisation runs in
// validate.ts::runDomainPostChecks via normalizeSitePackageJson after parsing.
// The schema captures the structural shape and is used as the
// persistence-boundary type source of truth.
// ---------------------------------------------------------------------------

export const SitePackageJsonSchema = withFallback(
  Type.Object({
    dependencies: withFallback(Type.Record(Type.String(), Type.String()), {}),
    devDependencies: withFallback(Type.Record(Type.String(), Type.String()), {}),
  }),
  { dependencies: {}, devDependencies: {} },
)

export type SitePackageJson = Static<typeof SitePackageJsonSchema>

/**
 * Empty default. The dependencies feature is opt-in: a fresh site has no
 * runtime packages until the user adds them through the Dependencies panel.
 *
 * Builder-only packages (TypeScript, Vite, type packages) used to live here as
 * devDependency defaults but they are not site runtime packages and should
 * never have leaked into a user's manifest. See the runtime dependencies
 * design doc, "Dependency Semantics".
 */
export const DEFAULT_SITE_PACKAGE_JSON: SitePackageJson = {
  dependencies: {},
  devDependencies: {},
}

export function clonePackageJson(
  packageJson: SitePackageJson = DEFAULT_SITE_PACKAGE_JSON,
): SitePackageJson {
  return {
    dependencies: { ...packageJson.dependencies },
    devDependencies: { ...packageJson.devDependencies },
  }
}

function normalizeDependencyMap(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}

  const normalized: Record<string, string> = {}
  for (const [rawName, rawVersion] of Object.entries(raw as Record<string, unknown>)) {
    const name = rawName.trim()
    const version = typeof rawVersion === 'string' ? rawVersion.trim() : ''
    if (!name || !version || !isSafePackageName(name)) continue
    normalized[name] = version
  }
  return normalized
}

export function normalizeSitePackageJson(raw: unknown): SitePackageJson {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return clonePackageJson()
  }

  // The user manifest is authoritative — we used to spread defaults *over* it,
  // which meant a user could never actually remove a default-listed package
  // (it would silently reappear on every load). Defaults only fill in the
  // entirely-missing case handled above.
  const manifest = raw as Record<string, unknown>
  return {
    dependencies: normalizeDependencyMap(manifest.dependencies),
    devDependencies: normalizeDependencyMap(manifest.devDependencies),
  }
}
