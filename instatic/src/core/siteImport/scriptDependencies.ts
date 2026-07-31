import { extractRuntimeImportSpecifiers } from '@core/site-runtime'
import { isSafePackageName } from '@core/site-dependencies/packageNames'
import type { ImportScriptDependency } from './types'

interface ScriptDependencyRewrite {
  content: string
  dependencies: ImportScriptDependency[]
}

interface NpmCdnSpecifier {
  packageName: string
  version: string
  importSpecifier: string
}

export function rewriteNpmCdnModuleImports(source: string): ScriptDependencyRewrite {
  const imports = extractRuntimeImportSpecifiers(source)
  const dependencies = new Map<string, ImportScriptDependency>()
  const rewrites: Array<{ start: number; end: number; importSpecifier: string }> = []
  let content = source

  for (const importEntry of imports) {
    const normalized = npmCdnSpecifierFromUrl(importEntry.specifier)
    if (!normalized) continue

    const quote = source[importEntry.start]
    if (quote !== '"' && quote !== "'") continue

    rewrites.push({
      start: importEntry.start,
      end: importEntry.end,
      importSpecifier: normalized.importSpecifier,
    })
    if (!dependencies.has(normalized.packageName)) {
      dependencies.set(normalized.packageName, {
        name: normalized.packageName,
        version: normalized.version,
      })
    }
  }

  for (const rewrite of rewrites.reverse()) {
    content =
      content.slice(0, rewrite.start + 1) +
      rewrite.importSpecifier +
      content.slice(rewrite.end - 1)
  }

  return { content, dependencies: [...dependencies.values()] }
}

function npmCdnSpecifierFromUrl(specifier: string): NpmCdnSpecifier | null {
  let url: URL
  try {
    url = new URL(specifier)
  } catch {
    return null
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null

  const host = url.hostname.toLowerCase()
  let pathname: string
  try {
    pathname = decodeURIComponent(url.pathname)
  } catch {
    return null
  }
  const rawParts = pathname.split('/').filter(Boolean)
  const parts = host === 'esm.sh' && /^v\d+$/.test(rawParts[0] ?? '')
    ? rawParts.slice(1)
    : rawParts

  if (host === 'esm.sh' || host === 'esm.run') {
    return npmSpecifierFromPackagePath(parts)
  }

  if (host === 'cdn.jsdelivr.net' && parts[0] === 'npm') {
    return npmSpecifierFromPackagePath(parts.slice(1))
  }

  if (host === 'unpkg.com') {
    return npmSpecifierFromPackagePath(parts)
  }

  return null
}

function npmSpecifierFromPackagePath(parts: string[]): NpmCdnSpecifier | null {
  if (parts.length === 0) return null

  const parsed = parts[0]!.startsWith('@')
    ? parseScopedPackage(parts)
    : parsePackageToken(parts[0]!)
  if (!parsed || !isSafePackageName(parsed.packageName)) return null

  const subpath = parts.slice(parsed.consumedParts).join('/')
  const importSpecifier = subpath ? `${parsed.packageName}/${subpath}` : parsed.packageName
  return {
    packageName: parsed.packageName,
    version: parsed.version || '*',
    importSpecifier,
  }
}

function parseScopedPackage(
  parts: string[],
): { packageName: string; version: string; consumedParts: number } | null {
  if (parts.length < 2) return null

  const scope = parts[0]!
  const nameToken = parts[1]!
  const versionIndex = nameToken.lastIndexOf('@')
  if (versionIndex <= 0) {
    return { packageName: `${scope}/${nameToken}`, version: '', consumedParts: 2 }
  }

  return {
    packageName: `${scope}/${nameToken.slice(0, versionIndex)}`,
    version: nameToken.slice(versionIndex + 1),
    consumedParts: 2,
  }
}

function parsePackageToken(token: string): { packageName: string; version: string; consumedParts: number } | null {
  const versionIndex = token.lastIndexOf('@')
  if (versionIndex <= 0) return { packageName: token, version: '', consumedParts: 1 }
  return {
    packageName: token.slice(0, versionIndex),
    version: token.slice(versionIndex + 1),
    consumedParts: 1,
  }
}
