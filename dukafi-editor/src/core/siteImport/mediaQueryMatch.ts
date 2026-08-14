import { breakpointMediaQuery } from '@core/page-tree'
import type { BreakpointHint } from './types'

function normalizeConditionText(conditionText: string): string {
  return conditionText.trim().replace(/\s+/g, ' ').toLowerCase()
}

function extractMaxWidthPx(conditionText: string): number | null {
  const match = conditionText.match(/\(\s*max-width\s*:\s*(\d+(?:\.\d+)?)\s*px\s*\)/i)
  return match ? Number(match[1]) : null
}

export function matchMediaQueryToViewport(
  conditionText: string,
  breakpoints: BreakpointHint[],
  tolerance: number,
): BreakpointHint | null {
  const normalized = normalizeConditionText(conditionText)
  for (const bp of breakpoints) {
    if (normalizeConditionText(breakpointMediaQuery(bp)) === normalized) return bp
  }

  const width = extractMaxWidthPx(conditionText)
  if (width === null) return null
  return breakpoints.find((bp) => Math.abs(bp.width - width) <= tolerance) ?? null
}
