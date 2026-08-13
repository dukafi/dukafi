/**
 * PluginsSection — configure installed plugins.
 *
 * The form is generated ENTIRELY from the schema each plugin declares
 * server-side (`p.secret :api_token`, `p.integer :channel_id`, …). Adding a
 * plugin therefore adds its settings form too, with no UI code of its own —
 * which is the whole point of a plugin system.
 *
 * Secrets are write-only over the API: the form can say one is set, but never
 * shows it. Submitting a blank secret leaves the stored value alone, since
 * the field could not have shown it to be resubmitted.
 */
import { useEffect, useState, type FormEvent } from 'react'
import { Button } from '@ui/components/Button'
import { DataTable, DataTableBody, DataTableCell, DataTableHead, DataTableHeader, DataTableRow } from '@ui/components/DataTable'
import { Dialog } from '@ui/components/Dialog'
import { EmptyState } from '@ui/components/EmptyState'
import { Input } from '@ui/components/Input'
import { ControlRow } from '@ui/components/ControlRow'
import { getErrorMessage } from '@core/utils/errorMessage'
import { commerceApi } from '../api'
import type { CommerceData } from '../hooks/useCommerceData'
import type { Plugin, PluginSettingField } from '../types'
import styles from '../DashboardPage.module.css'

function inputType(field: PluginSettingField): string {
  if (field.secret) return 'password'
  return field.type === 'integer' ? 'number' : 'text'
}

/**
 * A secret that is already stored shows a placeholder rather than its value,
 * and blank-on-submit means "keep it".
 */
function placeholderFor(field: PluginSettingField): string {
  if (field.secret) return field.isSet ? 'Saved — leave blank to keep' : 'Not set'
  return ''
}

export function PluginsSection({ data }: { data: CommerceData }) {
  const { plugins, error, setError, refresh } = data
  const [editing, setEditing] = useState<Plugin | null>(null)
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)

  // Reseed whenever a different plugin is opened, and after a refresh brings
  // new values back.
  useEffect(() => {
    if (!editing) return
    const next: Record<string, string> = {}
    for (const field of editing.settings) next[field.key] = field.secret ? '' : (field.value ?? '')
    setDraft(next)
  }, [editing])

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editing) return
    setBusy(true)
    setError(null)
    try {
      await commerceApi.savePluginSettings(editing.id, draft)
      await refresh()
      setEditing(null)
    } catch (err) {
      setError(getErrorMessage(err, 'Could not save the plugin settings'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={styles.section}>
      {error && <p className={styles.error} role="alert">{error}</p>}

      {plugins.length === 0 ? (
        <EmptyState
          title="No plugins installed."
          description="Plugins add payment providers and other integrations."
        />
      ) : (
        <DataTable aria-label="Plugins" density="compact">
          <DataTableHead>
            <DataTableRow>
              <DataTableHeader scope="col">Plugin</DataTableHeader>
              <DataTableHeader scope="col">Version</DataTableHeader>
              <DataTableHeader scope="col">Provides</DataTableHeader>
              <DataTableHeader scope="col">Status</DataTableHeader>
              <DataTableHeader scope="col" className={styles.actionsHeader}>Actions</DataTableHeader>
            </DataTableRow>
          </DataTableHead>
          <DataTableBody>
            {plugins.map((plugin) => (
              <DataTableRow key={plugin.id}>
                <DataTableCell>{plugin.name}</DataTableCell>
                <DataTableCell>{plugin.version}</DataTableCell>
                <DataTableCell>
                  {plugin.paymentProviders.length > 0
                    ? `Payments: ${plugin.paymentProviders.join(', ')}`
                    : '—'}
                </DataTableCell>
                <DataTableCell>{plugin.configured ? 'Configured' : 'Needs setup'}</DataTableCell>
                <DataTableCell>
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    disabled={plugin.settings.length === 0}
                    onClick={() => setEditing(plugin)}
                    data-testid={`plugin-configure-${plugin.id}`}
                  >
                    Configure
                  </Button>
                </DataTableCell>
              </DataTableRow>
            ))}
          </DataTableBody>
        </DataTable>
      )}

      <Dialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing ? editing.name : 'Plugin'}
        footer={
          <>
            <Button type="button" variant="secondary" size="sm" onClick={() => setEditing(null)}>
              <span>Cancel</span>
            </Button>
            <Button type="submit" form="plugin-settings-form" variant="primary" size="sm" disabled={busy}>
              <span>{busy ? 'Saving…' : 'Save'}</span>
            </Button>
          </>
        }
      >
        {editing && (
          <form id="plugin-settings-form" onSubmit={(event) => void handleSave(event)}>
            {editing.settings.map((field) => {
              // The row's `htmlFor` and the input's `id` must be the same
              // string, or the label points at nothing — no click-to-focus,
              // and a screen reader announces an unlabelled field.
              const fieldId = `plugin-${editing.id}-${field.key}`
              return (
              <ControlRow key={field.key} propKey={field.key} inputId={fieldId} label={field.label} layout="stacked">
                <Input
                  id={fieldId}
                  type={inputType(field)}
                  value={draft[field.key] ?? ''}
                  placeholder={placeholderFor(field)}
                  autoComplete="off"
                  disabled={busy}
                  onChange={(event) => {
                    // Read the value BEFORE the updater: React clears
                    // `currentTarget` once the handler returns, and a
                    // functional setState runs later than that.
                    const value = event.currentTarget.value
                    setDraft((current) => ({ ...current, [field.key]: value }))
                  }}
                />
              </ControlRow>
              )
            })}
          </form>
        )}
      </Dialog>
    </div>
  )
}
