/**
 * Footprint benchmark — repo / dependency / source-code surface metrics.
 *
 * Static analysis only — no I/O against running services. Tracks the
 * project's "weight": disk footprint of node_modules, dep count,
 * production vs test SLOC, heaviest source files, etc.
 *
 * Useful for catching:
 *   - Surprise dependency additions (node_modules size grows)
 *   - Test-code growing faster than production
 *   - Source files exceeding ~1000 LOC (a smell)
 */
import { resolve, join } from 'node:path'
import { statSync, readdirSync, existsSync, readFileSync } from 'node:fs'
import type { BenchModule, BenchResult, BenchRow } from '../lib/types'
import { fmtBytes, fmtNum } from '../lib/stats'
import { log } from '../lib/log'

const REPO_ROOT = resolve(import.meta.dir, '../../..')

function dirSize(path: string): { bytes: number; files: number } {
  let bytes = 0
  let files = 0
  const stack = [path]
  while (stack.length) {
    const p = stack.pop()!
    let entries: import('node:fs').Dirent[]
    try {
      entries = readdirSync(p, { withFileTypes: true })
    } catch {
      continue
    }
    for (const ent of entries) {
      const sub = join(p, ent.name)
      try {
        if (ent.isDirectory()) {
          if (ent.name === '.git' || ent.name === 'node_modules') continue
          stack.push(sub)
        } else if (ent.isFile()) {
          bytes += statSync(sub).size
          files++
        }
      } catch {
        // skip
      }
    }
  }
  return { bytes, files }
}

interface SrcStats {
  files: number
  lines: number
}

function srcStats(path: string, exts: readonly string[]): SrcStats {
  let lines = 0
  let files = 0
  const stack = [path]
  while (stack.length) {
    const p = stack.pop()!
    let entries: import('node:fs').Dirent[]
    try {
      entries = readdirSync(p, { withFileTypes: true })
    } catch {
      continue
    }
    for (const ent of entries) {
      const sub = join(p, ent.name)
      if (ent.isDirectory()) {
        stack.push(sub)
      } else if (ent.isFile()) {
        const dotIdx = ent.name.lastIndexOf('.')
        const ext = dotIdx < 0 ? '' : ent.name.slice(dotIdx)
        if (!exts.includes(ext)) continue
        try {
          const contents = readFileSync(sub, 'utf8')
          lines += contents.split('\n').length
          files++
        } catch {
          // skip
        }
      }
    }
  }
  return { files, lines }
}

interface LineFile {
  path: string
  lines: number
}

function findLargestFiles(
  root: string,
  exts: readonly string[],
  excludes: readonly string[],
  topN: number,
): LineFile[] {
  const out: LineFile[] = []
  const stack = [root]
  while (stack.length) {
    const p = stack.pop()!
    let entries: import('node:fs').Dirent[]
    try {
      entries = readdirSync(p, { withFileTypes: true })
    } catch {
      continue
    }
    for (const ent of entries) {
      const sub = join(p, ent.name)
      const rel = sub.slice(REPO_ROOT.length + 1)
      if (excludes.some((e) => rel.startsWith(e))) continue
      if (ent.isDirectory()) {
        stack.push(sub)
      } else if (ent.isFile()) {
        const dotIdx = ent.name.lastIndexOf('.')
        const ext = dotIdx < 0 ? '' : ent.name.slice(dotIdx)
        if (!exts.includes(ext)) continue
        if (rel.includes('.test.') || rel.includes('__tests__/')) continue
        try {
          const lines = readFileSync(sub, 'utf8').split('\n').length
          out.push({ path: rel, lines })
        } catch {
          // skip
        }
      }
    }
  }
  out.sort((a, b) => b.lines - a.lines)
  return out.slice(0, topN)
}

interface NodeModulesStats {
  totalBytes: number
  topLevelEntries: number
  heaviest: Array<{ name: string; bytes: number }>
}

function inspectNodeModules(): NodeModulesStats {
  const path = resolve(REPO_ROOT, 'node_modules')
  if (!existsSync(path)) return { totalBytes: 0, topLevelEntries: 0, heaviest: [] }
  const entries = readdirSync(path)
  let total = 0
  const heaviest: Array<{ name: string; bytes: number }> = []
  for (const name of entries) {
    if (name.startsWith('.')) continue
    const subPath = join(path, name)
    try {
      const stat = statSync(subPath)
      if (!stat.isDirectory()) continue
      // Inside `@scope/`, sum its sub-packages individually
      if (name.startsWith('@')) {
        for (const inner of readdirSync(subPath)) {
          const innerPath = join(subPath, inner)
          try {
            const innerStat = statSync(innerPath)
            if (!innerStat.isDirectory()) continue
            const { bytes } = dirSize(innerPath)
            total += bytes
            heaviest.push({ name: `${name}/${inner}`, bytes })
          } catch {
            // skip
          }
        }
      } else {
        const { bytes } = dirSize(subPath)
        total += bytes
        heaviest.push({ name, bytes })
      }
    } catch {
      // skip
    }
  }
  heaviest.sort((a, b) => b.bytes - a.bytes)
  return { totalBytes: total, topLevelEntries: entries.length, heaviest: heaviest.slice(0, 10) }
}

