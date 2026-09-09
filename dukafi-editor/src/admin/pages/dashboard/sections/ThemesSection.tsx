import { useEffect, useState } from 'react'
import { Button } from '@ui/components/Button'
import { Dialog } from '@ui/components/Dialog'
import { getErrorMessage } from '@core/utils/errorMessage'
import { themeApi } from '../api'
import type { ThemeInspect, ThemeSummary } from '../types'
import { ThemeApplyForm } from './ThemeApplyForm'

export function ThemesSection() {
  const [themes, setThemes] = useState<ThemeSummary[]>([])
  const [inspect, setInspect] = useState<ThemeInspect | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [degraded, setDegraded] = useState(false)
  const [applied, setApplied] = useState<{ themeId: string | null; version: string | null; appliedAt: string | null } | null>(null)
  useEffect(() => {
    fetch('/admin/api/cms/themes/catalogue', { credentials: 'same-origin' })
      .then(async (response) => {
        if (!response.ok) throw new Error('Could not load themes')
        return response.json() as Promise<{ themes: ThemeSummary[]; degraded?: boolean }>
      }).then((payload) => {
        setThemes(payload.themes)
        setDegraded(!!payload.degraded)
      }).catch((cause) => setError(getErrorMessage(cause, 'Could not load themes')))
    fetch('/admin/api/cms/site', { credentials: 'same-origin' })
      .then(async (response) => response.ok ? response.json() as Promise<{ site?: { settings?: { theme?: { themeId?: string; version?: string; appliedAt?: string } } } }> : null)
      .then((payload) => {
        const theme = payload?.site?.settings?.theme
        if (theme) setApplied({ themeId: theme.themeId ?? null, version: theme.version ?? null, appliedAt: theme.appliedAt ?? null })
      }).catch(() => {})
  }, [])

  async function install(theme: ThemeSummary) {
    setBusyId(theme.id); setError(null)
    try { setInspect(await themeApi.installTheme(theme.id)) }
    catch (cause) { setError(getErrorMessage(cause, 'Could not install theme')) }
    finally { setBusyId(null) }
  }

  return <section>
    <h2>Themes</h2><p>Start with a complete storefront and customize it in the editor.</p>
    {applied?.themeId && <p data-testid="applied-theme">Applied: {applied.themeId}{applied.version ? ` v${applied.version}` : ''}</p>}
    {degraded && <p role="status">Registry is unreachable. Showing bundled starter themes.</p>}
    {error && <p role="alert">{error}</p>}
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 16 }}>
      {themes.map((theme) => <article key={theme.id} style={{ border: '1px solid var(--border-subtle)', borderRadius: 8, padding: 16 }}>
        <h3>{theme.name}</h3><p>{theme.description}</p><small>{theme.contents.pages} pages · {theme.contents.products} products</small>
        <div style={{ marginTop: 12 }}><Button variant="primary" size="sm" disabled={busyId !== null} onClick={() => void install(theme)}>{busyId === theme.id ? 'Loading…' : 'Install'}</Button></div>
      </article>)}
    </div>
    <Dialog open={inspect !== null} onClose={() => setInspect(null)} title={inspect ? `Install ${inspect.theme.name}` : 'Install theme'} size="lg">
      {inspect && <ThemeApplyForm inspect={inspect} onCancel={() => setInspect(null)} onDone={() => setInspect(null)} />}
    </Dialog>
  </section>
}
