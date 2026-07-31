/**
 * Shared host⇄VM JSON-boundary marshaling.
 *
 * The host hands every dispatch argument into the VM as a JSON string and
 * reads every dispatch result back as a JSON string (see `eval.ts` and
 * `modulePackVm.ts`). Both sandbox runtimes — the full-plugin runtime
 * (`pluginRuntime.ts`) and the canvas module-pack runtime
 * (`modulePackRuntime.ts`) — cross that boundary the exact same way, so the
 * parse-in / stringify-out pair lives here once instead of being re-inlined
 * in each runtime. This is the "one shared place" the two bootstraps import.
 *
 * These functions are bundled (inlined) into each generated bootstrap artifact
 * by `scripts/sync-plugin-bootstrap.ts`; they never run in the host.
 */

/**
 * Parse a JSON argument string the host passed into the VM. The return is
 * intentionally untyped (`JSON.parse` yields `any`) — callers narrow at the
 * point of use, exactly as the hand-written bootstrap did.
 */
export function fromJson(json: string) {
  return JSON.parse(json)
}

/**
 * Stringify a dispatch result for the host to read back. When the plugin
 * handler returned `undefined`, substitute `fallback` first — several runners
 * supply a default for a no-return handler (`{ ok: true }` for routes, `null`
 * for media calls, or the original input value for hook filters).
 */
export function toJson(value: unknown, fallback?: unknown): string {
  return JSON.stringify(value === undefined ? fallback : value)
}
