/**
 * Provider, key and model — set from the composer, not from the plugin admin.
 *
 * Choosing a model is something you do WHILE working ("this one is too slow,
 * try the bigger one"), not a one-time install step. Sending a merchant to
 * Dashboard → Plugins for that loses the page they were editing and the
 * conversation they were mid-way through.
 *
 * The key still never comes back from the server: `hasKey` says whether one is
 * stored, and a blank field on save means "keep it". Clearing is explicit,
 * because switching from OpenRouter to a local model would otherwise keep
 * sending a stale credential.
 */

import { useEffect, useRef, useState } from 'react'
import { apiRequest } from '@core/http'
import { Type } from '@core/utils/typeboxHelpers'
import { getErrorMessage } from '@core/utils/errorMessage'
import { Button } from '@ui/components/Button'
import { ContextMenu } from '@ui/components/ContextMenu'
import { ControlRow } from '@ui/components/ControlRow'
import { Input } from '@ui/components/Input'
import { AiSettingsSolidIcon } from 'pixel-art-icons/icons/ai-settings-solid'
import styles from './AiPanel.module.css'
import { AiConnectionsDialog } from './AiConnectionsDialog'

/**
 * Providers, and what each needs.
 *
 * All but Anthropic speak the OpenAI `/chat/completions` protocol, which is why
 * one driver reaches them. Anthropic gets a second code path server-side
 * (`x-api-key`, a top-level system prompt, a required `max_tokens`) because it
 * is where Claude lives and reaching it through OpenRouter costs a second
 * account and a margin on every token.
 *
 * `key: false` marks the ones that run on the merchant's own machine and need
 * no credential.
 */
