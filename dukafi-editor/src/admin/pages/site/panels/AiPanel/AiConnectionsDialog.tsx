import { useEffect, useState } from 'react'
import { Button } from '@ui/components/Button'
import { Dialog } from '@ui/components/Dialog'
import { Input } from '@ui/components/Input'
import { getErrorMessage } from '@core/utils/errorMessage'

type Caps = { toolCalling: boolean; visionInput: boolean; imageGeneration: boolean; streaming: boolean }
type Model = { id: string; label: string; capabilities: Caps }
type Connection = { id: number; name: string; provider: string; chatModel: string | null; imageModel: string | null; priority: number; disabled: boolean; isSet: boolean }
type Provider = { id: string; label: string; authMode: string }
type TaskDefault = { connectionId: number; model: string } | null
type Defaults = { chat: TaskDefault; image: TaskDefault }

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { credentials: 'same-origin', ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } })
  const body = response.status === 204 ? {} : await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body?.error?.message || body?.error || `Request failed (${response.status})`)
  return body as T
}

function ConnectionEditor({ entry, defaults, reload, onSaved }: { entry: Connection; defaults: Defaults; reload: () => Promise<void>; onSaved: () => void }) {
  const [models, setModels] = useState<Model[]>([])
  const [chatModel, setChatModel] = useState(entry.chatModel || '')
  const [imageModel, setImageModel] = useState(entry.imageModel || '')
  const [priority, setPriority] = useState(entry.priority)
  const [disabled, setDisabled] = useState(entry.disabled)
  const [apiKey, setApiKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function discover() {
    setBusy(true); setError(null); setNotice(null)
    try {
      const result = await json<{ models: Model[] }>(`/admin/api/cms/ai/connections/${entry.id}/models`, { method: 'POST' })
      setModels(result.models)
      setNotice(result.models.length ? `Found ${result.models.length} models.` : 'No models returned. Check the API key.')
    } catch (cause) { setError(getErrorMessage(cause, 'Could not list models')) }
    finally { setBusy(false) }
  }

  async function save() {
    setBusy(true); setError(null); setNotice(null)
    try {
      await json(`/admin/api/cms/ai/connections/${entry.id}`, { method: 'PATCH', body: JSON.stringify({ chatModel, imageModel, priority, disabled, apiKey }) })
      await json('/admin/api/cms/ai/defaults', { method: 'PUT', body: JSON.stringify({
        chat: chatModel ? { connectionId: entry.id, model: chatModel } : defaults.chat,
        image: imageModel ? { connectionId: entry.id, model: imageModel } : defaults.image,
      }) })
      setApiKey(''); setNotice('Saved. These are now the design and image defaults.'); await reload(); onSaved()
    } catch (cause) { setError(getErrorMessage(cause, 'Could not save connection')) }
    finally { setBusy(false) }
  }

  async function test() {
    setBusy(true); setError(null); setNotice(null)
    try {
      const result = await json<{ ok: boolean; error?: string }>(`/admin/api/cms/ai/connections/${entry.id}/test`, { method: 'POST', body: JSON.stringify({ model: chatModel }) })
      if (!result.ok) throw new Error(result.error || 'Provider rejected the test')
      setNotice('Design model test passed.')
    } catch (cause) { setError(getErrorMessage(cause, 'Connection test failed')) }
    finally { setBusy(false) }
  }

  async function remove() {
    setBusy(true); setError(null)
    try { await json(`/admin/api/cms/ai/connections/${entry.id}`, { method: 'DELETE' }); await reload(); onSaved() }
    catch (cause) { setError(getErrorMessage(cause, 'Could not remove connection')) }
    finally { setBusy(false) }
  }

  const imageModels = models.filter((model) => model.capabilities.imageGeneration)
  return <article style={{ border: '1px solid var(--border-subtle)', borderRadius: 8, padding: 14, marginBottom: 12 }}>
    <h3 style={{ marginTop: 0 }}>{entry.name}</h3>
    <p><small>{entry.provider} · {entry.isSet ? 'key saved' : 'no key'}{defaults.chat?.connectionId === entry.id ? ' · design default' : ''}{defaults.image?.connectionId === entry.id ? ' · image default' : ''}</small></p>
    <Input aria-label={`New API key for ${entry.name}`} type="password" value={apiKey} placeholder={entry.isSet ? 'Leave blank to keep saved key' : 'API key'} onChange={(event) => setApiKey(event.currentTarget.value)} />
    <Button variant="secondary" size="sm" disabled={busy} onClick={() => void discover()}>{busy ? 'Working…' : 'Load models'}</Button>
    <label>Design/chat model
      {models.length ? <select value={chatModel} onChange={(event) => setChatModel(event.currentTarget.value)} style={{ display: 'block', width: '100%' }}>
        <option value="">Choose a model</option>{models.map((model) => <option key={model.id} value={model.id}>{model.label}</option>)}
      </select> : <Input value={chatModel} placeholder="Model ID" onChange={(event) => setChatModel(event.currentTarget.value)} />}
    </label>
    <label>Image model
      {models.length ? <select value={imageModel} onChange={(event) => setImageModel(event.currentTarget.value)} style={{ display: 'block', width: '100%' }}>
        <option value="">No image model</option>{imageModels.map((model) => <option key={model.id} value={model.id}>{model.label}</option>)}
      </select> : <Input value={imageModel} placeholder="Image model ID" onChange={(event) => setImageModel(event.currentTarget.value)} />}
    </label>
    {models.length > 0 && imageModels.length === 0 && <p><small>This provider returned no image-capable models.</small></p>}
    <label>Priority <Input type="number" value={String(priority)} onChange={(event) => setPriority(Number(event.currentTarget.value) || 100)} /></label>
    <label><input type="checkbox" checked={disabled} onChange={(event) => setDisabled(event.currentTarget.checked)} /> Disabled</label>
    <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
      <Button variant="primary" size="sm" disabled={busy || !chatModel} onClick={() => void save()}>Save and use</Button>
      <Button variant="secondary" size="sm" disabled={busy || !chatModel} onClick={() => void test()}>Test design model</Button>
      <Button variant="secondary" size="sm" disabled={busy} onClick={() => void remove()}>Remove</Button>
    </div>
    {notice && <p role="status">{notice}</p>}{error && <p role="alert">{error}</p>}
  </article>
}

export function AiConnectionsDialog({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const [connections, setConnections] = useState<Connection[]>([])
  const [providers, setProviders] = useState<Provider[]>([])
  const [defaults, setDefaults] = useState<Defaults>({ chat: null, image: null })
  const [name, setName] = useState('')
  const [provider, setProvider] = useState('openrouter')
  const [baseUrl, setBaseUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function load() {
    const [payload, taskDefaults] = await Promise.all([
      json<{ connections: Connection[]; providers: Provider[] }>('/admin/api/cms/ai/connections'),
      json<Defaults>('/admin/api/cms/ai/defaults'),
    ])
    setConnections(payload.connections); setProviders(payload.providers); setDefaults(taskDefaults)
  }
  useEffect(() => { if (open) void load().catch((cause) => setError(getErrorMessage(cause, 'Could not load connections'))) }, [open])

  async function add() {
    setError(null)
    try {
      await json('/admin/api/cms/ai/connections', { method: 'POST', body: JSON.stringify({ name, provider, baseUrl, apiKey }) })
      setName(''); setApiKey(''); await load(); onSaved()
    } catch (cause) { setError(getErrorMessage(cause, 'Could not add connection')) }
  }

  return <Dialog open={open} onClose={onClose} title="AI connections and models" size="xl">
    {connections.length === 0 && <p>Connect OpenRouter or another provider, load its models, then select separate design and image defaults.</p>}
    {connections.map((entry) => <ConnectionEditor key={entry.id} entry={entry} defaults={defaults} reload={load} onSaved={onSaved} />)}
    <h3>Add connection</h3>
    <Input aria-label="Connection name" placeholder="Connection name" value={name} onChange={(event) => setName(event.currentTarget.value)} />
    <select aria-label="Provider" value={provider} onChange={(event) => setProvider(event.currentTarget.value)} style={{ width: '100%', marginTop: 8 }}>
      {providers.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}
    </select>
    <Input aria-label="Base URL" placeholder="Base URL (optional for OpenRouter)" value={baseUrl} onChange={(event) => setBaseUrl(event.currentTarget.value)} />
    <Input aria-label="API key" type="password" placeholder="API key" value={apiKey} onChange={(event) => setApiKey(event.currentTarget.value)} />
    <Button variant="primary" size="sm" disabled={!name.trim()} onClick={() => void add()}>Add connection</Button>
    {error && <p role="alert">{error}</p>}
  </Dialog>
}
