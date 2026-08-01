/**
 * Commerce → Settings. Store-wide commerce configuration — currently just
 * the default currency and the default low-stock threshold. v1 is
 * single-currency (VISION.md's post-1.0 parking lot explicitly defers real
 * multi-currency support): the configured currency here always wins over
 * anything a form or CSV import might otherwise suggest, enforced
 * server-side in `commerce_variant_attributes` (dukafy/routes/admin_api.rb).
 *
 * Self-contained (own fetch), unlike Products/Collections — this data isn't
 * shared with any other section, so it doesn't need to live in
 * `useCommerceData`.
 */
import { useEffect, useState, type FormEvent } from 'react'
import { Button } from '@ui/components/Button'
import { FormField } from '@ui/components/FormField'
import { Input } from '@ui/components/Input'
import { SkeletonBlock } from '@ui/components/Skeleton'
import { getErrorMessage } from '@core/utils/errorMessage'
import { SaveSolidIcon } from 'pixel-art-icons/icons/save-solid'
import { commerceApi } from '../api'
import type { CommerceSettings } from '../types'
import styles from '../CommercePage.module.css'

export function SettingsSection() {
  const [settings, setSettings] = useState<CommerceSettings | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    commerceApi.getSettings()
      .then((result) => { if (!cancelled) setSettings(result.settings) })
      .catch((err) => { if (!cancelled) setError(getErrorMessage(err, 'Could not load commerce settings')) })
    return () => { cancelled = true }
  }, [])

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const result = await commerceApi.updateSettings({
        currency: String(form.get('currency') || 'USD'),
        lowStockThreshold: Number(form.get('lowStockThreshold') || 5),
      })
      setSettings(result.settings)
      setNotice('Saved.')
    } catch (err) {
      setError(getErrorMessage(err, 'Could not save commerce settings'))
    } finally {
      setBusy(false)
    }
  }

  if (error && !settings) return <p className={styles.error} role="alert">{error}</p>
  if (!settings) return <SkeletonBlock minHeight={160} ariaLabel="Loading commerce settings" />

  return (
    <div className={styles.section}>
      <div className={styles.sectionHeader}>
        <h2>Settings</h2>
        <p>Store-wide commerce configuration.</p>
      </div>

      {error && <p className={styles.error} role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}

      <form className={styles.dialogForm} onSubmit={handleSave}>
        <FormField
          label="Currency"
          htmlFor="commerce-currency"
          description="Three-letter code (e.g. USD, EUR, KES). Dukafy is single-currency in v1 — every variant is always saved with this currency, regardless of what a form or CSV import suggests."
        >
          <Input
            id="commerce-currency"
            name="currency"
            required
            pattern="[A-Za-z]{3}"
            maxLength={3}
            defaultValue={settings.currency}
            monospace
            style={{ textTransform: 'uppercase', width: '8ch' }}
          />
        </FormField>
        <FormField
          label="Low-stock threshold"
          htmlFor="commerce-low-stock-threshold"
          description="Stock badges show “Only N left” at or below this quantity. Only affects newly-generated product templates and badges without their own override — existing pages keep whatever threshold they already have."
        >
          <Input
            id="commerce-low-stock-threshold"
            name="lowStockThreshold"
            type="number"
            min={0}
            required
            defaultValue={settings.lowStockThreshold}
            style={{ width: '8ch' }}
          />
        </FormField>
        <div className={styles.dialogFormActions}>
          <Button type="submit" variant="primary" size="sm" disabled={busy}>
            <SaveSolidIcon size={14} aria-hidden="true" />
            <span>Save settings</span>
          </Button>
        </div>
      </form>
    </div>
  )
}