export const footprintBench: BenchModule = {
  name: 'footprint',
  title: 'Footprint (repo / deps / source)',
  description: 'Disk + line counts. No I/O, just static analysis.',

  async run(): Promise<BenchResult> {
    log.step('Sizing dist/, vendor/, uploads/, .tmp/')
    const dirs = {
      dist: resolve(REPO_ROOT, 'dist'),
      vendor: resolve(REPO_ROOT, 'vendor'),
      uploads: resolve(REPO_ROOT, 'uploads'),
      tmp: resolve(REPO_ROOT, '.tmp'),
    }
    const dirRows: BenchRow[] = []
    for (const [name, path] of Object.entries(dirs)) {
      if (!existsSync(path)) {
        dirRows.push({ label: name, metrics: { size: '—', files: '—' }, notes: 'not present' })
        continue
      }
      const { bytes, files } = dirSize(path)
      dirRows.push({
        label: name,
        metrics: { size: fmtBytes(bytes), files: fmtNum(files) },
      })
    }

    log.step('Counting source lines')
    const srcRows: BenchRow[] = []
    const srcDirs: Array<{ label: string; path: string; exts: readonly string[] }> = [
      { label: 'src/admin', path: resolve(REPO_ROOT, 'src/admin'), exts: ['.ts', '.tsx', '.css'] },
      { label: 'src/editor', path: resolve(REPO_ROOT, 'src/editor'), exts: ['.ts', '.tsx', '.css'] },
      { label: 'src/core', path: resolve(REPO_ROOT, 'src/core'), exts: ['.ts', '.tsx'] },
      { label: 'src/modules', path: resolve(REPO_ROOT, 'src/modules'), exts: ['.ts', '.tsx', '.css'] },
      { label: 'src/ui', path: resolve(REPO_ROOT, 'src/ui'), exts: ['.ts', '.tsx', '.css'] },
      { label: 'src/__tests__', path: resolve(REPO_ROOT, 'src/__tests__'), exts: ['.ts', '.tsx'] },
      { label: 'server', path: resolve(REPO_ROOT, 'server'), exts: ['.ts'] },
      { label: 'scripts', path: resolve(REPO_ROOT, 'scripts'), exts: ['.ts'] },
      { label: 'examples', path: resolve(REPO_ROOT, 'examples'), exts: ['.ts', '.tsx'] },
    ]
    let prodLines = 0
    let testLines = 0
    for (const d of srcDirs) {
      if (!existsSync(d.path)) continue
      const stats = srcStats(d.path, d.exts)
      srcRows.push({
        label: d.label,
        metrics: { files: fmtNum(stats.files), lines: fmtNum(stats.lines) },
      })
      if (d.label === 'src/__tests__') testLines += stats.lines
      else prodLines += stats.lines
    }
    srcRows.push({
      label: 'TOTAL production',
      metrics: { files: '', lines: fmtNum(prodLines) },
    })
    srcRows.push({
      label: 'TOTAL test',
      metrics: { files: '', lines: fmtNum(testLines) },
      notes: `test:prod ratio ≈ ${(testLines / Math.max(prodLines, 1)).toFixed(2)}:1`,
    })

    log.step('Largest single source files')
    const largest = findLargestFiles(
      resolve(REPO_ROOT, 'src'),
      ['.ts', '.tsx'],
      ['src/__tests__', 'src/styles'],
      10,
    )
    const largestServer = findLargestFiles(
      resolve(REPO_ROOT, 'server'),
      ['.ts'],
      [],
      10,
    )
    const bigFileRows: BenchRow[] = [...largest, ...largestServer]
      .sort((a, b) => b.lines - a.lines)
      .slice(0, 10)
      .map((f) => ({ label: f.path, metrics: { lines: fmtNum(f.lines) } }))

    log.step('Sizing node_modules')
    const nm = inspectNodeModules()
    const nmRows: BenchRow[] = [
      {
        label: 'node_modules',
        metrics: { size: fmtBytes(nm.totalBytes), top_level_entries: fmtNum(nm.topLevelEntries) },
      },
      ...nm.heaviest.map((h) => ({
        label: h.name,
        metrics: { size: fmtBytes(h.bytes) },
      })),
    ]

    // Package metadata
    const pkg = JSON.parse(readFileSync(resolve(REPO_ROOT, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
    }
    const runtimeDeps = Object.keys(pkg.dependencies ?? {}).length
    const devDeps = Object.keys(pkg.devDependencies ?? {}).length
    const depRow: BenchRow = {
      label: 'package.json deps',
      metrics: {
        runtime: fmtNum(runtimeDeps),
        dev: fmtNum(devDeps),
        total_declared: fmtNum(runtimeDeps + devDeps),
      },
    }

    return {
      name: this.name,
      title: this.title,
      headline: {
        'node_modules': fmtBytes(nm.totalBytes),
        'src + server LOC': fmtNum(prodLines),
        'test LOC': fmtNum(testLines),
      },
      sections: [
        { title: 'Build artifacts + sibling dirs', rows: dirRows },
        { title: 'Declared dependencies', rows: [depRow] },
        { title: 'node_modules — heaviest top-level packages', rows: nmRows },
        { title: 'Source line counts', rows: srcRows },
        { title: 'Largest single source files (production)', rows: bigFileRows },
      ],
    }
  },
}
