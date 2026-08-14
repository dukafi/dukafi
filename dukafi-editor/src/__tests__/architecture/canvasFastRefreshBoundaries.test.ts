import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'bun:test'

const SRC_ROOT = join(import.meta.dir, '..', '..')

function readSource(path: string): string {
  return readFileSync(join(SRC_ROOT, path), 'utf8')
}

function collectFiles(dir: string): string[] {
  const files: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) files.push(...collectFiles(full))
    else if (entry.endsWith('Editor.tsx')) files.push(full)
  }
  return files
}

describe('Canvas Fast Refresh boundaries', () => {
  it('keeps component modules free of Fast Refresh suppression comments', () => {
    const files = [
      'admin/pages/site/canvas/ModuleSandboxFrame.tsx',
      'admin/pages/site/canvas/NodeRenderer.tsx',
    ]

    for (const file of files) {
      expect(readSource(file)).not.toContain('react-refresh/only-export-components')
    }
  })

  it('keeps NodeRenderer exports limited to React components', () => {
    const source = readSource('admin/pages/site/canvas/NodeRenderer.tsx')

    expect(source).not.toContain('export const CanvasSelectionContext')
    expect(source).not.toContain('export const CanvasBreakpointContext')
    expect(source).not.toContain('export const CanvasTemplateContext')
    expect(source).not.toContain('export function getCanvasNodeClassName')
  })

  it('keeps ModuleSandboxFrame exports limited to React components', () => {
    const source = readSource('admin/pages/site/canvas/ModuleSandboxFrame.tsx')

    expect(source).not.toContain('export function createSandboxSrcDoc')
  })

  it('keeps base module editors independent of registration barrels', () => {
    const editorFiles = collectFiles(join(SRC_ROOT, 'modules/base'))
    expect(editorFiles.length).toBeGreaterThan(0)

    const offenders: string[] = []
    for (const file of editorFiles) {
      const source = readFileSync(file, 'utf8')
      if (/from ['"]\.\/index['"]/.test(source)) {
        offenders.push(file.replace(`${SRC_ROOT}/`, ''))
      }
    }

    expect(offenders).toEqual([])
  })
})