const PROVIDERS = [
  { id: 'dukafi', label: 'Dukafi AI', baseUrl: '', key: false },
  { id: 'ollama', label: 'Ollama (local)', baseUrl: 'http://localhost:11434/v1', key: false },
  { id: 'lmstudio', label: 'LM Studio (local)', baseUrl: 'http://localhost:1234/v1', key: false },
  { id: 'anthropic', label: 'Anthropic (Claude)', baseUrl: 'https://api.anthropic.com/v1', key: true },
  { id: 'openrouter', label: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', key: true },
  { id: 'openai', label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', key: true },
  { id: 'groq', label: 'Groq', baseUrl: 'https://api.groq.com/openai/v1', key: true },
  { id: 'custom', label: 'Custom…', baseUrl: '', key: true },
] as const

const ConfigSchema = Type.Object({
  baseUrl: Type.String(),
  model: Type.String(),
  hasKey: Type.Boolean(),
  provider: Type.Optional(Type.String()),
  harnessUrl: Type.Optional(Type.String()),
  connected: Type.Optional(Type.Boolean()),
})
const ModelsSchema = Type.Object({ models: Type.Array(Type.String()) })

/** Which preset a stored base URL came from, so the popover reopens on it. */
function providerFor(baseUrl: string, stored?: string): string {
  if (stored === 'dukafi') return 'dukafi'
  if (stored && PROVIDERS.some((p) => p.id === stored)) return stored
  return PROVIDERS.find((p) => p.baseUrl !== '' && p.baseUrl === baseUrl)?.id ?? 'custom'
}

export function AiSettingsPopover({ onSaved }: { onSaved: () => void }) {
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [connectionsOpen, setConnectionsOpen] = useState(false)

  const [provider, setProvider] = useState('ollama')
  const [baseUrl, setBaseUrl] = useState('')
  const [model, setModel] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [hasKey, setHasKey] = useState(false)
  const [harnessUrl, setHarnessUrl] = useState('')
  const [connected, setConnected] = useState(false)

  const [models, setModels] = useState<string[]>([])
  const [loadingModels, setLoadingModels] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load what is stored each time the popover opens, so it never shows a stale
  // draft from a previous session.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    void (async () => {
      try {
        const config = await apiRequest('/admin/api/cms/ai/config', {
          schema: ConfigSchema, fallbackMessage: 'Could not read the AI settings',
        })
        if (cancelled) return
        // Nothing stored yet: land on the local default with its URL filled in,
        // rather than on "Custom…" with an empty field. A fresh install should
        // be two clicks from working, not a URL the merchant has to know.
        const fallback = PROVIDERS[0]
        const resolved = config.baseUrl || fallback.baseUrl
        setBaseUrl(resolved)
        setModel(config.model)
        setHasKey(config.hasKey)
        setHarnessUrl(config.harnessUrl || '')
        setConnected(Boolean(config.connected))
        setProvider(config.provider === 'dukafi' || config.baseUrl
          ? providerFor(config.baseUrl, config.provider)
          : fallback.id)
        setApiKey('')
        setError(null)
      } catch (err) {
        if (!cancelled) setError(getErrorMessage(err, 'Could not read the AI settings'))
      }
    })()
    return () => { cancelled = true }
  }, [open])

  const preset = PROVIDERS.find((p) => p.id === provider)
  const needsKey = preset?.key ?? true

  function pickProvider(id: string) {
    setProvider(id)
    const next = PROVIDERS.find((p) => p.id === id)
    if (next && next.baseUrl) setBaseUrl(next.baseUrl)
    // The catalogue belongs to the old provider; keeping it would offer models
    // the new one has never heard of.
    setModels([])
  }

  async function loadModels() {
    setLoadingModels(true)
    setError(null)
    try {
      const result = await apiRequest('/admin/api/cms/ai/models', {
        method: 'POST',
        // The not-yet-saved values, so the list can be fetched before committing.
        body: { baseUrl, apiKey },
        schema: ModelsSchema,
        fallbackMessage: 'Could not list models',
      })
      setModels(result.models)
      if (result.models.length === 0) {
        setError('No models came back. Check the URL and key, or type a model id.')
      }
    } catch (err) {
      setError(getErrorMessage(err, 'Could not list models'))
    } finally {
      setLoadingModels(false)
    }
  }

  async function save(clearKey = false) {
    setBusy(true)
    setError(null)
    try {
      await apiRequest('/admin/api/cms/ai/config', {
        method: 'PUT',
        body: provider === 'dukafi'
          ? { provider: 'dukafi', harnessUrl: harnessUrl.trim() }
          : { provider, baseUrl: baseUrl.trim(), model: model.trim(), apiKey, ...(clearKey ? { clearKey } : {}) },
        fallbackMessage: 'Could not save the AI settings',
      })
      setOpen(false)
      onSaved()
    } catch (err) {
      setError(getErrorMessage(err, 'Could not save the AI settings'))
    } finally {
      setBusy(false)
    }
  }

  async function connect() {
    setBusy(true)
    setError(null)
    try {
      await apiRequest('/admin/api/cms/ai/config', {
        method: 'PUT',
        body: { provider: 'dukafi', harnessUrl: harnessUrl.trim() },
        fallbackMessage: 'Could not save the AI settings',
      })
      const result = await apiRequest('/admin/api/cms/ai/dukafi/connect', {
        method: 'POST',
        schema: Type.Object({ connected: Type.Boolean() }),
        fallbackMessage: 'Could not connect Dukafi AI',
      })
      setConnected(result.connected)
      onSaved()
    } catch (err) {
      setError(getErrorMessage(err, 'Could not connect Dukafi AI'))
    } finally {
      setBusy(false)
    }
  }

  async function disconnect() {
    setBusy(true)
    setError(null)
    try {
      await apiRequest('/admin/api/cms/ai/dukafi/disconnect', {
        method: 'POST',
        schema: Type.Object({ connected: Type.Boolean() }),
        fallbackMessage: 'Could not disconnect Dukafi AI',
      })
      setConnected(false)
      onSaved()
    } catch (err) {
      setError(getErrorMessage(err, 'Could not disconnect Dukafi AI'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Button
        ref={triggerRef}
        variant="ghost"
        size="sm"
        iconOnly
        aria-label="Model settings"
        data-testid="ai-settings-trigger"
        onClick={() => setOpen((value) => !value)}
      >
        <AiSettingsSolidIcon size={14} aria-hidden="true" />
      </Button>

      {open && (
        <ContextMenu
          anchorRef={triggerRef}
          triggerRef={triggerRef}
          side="top"
          align="start"
          offset={6}
          minWidth={280}
          maxWidth={320}
          ariaLabel="Model settings"
          onClose={() => setOpen(false)}
        >
          <div className={styles.settings} data-testid="ai-settings">
            <Button variant="secondary" size="sm" fullWidth onClick={() => { setOpen(false); setConnectionsOpen(true) }}>Manage connections</Button>
            <ControlRow propKey="ai-provider" inputId="ai-provider" label="Provider" layout="stacked">
              {/* A native <select>, not the `Select` primitive: that one portals
                  its listbox to document.body as its own ContextMenu, and a
                  click inside it reads as "outside" to this popover's dismiss
                  handler — which silently closed the whole popover the moment a
                  provider was picked. Native renders inline, so the click stays
                  within the menu. */}
              <select
                id="ai-provider"
                className={styles.nativeSelect}
                value={provider}
                onChange={(event) => pickProvider(event.currentTarget.value)}
              >
                {PROVIDERS.map((entry) => (
                  <option key={entry.id} value={entry.id}>{entry.label}</option>
                ))}
              </select>
            </ControlRow>

            {provider === 'custom' && (
              <ControlRow propKey="ai-base-url" inputId="ai-base-url" label="Base URL" layout="stacked">
                <Input
                  id="ai-base-url"
                  value={baseUrl}
                  placeholder="https://host/v1"
                  onChange={(event) => setBaseUrl(event.currentTarget.value)}
                />
              </ControlRow>
            )}

            {provider === 'dukafi' && connected && (
              <p className={styles.settingsHint}>Connected. The store holds the MCP token.</p>
            )}

            {provider === 'dukafi' && (
              <ControlRow propKey="ai-harness-url" inputId="ai-harness-url" label="Harness URL" layout="stacked">
                <Input
                  id="ai-harness-url"
                  value={harnessUrl}
                  placeholder="Blank = official (DUKAFI_AI_URL)"
                  onChange={(event) => setHarnessUrl(event.currentTarget.value)}
                />
              </ControlRow>
            )}

            {needsKey && provider !== 'dukafi' && (
              <ControlRow propKey="ai-key" inputId="ai-key" label="API key" layout="stacked">
                <Input
                  id="ai-key"
                  type="password"
                  value={apiKey}
                  placeholder={hasKey ? 'Saved — leave blank to keep' : 'Not set'}
                  onChange={(event) => setApiKey(event.currentTarget.value)}
                />
              </ControlRow>
            )}

            {provider !== 'dukafi' && (
            <ControlRow propKey="ai-model" inputId="ai-model" label="Model" layout="stacked">
              {models.length > 0 ? (
                <select
                  id="ai-model"
                  className={styles.nativeSelect}
                  value={model}
                  onChange={(event) => setModel(event.currentTarget.value)}
                >
                  {/* The stored model may not be in a freshly loaded catalogue;
                      keeping it listed stops the select silently changing it. */}
                  {!models.includes(model) && model !== '' && <option value={model}>{model}</option>}
                  {models.map((id) => <option key={id} value={id}>{id}</option>)}
                </select>
              ) : (
                <Input
                  id="ai-model"
                  value={model}
                  placeholder="qwen2.5-coder:7b"
                  onChange={(event) => setModel(event.currentTarget.value)}
                />
              )}
            </ControlRow>
            )}

            <div className={styles.settingsActions}>
              {provider === 'dukafi' ? (
                <>
                  {connected ? (
                    <Button variant="ghost" size="xs" onClick={() => void disconnect()} disabled={busy}>
                      Disconnect
                    </Button>
                  ) : (
                    <Button variant="secondary" size="xs" onClick={() => void connect()} disabled={busy}>
                      {busy ? 'Connecting…' : 'Connect'}
                    </Button>
                  )}
                  <Button variant="primary" size="xs" onClick={() => void save()} disabled={busy}>
                    {busy ? 'Saving…' : 'Save'}
                  </Button>
                </>
              ) : (
                <>
              <Button variant="secondary" size="xs" onClick={loadModels} disabled={loadingModels || !baseUrl}>
                {loadingModels ? 'Loading…' : 'Load models'}
              </Button>
              {hasKey && needsKey && (
                <Button variant="ghost" size="xs" onClick={() => void save(true)} disabled={busy}>
                  Remove key
                </Button>
              )}
              <Button
                variant="primary"
                size="xs"
                onClick={() => void save()}
                disabled={busy || !baseUrl.trim() || !model.trim()}
              >
                {busy ? 'Saving…' : 'Save'}
              </Button>
                </>
              )}
            </div>

            {error && <p className={styles.settingsError} role="alert">{error}</p>}
          </div>
        </ContextMenu>
      )}
      <AiConnectionsDialog open={connectionsOpen} onClose={() => setConnectionsOpen(false)} onSaved={onSaved} />
    </>
  )
}
