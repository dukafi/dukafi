/**
 * Vendored Icon Freshness Gate
 *
 * The CMS depends on `pixel-art-icons` via the deep-import shape
 *
 *   import { CheckIcon } from 'pixel-art-icons/icons/check'
 *
 * The full upstream catalog (~4,053 icons) is a private, premium asset and is
 * not redistributed with the public CMS repo. Instead, the CMS carries only
 * the icons it actually imports, vendored as a self-contained npm-shaped
 * package at `vendor/pixel-art-icons/`. The root `package.json` resolves the
 * dependency from there:
 *
 *   "pixel-art-icons": "file:./vendor/pixel-art-icons"
 *
 * This gate prevents that vendored set from drifting out of sync with what
 * the source actually imports. It runs as part of `bun test`, so a missing
 * or orphan vendored icon fails CI loudly with a single fix instruction:
 * run `bun run icons:sync`.
 *
 * It deliberately does NOT need access to the upstream private repo — it
 * only compares imports vs. the vendored output already committed to the CMS
 * repo. That makes the gate runnable on every fresh checkout, including by
 * external contributors who do not (and cannot) have the premium icon
 * catalog locally.
 */

import { describe, it, expect } from 'bun:test'
import { spawnSync } from 'child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'fs'
import { extname, join } from 'path'

const PROJECT_ROOT = join(import.meta.dir, '../../../')
const SRC_DIR = join(PROJECT_ROOT, 'src')
const VENDOR_ICONS_DIR = join(PROJECT_ROOT, 'vendor/pixel-art-icons/icons')
const VENDOR_DIST_ICONS_DIR = join(
  PROJECT_ROOT,
  'vendor/pixel-art-icons/dist/icons',
)
const VENDOR_TYPES_FILE = join(PROJECT_ROOT, 'vendor/pixel-art-icons/types.ts')
const VENDOR_DIST_TYPES_FILE = join(
  PROJECT_ROOT,
  'vendor/pixel-art-icons/dist/types.js',
)
const VENDOR_PACKAGE_JSON = join(
  PROJECT_ROOT,
  'vendor/pixel-art-icons/package.json',
)

const SCAN_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mts', '.mjs'])
const IMPORT_RE = /from\s+["']pixel-art-icons\/icons\/([a-z0-9-]+)["']/g

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const st = statSync(full)
    if (st.isDirectory()) walk(full, out)
    else if (SCAN_EXTS.has(extname(entry))) out.push(full)
  }
  return out
}

function collectImportedIcons(): Set<string> {
  const names = new Set<string>()
  for (const file of walk(SRC_DIR)) {
    const source = readFileSync(file, 'utf8')
    if (!source.includes('pixel-art-icons/icons/')) continue
    let m: RegExpExecArray | null
    IMPORT_RE.lastIndex = 0
    while ((m = IMPORT_RE.exec(source)) !== null) {
      names.add(m[1])
    }
  }
  return names
}

function listVendoredSources(): Set<string> {
  const out = new Set<string>()
  if (!existsSync(VENDOR_ICONS_DIR)) return out
  for (const entry of readdirSync(VENDOR_ICONS_DIR)) {
    if (entry.endsWith('.tsx')) out.add(entry.replace(/\.tsx$/, ''))
  }
  return out
}

function listVendoredDist(): Set<string> {
  const out = new Set<string>()
  if (!existsSync(VENDOR_DIST_ICONS_DIR)) return out
  for (const entry of readdirSync(VENDOR_DIST_ICONS_DIR)) {
    if (entry.endsWith('.js')) out.add(entry.replace(/\.js$/, ''))
  }
  return out
}

function assertNotIgnoredByGit(path: string): void {
  const result = spawnSync('git', ['check-ignore', '--quiet', '--no-index', path], {
    cwd: PROJECT_ROOT,
  })

  if (result.status === 0) {
    throw new Error(
      `[vendor-icons-fresh] ${path} is ignored by .gitignore, so fresh checkouts will miss required icon package files.`,
    )
  }

  if (result.status !== 1) {
    throw new Error(
      `[vendor-icons-fresh] git check-ignore failed for ${path} with exit ${result.status}.`,
    )
  }
}

const FIX_HINT =
  '\n  Fix: run `bun run icons:sync` to refresh vendor/pixel-art-icons/.'

describe('vendor/pixel-art-icons — freshness gate', () => {
  it('vendor package skeleton exists', () => {
    expect(existsSync(VENDOR_PACKAGE_JSON)).toBe(true)
    expect(existsSync(VENDOR_TYPES_FILE)).toBe(true)
    expect(existsSync(VENDOR_DIST_TYPES_FILE)).toBe(true)
  })

  it('vendored built icon package files are not hidden by .gitignore', () => {
    assertNotIgnoredByGit('vendor/pixel-art-icons/dist/types.js')
    assertNotIgnoredByGit('vendor/pixel-art-icons/dist/icons/check.js')
  })

  it('every imported icon has a vendored .tsx source', () => {
    const imported = collectImportedIcons()
    const sources = listVendoredSources()
    const missing = [...imported].filter((n) => !sources.has(n)).sort()

    if (missing.length > 0) {
      throw new Error(
        `[vendor-icons-fresh] ${missing.length} imported icon(s) are missing from vendor/pixel-art-icons/icons/:\n` +
          missing.map((n) => `  - ${n}.tsx`).join('\n') +
          FIX_HINT,
      )
    }
    expect(missing).toHaveLength(0)
  })

  it('every imported icon has a vendored built .js + .d.ts in dist/icons/', () => {
    const imported = collectImportedIcons()
    const missing: string[] = []

    for (const name of imported) {
      const js = join(VENDOR_DIST_ICONS_DIR, `${name}.js`)
      const dts = join(VENDOR_DIST_ICONS_DIR, `${name}.d.ts`)
      if (!existsSync(js) || !existsSync(dts)) missing.push(name)
    }

    if (missing.length > 0) {
      throw new Error(
        `[vendor-icons-fresh] ${missing.length} imported icon(s) are missing built artifacts in vendor/pixel-art-icons/dist/icons/:\n` +
          missing.map((n) => `  - dist/icons/${n}.{js,d.ts}`).join('\n') +
          FIX_HINT,
      )
    }
    expect(missing).toHaveLength(0)
  })

  it('vendor/pixel-art-icons/icons/ contains no orphan icons (every vendored .tsx is imported by src/)', () => {
    const imported = collectImportedIcons()
    const sources = listVendoredSources()
    const orphans = [...sources].filter((n) => !imported.has(n)).sort()

    if (orphans.length > 0) {
      throw new Error(
        `[vendor-icons-fresh] ${orphans.length} orphan icon source(s) in vendor/pixel-art-icons/icons/ (not imported anywhere in src/):\n` +
          orphans.map((n) => `  - ${n}.tsx`).join('\n') +
          FIX_HINT,
      )
    }
    expect(orphans).toHaveLength(0)
  })

  it('vendor/pixel-art-icons/dist/icons/ contains no orphan built files', () => {
    const imported = collectImportedIcons()
    const dist = listVendoredDist()
    const orphans = [...dist].filter((n) => !imported.has(n)).sort()

    if (orphans.length > 0) {
      throw new Error(
        `[vendor-icons-fresh] ${orphans.length} orphan built file(s) in vendor/pixel-art-icons/dist/icons/:\n` +
          orphans.map((n) => `  - dist/icons/${n}.js`).join('\n') +
          FIX_HINT,
      )
    }
    expect(orphans).toHaveLength(0)
  })
})
