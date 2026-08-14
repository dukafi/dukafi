const HEX_COLOR_RE = /^#[0-9a-f]{6}$/i
const HEX_SHORT_RE = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i
const HEX_SWATCH_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i
const FUNCTION_SWATCH_RE = /^(?:rgb|rgba|hsl|hsla)\([0-9a-z.%\s,+/-]+\)$/i
const CSS_VARIABLE_RE = /^var\(--[a-z0-9_-]+\)$/i
const RGB_RE = /^rgba?\(\s*([-+]?\d*\.?\d+%?)\s*,\s*([-+]?\d*\.?\d+%?)\s*,\s*([-+]?\d*\.?\d+%?)(?:\s*,\s*[-+]?\d*\.?\d+)?\s*\)$/i
const HSL_RE = /^hsla?\(\s*([-+]?\d*\.?\d+)(?:deg)?\s*,\s*([-+]?\d*\.?\d+)%\s*,\s*([-+]?\d*\.?\d+)%(?:\s*,\s*[-+]?\d*\.?\d+)?\s*\)$/i

export function getColorInputValue(value: unknown, fallback = '#000000') {
  const next = typeof value === 'string' ? value.trim() : ''
  if (HEX_COLOR_RE.test(next)) return next.toLowerCase()
  const shortHex = next.match(HEX_SHORT_RE)
  if (shortHex) return `#${shortHex[1]}${shortHex[1]}${shortHex[2]}${shortHex[2]}${shortHex[3]}${shortHex[3]}`.toLowerCase()
  return colorFunctionToHex(next) ?? fallback
}

export function getColorSwatchValue(value: unknown, fallback = '#000000') {
  const next = typeof value === 'string' ? value.trim() : ''
  if (!next || next.length > 120) return fallback
  if (/[;{}<>]/.test(next)) return fallback
  if (HEX_SWATCH_RE.test(next)) return next
  if (FUNCTION_SWATCH_RE.test(next)) return next
  if (CSS_VARIABLE_RE.test(next)) return next
  return fallback
}

function colorFunctionToHex(value: string): string | null {
  const rgb = value.match(RGB_RE)
  if (rgb) {
    return formatHex(
      parseRgbChannel(rgb[1]),
      parseRgbChannel(rgb[2]),
      parseRgbChannel(rgb[3]),
    )
  }

  const hsl = value.match(HSL_RE)
  if (hsl) {
    const h = normalizeHue(Number(hsl[1]))
    const s = clamp(Number(hsl[2]) / 100, 0, 1)
    const l = clamp(Number(hsl[3]) / 100, 0, 1)
    const c = (1 - Math.abs(2 * l - 1)) * s
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
    const m = l - c / 2
    let r = 0
    let g = 0
    let b = 0

    if (h < 60) {
      r = c
      g = x
    } else if (h < 120) {
      r = x
      g = c
    } else if (h < 180) {
      g = c
      b = x
    } else if (h < 240) {
      g = x
      b = c
    } else if (h < 300) {
      r = x
      b = c
    } else {
      r = c
      b = x
    }

    return formatHex((r + m) * 255, (g + m) * 255, (b + m) * 255)
  }

  return null
}

function parseRgbChannel(value: string): number {
  if (value.endsWith('%')) return clamp(Number(value.slice(0, -1)), 0, 100) * 2.55
  return clamp(Number(value), 0, 255)
}

function formatHex(r: number, g: number, b: number): string {
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

function toHex(value: number): string {
  return Math.round(clamp(value, 0, 255)).toString(16).padStart(2, '0')
}

function normalizeHue(value: number): number {
  return ((value % 360) + 360) % 360
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.max(min, Math.min(max, value))
}
