import { describe, expect, it, afterEach, mock } from 'bun:test'
import { streamAiRun } from '@site/ai/harnessRun'

afterEach(() => {
  mock.restore()
})

describe('streamAiRun', () => {
  it('parses activity events and finishes on done', async () => {
    const body = [
      'event: activity',
      'data: {"phase":"structure","message":"structure: hero, about"}',
      '',
      'event: done',
      'data: {"ok":true,"mode":"landing"}',
      '',
    ].join('\n')

    globalThis.fetch = (async () => new Response(body, {
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
    })) as typeof fetch

    const activity: string[] = []
    const result = await streamAiRun({
      prompt: 'build a landing',
      slug: 'index',
      mode: 'landing',
      onActivity: (event) => { activity.push(event.message) },
    })

    expect(activity).toEqual(['structure: hero, about'])
    expect(result.ok).toBe(true)
  })

  it('surfaces a chat-only done payload', async () => {
    globalThis.fetch = (async () => new Response(
      'event: done\ndata: {"ok":true,"mode":"landing","changed":false,"reply":"Say what you want changed on this page."}\n\n',
      { status: 200, headers: { 'content-type': 'text/event-stream' } },
    )) as typeof fetch

    const result = await streamAiRun({
      prompt: 'hello',
      slug: 'index',
      mode: 'landing',
      onActivity: () => {},
    })

    expect(result.changed).toBe(false)
    expect(result.reply).toContain('Say what you want changed')
  })

  it('does not send a token in the body', async () => {
    let sent = ''
    globalThis.fetch = (async (_url: RequestInfo | URL, init?: RequestInit) => {
      sent = String(init?.body || '')
      return new Response('event: done\ndata: {"ok":true}\n\n', {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      })
    }) as typeof fetch

    await streamAiRun({
      prompt: 'hello',
      slug: 'index',
      mode: 'landing',
      onActivity: () => {},
    })

    expect(sent).toContain('"prompt":"hello"')
    expect(sent).not.toContain('dkf_')
    expect(sent).not.toContain('mcpToken')
  })
})
