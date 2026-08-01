import { describe, test, expect } from 'bun:test'
import { parseSseStream, type SseFrame } from '../../../server/ai/drivers/http/sse'

/**
 * The SSE parser must reassemble frames across arbitrary network-chunk
 * boundaries — including a single JSON `data:` payload split mid-token — and
 * stop cleanly at a `[DONE]` sentinel.
 */

function responseFromChunks(chunks: string[]): Response {
  const enc = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(enc.encode(chunk))
      controller.close()
    },
  })
  return new Response(stream)
}

async function collect(res: Response): Promise<SseFrame[]> {
  const out: SseFrame[] = []
  for await (const frame of parseSseStream(res)) out.push(frame)
  return out
}

describe('parseSseStream', () => {
  test('parses a single data-only frame', async () => {
    const frames = await collect(responseFromChunks(['data: {"a":1}\n\n']))
    expect(frames).toEqual([{ event: null, data: '{"a":1}' }])
    expect(JSON.parse(frames[0]!.data)).toEqual({ a: 1 })
  })

  test('parses event-named frames', async () => {
    const frames = await collect(
      responseFromChunks(['event: content_block_delta\ndata: {"x":1}\n\n']),
    )
    expect(frames).toEqual([{ event: 'content_block_delta', data: '{"x":1}' }])
  })

  test('joins multi-line data fields with newlines', async () => {
    const frames = await collect(responseFromChunks(['data: line1\ndata: line2\n\n']))
    expect(frames).toEqual([{ event: null, data: 'line1\nline2' }])
  })

  test('reassembles a frame split across chunks', async () => {
    const frames = await collect(responseFromChunks(['data: {"a":', '1}\n\n']))
    expect(frames).toEqual([{ event: null, data: '{"a":1}' }])
  })

  test('reassembles a JSON object split mid-token across three chunks', async () => {
    const frames = await collect(
      responseFromChunks(['event: message\n', 'data: {"hello"', ':"wor', 'ld"}\n\n']),
    )
    expect(frames).toHaveLength(1)
    expect(frames[0]!.event).toBe('message')
    expect(JSON.parse(frames[0]!.data)).toEqual({ hello: 'world' })
  })

  test('stops at [DONE] and omits the sentinel frame and anything after it', async () => {
    const frames = await collect(
      responseFromChunks(['data: {"a":1}\n\n', 'data: [DONE]\n\n', 'data: {"b":2}\n\n']),
    )
    expect(frames).toEqual([{ event: null, data: '{"a":1}' }])
  })

  test('handles CRLF frame boundaries', async () => {
    const frames = await collect(
      responseFromChunks(['event: ping\r\ndata: {"k":1}\r\n\r\n']),
    )
    expect(frames).toEqual([{ event: 'ping', data: '{"k":1}' }])
  })

  test('skips comment-only frames', async () => {
    const frames = await collect(responseFromChunks([': keep-alive\n\ndata: {"a":1}\n\n']))
    expect(frames).toEqual([{ event: null, data: '{"a":1}' }])
  })

  test('flushes a trailing frame not terminated by a blank line', async () => {
    const frames = await collect(responseFromChunks(['data: {"a":1}']))
    expect(frames).toEqual([{ event: null, data: '{"a":1}' }])
  })
})
