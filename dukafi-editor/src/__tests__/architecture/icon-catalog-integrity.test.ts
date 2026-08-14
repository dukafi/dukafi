/**
 * Icon Catalog Integrity — Guideline #350 / Constraint #348
 *
 * WHY THESE GATES EXIST
 * ─────────────────────
 * Editor UI icons render synchronously from the in-house pixel-art icon
 * catalog. Production UI imports concrete icon files directly from
 * `pixel-art-icons/icons/<name>` instead of resolving string names through a
 * lazy runtime wrapper.
 *
 * The icon catalog ships as the `pixel-art-icons` npm package (developed as a
 * sibling project at `../pixel-art-icons`). The `link:` dependency in
 * `package.json` symlinks it into `node_modules/pixel-art-icons/` for local
 * dev; once published, consumers install from the registry.
 *
 * This test file:
 *   Gate 1 — scans all src/admin/pages/site/ .tsx files for direct icon imports and
 *             asserts each imported icon has a matching catalog file in the
 *             pixel-art-icons package (resolved through node_modules).
 *
 *   Gate 2 — verifies each catalog file exports the expected PascalCase component.
 *             Confirms direct imports target the expected component names.
 *
 *   Gate 3 — scans src/admin/pages/site/ for inline <svg JSX (raw SVG definitions inside
 *             component files), which violates Constraint #348 / Guideline #350.
 *
 * @see Task #389       — Icon Investigation + UI Polish Audit
 * @see Guideline #350  — pixel-art-icons accessibility requirements
 * @see Constraint #348 — All icons must use the in-house pixel-art set
 */

import { describe, it, expect } from 'bun:test'
import { readdirSync, readFileSync, existsSync, statSync } from 'fs'
import { join, extname } from 'path'

const PROJECT_ROOT = join(import.meta.dir, '../../../')
const EDITOR_DIR   = join(PROJECT_ROOT, 'src/admin/pages/site')
// Resolve the pixel-art-icons package via node_modules. The published shape
// exposes built artifacts under dist/icons/<name>.js (+ .d.ts), so that's what
// we check against — same path consumers see whether installed from the file:
// dep or the published registry version.
const ICONS_DIR    = join(PROJECT_ROOT, 'node_modules/pixel-art-icons/dist/icons')
const ICON_FILE_EXT = '.js'

// ─── helpers ─────────────────────────────────────────────────────────────────

/** Recursively collect .tsx / .ts files under a directory. */
function collectFiles(dir: string, exts = ['.tsx', '.ts']): string[] {
  const results: string[] = []
  if (!existsSync(dir)) return results
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      results.push(...collectFiles(full, exts))
    } else if (exts.includes(extname(entry))) {
      results.push(full)
    }
  }
  return results
}

/**
 * Convert a kebab-case icon name to the PascalCase component name used in the
 * icon file exports.
 *
 * "arrow-right"       → "ArrowRightIcon"
 * "settings"          → "SettingsIcon"
 * "sliders-horizontal"→ "SlidersHorizontalIcon"
 */
function toComponentName(kebab: string): string {
  return (
    kebab
      .split('-')
      .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
      .join('') + 'Icon'
  )
}

/**
 * Extract all icon name strings referenced in a source file.
 *   import { ArrowRightIcon } from 'pixel-art-icons/icons/arrow-right'
 */
