/**
 * PluginsSection — configure, export and remove installed plugins.
 *
 * The settings form is generated ENTIRELY from the schema each plugin declares
 * server-side (`p.secret :api_token`, `p.integer :channel_id`, …). Adding a
 * plugin therefore adds its settings form too, with no UI code of its own —
 * which is the whole point of a plugin system.
 *
 * Secrets are write-only over the API: the form can say one is set, but never
 * shows it. Submitting a blank secret leaves the stored value alone, since
 * the field could not have shown it to be resubmitted.
 *
 * Export builds a tarball of the plugin directory. The SHA-256 in the
 * response is of those archive bytes — it cannot live inside the tarball
 * without changing itself. The registry hashes the file again on upload.
 */
import { useEffect, useState, type FormEvent } from 'react'
import { Button } from '@ui/components/Button'
import { DataTable, DataTableBody, DataTableCell, DataTableHead, DataTableHeader, DataTableRow } from '@ui/components/DataTable'
import { Dialog } from '@ui/components/Dialog'
import { EmptyState } from '@ui/components/EmptyState'
import { Input } from '@ui/components/Input'
import { ControlRow } from '@ui/components/ControlRow'
import { SearchBar } from '@ui/components/SearchBar'
import { Select } from '@ui/components/Select'
import { TagPill } from '@ui/components/TagPill'
import { PackageSolidIcon } from 'pixel-art-icons/icons/package-solid'
import { PlusIcon } from 'pixel-art-icons/icons/plus'
import { SettingsCogSolidIcon } from 'pixel-art-icons/icons/settings-cog-solid'
import { TrashSolidIcon } from 'pixel-art-icons/icons/trash-solid'
import { getErrorMessage } from '@core/utils/errorMessage'
import { commerceApi } from '../api'
import { Pagination } from '../components/Pagination'
import type { CommerceData } from '../hooks/useCommerceData'
import type { CataloguePlugin, CatalogueQuery, Plugin, PluginSettingField } from '../types'
import styles from '../DashboardPage.module.css'

const REGISTRY_CATEGORIES = [
  'payments', 'shipping', 'marketing', 'analytics', 'content', 'media', 'integrations', 'other',
] as const

const CATEGORY_OPTIONS = [
  { value: '', label: 'All categories', textValue: 'All categories' },
  ...REGISTRY_CATEGORIES.map((id) => {
    const label = id.charAt(0).toUpperCase() + id.slice(1)
    return { value: id, label, textValue: label }
  }),
]

const LICENSED_OPTIONS = [
  { value: '', label: 'All plugins', textValue: 'All plugins' },
  { value: 'false', label: 'Free', textValue: 'Free' },
  { value: 'true', label: 'Licensed', textValue: 'Licensed' },
]

const CATALOGUE_PAGE_SIZE = 25

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

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

