/**
 * Renders an array of BenchResult into a single markdown report.
 *
 * Layout:
 *   # Instatic — Benchmark Report
 *   ## Headline numbers (one-line summary of every bench)
 *   ## <bench title>            (one section per bench)
 *      <highlights bullets>
 *      ### <section title>
 *      | tabular results |
 *
 * The renderer keeps zero domain knowledge of any individual bench —
 * each module supplies its own labels, units, and notes via BenchRow.
 */
import type { BenchResult, BenchRow } from './types'

export function renderReport(
  results: BenchResult[],
  meta: { runAt: Date; durationMs: number; host: string; bun: string },
): string {
  const lines: string[] = []
  lines.push('# Instatic — Benchmark Report')
  lines.push('')
  lines.push(`Run at: ${meta.runAt.toISOString()}`)
  lines.push(`Host: ${meta.host}`)
  lines.push(`Bun: ${meta.bun}`)
  lines.push(`Total wall time: ${(meta.durationMs / 1000).toFixed(1)}s`)
  lines.push('')

  // Headline table
  lines.push('## Headline numbers')
  lines.push('')
  lines.push('| Bench | Metric | Value |')
  lines.push('| --- | --- | --- |')
  for (const r of results) {
    const entries = Object.entries(r.headline)
    if (entries.length === 0) continue
    for (let i = 0; i < entries.length; i++) {
      const [k, v] = entries[i]
      lines.push(`| ${i === 0 ? r.title : ''} | ${k} | ${v} |`)
    }
  }
  lines.push('')

  // Detailed sections
  for (const r of results) {
    lines.push(`## ${r.title}`)
    lines.push('')
    if (r.durationMs !== undefined) {
      lines.push(`_Ran in ${(r.durationMs / 1000).toFixed(1)}s._`)
      lines.push('')
    }
    for (const section of r.sections) {
      lines.push(`### ${section.title}`)
      lines.push('')
      if (section.intro) {
        lines.push(section.intro)
        lines.push('')
      }
      if (section.highlights?.length) {
        for (const h of section.highlights) lines.push(`- ${h}`)
        lines.push('')
      }
      if (section.rows.length > 0) {
        lines.push(renderRowsTable(section.rows))
        lines.push('')
      }
    }
  }
  return lines.join('\n')
}

function renderRowsTable(rows: BenchRow[]): string {
  // Collect column order from the first row's inputs + metrics. Subsequent
  // rows may add new columns — we union them in encounter order.
  const inputCols: string[] = []
  const metricCols: string[] = []
  for (const row of rows) {
    if (row.inputs) {
      for (const k of Object.keys(row.inputs)) {
        if (!inputCols.includes(k)) inputCols.push(k)
      }
    }
    for (const k of Object.keys(row.metrics)) {
      if (!metricCols.includes(k)) metricCols.push(k)
    }
  }
  const headers = ['label', ...inputCols, ...metricCols]
  const lines: string[] = []
  lines.push(`| ${headers.map(escapeCell).join(' | ')} |`)
  lines.push(`| ${headers.map(() => '---').join(' | ')} |`)
  for (const row of rows) {
    const cells = [row.label]
    for (const k of inputCols) cells.push(String(row.inputs?.[k] ?? ''))
    for (const k of metricCols) cells.push(String(row.metrics[k] ?? ''))
    lines.push(`| ${cells.map(escapeCell).join(' | ')} |`)
    if (row.notes) {
      lines.push(`| _${escapeCell(row.notes)}_ | ${headers.slice(1).map(() => '').join(' | ')} |`)
    }
  }
  return lines.join('\n')
}

function escapeCell(s: string): string {
  return s.replace(/\|/g, '\\|').replace(/\n/g, ' ')
}
