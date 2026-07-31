/**
 * JS↔VM marshalling — converts JSON-serializable JS values into QuickJS
 * handles for injection into the VM.
 */

import type { QuickJSContext, QuickJSHandle } from 'quickjs-emscripten'

/**
 * Convert a JSON-serializable JS value into a fresh QuickJS handle. Caller
 * owns the returned handle and must dispose it (or transfer ownership to
 * the VM via `setProp` / function return).
 */
export function jsToHandle(ctx: QuickJSContext, value: unknown): QuickJSHandle {
  if (value === null || value === undefined) return ctx.undefined
  if (typeof value === 'string') return ctx.newString(value)
  if (typeof value === 'number') return ctx.newNumber(value)
  if (typeof value === 'boolean') return value ? ctx.true : ctx.false
  if (Array.isArray(value)) {
    const arr = ctx.newArray()
    value.forEach((item, idx) => {
      const itemHandle = jsToHandle(ctx, item)
      ctx.setProp(arr, idx, itemHandle)
      itemHandle.dispose()
    })
    return arr
  }
  if (typeof value === 'object') {
    const obj = ctx.newObject()
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const childHandle = jsToHandle(ctx, v)
      ctx.setProp(obj, k, childHandle)
      childHandle.dispose()
    }
    return obj
  }
  // Functions / Symbols / BigInts aren't JSON-serializable across the boundary.
  return ctx.newString(String(value))
}