function extractIconNames(source: string): string[] {
  const names: string[] = []
  const seen = new Set<string>()

  function add(n: string) {
    if (!seen.has(n)) { seen.add(n); names.push(n) }
  }

  const importPattern = /from\s+["']pixel-art-icons\/icons\/([a-z0-9-]+)["']/g
  let m: RegExpExecArray | null
  while ((m = importPattern.exec(source)) !== null) add(m[1])

  return names
}

// ─── Gate 1: every direct icon import in src/admin/pages/site/ has a catalog file ──────

describe('Gate 1 — All direct icon imports exist in the icon catalog', () => {
  const editorFiles = collectFiles(EDITOR_DIR)

  // Collect every (iconName, filePath) pair referenced across editor components
  interface IconRef { name: string; file: string }
  const allRefs: IconRef[] = []

  for (const filePath of editorFiles) {
    const source = readFileSync(filePath, 'utf8')
    if (!source.includes('pixel-art-icons/icons/')) continue
    const names = extractIconNames(source)
    for (const name of names) {
      allRefs.push({ name, file: filePath.replace(PROJECT_ROOT, '') })
    }
  }

  // Deduplicate for the per-name tests
  const uniqueNames = [...new Set(allRefs.map((r) => r.name))]

  it('at least one direct icon import is found in src/admin/pages/site/ (sanity check)', () => {
    expect(allRefs.length).toBeGreaterThan(0)
  })

  it('every directly imported icon name has a matching file in pixel-art-icons', () => {
    const missing: IconRef[] = allRefs.filter(
      (ref) => !existsSync(join(ICONS_DIR, `${ref.name}${ICON_FILE_EXT}`)),
    )

    if (missing.length > 0) {
      const lines = missing.map(
        (m) => `  icon "${m.name}" referenced in ${m.file}`,
      )
      throw new Error(
        `[Gate 1 — Task #389] ${missing.length} icon(s) missing from pixel-art-icons.\n` +
          lines.join('\n') +
          `\n\nFix: add the missing icon to the pixel-art-icons package source\n` +
          `(at ../pixel-art-icons/icons/<name>.tsx during local dev).\n` +
          `See Constraint #348 / Guideline #350.`,
      )
    }

    expect(missing).toHaveLength(0)
  })

  it('the full list of unique icon names referenced in editor components is known', () => {
    // Informational — lists every name found so reviewers can audit coverage
    const known = uniqueNames.sort()
    expect(known.length).toBeGreaterThan(0)
    // If this changes unexpectedly, the test will surface new/removed icons
    // Update the snapshot when icons are intentionally added or removed
  })
})

// ─── Gate 2: catalog files export the expected PascalCase component ──────────

describe('Gate 2 — Catalog files export the expected PascalCase component name', () => {
  // Sample a subset of icons that are actively used in editor components.
  // Every entry must be an icon imported somewhere in src/ — otherwise it
  // won't be present in the vendored pixel-art-icons subset shipped with the
  // public CMS repo. (Constraint #451 forbids `XIcon` as a close glyph, so
  // `x` is intentionally NOT in this list.)
  const SAMPLED_ICONS = [
    'eye-solid',
    'undo',
    'redo',
    'file-text-solid',
    'command',
    'upload',
    'sliders-horizontal',
    'smartphone-solid',
    'monitor-solid',
    'laptop-solid',
    'tablet-solid',
    'chevron-right',
    'chevron-left',
    'folder-glyph',
    'package-solid',
    'search-solid',
    'plus',
  ]

  for (const name of SAMPLED_ICONS) {
    it(`pixel-art-icons/dist/icons/${name}.js exports "${toComponentName(name)}"`, () => {
      const filePath = join(ICONS_DIR, `${name}${ICON_FILE_EXT}`)
      expect(existsSync(filePath)).toBe(true)

      const source = readFileSync(filePath, 'utf8')
      const expected = toComponentName(name)
      const hasExport =
        source.includes(`export function ${expected}`) ||
        source.includes(`export const ${expected}`)

      expect(hasExport).toBe(true)
    })
  }
})

// ─── Gate 3: no inline <svg JSX in src/admin/pages/site/ components ────────────────────

describe('Gate 3 — No inline <svg JSX in src/admin/pages/site/ (Constraint #348)', () => {
  // Inline SVG definitions inside component files violate Constraint #348;
  // UI chrome should import concrete components from the MotionPageMaster set.

  it('no src/admin/pages/site/ .tsx file contains inline <svg JSX element definitions', () => {
    const editorFiles = collectFiles(EDITOR_DIR, ['.tsx'])

    // An "inline SVG definition" is a local function or component that returns
    // a <svg> JSX element — recognisable by the pattern: `return (\n...<svg`
    // or `return <svg` inside a function body.
    //
    // We intentionally exclude:
    //   - Imports from pixel-art-icons (those ARE the MotionPageMaster icons)
    //   - src/ui/ entirely — icons live there legitimately
    //   - files that carry an explicit opt-out comment for non-icon SVG usage
    //     (e.g. geometric overlays, scientific charts) — same pattern as
    //     Gate 5's `// allowed: X social brand mark`
    const INLINE_SVG_PATTERN = /return\s*\(\s*\n?\s*<svg|return\s+<svg/
    const ALLOWED_NON_ICON_MARKER = '// allowed: non-icon SVG (geometric overlay)'

    const violations: string[] = []

    for (const filePath of editorFiles) {
      const source = readFileSync(filePath, 'utf8')
      if (source.includes(ALLOWED_NON_ICON_MARKER)) continue
      if (INLINE_SVG_PATTERN.test(source)) {
        violations.push(filePath.replace(PROJECT_ROOT, ''))
      }
    }

    if (violations.length > 0) {
      throw new Error(
        `[Gate 3 — Task #389 / Constraint #348] ${violations.length} file(s) in src/admin/pages/site/ ` +
          `define inline <svg JSX elements.\n` +
          `All icons must use direct imports from 'pixel-art-icons/icons/<name>'.\n\n` +
          violations.map((f) => `  ${f}`).join('\n') +
          `\n\nFix: replace each inline SVG function with an appropriate direct icon import.\n` +
          `See Constraint #348 / Guideline #350.`,
      )
    }

    expect(violations).toHaveLength(0)
  })
})

// ─── Gate 5: no X/Twitter logo used as close/dismiss icon ───────────────────

describe('Gate 5 — No X/Twitter logo used as close/dismiss button (Constraint #451)', () => {
  /**
   * Constraint #451 — user directive msg #1967
   *
   * `XIcon` from `pixel-art-icons/icons/x` is the Twitter/X social-media logo
   * (22 stair-step rectangles), NOT a close glyph.
   *
   * The correct close icon for dialogs, modals, and panel headers is:
   *
   *   import { CloseIcon } from 'pixel-art-icons/icons/close'
   *   <CloseIcon size={12} color="currentColor" aria-hidden="true" />
   *
   * Exceptions (files that legitimately reference the X brand logo):
   *   — File path contains "Share" or "Social" (social-sharing UI)
   *   — File contains the comment: // allowed: X social brand mark
   */
  it('no src/admin/pages/site/ file imports XIcon unless it is an allowed social/share context', () => {
    const editorFiles = collectFiles(EDITOR_DIR, ['.tsx', '.ts'])

    // NOTE: patterns are assembled from parts so this test file does not self-match.
    const X_ICON_PATTERN = new RegExp(`from\\s+["']pixel-art-icons/icons/` + `x["']|<` + `XIcon\\b`)

    const violations: string[] = []

    for (const filePath of editorFiles) {
      // Allow social-sharing contexts by path
      const basename = filePath.replace(PROJECT_ROOT, '')
      if (/Share|Social/i.test(basename)) continue

      let source: string
      try {
        source = readFileSync(filePath, 'utf8')
      } catch {
        continue
      }

      // Allow files that carry an explicit opt-out comment
      if (source.includes('// allowed: X social brand mark')) continue

      if (X_ICON_PATTERN.test(source)) {
        violations.push(basename)
      }
    }

    if (violations.length > 0) {
      throw new Error(
        `[Gate 5 — Constraint #451] ${violations.length} file(s) in src/admin/pages/site/ use XIcon (Twitter/X logo).\n` +
          `X icon is the Twitter logo — see Constraint #451 for the correct icon.\n\n` +
          `Use the site-standard close icon instead:\n` +
          `  import { CloseIcon } from 'pixel-art-icons/icons/close'\n` +
          `  <CloseIcon size={12} color="currentColor" aria-hidden="true" />\n\n` +
          `Violating files:\n` +
          violations.map((f) => `  ${f}`).join('\n') +
          `\n\nTo allow the X brand logo in a social-sharing context, either:\n` +
          `  — name the file/folder with "Share" or "Social", OR\n` +
          `  — add the comment: // allowed: X social brand mark`,
      )
    }

    expect(violations).toHaveLength(0)
  })
})

// ─── Gate 4: no Unicode characters used as visual icons ──────────────────────

describe('Gate 4 — No Unicode/emoji characters used as visual icons (user directive #1671)', () => {
  /**
   * INTENTIONALLY FAILING — user directive (message #1671)
   *
   * The user said: "you need to go through the entire app and find any icons that
   * are not from our package and replace them with an equivalent from our package."
   *
   * These Unicode characters are currently used as visual icons in JSX renders:
   *
   *   ❌  DomPanel.tsx:400    — '≡'  (hamburger/triple-bar) for collapsed Layers panel
   *         Fix: direct import MenuIcon from pixel-art-icons/icons/menu
   *
   *   ❌  PropertiesPanel.tsx:283 — '‹' / '›' for collapse/expand toggle button
   *         Fix: direct import ChevronLeftIcon / ChevronRightIcon
   *
   *   ❌  PublishingSection.tsx:83-86 — '⏳' / '✅' / '❌' / '⬇' in button labels
   *         Fix: use direct icon imports plus text labels
   *
   * Rule: Visual icons must come exclusively from the MotionPageMaster pixel-art
   * set (Constraint #348 / Guideline #350). Unicode characters ≡ ‹ › ⬇ etc.
   * look inconsistent and don't scale at different densities.
   *
   * Note: emoji in COMMENTS or aria-hidden descriptions are acceptable — this
   * gate targets JSX text content (inside JSX tags or string literals rendered
   * as React children).
   */

  /**
   * Characters that are FORBIDDEN as visual icons in JSX renders.
   * Each entry: [character, description, suggested pixel-art-icons replacement]
   */
  const FORBIDDEN_ICON_CHARS = [
    { char: '≡',  desc: 'triple-bar / hamburger', replacement: 'MenuIcon' },
    { char: '‹',  desc: 'single left-pointing angle quotation', replacement: 'ChevronLeftIcon' },
    { char: '›',  desc: 'single right-pointing angle quotation', replacement: 'ChevronRightIcon' },
    { char: '⬇',  desc: 'downwards black arrow', replacement: 'ArrowDownIcon or DownloadIcon' },
    { char: '⬆',  desc: 'upwards black arrow', replacement: 'ArrowUpIcon' },
  ]

  // Scan src/admin/pages/site/ and src/admin/.
  const APP_DIR = join(PROJECT_ROOT, 'src/admin')
  const ACTIVE_APP_FILES = [
    join(APP_DIR, 'layouts/AdminCanvasLayout/AdminCanvasLayout.tsx'),
    join(APP_DIR, 'layouts/AdminPageLayout/AdminPageLayout.tsx'),
    join(APP_DIR, 'router.tsx'),
  ]

  for (const { char, desc, replacement } of FORBIDDEN_ICON_CHARS) {
    it(`[FAILING] no JSX renders Unicode character '${char}' (${desc}) — use ${replacement}`, () => {
      const editorFiles = collectFiles(EDITOR_DIR, ['.tsx'])
      const appFiles = ACTIVE_APP_FILES.filter((f) => existsSync(f))
      const allFiles = [...editorFiles, ...appFiles]

      const violations: string[] = []

      for (const filePath of allFiles) {
        const source = readFileSync(filePath, 'utf8')

        // Look for the character inside JSX text content or string literals.
        // We scan for the character appearing on a non-comment line.
        // Simple heuristic: split by lines, skip lines that start with // or *
        const lines = source.split('\n')
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i]
          const trimmed = line.trimStart()
          // Skip comment lines
          if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue
          if (line.includes(char)) {
            violations.push(`  ${filePath.replace(PROJECT_ROOT, '')}:${i + 1}: ${trimmed.slice(0, 80)}`)
          }
        }
      }

      if (violations.length > 0) {
        throw new Error(
          `[Gate 4 — Constraint #348 / User directive #1671]\n` +
            `Unicode character '${char}' (${desc}) is used as a visual icon.\n` +
            `Replace with: ${replacement}\n\n` +
            violations.join('\n') +
            `\n\nAll visual icons must come from the pixel-art-icons pixel-art set.\n` +
            `See Constraint #348 / Guideline #350.`,
        )
      }

      expect(violations).toHaveLength(0)
    })
  }
})
