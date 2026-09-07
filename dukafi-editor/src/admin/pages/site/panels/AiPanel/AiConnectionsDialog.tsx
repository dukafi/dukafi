import { useEffect, useState } from 'react'
import { Button } from '@ui/components/Button'
import { Dialog } from '@ui/components/Dialog'
import { Input } from '@ui/components/Input'
import { getErrorMessage } from '@core/utils/errorMessage'

type Connection = { id: number; name: string; provider: string; baseUrl: string; chatModel: string; imageModel: string; priority: number; disabled: boolean; isSet: boolean }
type Provider = { id: string; label: string; authMode: string }

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { credentials: 'same-origin', ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body?.error?.message || `Request failed (${response.status})`)
  return body as T
}

export function AiConnectionsDialog({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const [connections, setConnections] = useState<Connection[]>([])
  const [providers, setProviders] = useState<Provider[]>([])
  const [name, setName] = useState('')
  const [provider, setProvider] = useState('openai')
  const [baseUrl, setBaseUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function load() {
    const payload = await json<{ connections: Connection[]; providers: Provider[] }>('/admin/api/cms/ai/connections')
    setConnections(payload.connections); setProviders(payload.providers)
  }
  useEffect(() => { if (open) void load().catch((cause) => setError(getErrorMessage(cause, 'Could not load connections'))) }, [open])

  async function add() {
    setError(null)
    try {
      await json('/admin/api/cms/ai/connections', { method: 'POST', body: JSON.stringify({ name, provider, baseUrl, apiKey }) })
      setName(''); setApiKey(''); await load(); onSaved()
    } catch (cause) { setError(getErrorMessage(cause, 'Could not add connection')) }
  }
  async function remove(id: number) {
    try { await json(`/admin/api/cms/ai/connections/${id}`, { method: 'DELETE' }); await load(); onSaved() }
    catch (cause) { setError(getErrorMessage(cause, 'Could not remove connection')) }
  }

  return <Dialog open={open} onClose={onClose} title="AI connections" size="lg">
    {connections.length === 0 && <p>Connect an AI provider to enable chat and image generation.</p>}
    {connections.map((entry) => <div key={entry.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border-subtle)' }}>
      <span><strong>{entry.name}</strong><br /><small>{entry.provider} · {entry.isSet ? 'key saved' : 'no key'} · priority {entry.priority}</small></span>
      <Button variant="secondary" size="sm" onClick={() => void remove(entry.id)}>Remove</Button>
    </div>)}
    <h3>Add connection</h3>
    <Input aria-label="Connection name" placeholder="Connection name" value={name} onChange={(event) => setName(event.currentTarget.value)} />
    <select aria-label="Provider" value={provider} onChange={(event) => setProvider(event.currentTarget.value)} style={{ width: '100%', marginTop: 8 }}>
      {providers.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}
    </select>
    <Input aria-label="Base URL" placeholder="Base URL (optional for built-ins)" value={baseUrl} onChange={(event) => setBaseUrl(event.currentTarget.value)} />
    <Input aria-label="API key" type="password" placeholder="API key" value={apiKey} onChange={(event) => setApiKey(event.currentTarget.value)} />
    <Button variant="primary" size="sm" disabled={!name.trim()} onClick={() => void add()}>Add connection</Button>
    {error && <p role="alert">{error}</p>}
  </Dialog>
}