export function PluginsSection({ data }: { data: CommerceData }) {
  const { plugins, error, setError, refresh } = data
  const [editing, setEditing] = useState<Plugin | null>(null)
  const [exporting, setExporting] = useState<Plugin | null>(null)
  const [exportName, setExportName] = useState('')
  const [exportVersion, setExportVersion] = useState('')
  const [checksum, setChecksum] = useState<string | null>(null)
  const [removeCandidate, setRemoveCandidate] = useState<Plugin | null>(null)
  const [browsing, setBrowsing] = useState(false)
  const [catalogue, setCatalogue] = useState<CataloguePlugin[] | null>(null)
  const [catalogueTotal, setCatalogueTotal] = useState(0)
  const [catalogueError, setCatalogueError] = useState<string | null>(null)
  const [catalogueQuery, setCatalogueQuery] = useState('')
  const [debouncedCatalogueQuery, setDebouncedCatalogueQuery] = useState('')
  const [catalogueCategory, setCatalogueCategory] = useState('')
  const [catalogueLicensed, setCatalogueLicensed] = useState('')
  const [cataloguePage, setCataloguePage] = useState(1)
  const [cataloguePageSize, setCataloguePageSize] = useState(CATALOGUE_PAGE_SIZE)
  const [installingId, setInstallingId] = useState<string | null>(null)
  const [inspecting, setInspecting] = useState<CataloguePlugin | null>(null)
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

  useEffect(() => {
    if (!exporting) {
      setExportName('')
      setExportVersion('')
      setChecksum(null)
      return
    }
    setExportName(exporting.name)
    setExportVersion(exporting.version)
    setChecksum(null)
  }, [exporting])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedCatalogueQuery(catalogueQuery)
      if (catalogueQuery !== debouncedCatalogueQuery) setCataloguePage(1)
    }, 250)
    return () => window.clearTimeout(timer)
  }, [catalogueQuery, debouncedCatalogueQuery])

  useEffect(() => {
    if (!browsing) return
    let cancelled = false
    setCatalogueError(null)
    void (async () => {
      try {
        const result = await commerceApi.listCatalogue({
          q: debouncedCatalogueQuery,
          category: catalogueCategory || undefined,
          licensed: catalogueLicensed === '' ? undefined : catalogueLicensed === 'true',
          limit: cataloguePageSize,
          offset: (cataloguePage - 1) * cataloguePageSize,
        })
        if (cancelled) return
        if (result.plugins.length === 0 && result.total > 0 && cataloguePage > 1) {
          setCataloguePage(1)
          return
        }
        setCatalogue(result.plugins)
        setCatalogueTotal(result.total)
      } catch (err) {
        if (cancelled) return
        setCatalogue(null)
        setCatalogueTotal(0)
        setCatalogueError(getErrorMessage(err, 'Could not load the plugin catalogue'))
      }
    })()
    return () => { cancelled = true }
  }, [browsing, debouncedCatalogueQuery, catalogueCategory, catalogueLicensed, cataloguePage, cataloguePageSize])

  function catalogueListQuery(): CatalogueQuery {
    return {
      q: debouncedCatalogueQuery,
      category: catalogueCategory || undefined,
      licensed: catalogueLicensed === '' ? undefined : catalogueLicensed === 'true',
      limit: cataloguePageSize,
      offset: (cataloguePage - 1) * cataloguePageSize,
    }
  }

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

  async function handleExport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!exporting) return
    setBusy(true)
    setError(null)
    try {
      const archive = await commerceApi.exportPlugin(exporting.id, {
        name: exportName.trim(),
        version: exportVersion.trim(),
      })
      downloadBlob(archive.blob, archive.filename)
      setChecksum(archive.sha256)
    } catch (err) {
      setError(getErrorMessage(err, 'Could not export the plugin'))
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete(plugin: Plugin) {
    setBusy(true)
    setError(null)
    try {
      await commerceApi.deletePlugin(plugin.id)
      await refresh()
      setRemoveCandidate(null)
    } catch (err) {
      setError(getErrorMessage(err, 'Could not delete the plugin'))
    } finally {
      setBusy(false)
    }
  }

  function openCatalogue() {
    setCatalogueQuery('')
    setDebouncedCatalogueQuery('')
    setCatalogueCategory('')
    setCatalogueLicensed('')
    setCataloguePage(1)
    setCataloguePageSize(CATALOGUE_PAGE_SIZE)
    setCatalogue(null)
    setCatalogueTotal(0)
    setCatalogueError(null)
    setInspecting(null)
    setBrowsing(true)
  }

  async function handleInstall(listing: CataloguePlugin): Promise<boolean> {
    setInstallingId(listing.id)
    setError(null)
    setCatalogueError(null)
    try {
      await commerceApi.installPlugin(listing.id)
      await refresh()
      const result = await commerceApi.listCatalogue(catalogueListQuery())
      setCatalogue(result.plugins)
      setCatalogueTotal(result.total)
      return true
    } catch (err) {
      setCatalogueError(getErrorMessage(err, 'Could not install the plugin'))
      return false
    } finally {
      setInstallingId(null)
    }
  }

  return (
    <div className={styles.section}>
      <div className={styles.toolbar}>
        <span />
        <Button type="button" variant="primary" size="sm" onClick={openCatalogue} data-testid="plugin-catalogue-open">
          <PlusIcon size={14} aria-hidden="true" />
          <span>Install from registry</span>
        </Button>
      </div>

      {error && <p className={styles.error} role="alert">{error}</p>}

      {plugins.length === 0 ? (
        <EmptyState
          title="No plugins installed."
          description="Install one from the registry to add payments and other integrations."
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
                <DataTableCell>
                  <TagPill
                    label={plugin.configured ? 'Configured' : 'Needs setup'}
                    colorKey={plugin.configured ? 'configured' : 'needs-setup'}
                    muted={!plugin.configured}
                    size="xs"
                  />
                </DataTableCell>
                <DataTableCell className={styles.actionsCell}>
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    iconOnly
                    disabled={plugin.settings.length === 0}
                    tooltip="Configure"
                    aria-label={`Configure ${plugin.name}`}
                    onClick={() => setEditing(plugin)}
                    data-testid={`plugin-configure-${plugin.id}`}
                  >
                    <SettingsCogSolidIcon size={14} aria-hidden="true" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    iconOnly
                    tooltip="Export"
                    aria-label={`Export ${plugin.name}`}
                    onClick={() => setExporting(plugin)}
                    data-testid={`plugin-export-${plugin.id}`}
                  >
                    <PackageSolidIcon size={14} aria-hidden="true" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    tone="danger"
                    size="xs"
                    iconOnly
                    tooltip="Delete"
                    aria-label={`Delete ${plugin.name}`}
                    onClick={() => setRemoveCandidate(plugin)}
                    data-testid={`plugin-delete-${plugin.id}`}
                  >
                    <TrashSolidIcon size={14} aria-hidden="true" />
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

      <Dialog
        open={exporting !== null}
        onClose={() => setExporting(null)}
        title={exporting ? `Export ${exporting.name}` : 'Export plugin'}
        footer={
          <>
            <Button type="button" variant="secondary" size="sm" onClick={() => setExporting(null)}>
              <span>{checksum ? 'Done' : 'Cancel'}</span>
            </Button>
            <Button type="submit" form="plugin-export-form" variant="primary" size="sm" disabled={busy}>
              <PackageSolidIcon size={13} aria-hidden="true" />
              <span>{busy ? 'Exporting…' : checksum ? 'Export again' : 'Export'}</span>
            </Button>
          </>
        }
      >
        {exporting && (
          <form id="plugin-export-form" className={styles.dialogForm} onSubmit={(event) => void handleExport(event)}>
            <ControlRow propKey="name" inputId="plugin-export-name" label="Name" layout="stacked">
              <Input
                id="plugin-export-name"
                value={exportName}
                autoComplete="off"
                disabled={busy}
                onChange={(event) => setExportName(event.currentTarget.value)}
              />
            </ControlRow>
            <ControlRow propKey="version" inputId="plugin-export-version" label="Version" layout="stacked">
              <Input
                id="plugin-export-version"
                value={exportVersion}
                autoComplete="off"
                disabled={busy}
                onChange={(event) => setExportVersion(event.currentTarget.value)}
              />
            </ControlRow>
            {checksum ? (
              <div className={styles.checksum}>
                <p className={styles.connectHint}>
                  SHA-256 of this archive. The registry hashes the file when you
                  upload it on dukafi.dev — you do not paste this into a manifest.
                  Keep it if you want to check the download yourself.
                </p>
                <code data-testid="plugin-export-checksum">{checksum}</code>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => { void navigator.clipboard.writeText(checksum) }}
                >
                  Copy checksum
                </Button>
              </div>
            ) : (
              <p className={styles.connectHint}>
                Downloads a <code>.tar.gz</code> of this plugin. Name and version
                are written into the exported <code>plugin.rb</code>; the install
                on this store is left as it is.
              </p>
            )}
          </form>
        )}
      </Dialog>

      <Dialog
        open={removeCandidate !== null}
        onClose={() => setRemoveCandidate(null)}
        title="Delete plugin?"
        tone="danger"
        footer={
          <>
            <Button type="button" variant="secondary" size="sm" onClick={() => setRemoveCandidate(null)} disabled={busy}>
              <span>Cancel</span>
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={busy}
              onClick={() => removeCandidate && void handleDelete(removeCandidate)}
            >
              <TrashSolidIcon size={13} aria-hidden="true" />
              <span>{busy ? 'Deleting…' : 'Delete plugin'}</span>
            </Button>
          </>
        }
      >
        <p>
          This removes “{removeCandidate?.name}” from this store — its files and
          its settings. Payment methods it provided stop being offered immediately.
          To reinstall it, copy the directory back into the plugins folder.
        </p>
      </Dialog>

      <Dialog
        open={browsing}
        onClose={() => setBrowsing(false)}
        title="Install from registry"
        size="2xl"
        footer={
          <Button type="button" variant="secondary" size="sm" onClick={() => setBrowsing(false)}>
            <span>Close</span>
          </Button>
        }
      >
        <div className={styles.catalogueBrowse}>
          <div className={styles.catalogueToolbar}>
            <SearchBar
              className={styles.catalogueSearch}
              value={catalogueQuery}
              onValueChange={setCatalogueQuery}
              placeholder="Search plugins…"
              aria-label="Search plugins"
              data-testid="plugin-catalogue-search"
            />
            <Select
              id="plugin-catalogue-category"
              className={styles.catalogueFilter}
              aria-label="Category"
              value={catalogueCategory}
              options={CATEGORY_OPTIONS}
              fieldSize="sm"
              searchable={false}
              onChange={(event) => {
                setCatalogueCategory(event.currentTarget.value)
                setCataloguePage(1)
              }}
            />
            <Select
              id="plugin-catalogue-licensed"
              className={styles.catalogueFilter}
              aria-label="Licence"
              value={catalogueLicensed}
              options={LICENSED_OPTIONS}
              fieldSize="sm"
              searchable={false}
              onChange={(event) => {
                setCatalogueLicensed(event.currentTarget.value)
                setCataloguePage(1)
              }}
            />
          </div>

          {catalogueError && <p className={styles.error} role="alert">{catalogueError}</p>}
          {catalogue === null && !catalogueError ? (
            <p className={styles.connectHint}>Loading the catalogue…</p>
          ) : catalogue && catalogue.length === 0 ? (
            <EmptyState
              title={catalogueQuery || catalogueCategory || catalogueLicensed
                ? 'Nothing matches that.'
                : 'Nothing listed yet.'}
              description={catalogueQuery || catalogueCategory || catalogueLicensed
                ? 'Try a different search or filter.'
                : 'Approved plugins from the Dukafi registry will appear here.'}
            />
          ) : catalogue ? (
            <DataTable aria-label="Plugin catalogue" density="compact">
              <DataTableHead>
                <DataTableRow>
                  <DataTableHeader scope="col">Plugin</DataTableHeader>
                  <DataTableHeader scope="col">Version</DataTableHeader>
                  <DataTableHeader scope="col">Category</DataTableHeader>
                  <DataTableHeader scope="col" className={styles.actionsHeader}> </DataTableHeader>
                </DataTableRow>
              </DataTableHead>
              <DataTableBody>
                {catalogue.map((listing) => (
                  <DataTableRow key={listing.id}>
                    <DataTableCell>
                      <div className={styles.identityRow}>
                        {listing.logo ? (
                          <img src={listing.logo} alt="" className={styles.pluginLogo} />
                        ) : (
                          <span className={styles.pluginLogoFallback} aria-hidden="true">
                            {listing.name.slice(0, 1).toUpperCase()}
                          </span>
                        )}
                        <div className={styles.identity}>
                          <button
                            type="button"
                            className={styles.pluginName}
                            onClick={() => setInspecting(listing)}
                            data-testid={`plugin-details-${listing.id}`}
                          >
                            {listing.name}
                          </button>
                          <span>{listing.author || listing.id}</span>
                        </div>
                      </div>
                    </DataTableCell>
                    <DataTableCell>{listing.version}</DataTableCell>
                    <DataTableCell>{listing.category || '—'}</DataTableCell>
                    <DataTableCell className={styles.actionsCell}>
                      {listing.installed ? (
                        <TagPill label="Installed" colorKey="configured" size="xs" />
                      ) : listing.licensed ? (
                        listing.purchaseUrl ? (
                          <Button type="button" variant="secondary" size="xs" onClick={() => window.open(listing.purchaseUrl, '_blank', 'noopener')}>
                            Buy
                          </Button>
                        ) : (
                          <TagPill label="Licensed" muted size="xs" />
                        )
                      ) : (
                        <Button
                          type="button"
                          variant="primary"
                          size="xs"
                          disabled={installingId !== null}
                          onClick={() => void handleInstall(listing)}
                          data-testid={`plugin-install-${listing.id}`}
                        >
                          {installingId === listing.id ? 'Installing…' : 'Install'}
                        </Button>
                      )}
                    </DataTableCell>
                  </DataTableRow>
                ))}
              </DataTableBody>
            </DataTable>
          ) : null}

          {catalogue !== null && catalogueTotal > 0 && (
            <Pagination
              page={cataloguePage}
              pageSize={cataloguePageSize}
              total={catalogueTotal}
              onPageChange={setCataloguePage}
              onPageSizeChange={(size) => {
                setCataloguePageSize(size)
                setCataloguePage(1)
              }}
            />
          )}
        </div>
      </Dialog>

      <Dialog
        open={inspecting !== null}
        onClose={() => setInspecting(null)}
        title={inspecting?.name ?? 'Plugin'}
        eyebrow={inspecting ? `${inspecting.category || 'plugin'} · ${inspecting.version}` : undefined}
        size="xl"
        footer={inspecting && !inspecting.installed && !inspecting.licensed ? (
          <Button
            type="button"
            variant="primary"
            size="sm"
            disabled={installingId !== null}
            onClick={() => {
              const listing = inspecting
              void handleInstall(listing).then((ok) => {
                if (ok) setInspecting(null)
              })
            }}
          >
            {installingId === inspecting.id ? 'Installing…' : 'Install'}
          </Button>
        ) : inspecting?.licensed && inspecting.purchaseUrl ? (
          <Button type="button" variant="secondary" size="sm" onClick={() => window.open(inspecting.purchaseUrl, '_blank', 'noopener')}>
            Buy
          </Button>
        ) : undefined}
      >
        {inspecting && (
          <div className={styles.pluginDetail}>
            <div className={styles.identityRow}>
              {inspecting.logo ? (
                <img src={inspecting.logo} alt="" className={styles.pluginLogoLarge} />
              ) : (
                <span className={styles.pluginLogoFallbackLarge} aria-hidden="true">
                  {inspecting.name.slice(0, 1).toUpperCase()}
                </span>
              )}
              <div className={styles.identity}>
                <strong>{inspecting.name}</strong>
                <span>{inspecting.author || inspecting.id}</span>
              </div>
            </div>
            {inspecting.description ? (
              <p className={styles.connectHint}>{inspecting.description}</p>
            ) : (
              <p className={styles.connectHint}>No description yet.</p>
            )}
            {inspecting.images?.length > 0 && (
              <div className={styles.pluginShots}>
                {inspecting.images.map((src) => (
                  <img key={src} src={src} alt="" />
                ))}
              </div>
            )}
            {inspecting.homepage ? (
              <p className={styles.connectHint}>
                <a href={inspecting.homepage} target="_blank" rel="noreferrer noopener">Homepage</a>
              </p>
            ) : null}
          </div>
        )}
      </Dialog>
    </div>
  )
}
