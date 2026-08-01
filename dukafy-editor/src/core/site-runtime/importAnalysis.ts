import type { SiteFile } from '@core/files/schemas'
import type { SitePackageJson } from '@core/site-dependencies/manifest'
import { isSafePackageName } from '@core/site-dependencies/packageNames'
import type {
  RuntimeImportKind,
  RuntimeImportSpecifier,
  RuntimePackageDependencyUsage,
  RuntimeScriptImportAnalysis,
  SiteRuntimeDiagnostic,
} from './schemas'

const NODE_BUILTIN_PACKAGES = new Set([
  'assert',
  'buffer',
  'child_process',
  'cluster',
  'crypto',
  'dns',
  'events',
  'fs',
  'http',
  'https',
  'module',
  'net',
  'os',
  'path',
  'process',
  'stream',
  'tls',
  'url',
  'util',
  'vm',
  'worker_threads',
  'zlib',
])

function isIdentifierStart(char: string | undefined): boolean {
  return typeof char === 'string' && /[A-Za-z_$]/.test(char)
}

function isIdentifierPart(char: string | undefined): boolean {
  return typeof char === 'string' && /[A-Za-z0-9_$]/.test(char)
}

function isKeywordAt(source: string, index: number, keyword: string): boolean {
  if (!source.startsWith(keyword, index)) return false
  return !isIdentifierPart(source[index - 1]) && !isIdentifierPart(source[index + keyword.length])
}

function skipWhitespace(source: string, index: number): number {
  let i = index
  while (i < source.length && /\s/.test(source[i])) i += 1
  return i
}

function readIdentifier(source: string, index: number): { value: string; end: number } | null {
  if (!isIdentifierStart(source[index])) return null
  let end = index + 1
  while (end < source.length && isIdentifierPart(source[end])) end += 1
  return { value: source.slice(index, end), end }
}

function skipLineComment(source: string, index: number): number {
  const end = source.indexOf('\n', index + 2)
  return end === -1 ? source.length : end + 1
}

function skipBlockComment(source: string, index: number): number {
  const end = source.indexOf('*/', index + 2)
  return end === -1 ? source.length : end + 2
}

function readQuotedString(source: string, index: number): { value: string; end: number } | null {
  const quote = source[index]
  if (quote !== '"' && quote !== "'") return null

  let value = ''
  let i = index + 1
  while (i < source.length) {
    const char = source[i]
    if (char === '\\') {
      if (i + 1 < source.length) value += source[i + 1]
      i += 2
      continue
    }
    if (char === quote) return { value, end: i + 1 }
    value += char
    i += 1
  }

  return null
}

function skipTemplate(source: string, index: number): number {
  let i = index + 1
  while (i < source.length) {
    if (source[i] === '\\') {
      i += 2
      continue
    }
    if (source[i] === '`') return i + 1
    i += 1
  }
  return source.length
}

function skipNonCode(source: string, index: number): number | null {
  const char = source[index]
  const next = source[index + 1]
  if (char === '/' && next === '/') return skipLineComment(source, index)
  if (char === '/' && next === '*') return skipBlockComment(source, index)
  if (char === '"' || char === "'") return readQuotedString(source, index)?.end ?? source.length
  if (char === '`') return skipTemplate(source, index)
  return null
}

function readFirstStringBeforeStatementEnd(
  source: string,
  index: number,
): { value: string; start: number; end: number } | null {
  let i = index
  while (i < source.length) {
    const skipped = skipNonCode(source, i)
    if (skipped !== null) {
      const quoted = readQuotedString(source, i)
      if (quoted) return { value: quoted.value, start: i, end: quoted.end }
      i = skipped
      continue
    }

    const char = source[i]
    if (char === ';') return null
    i += 1
  }
  return null
}

function readStringAfterFrom(source: string, index: number): { value: string; start: number; end: number } | null {
  let i = index
  while (i < source.length) {
    const skipped = skipNonCode(source, i)
    if (skipped !== null) {
      i = skipped
      continue
    }
    if (source[i] === ';') return null
    if (isKeywordAt(source, i, 'from')) {
      const literalStart = skipWhitespace(source, i + 'from'.length)
      const literal = readQuotedString(source, literalStart)
      return literal ? { value: literal.value, start: literalStart, end: literal.end } : null
    }
    i += 1
  }
  return null
}

function readDynamicImport(source: string, index: number): RuntimeImportSpecifier | null {
  let i = skipWhitespace(source, index + 'import'.length)
  if (source[i] === '.') return null
  if (source[i] !== '(') return null

  i = skipWhitespace(source, i + 1)
  const literal = readQuotedString(source, i)
  if (!literal) return null

  return {
    specifier: literal.value,
    kind: 'dynamic',
    start: i,
    end: literal.end,
  }
}

function readStaticImport(source: string, index: number): RuntimeImportSpecifier | null {
  const i = skipWhitespace(source, index + 'import'.length)
  if (source[i] === '.' || source[i] === '(') return null
  const firstToken = readIdentifier(source, i)
  if (firstToken?.value === 'type') return null

  const literal = readFirstStringBeforeStatementEnd(source, i)
  if (!literal) return null

  return {
    specifier: literal.value,
    kind: 'static',
    start: literal.start,
    end: literal.end,
  }
}

