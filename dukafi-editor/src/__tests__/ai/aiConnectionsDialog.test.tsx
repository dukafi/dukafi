import { describe, it, expect, afterEach, mock } from 'bun:test'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { AiConnectionsDialog } from '@admin/pages/site/panels/AiPanel/AiConnectionsDialog'

afterEach(() => {
  cleanup()
  mock.restore()
})

describe('AiConnectionsDialog', () => {
  it('loads models, saves design/image defaults, and tests the design model', async () => {
    const calls: Array<{ url: string; method: string }> = []
    const connection = {
      id: 1, name: 'OpenRouter', provider: 'openrouter', chatModel: null as string | null,
      imageModel: null as string | null, priority: 100, disabled: false, isSet: true,
    }

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = (init?.method || 'GET').toUpperCase()
      calls.push({ url, method })
      const body = init?.body ? JSON.parse(String(init.body)) : undefined

      if (url.includes('/ai/connections') && method === 'GET' && !url.includes('/models') && !url.includes('/test')) {
        return json({
          connections: [connection],
          providers: [{ id: 'openrouter', label: 'OpenRouter', authMode: 'api_key' }],
        })
      }
      if (url.includes('/ai/defaults') && method === 'GET') return json({ chat: null, image: null })
      if (url.includes('/models') && method === 'POST') {
        return json({
          models: [
            { id: 'chat-1', label: 'Chat One', capabilities: { toolCalling: true, visionInput: true, imageGeneration: false, streaming: true } },
            { id: 'img-1', label: 'Image One', capabilities: { toolCalling: false, visionInput: false, imageGeneration: true, streaming: false } },
          ],
        })
      }
      if (url.match(/\/connections\/1$/) && method === 'PATCH') {
        connection.chatModel = body.chatModel
        connection.imageModel = body.imageModel
        return json({ connection })
      }
      if (url.includes('/ai/defaults') && method === 'PUT') return json(body)
      if (url.includes('/test') && method === 'POST') return json({ ok: true })
      return json({ error: `unhandled ${method} ${url}` }, 500)
    }) as typeof fetch

    const onSaved = mock(() => {})
    render(<AiConnectionsDialog open onClose={() => {}} onSaved={onSaved} />)

    await waitFor(() => expect(screen.getByText('Load models')).toBeDefined())
    fireEvent.click(screen.getByText('Load models'))
    await waitFor(() => expect(screen.getByText('Found 2 models.')).toBeDefined())

    const selects = screen.getAllByRole('combobox') as HTMLSelectElement[]
    fireEvent.change(selects[0], { target: { value: 'chat-1' } })
    fireEvent.change(selects[1], { target: { value: 'img-1' } })

    fireEvent.click(screen.getByText('Save and use'))
    await waitFor(() => expect(screen.getByText(/Saved\. These are now the design and image defaults/)).toBeDefined())

    fireEvent.click(screen.getByText('Test design model'))
    await waitFor(() => expect(screen.getByText('Design model test passed.')).toBeDefined())

    expect(calls.some((call) => call.url.includes('/models') && call.method === 'POST')).toBe(true)
    expect(calls.some((call) => call.url.includes('/ai/defaults') && call.method === 'PUT')).toBe(true)
    expect(onSaved).toHaveBeenCalled()
  })
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}
