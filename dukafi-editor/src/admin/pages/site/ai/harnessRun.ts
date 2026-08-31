/**
 * Stream a Dukafi AI run. The store injects the MCP token; this client
 * only sees activity events.
 */

import { ApiError, responseErrorMessage } from '@core/http'

export interface HarnessActivity {
  phase: string
  message: string
}

export interface HarnessDone {
  ok: boolean
  mode?: string
  slug?: string
  changed?: boolean
  reply?: string
}

export async function streamAiRun(options: {
  prompt: string
  slug: string
  mode: string
  onActivity: (event: HarnessActivity) => void
}): Promise<HarnessDone> {
  const response = await fetch('/admin/api/cms/ai/run', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify({
      prompt: options.prompt,
      slug: options.slug,
      mode: options.mode,
    }),
  })

  if (!response.ok) {
    throw new ApiError(await responseErrorMessage(response, 'The harness could not start'), response.status)
  }
  if (!response.body) {
    throw new ApiError('The harness returned no stream', response.status)
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let donePayload: HarnessDone | null = null

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const blocks = buffer.split('\n\n')
    buffer = blocks.pop() ?? ''
    for (const block of blocks) {
      const parsed = parseSse(block)
      if (!parsed) continue
      if (parsed.event === 'activity' && parsed.data && typeof parsed.data === 'object') {
        const row = parsed.data as { phase?: unknown; message?: unknown }
        if (typeof row.message === 'string' && row.message.trim()) {
          options.onActivity({
            phase: typeof row.phase === 'string' ? row.phase : 'apply',
            message: row.message,
          })
        }
      }
      if (parsed.event === 'error') {
        const message = typeof (parsed.data as { message?: unknown })?.message === 'string'
          ? (parsed.data as { message: string }).message
          : 'The harness failed'
        throw new ApiError(message, 502)
      }
      if (parsed.event === 'done' && parsed.data && typeof parsed.data === 'object') {
        donePayload = parsed.data as HarnessDone
      }
    }
  }

  return donePayload ?? { ok: true }
}

function parseSse(block: string): { event: string; data: unknown } | null {
  let event = 'message'
  const dataLines: string[] = []
  for (const line of block.split('\n')) {
    if (line.startsWith('event:')) event = line.slice(6).trim()
    if (line.startsWith('data:')) dataLines.push(line.slice(5).trim())
  }
  if (dataLines.length === 0) return null
  try {
    return { event, data: JSON.parse(dataLines.join('\n')) }
  } catch {
    return { event, data: { message: dataLines.join('\n') } }
  }
}
