import { describe, expect, it } from 'bun:test'
import { binaryResponse, toArrayBuffer } from './binary'

describe('toArrayBuffer', () => {
  it('copies only the view\'s range when given a sub-view of a larger buffer', () => {
    // The bug the copy prevents: a Uint8Array can be a window into a bigger
    // backing store (non-zero byteOffset, byteLength < buffer.byteLength).
    // Handing `.buffer` straight to a consumer would leak the sibling bytes.
    const backing = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7])
    const view = backing.subarray(2, 5) // byteOffset 2, byteLength 3

    expect(view.byteOffset).toBe(2)
    expect(view.byteLength).toBe(3)
    expect(view.buffer.byteLength).toBe(8)

    const out = toArrayBuffer(view)

    // Exactly the declared range, none of the siblings.
    expect(out.byteLength).toBe(3)
    expect([...new Uint8Array(out)]).toEqual([2, 3, 4])
  })

  it('returns a standalone buffer that does not alias the source', () => {
    const src = new Uint8Array([10, 20, 30])
    const out = toArrayBuffer(src)

    expect(out).not.toBe(src.buffer)
    // Mutating the source must not affect the copy.
    src[0] = 99
    expect(new Uint8Array(out)[0]).toBe(10)
  })

  it('handles a zero-length view', () => {
    const out = toArrayBuffer(new Uint8Array(0))
    expect(out.byteLength).toBe(0)
  })
})

describe('binaryResponse', () => {
  it('serves exactly the view\'s bytes with the given headers', async () => {
    const backing = new Uint8Array([9, 8, 7, 6, 5])
    const view = backing.subarray(1, 4) // [8, 7, 6]

    const res = binaryResponse(view, {
      headers: { 'content-type': 'application/octet-stream' },
    })

    expect(res.headers.get('content-type')).toBe('application/octet-stream')
    const bytes = new Uint8Array(await res.arrayBuffer())
    expect([...bytes]).toEqual([8, 7, 6])
  })
})
