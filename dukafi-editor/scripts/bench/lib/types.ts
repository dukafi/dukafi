/**
 * Shared types between benchmark drivers, the orchestrator, and the report
 * renderer. Each bench returns a `BenchResult` so the orchestrator can
 * aggregate them uniformly.
 */

export interface BenchRow {
  /** Human-readable label for this measurement. */
  label: string
  /** Optional numeric inputs (e.g. node count, byte size) — shown verbatim. */
  inputs?: Record<string, number | string>
  /** Latency / throughput metrics (already formatted strings). */
  metrics: Record<string, string>
  /** Optional notes — rendered after the metrics row. */
  notes?: string
}

export interface BenchSection {
  /** Section heading (rendered as H3 in the markdown report). */
  title: string
  /** Optional one-paragraph context describing what the rows mean. */
  intro?: string
  /** Tabular rows for this section. */
  rows: BenchRow[]
  /** Optional findings the bench wants to highlight ahead of the table. */
  highlights?: string[]
}

export interface BenchResult {
  /** Module identifier — matches the filename in scripts/bench/benches/. */
  name: string
  /** Human-readable title rendered as H2 in the report. */
  title: string
  /** Top-line summary that bubbles up to the headline-numbers table. */
  headline: Record<string, string>
  /** Detailed sections rendered in module order. */
  sections: BenchSection[]
  /** Time spent in this bench (orchestrator fills this in). */
  durationMs?: number
}

export interface BenchContext {
  /** Where to write artifacts (logs, intermediate files). Always inside .tmp/. */
  outputDir: string
  /** Lower iteration counts for fast smoke runs. */
  quick: boolean
  /** Override server base URL for HTTP benches (otherwise auto-managed). */
  baseUrl?: string
}

/** Each bench module exports an object matching this shape. */
export interface BenchModule {
  name: string
  title: string
  /** Short description rendered in the README. */
  description: string
  /** Run the bench and return aggregated results. */
  run(ctx: BenchContext): Promise<BenchResult>
}
