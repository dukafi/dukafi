/**
 * The site seq this tab has seen.
 *
 * One monotonic counter lives server-side (`site_states.seq`), bumped by every
 * writer — this editor, and now MCP. Recording what we last saw is what makes
 * "someone else changed the store" answerable by comparing two integers.
 *
 * Module state rather than store state on purpose: the poller needs it, the
 * persistence hook writes it, and neither should have to reach into the editor
 * store to find the other. It is also per-tab by nature — two tabs legitimately
 * hold different values.
 */

let lastSeenSeq = 0

/** After a load or a successful save: this is now our version of the truth. */
export function recordSiteSeq(seq: number): void {
  if (!Number.isFinite(seq)) return
  // Never go backwards. Responses can arrive out of order, and a stale one
  // must not re-arm a change notice that has already been dealt with.
  if (seq > lastSeenSeq) lastSeenSeq = seq
}

export function lastSeenSiteSeq(): number {
  return lastSeenSeq
}

/** Only for tests — a module-level counter otherwise leaks between them. */
export function resetSiteSeq(): void {
  lastSeenSeq = 0
}
