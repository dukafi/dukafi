/**
 * Extract a human-readable message from an unknown thrown value.
 *
 * The canonical way to turn a `catch (err)` value into display/log text. Use
 * this instead of hand-writing `getErrorMessage(err, '…')` at
 * each call site — that pattern was duplicated ~130 times across the codebase
 * before this util existed.
 *
 * An `Error` with an empty/whitespace-only message falls back too, so callers
 * never render a blank error string.
 *
 * For logging the raw thrown value when it isn't an `Error`, pass `String(err)`
 * as the fallback explicitly — that intent stays at the call site.
 */
export function getErrorMessage(err: unknown, fallback = 'Unknown error'): string {
  return err instanceof Error && err.message.trim() ? err.message : fallback
}
