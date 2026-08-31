/**
 * The model picker in the composer.
 *
 * What is worth pinning here is the credential handling, because it is the one
 * place a key could leak into the browser: the popover must be able to show
 * that a key is stored without ever holding it, and a blank field must mean
 * "keep" rather than "erase" — the field could not have shown the value to
 * resubmit.
 */

import { afterEach, describe, expect, it, mock } from 'bun:test'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { AiSettingsPopover } from '@site/panels/AiPanel/AiSettingsPopover'

afterEach(() => {
  cleanup()
  mock.restore()
})

interface Call { url: string; method: string; body: Record<string, unknown> }

/** Stub the transport and record what the popover sent. */
function stubApi(config: { baseUrl: string; model: string; hasKey: boolean }, models: string[] = []) {
  const calls: Call[] = []
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = init?.method ?? 'GET'
    const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {}
    calls.push({ url, method, body })

    const json = (value: unknown) =>
      new Response(JSON.stringify(value), { status: 200, headers: { 'content-type': 'application/json' } })

    if (url.includes('/ai/config') && method === 'GET') return json(config)
    if (url.includes('/ai/config')) return new Response(null, { status: 204 })
    if (url.includes('/ai/models')) return json({ models })
    return new Response(null, { status: 404 })
  }) as typeof fetch
  return calls
}

async function openPopover() {
  fireEvent.click(screen.getByTestId('ai-settings-trigger'))
  await waitFor(() => expect(screen.getByTestId('ai-settings')).toBeDefined())
}

/**
 * These are native `<select>` elements on purpose — see the note in
 * `AiSettingsPopover.tsx`. The `Select` primitive portals its listbox, and the
 * popover's own dismiss handler read that as an outside click, closing the
 * whole thing the moment a provider was picked.
 */
function nativeSelect(id: string): HTMLSelectElement {
  const element = document.querySelector<HTMLSelectElement>(`select#${id}`)
  if (!element) throw new Error(`no select for #${id}`)
  return element
}

function optionValues(id: string): string[] {
  return Array.from(nativeSelect(id).options).map((option) => option.value)
}

function optionLabels(id: string): string[] {
  return Array.from(nativeSelect(id).options).map((option) => option.textContent ?? '')
}