function readReexport(source: string, index: number): RuntimeImportSpecifier | null {
  const i = skipWhitespace(source, index + 'export'.length)
  const firstToken = readIdentifier(source, i)
  if (firstToken?.value === 'type') return null

  const literal = readStringAfterFrom(source, i)
  if (!literal) return null

  return {
    specifier: literal.value,
    kind: 'reexport',
    start: literal.start,
    end: literal.end,
  }
}

export function extractRuntimeImportSpecifiers(source: string): RuntimeImportSpecifier[] {
  const imports: RuntimeImportSpecifier[] = []
  let i = 0

  while (i < source.length) {
    const skipped = skipNonCode(source, i)
    if (skipped !== null) {
      i = skipped
      continue
    }

    if (isKeywordAt(source, i, 'import')) {
      const dynamicImport = readDynamicImport(source, i)
      const staticImport = dynamicImport ?? readStaticImport(source, i)
      if (staticImport) {
        imports.push(staticImport)
        i = staticImport.end
        continue
      }
    }

    if (isKeywordAt(source, i, 'export')) {
      const reexport = readReexport(source, i)
      if (reexport) {
        imports.push(reexport)
        i = reexport.end
        continue
      }
    }

    i += 1
  }

  return imports
}

export function packageNameFromImportSpecifier(specifier: string): string | null {
  if (!specifier || specifier.startsWith('.') || specifier.startsWith('/') || specifier.startsWith('#')) {
    return null
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(specifier)) return null

  const parts = specifier.split('/').filter(Boolean)
  if (specifier.startsWith('@')) {
    return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : specifier
  }
  return parts[0] ?? null
}

function isNodeBuiltinImportSpecifier(specifier: string): boolean {
  const withoutProtocol = specifier.startsWith('node:') ? specifier.slice('node:'.length) : specifier
  const packageName = packageNameFromImportSpecifier(withoutProtocol) ?? withoutProtocol
  return NODE_BUILTIN_PACKAGES.has(packageName)
}

function importDiagnostic(
  code: string,
  message: string,
  severity: SiteRuntimeDiagnostic['severity'],
  file: SiteFile,
  importKind: RuntimeImportKind,
  packageName?: string,
): SiteRuntimeDiagnostic {
  return {
    code,
    severity,
    message: `${message} (${importKind} import in ${file.path})`,
    fileId: file.id,
    path: file.path,
    packageName,
  }
}

function addUsage(
  usage: Map<string, RuntimePackageDependencyUsage>,
  packageName: string,
  specifier: string,
  requestedVersion: string | null,
  file: SiteFile,
): void {
  const current = usage.get(packageName)
  if (current) {
    if (!current.specifiers.includes(specifier)) current.specifiers.push(specifier)
    if (!current.files.some((entry) => entry.fileId === file.id)) {
      current.files.push({ fileId: file.id, path: file.path })
    }
    return
  }

  usage.set(packageName, {
    name: packageName,
    requestedVersion,
    specifiers: [specifier],
    files: [{ fileId: file.id, path: file.path }],
  })
}

export function analyzeRuntimeScriptImports(
  files: SiteFile[],
  packageJson: SitePackageJson,
): RuntimeScriptImportAnalysis {
  const imports: RuntimeImportSpecifier[] = []
  const usage = new Map<string, RuntimePackageDependencyUsage>()
  const diagnostics: SiteRuntimeDiagnostic[] = []

  for (const file of files) {
    if (file.type !== 'script' || typeof file.content !== 'string') continue

    for (const importEntry of extractRuntimeImportSpecifiers(file.content)) {
      imports.push(importEntry)
      if (isNodeBuiltinImportSpecifier(importEntry.specifier)) {
        diagnostics.push(importDiagnostic(
          'runtime-dependency-node-builtin',
          `Node builtin "${importEntry.specifier}" cannot be imported by browser runtime scripts`,
          'error',
          file,
          importEntry.kind,
          importEntry.specifier,
        ))
        continue
      }

      const packageName = packageNameFromImportSpecifier(importEntry.specifier)
      if (!packageName) {
        if (/^[a-z][a-z0-9+.-]*:/i.test(importEntry.specifier)) {
          diagnostics.push(importDiagnostic(
            'runtime-dependency-external-url',
            `External runtime import "${importEntry.specifier}" is not self-hosted`,
            'warning',
            file,
            importEntry.kind,
          ))
        }
        continue
      }

      if (!isSafePackageName(packageName)) {
        diagnostics.push(importDiagnostic(
          'runtime-dependency-invalid-name',
          `Invalid runtime package name "${packageName}"`,
          'error',
          file,
          importEntry.kind,
          packageName,
        ))
        continue
      }

      const runtimeVersion = packageJson.dependencies[packageName] ?? null
      const devVersion = packageJson.devDependencies[packageName] ?? null
      addUsage(usage, packageName, importEntry.specifier, runtimeVersion ?? devVersion, file)

      if (runtimeVersion) continue
      if (devVersion) {
        diagnostics.push(importDiagnostic(
          'runtime-dependency-dev-only',
          `Package "${packageName}" is declared as a dev dependency but is imported by a runtime script`,
          'error',
          file,
          importEntry.kind,
          packageName,
        ))
        continue
      }

      diagnostics.push(importDiagnostic(
        'runtime-dependency-missing',
        `Package "${packageName}" is imported by a runtime script but is not declared in dependencies`,
        'error',
        file,
        importEntry.kind,
        packageName,
      ))
    }
  }

  return { imports, usage, diagnostics }
}
