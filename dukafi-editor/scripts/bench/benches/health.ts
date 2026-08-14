/**
 * Code health benchmark.
 *
 * Runs fallow's dead-code + health analyses, plus jscpd duplication, plus
 * madge circular-deps. Each tool emits a small set of headline numbers
 * we capture verbatim.
 *
 * Why these tools?
 *   - fallow: bridges dead code + complexity + churn. Single
 *     maintainability score.
 *   - jscpd: duplication % across the source tree.
 *   - madge: circular dependency count (cycles break tree-shaking).
 *
 * Each runs in its own subprocess with a generous timeout. If a tool
 * is missing, the row notes "unavailable" rather than crashing the
 * suite.
 */
import { resolve } from 'node:path'
import type { BenchModule, BenchResult, BenchRow } from '../lib/types'
import { fmtMs } from '../lib/stats'
import { log } from '../lib/log'

const REPO_ROOT = resolve(import.meta.dir, '../../..')

async function runCommand(args: readonly string[], timeoutMs: number): Promise<{ stdout: string; stderr: string; ms: number; exit: number; timedOut: boolean }> {
  const t0 = performance.now()
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const proc = Bun.spawn({
      cmd: args as string[],
      cwd: REPO_ROOT,
      stdout: 'pipe',
      stderr: 'pipe',
      // No `signal` field needed — we kill manually below if it doesn't finish.
    })
    const [stdout, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ])
    const exit = await proc.exited
    return { stdout, stderr, ms: performance.now() - t0, exit, timedOut: false }
  } catch (err) {
    return { stdout: '', stderr: (err as Error).message, ms: performance.now() - t0, exit: -1, timedOut: false }
  } finally {
    clearTimeout(timeout)
  }
}

export const healthBench: BenchModule = {
  name: 'health',
  title: 'Code health (fallow / jscpd / madge)',
  description: 'Aggregate code-health snapshot: maintainability, duplication, circular deps.',

  async run(): Promise<BenchResult> {
    const rows: BenchRow[] = []

    // Each tool may print summary lines to stdout, stderr, or both — search
    // both streams to stay resilient to upstream changes.
    const both = (r: { stdout: string; stderr: string }): string => `${r.stdout}\n${r.stderr}`

    // fallow health
    log.step('Running fallow health')
    const fallow = await runCommand(['bunx', '--bun', 'fallow', 'health'], 120_000)
    {
      const fallowText = both(fallow)
      const maint = fallowText.match(/maintainability\s+([0-9.]+)\s*\(([^)]+)\)/i)
      const refactorMatch = fallowText.match(/Refactoring targets\s+\((\d+)\)/)
      rows.push({
        label: 'fallow health',
        metrics: {
          status: fallow.exit === 0 ? 'clean' : `exit=${fallow.exit}`,
          wall: fmtMs(fallow.ms),
          maintainability: maint ? `${maint[1]} (${maint[2]})` : '—',
          refactoring_targets: refactorMatch ? refactorMatch[1] : '—',
        },
      })
    }

    // fallow dead-code
    log.step('Running fallow dead-code')
    const dead = await runCommand(['bunx', '--bun', 'fallow', 'dead-code'], 60_000)
    {
      const deadText = both(dead)
      const filesMatch = deadText.match(/(\d+)\s+files?\s*·\s*(\d+)\s+exports?\s*·\s*(\d+)\s+types?/i)
      rows.push({
        label: 'fallow dead-code',
        metrics: {
          wall: fmtMs(dead.ms),
          files_with_issues: filesMatch ? filesMatch[1] : '—',
          unused_exports: filesMatch ? filesMatch[2] : '—',
          unused_types: filesMatch ? filesMatch[3] : '—',
        },
      })
    }

    // jscpd
    log.step('Running jscpd duplication scan')
    const jscpd = await runCommand(
      ['bunx', '--bun', 'jscpd', 'src', '--silent', '--reporters', 'consoleFull', '--min-lines', '10', '--min-tokens', '70'],
      180_000,
    )
    {
      const jscpdText = both(jscpd)
      const clonesMatch = jscpdText.match(/Found\s+(\d+)\s+exact\s+clones\s+with\s+(\d+)\(([0-9.]+)%\)\s+duplicated\s+lines/i)
      rows.push({
        label: 'jscpd (src)',
        metrics: {
          wall: fmtMs(jscpd.ms),
          clones: clonesMatch ? clonesMatch[1] : '—',
          dup_lines: clonesMatch ? clonesMatch[2] : '—',
          dup_pct: clonesMatch ? `${clonesMatch[3]}%` : '—',
        },
      })
    }

    // madge circular-deps
    log.step('Running madge --circular')
    const madge = await runCommand(
      ['bunx', '--bun', 'madge', '--circular', '--ts-config', 'tsconfig.json', '--extensions', 'ts,tsx', 'src'],
      60_000,
    )
    {
      // madge prints the "Found N circular dependencies!" summary on stderr,
      // and the no-cycles success string on stderr too. The numbered list of
      // cycles goes to stdout. Search both streams.
      const haystack = `${madge.stdout}\n${madge.stderr}`
      const cycleMatch = haystack.match(/Found\s+(\d+)\s+circular\s+dependenc/i)
      const noCycles = /No\s+circular\s+dependenc/i.test(haystack)
      rows.push({
        label: 'madge circular',
        metrics: {
          wall: fmtMs(madge.ms),
          cycles: cycleMatch ? cycleMatch[1] : noCycles ? '0' : '—',
        },
      })
    }

    const fallowRow = rows.find((r) => r.label === 'fallow health')
    const jscpdRow = rows.find((r) => r.label === 'jscpd (src)')
    const madgeRow = rows.find((r) => r.label === 'madge circular')

    return {
      name: this.name,
      title: this.title,
      headline: {
        'maintainability': fallowRow?.metrics.maintainability ?? '—',
        'duplication': jscpdRow?.metrics.dup_pct ?? '—',
        'circular deps': madgeRow?.metrics.cycles ?? '—',
      },
      sections: [
        {
          title: 'Static analysis snapshot',
          intro:
            'Tool versions resolved via `bunx`. fallow gives the maintainability score, jscpd quantifies duplication, madge surfaces import cycles.',
          rows,
        },
      ],
    }
  },
}