describe('AiSettingsPopover', () => {
  it('offers local providers that need no key', async () => {
    stubApi({ baseUrl: '', model: '', hasKey: false })
    render(<AiSettingsPopover onSaved={() => {}} />)
    await openPopover()

    expect(optionLabels('ai-provider')).toContain('Dukafi AI')
    expect(optionLabels('ai-provider')).toContain('Ollama (local)')
    expect(optionLabels('ai-provider')).toContain('OpenRouter')
    // Ollama is the default selection, and it asks for no credential.
    expect(screen.queryByLabelText('API key')).toBeNull()
  })

  // The bug that prompted this: picking a provider closed the popover with no
  // console error, so nothing could be configured but a local model.
  it('stays open when a provider is picked', async () => {
    stubApi({ baseUrl: '', model: '', hasKey: false })
    render(<AiSettingsPopover onSaved={() => {}} />)
    await openPopover()

    fireEvent.change(nativeSelect('ai-provider'), { target: { value: 'openai' } })

    expect(screen.getByTestId('ai-settings')).toBeDefined()
    expect(nativeSelect('ai-provider').value).toBe('openai')
  })

  it('offers Anthropic and saves the host its protocol is keyed off', async () => {
    const calls = stubApi({ baseUrl: '', model: '', hasKey: false })
    render(<AiSettingsPopover onSaved={() => {}} />)
    await openPopover()

    expect(optionLabels('ai-provider')).toContain('Anthropic (Claude)')

    fireEvent.change(nativeSelect('ai-provider'), { target: { value: 'anthropic' } })
    fireEvent.change(screen.getByLabelText('API key'), { target: { value: 'sk-ant-test' } })
    fireEvent.change(screen.getByLabelText('Model'), { target: { value: 'claude-sonnet-4-5' } })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))

    await waitFor(() => {
      const save = calls.find((call) => call.method === 'PUT')
      // The server picks the Anthropic request shape off this HOST, so the
      // preset filling it exactly is what makes Claude work at all.
      expect(save!.body.baseUrl).toBe('https://api.anthropic.com/v1')
      expect(save!.body.model).toBe('claude-sonnet-4-5')
    })
  })

  it('asks for a key once a hosted provider is chosen', async () => {
    stubApi({ baseUrl: '', model: '', hasKey: false })
    render(<AiSettingsPopover onSaved={() => {}} />)
    await openPopover()

    fireEvent.change(nativeSelect('ai-provider'), { target: { value: 'openrouter' } })

    expect(screen.getByLabelText('API key')).toBeDefined()
  })

  // The server never returns the key, so the only honest thing the popover can
  // show is that one exists.
  it('reports a stored key without ever receiving it', async () => {
    stubApi({ baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini', hasKey: true })
    render(<AiSettingsPopover onSaved={() => {}} />)
    await openPopover()

    const key = screen.getByLabelText('API key') as HTMLInputElement
    expect(key.value).toBe('')
    expect(key.placeholder).toContain('Saved')
  })

  it('sends a blank key on save, meaning keep the stored one', async () => {
    const calls = stubApi({ baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini', hasKey: true })
    render(<AiSettingsPopover onSaved={() => {}} />)
    await openPopover()

    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))

    await waitFor(() => {
      const save = calls.find((call) => call.method === 'PUT')
      expect(save).toBeDefined()
      expect(save!.body.apiKey).toBe('')
      expect(save!.body.clearKey).toBeUndefined()
    })
  })

  // Switching from a hosted provider to a local one must not keep sending a
  // stale credential, so clearing is its own explicit action.
  it('clears a key only when asked explicitly', async () => {
    const calls = stubApi({ baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini', hasKey: true })
    render(<AiSettingsPopover onSaved={() => {}} />)
    await openPopover()

    fireEvent.click(screen.getByRole('button', { name: /remove key/i }))

    await waitFor(() => {
      const save = calls.find((call) => call.method === 'PUT')
      expect(save!.body.clearKey).toBe(true)
    })
  })

  it('turns the model field into a picker once the catalogue loads', async () => {
    stubApi({ baseUrl: 'http://localhost:11434/v1', model: '', hasKey: false },
            ['llama3', 'qwen2.5-coder:7b'])
    render(<AiSettingsPopover onSaved={() => {}} />)
    await openPopover()

    // Before loading it is a free-text field, so an unreachable provider does
    // not block configuration.
    expect(screen.getByLabelText('Model').tagName).toBe('INPUT')

    fireEvent.click(screen.getByRole('button', { name: /load models/i }))

    await waitFor(() => {
      expect(optionValues('ai-model')).toContain('qwen2.5-coder:7b')
    })
  })

  it('keeps the stored model listed even when the catalogue omits it', async () => {
    stubApi({ baseUrl: 'https://openrouter.ai/api/v1', model: 'anthropic/claude-sonnet-4.5', hasKey: true },
            ['openai/gpt-4o-mini'])
    render(<AiSettingsPopover onSaved={() => {}} />)
    await openPopover()

    fireEvent.click(screen.getByRole('button', { name: /load models/i }))

    await waitFor(() => {
      // Without this the select would silently switch the merchant's model.
      expect(optionValues('ai-model')).toContain('anthropic/claude-sonnet-4.5')
    })
  })

  it('reopens on the provider matching the stored base URL', async () => {
    stubApi({ baseUrl: 'https://openrouter.ai/api/v1', model: 'x', hasKey: true })
    render(<AiSettingsPopover onSaved={() => {}} />)
    await openPopover()

    await waitFor(() => {
      expect(nativeSelect('ai-provider').value).toBe('openrouter')
    })
  })

  it('falls back to Custom for a base URL that matches no preset', async () => {
    stubApi({ baseUrl: 'https://my-own-host/v1', model: 'x', hasKey: false })
    render(<AiSettingsPopover onSaved={() => {}} />)
    await openPopover()

    await waitFor(() => {
      expect(nativeSelect('ai-provider').value).toBe('custom')
      expect((screen.getByLabelText('Base URL') as HTMLInputElement).value).toBe('https://my-own-host/v1')
    })
  })

  it('offers Dukafi AI without a model or key, and connects without returning a token', async () => {
    const calls: Call[] = []
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = init?.method ?? 'GET'
      const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {}
      calls.push({ url, method, body })
      const json = (value: unknown) =>
        new Response(JSON.stringify(value), { status: 200, headers: { 'content-type': 'application/json' } })
      if (url.includes('/ai/config') && method === 'GET') {
        return json({ baseUrl: '', model: '', hasKey: false, provider: 'dukafi', connected: false })
      }
      if (url.includes('/ai/config')) return new Response(null, { status: 204 })
      if (url.includes('/dukafi/connect')) return json({ connected: true })
      return new Response(null, { status: 404 })
    }) as typeof fetch

    render(<AiSettingsPopover onSaved={() => {}} />)
    await openPopover()

    expect(nativeSelect('ai-provider').value).toBe('dukafi')
    expect(screen.queryByLabelText('API key')).toBeNull()
    expect(screen.queryByLabelText('Model')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /^connect$/i }))

    await waitFor(() => {
      expect(calls.some((call) => call.url.includes('/dukafi/connect'))).toBe(true)
    })
    expect(JSON.stringify(calls)).not.toContain('dkf_')
  })
})
