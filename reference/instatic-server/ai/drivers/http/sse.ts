/**
 * Server-Sent Events parser for the direct provider HTTP drivers.
 *
 * Providers stream their responses as `text/event-stream`: a sequence of
 * frames separated by a blank line. Each frame carries an optional `event:`
 * name and one or more `data:` lines (joined with `\n`). A `data: [DONE]`
 * sentinel (OpenAI-style) terminates the stream.
 *
 * `parseSseStream` reads the raw `Response.body` (a Bun `ReadableStream`),
 * reassembles frames across arbitrary network-chunk boundaries — including a
 * single JSON `data:` payload split across two TCP reads — and yields one
 * `{ event, data }` per complete frame. Callers `JSON.parse` + TypeBox-validate
 * each `data` payload at their own boundary; this module never touches the JSON.
 */

export interface SseFrame {
  /** The `event:` field value, or null when the frame omits it. */
  readonly event: string | null
  /** The concatenated `data:` field value(s). */
  readonly data: string
}

/**
 * Parse an `Response` whose body is an SSE stream into a sequence of frames.
 *
 * Stops cleanly when the stream ends or a `[DONE]` sentinel arrives. The
 * `[DONE]` frame itself is NOT yielded.
 */
export async function* parseSseStream(res: Response): AsyncIterable<SseFrame> {
  const body = res.body
  if (!body) return

  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      // `stream: true` keeps multi-byte UTF-8 sequences that straddle a chunk
      // boundary intact across reads.
      buffer += decoder.decode(value, { stream: true })

      for (;;) {
        const boundary = findFrameBoundary(buffer)
        if (!boundary) break
        const rawFrame = buffer.slice(0, boundary.index)
        buffer = buffer.slice(boundary.index + boundary.length)
        const frame = parseFrame(rawFrame)
        if (!frame) continue
        if (frame.data === '[DONE]') return
        yield frame
      }
    }

    // Flush any trailing frame that wasn't terminated by a blank line.
    buffer += decoder.decode()
    const frame = parseFrame(buffer)
    if (frame && frame.data !== '[DONE]') yield frame
  } finally {
    reader.releaseLock()
  }
}

/**
 * Find the earliest frame boundary (`\n\n` or `\r\n\r\n`) in the buffer.
 * Returns its start index and length, or null when no complete frame is
 * buffered yet.
 */
function findFrameBoundary(buffer: string): { index: number; length: number } | null {
  const lf = buffer.indexOf('\n\n')
  const crlf = buffer.indexOf('\r\n\r\n')
  if (lf === -1 && crlf === -1) return null
  if (crlf === -1 || (lf !== -1 && lf < crlf)) return { index: lf, length: 2 }
  return { index: crlf, length: 4 }
}

/**
 * Parse a single raw frame (everything before the blank-line boundary) into an
 * `SseFrame`. Returns null for empty/comment-only frames that carry no payload.
 */
function parseFrame(raw: string): SseFrame | null {
  let event: string | null = null
  const dataLines: string[] = []

  for (let line of raw.split('\n')) {
    if (line.endsWith('\r')) line = line.slice(0, -1)
    // Blank lines and comment lines (`:` prefix) carry no field.
    if (line === '' || line.startsWith(':')) continue

    const colon = line.indexOf(':')
    const field = colon === -1 ? line : line.slice(0, colon)
    let value = colon === -1 ? '' : line.slice(colon + 1)
    // Per the SSE spec, a single leading space after the colon is stripped.
    if (value.startsWith(' ')) value = value.slice(1)

    if (field === 'event') event = value
    else if (field === 'data') dataLines.push(value)
  }

  if (event === null && dataLines.length === 0) return null
  return { event, data: dataLines.join('\n') }
}
