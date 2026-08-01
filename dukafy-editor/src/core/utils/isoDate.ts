export function isoDate(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}
export function isoDateOrNull(value: Date | string | null | undefined): string | null {
  return value == null ? null : isoDate(value)
}
