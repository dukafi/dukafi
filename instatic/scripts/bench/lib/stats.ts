/**
 * Stats helpers for benchmark drivers. Everything here is pure — no I/O,
 * no global state — so individual benches stay deterministic and
 * trivially unit-testable if we ever decide to.
 */

export interface LatencySummary {
  count: number
  mean: number
  p50: number
  p95: number
  p99: number
  min: number
  max: number
  /** Standard deviation, included for benches where variance is a signal. */
  stdev: number
}

/**
 * Compute mean/min/max/percentiles/stdev for an array of latency samples.
 * Mutates the input by sorting it in place (cheap and avoids an allocation).
 */
export function summarize(samples: number[]): LatencySummary {
  if (samples.length === 0) {
    return { count: 0, mean: 0, p50: 0, p95: 0, p99: 0, min: 0, max: 0, stdev: 0 }
  }
  samples.sort((a, b) => a - b)
  const n = samples.length
  const sum = samples.reduce((s, v) => s + v, 0)
  const mean = sum / n
  let variance = 0
  for (const v of samples) {
    const d = v - mean
    variance += d * d
  }
  variance /= n
  return {
    count: n,
    mean,
    p50: samples[Math.floor((n - 1) * 0.5)],
    p95: samples[Math.floor((n - 1) * 0.95)],
    p99: samples[Math.floor((n - 1) * 0.99)],
    min: samples[0],
    max: samples[n - 1],
    stdev: Math.sqrt(variance),
  }
}

/** Format a number of milliseconds with a sensible unit + 2 decimals. */
export function fmtMs(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`
  if (ms >= 1) return `${ms.toFixed(2)}ms`
  if (ms >= 0.001) return `${(ms * 1000).toFixed(2)}µs`
  return `${(ms * 1_000_000).toFixed(0)}ns`
}

/** Format a byte count with a binary suffix. */
export function fmtBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${bytes} B`
}

/** Format a count with thousand separators. */
export function fmtNum(n: number): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 })
}
