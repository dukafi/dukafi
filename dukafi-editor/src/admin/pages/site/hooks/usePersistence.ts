import { useEffect, useRef, useState } from 'react'
import { useEditorStore } from '@site/store/store'
import type { SiteDocument } from '@core/page-tree'
import type { IPersistenceAdapter } from '@core/persistence/types'
import { cmsAdapter } from '@core/persistence/cms'
import { SiteValidationError } from '@core/persistence/validate'
import { getErrorMessage } from '@core/utils/errorMessage'
import { pushToast } from '@ui/components/Toast'
import { readEditorSelectPreference } from '@site/preferences/editorPreferences'
import { consumePendingCmsSiteReload, hasPendingCmsSiteReload } from '@admin/state/adminEvents'
import { recordSiteSeq } from '@site/sync/siteSyncSeq'
import { consumeSkipSiteAutosave } from '@site/sync/refreshSiteFromServer'
import { useExternalSiteChanges } from '@site/sync/useExternalSiteChanges'

export interface PersistenceSaveStatus {
  state: 'loading' | 'synced' | 'connecting' | 'offline' | 'error'
  message?: string
}

interface PersistenceController {
  saveStatus: PersistenceSaveStatus
}

const SAVE_DEBOUNCE_MS = 400

function currentEditorDataDeepLink(): { table: 'pages' | 'components'; rowId: string } | null {
  if (typeof window === 'undefined') return null
  const params = new URLSearchParams(window.location.search)
  const table = params.get('table')
  const rowId = params.get('row')
  if (!rowId || (table !== 'pages' && table !== 'components')) return null
  return { table, rowId }
}

function siteMissesEditorDataDeepLink(site: SiteDocument): boolean {
  const deepLink = currentEditorDataDeepLink()
  if (!deepLink) return false
  return deepLink.table === 'pages'
    ? !site.pages.some((page) => page.id === deepLink.rowId)
    : !site.visualComponents.some((component) => component.id === deepLink.rowId)
}

function applyDefaultBreakpointPreference(breakpoints: ReadonlyArray<{ id: string }>): void {
  const preferredId = readEditorSelectPreference('defaultBreakpoint')
  if (breakpoints.some((breakpoint) => breakpoint.id === preferredId)) {
    useEditorStore.getState().setActiveBreakpoint(preferredId)
  }
}

/**
 * Dukafi persists through the Ruby HTTP adapter. Instatic's upstream Yjs
 * WebSocket relay is intentionally not started: one Dukafi process owns one
 * store, and M1 uses a short, serialized REST autosave instead.
 */
export function usePersistence(
  requestedSiteId = 'default',
  adapter: IPersistenceAdapter = cmsAdapter,
  options: { enabled?: boolean } = {},
): PersistenceController {
  const enabled = options.enabled ?? true
  const adapterRef = useRef(adapter)
  const [saveStatus, setSaveStatus] = useState<PersistenceSaveStatus>(
    enabled ? { state: 'loading' } : { state: 'synced' },
  )

  useEffect(() => {
    adapterRef.current = adapter
  }, [adapter])

  useEffect(() => {
    if (!enabled) return undefined

    let cancelled = false
    let saveTimer: ReturnType<typeof setTimeout> | undefined
    let pendingSite: SiteDocument | null = null
    let saving = false
    let unsubscribe: (() => void) | undefined

    async function flushSaves(): Promise<void> {
      if (saving || cancelled) return
      saving = true
      try {
        while (pendingSite && !cancelled) {
          const snapshot = pendingSite
          pendingSite = null
          setSaveStatus({ state: 'connecting' })
          // The seq this save landed at. Recording it is what stops the
          // change-poller reporting our own write back to us.
          const saved = await adapterRef.current.saveSite(snapshot)
          recordSiteSeq(saved.seq)
          if (!cancelled) setSaveStatus({ state: 'synced' })
        }
      } catch (err) {
        if (!cancelled) {
          const message = getErrorMessage(err, 'Failed to save draft')
          setSaveStatus({ state: 'error', message })
          pushToast({
            kind: 'error',
            title: 'Draft save failed',
            body: message,
            location: 'site-editor:persistence',
          })
        }
      } finally {
        saving = false
        if (pendingSite && !cancelled) void flushSaves()
      }
    }

    function queueSave(site: SiteDocument | null): void {
      if (!site || cancelled) return
      pendingSite = site
      if (saveTimer !== undefined) clearTimeout(saveTimer)
      saveTimer = setTimeout(() => {
        saveTimer = undefined
        void flushSaves()
      }, SAVE_DEBOUNCE_MS)
    }

    async function boot(): Promise<void> {
      const { site: existingSite, loadSite, createSite } = useEditorStore.getState()
      const pendingReload = hasPendingCmsSiteReload()
      const shouldReload = existingSite
        ? pendingReload || siteMissesEditorDataDeepLink(existingSite)
        : true

      try {
        if (shouldReload) {
          const result = await adapterRef.current.loadSite(requestedSiteId || 'default')
          if (cancelled) return
          if (result) {
            if (pendingReload) consumePendingCmsSiteReload()
            // The baseline every later poll is compared against.
            recordSiteSeq(result.shellSeq)
            loadSite(result.site)
            applyDefaultBreakpointPreference(result.site.breakpoints)
          } else {
            const created = createSite('Dukafi Store')
            applyDefaultBreakpointPreference(created.breakpoints)
            const saved = await adapterRef.current.saveSite(created)
            recordSiteSeq(saved.seq)
          }
        }

        if (cancelled) return
        setSaveStatus({ state: 'synced' })
        unsubscribe = useEditorStore.subscribe(
          (state) => state.site,
          (site, previousSite) => {
            if (consumeSkipSiteAutosave()) return
            if (site !== previousSite) queueSave(site)
          },
        )
      } catch (err) {
        if (err instanceof SiteValidationError) {
          console.error('[persistence] Corrupt CMS site data:', err)
        } else {
          console.error('[persistence] Failed to load CMS site:', err)
        }
        if (!cancelled) {
          const message = getErrorMessage(err, 'Failed to load CMS site')
          setSaveStatus({ state: 'error', message })
          pushToast({
            kind: 'error',
            title: 'Site load failed',
            body: message,
            location: 'site-editor:persistence',
          })
        }
      }
    }

    void boot()

    return () => {
      unsubscribe?.()
      if (saveTimer !== undefined) clearTimeout(saveTimer)
      if (pendingSite) void adapterRef.current.saveSite(pendingSite)
      cancelled = true
    }
  }, [enabled, requestedSiteId])

  // Something else wrote to the store — an MCP client, or this merchant in
  // another tab. Told, not acted on: reloading for them could throw away
  // whatever they are part-way through typing.
  const changedElsewhere = useExternalSiteChanges({ enabled })

  useEffect(() => {
    if (!changedElsewhere) return

    pushToast({
      kind: 'info',
      title: 'This store changed somewhere else',
      body: 'An AI client or another tab edited it. Reload to see the current version — '
        + 'anything unsaved here will be lost.',
      location: 'site-editor:external-change',
      // Held until acted on. A notice that vanishes after four seconds is one
      // a merchant misses, and then saves over the change it was warning about.
      durationMs: null,
      action: {
        label: 'Reload',
        onSelect: () => { window.location.reload() },
      },
    })
  }, [changedElsewhere])

  return { saveStatus }
}
