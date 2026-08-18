import { useEffect, useState } from 'react'
import { Button } from '@ui/components/Button'
import { Dialog } from '@ui/components/Dialog'
import { getErrorMessage } from '@core/utils/errorMessage'
import { themeApi } from '@admin/pages/dashboard/api'
import { ThemeApplyForm } from '@admin/pages/dashboard/sections/ThemeApplyForm'
import type { ThemeInspect, ThemeSummary } from '@admin/pages/dashboard/types'

const DISMISS_KEY = 'dukafi.defaultThemeDismissed'

export function DefaultThemePrompt() {
  const [offer, setOffer] = useState<ThemeSummary | null>(null)
  const [inspect, setInspect] = useState<ThemeInspect | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (typeof localStorage !== 'undefined' && localStorage.getItem(DISMISS_KEY) === '1') return
    let cancelled = false
    themeApi.defaultTheme()
      .then((result) => {
        if (!cancelled && result.theme) setOffer(result.theme)
      })
      .catch(() => {
        // Registry down or no default — stay on the blank starter.
      })
    return () => { cancelled = true }
  }, [])

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, '1')
    setOffer(null)
    setInspect(null)
  }

  async function accept() {
    if (!offer) return
    setBusy(true)
    setError(null)
    try {
      const payload = await themeApi.installTheme(offer.id)
      setInspect(payload)
      setOffer(null)
    } catch (err) {
      setError(getErrorMessage(err, 'Could not load the default theme'))
    } finally {
      setBusy(false)
    }
  }

  const contents = offer?.contents

  return (
    <>
      <Dialog
        open={offer !== null}
        onClose={dismiss}
        title="Start from a theme?"
        footer={
          <>
            <Button type="button" variant="secondary" size="sm" onClick={dismiss}>
              <span>Skip</span>
            </Button>
            <Button type="button" variant="primary" size="sm" onClick={() => void accept()} disabled={busy}>
              <span>{busy ? 'Loading…' : 'Use this theme'}</span>
            </Button>
          </>
        }
      >
        {offer && (
          <>
            <p>
              <strong>{offer.name}</strong>
              {offer.description ? ` — ${offer.description}` : ''}.
              Accepting copies its media from the demo store into this one, then applies pages, tables, and sample products.
            </p>
            {contents && (
              <p>
                {contents.pages} pages, {contents.templates} templates, {contents.products} products, {contents.media} images.
              </p>
            )}
            {error && <p role="alert">{error}</p>}
          </>
        )}
      </Dialog>

      <Dialog
        open={inspect !== null}
        onClose={dismiss}
        title={inspect ? `Import ${inspect.theme.name}` : 'Import theme'}
        size="lg"
      >
        {inspect && (
          <ThemeApplyForm
            inspect={inspect}
            onCancel={dismiss}
            onDone={() => dismiss()}
          />
        )}
      </Dialog>
    </>
  )
}
