/**
 * UI primitives ownership gate.
 *
 * Reusable editor chrome primitives live in src/ui/components so they can be
 * shared by editor panels, settings, toolbar, and future non-editor surfaces.
 * The old shadcn/Base UI scaffold under src/ui/components/ui is intentionally
 * not used by the app and should not be recreated.
 */

import { describe, expect, it } from 'bun:test'
import { existsSync, readdirSync, readFileSync, statSync } from 'fs'
import { extname, join, relative } from 'path'

const SRC_ROOT = join(import.meta.dir, '../..')
const UI_COMPONENTS_ROOT = join(SRC_ROOT, 'ui/components')
const EDITOR_ROOT = join(SRC_ROOT, 'editor')

const REQUIRED_PRIMITIVES = [
  'Button/Button.tsx',
  'Button/Button.module.css',
  'Input/Input.tsx',
  'Input/Input.module.css',
  'Select/Select.tsx',
  'Select/Select.module.css',
  'Switch/Switch.tsx',
  'Switch/Switch.module.css',
  'Checkbox/Checkbox.tsx',
  'Checkbox/Checkbox.module.css',
  'Separator/Separator.tsx',
  'Separator/Separator.module.css',
  'ColorInput/ColorInput.tsx',
  'ColorInput/ColorInput.module.css',
  'FileUpload/FileUpload.tsx',
  'FileUpload/FileUpload.module.css',
]

function collectTSXFiles(dir: string): string[] {
  const results: string[] = []
  if (!existsSync(dir)) return results

  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) {
      results.push(...collectTSXFiles(full))
    } else if (extname(entry) === '.tsx') {
      results.push(full)
    }
  }

  return results
}

describe('UI primitives location', () => {
  it('keeps reusable primitives in src/ui/components', () => {
    const missing = REQUIRED_PRIMITIVES.filter(
      (file) => !existsSync(join(UI_COMPONENTS_ROOT, file)),
    )

    expect(missing).toEqual([])
  })

  it('does not keep the old editor-local Button primitive', () => {
    expect(existsSync(join(EDITOR_ROOT, 'components/ui/Button/Button.tsx'))).toBe(false)
  })

  it('does not keep unused shadcn-style primitives under src/ui/components/ui', () => {
    expect(existsSync(join(UI_COMPONENTS_ROOT, 'ui'))).toBe(false)
  })

  it('imports shared Button from @ui/components instead of editor-relative paths', () => {
    const violations: string[] = []

    for (const file of collectTSXFiles(EDITOR_ROOT)) {
      const source = readFileSync(file, 'utf-8')
      if (/from ['"].*\/ui\/Button['"]/.test(source)) {
        violations.push(relative(EDITOR_ROOT, file))
      }
    }

    expect(violations).toEqual([])
  })

  it('keeps native color and file inputs inside shared UI components', () => {
    const roots = [join(SRC_ROOT, 'app'), EDITOR_ROOT]
    const violations: string[] = []

    for (const root of roots) {
      for (const file of collectTSXFiles(root)) {
        const source = readFileSync(file, 'utf-8')
        if (/<input[\s\S]*type=["'](?:color|file)["']/.test(source)) {
          violations.push(relative(SRC_ROOT, file))
        }
      }
    }

    expect(violations).toEqual([])
  })
})
