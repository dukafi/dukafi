/**
 * Error reporting helpers shared by `ErrorBoundary` and the React 19
 * `createRoot` callbacks (`onCaughtError`, `onUncaughtError`,
 * `onRecoverableError`).
 *
 * The CMS-wide convention is `console.error('[<module>]', ...)` — these
 * helpers keep that prefix consistent and walk `error.cause` chains so
 * domain-specific typed errors (`SiteValidationError`,
 * `VisualComponentNameError`, etc.) render their full provenance.
 */

export interface ErrorChainEntry {
  /** `Error.name`, or `'value'` if a non-Error was thrown. */
  name: string
  message: string
  stack?: string
}

/**
 * Walk an arbitrary thrown value into a flat list of `{ name, message, stack }`.
 * The list always contains at least one entry; nested causes are appended in
 * order so the original cause appears last (mirroring how V8 formats them).
 */
export function flattenErrorChain(input: unknown): ErrorChainEntry[] {
  const out: ErrorChainEntry[] = []
  let current: unknown = input
  // Guard against cyclic causes — extremely rare, but a buggy plugin could
  // construct one and we don't want to lock the boundary up.
  const seen = new Set<unknown>()

  while (current !== undefined && current !== null) {
    if (seen.has(current)) break
    seen.add(current)

    if (current instanceof Error) {
      out.push({
        name: current.name || 'Error',
        message: current.message || '(empty message)',
        stack: current.stack,
      })
      current = (current as { cause?: unknown }).cause
      continue
    }

    out.push({
      name: 'value',
      message: typeof current === 'string' ? current : safeStringify(current),
    })
    break
  }

  if (out.length === 0) {
    out.push({ name: 'value', message: 'Unknown error (null/undefined thrown)' })
  }
  return out
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

/**
 * Format an error chain + component stack into a single string suitable for
 * pasting into a bug report or copy-to-clipboard. Newline-separated.
 */
export function formatErrorReport(
  location: string,
  chain: ErrorChainEntry[],
  componentStack: string | null,
): string {
  const lines: string[] = []
  lines.push(`Location: ${location}`)
  for (let i = 0; i < chain.length; i++) {
    const entry = chain[i]
    const label = i === 0 ? 'Error' : `Caused by`
    lines.push(`${label}: ${entry.name}: ${entry.message}`)
    if (entry.stack) {
      lines.push(entry.stack)
    }
  }
  if (componentStack) {
    lines.push('Component stack:')
    lines.push(componentStack.trim())
  }
  return lines.join('\n')
}

/**
 * Log a chain of errors with the project's `[<module>]` prefix, appending
 * the full chain so wrapped errors don't lose their cause.
 *
 * Used by:
 *   - `<ErrorBoundary>` `componentDidCatch`
 *   - `createRoot({ onCaughtError, onUncaughtError, onRecoverableError })`
 *   - the `boundary*Error` listeners on `window.error` (future)
 */
export function logErrorChain(
  prefix: string,
  chain: ErrorChainEntry[],
  componentStack?: string | null,
): void {
  const head = chain[0]
  if (chain.length === 1) {
    console.error(`[${prefix}]`, `${head.name}: ${head.message}`, head.stack ?? '')
  } else {
    console.error(`[${prefix}]`, `${head.name}: ${head.message}`, head.stack ?? '')
    for (let i = 1; i < chain.length; i++) {
      const entry = chain[i]
      console.error(
        `[${prefix}] caused by`,
        `${entry.name}: ${entry.message}`,
        entry.stack ?? '',
      )
    }
  }
  if (componentStack) {
    console.error(`[${prefix}] componentStack`, componentStack.trim())
  }
}
