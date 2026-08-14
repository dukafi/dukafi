import { useEffect, useRef, useState } from 'react'
import { buildSiteExport, parseSiteExport, type SiteDocument } from '@core/page-tree'
import { selectActivePage, useEditorStore } from '@site/store/store'
import { getCmsPublishStatus, publishCmsDraft } from '@core/persistence'
import { LoaderIcon } from 'pixel-art-icons/icons/loader'
import { CalendarSolidIcon } from 'pixel-art-icons/icons/calendar-solid'
import { CheckIcon } from 'pixel-art-icons/icons/check'
import { CircleAlertSolidIcon } from 'pixel-art-icons/icons/circle-alert-solid'
import { CloudUploadSolidIcon } from 'pixel-art-icons/icons/cloud-upload-solid'
import { ArrowDownIcon } from 'pixel-art-icons/icons/arrow-down'
import { EyeSolidIcon } from 'pixel-art-icons/icons/eye-solid'
import { StepUpCancelledMessage, useStepUp } from '@admin/shared/StepUp'
import { SchedulePublishDialog } from '@admin/modals/SchedulePublishDialog'
import { Dialog } from '@ui/components/Dialog'
import { Button } from '@ui/components/Button'
import type { PersistenceSaveStatus } from '@site/hooks/usePersistence'
import { pushToast } from '@ui/components/Toast'
import { PublishActionGroup, type PublishActionMenuItem } from './PublishActionGroup'
import { getErrorMessage } from '@core/utils/errorMessage'
import { downloadJsonFile, safeFilenameFragment } from '@admin/shared/downloadJsonFile'

type PublishState = 'idle' | 'publishing' | 'published' | 'error'

interface PublishButtonProps {
  enabled?: boolean
  saveStatus?: PersistenceSaveStatus
}

export function PublishButton({ enabled = true, saveStatus }: PublishButtonProps) {
  const site = useEditorStore((s) => s.site)
  const siteId = useEditorStore((s) => s.site?.id ?? null)
  const activePage = useEditorStore(selectActivePage)
  const openPreview = useEditorStore((s) => s.openPreview)
  const { runStepUp } = useStepUp()
  const [state, setState] = useState<PublishState>('idle')
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false)
  const [pendingSiteImport, setPendingSiteImport] = useState<SiteDocument | null>(null)
  const siteImportInputRef = useRef<HTMLInputElement>(null)
  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  /**
   * The `site` reference captured when the button entered the "published"
   * state. Every store mutation (local or a remote peer's) produces a new
   * reference, so `site !== publishedSiteRef.current` is the exact "the
   * draft moved on since publish" signal that returns the button to idle.
   */
  const publishedSiteRef = useRef<SiteDocument | null>(null)
  const syncError = saveStatus?.state === 'error' ? saveStatus.message ?? 'Sync failed' : null

  useEffect(() => {
    return () => {
      if (statusTimerRef.current) clearTimeout(statusTimerRef.current)
    }
  }, [])

  useEffect(() => {
    if (!enabled || !siteId) return
    let cancelled = false

    async function loadPublishStatus() {
      try {
        const status = await getCmsPublishStatus()
        if (cancelled) return
        if (status.draftMatchesPublished) {
          publishedSiteRef.current = useEditorStore.getState().site
          setState('published')
        }
      } catch (err) {
        console.warn('[toolbar] Failed to load publish status:', err)
      }
    }

    void loadPublishStatus()
    return () => { cancelled = true }
  }, [enabled, siteId])

  useEffect(() => {
    if (state !== 'published' || site === publishedSiteRef.current) return
    if (statusTimerRef.current) clearTimeout(statusTimerRef.current)
    statusTimerRef.current = null
    const resetTimer = setTimeout(() => {
      setState('idle')
    }, 0)
    return () => clearTimeout(resetTimer)
  }, [site, state])

  const resetErrorLater = () => {
    if (statusTimerRef.current) clearTimeout(statusTimerRef.current)
    statusTimerRef.current = setTimeout(() => {
      setState('idle')
      statusTimerRef.current = null
    }, 5000)
  }

  const handlePublish = async () => {
    if (!site || !enabled || state === 'publishing') return

    if (statusTimerRef.current) {
      clearTimeout(statusTimerRef.current)
      statusTimerRef.current = null
    }

    setState('publishing')

    try {
      // No client-side flush needed: edits stream to the server live, and
      // the publish endpoint flushes the relay's debounced persist itself.
      // Wrap the publish call in `runStepUp` so the StepUpProvider can
      // intercept the server's `step_up_required` 401, prompt the user
      // to re-enter their password, then retry. Publish is the highest-
      // blast-radius site action (one click replaces every public page),
      // which is why the server gates it behind a fresh step-up window
      // in addition to the `pages.publish` capability check.
      await runStepUp(() => publishCmsDraft())
      publishedSiteRef.current = useEditorStore.getState().site
      setState('published')
    } catch (err) {
      if (err instanceof Error && err.message === StepUpCancelledMessage) {
        // User dismissed the step-up dialog — return the button to its
        // resting state without surfacing an error message; this is the
        // same UX every other step-up-gated action uses.
        setState('idle')
        return
      }
      console.error('[toolbar] Publish failed:', err)
      setState('error')
      pushToast({
        kind: 'error',
        title: 'Publish failed',
        body: getErrorMessage(err, 'Unknown publish error'),
        location: 'site-editor',
      })
      resetErrorLater()
    }
  }

  const isPublishing = state === 'publishing'
  // Block publish until the client is synced: local edits live only in this
  // client's Y docs until they reach the server, and the server-side publish
  // flush can only bake what it has received. Offline/connecting/error → the
  // status chip states the reason inline (never available-then-blocked). An
  // absent saveStatus (collab info unavailable) doesn't gate.
  const notSynced = saveStatus ? saveStatus.state !== 'synced' : false
  const disabled = !site || !enabled || isPublishing || notSynced
  const label =
    isPublishing ? 'Publishing' :
    state === 'published' ? 'Published' :
    state === 'error' ? 'Retry publish' :
    'Publish'

  const status =
    syncError ? {
      label: 'Sync failed',
      tone: 'danger' as const,
      ariaLabel: syncError,
    } :
    saveStatus?.state === 'offline' ? {
      label: 'Offline — reconnecting',
      tone: 'warning' as const,
    } :
    saveStatus?.state === 'connecting' || saveStatus?.state === 'loading' ? {
      label: 'Connecting',
      tone: 'neutral' as const,
    } :
    {
      label: 'Draft synced',
      tone: 'success' as const,
    }

  const PublishIcon =
    isPublishing ? LoaderIcon :
    state === 'published' ? CheckIcon :
    state === 'error' ? CircleAlertSolidIcon :
    CloudUploadSolidIcon

  function handleExportSite() {
    if (!site) return
    downloadJsonFile(`${safeFilenameFragment(site.name)}.dukafy-site.json`, buildSiteExport(site))
  }

  async function handleSiteImportFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (!file) return
    try {
      const raw = JSON.parse(await file.text())
      const parsed = parseSiteExport(raw)
      if (!parsed) {
        pushToast({ kind: 'error', title: "Not a Dukafi site export", body: `${file.name} doesn't match the expected file shape.` })
        return
      }
      setPendingSiteImport(parsed.site)
    } catch {
      pushToast({ kind: 'error', title: 'Could not read file', body: `${file.name} is not valid JSON.` })
    }
  }

  function confirmSiteImport() {
    if (!pendingSiteImport) return
    useEditorStore.getState().loadSite(pendingSiteImport)
    setPendingSiteImport(null)
    pushToast({ kind: 'success', title: 'Site imported into the draft', body: 'Review it, then Publish to go live.' })
  }

  const menuItems: PublishActionMenuItem[] = [
    {
      id: 'export-site',
      label: 'Export site',
      icon: ArrowDownIcon,
      disabled: !site,
      onSelect: handleExportSite,
      testId: 'toolbar-export-site-action',
    },
    // "Import site…" is deliberately NOT offered yet. In connected mode
    // `loadSite` binds each imported page id to an empty server doc, and the
    // projection then deletes every one of those pages — importing a site
    // silently empties it, while the shell survives so it still looks fine.
    // Proven in `__tests__/collab/siteImportConnected.test.ts`. Export and
    // per-page Import are unaffected; re-list this once import seeds the
    // imported content INTO the bound docs instead of being overwritten.
    {
      // Per-page scheduling. The Site editor's primary Publish button
      // still publishes ALL draft pages at once (existing behaviour);
      // the schedule action targets the currently-active page only —
      // matching what the user sees in the editor when they make the
      // decision.
      id: 'schedule-publish',
      label: 'Schedule publish…',
      icon: CalendarSolidIcon,
      disabled: !activePage,
      onSelect: () => setScheduleDialogOpen(true),
      testId: 'toolbar-schedule-publish-action',
    },
    {
      id: 'preview',
      label: 'Preview page',
      icon: EyeSolidIcon,
      disabled: !site,
      onSelect: () => openPreview(),
      testId: 'toolbar-preview-action',
    },
    // "Open live page" used to live here. It now has a dedicated
    // toolbar icon button (`OpenLivePageButton`) next to the avatar so
    // it's reachable on every admin route — not just the Site editor.
  ]

  return (
    <>
      <PublishActionGroup
        statusLabel={state === 'published' ? null : status.label}
        statusTone={status.tone}
        statusAriaLabel={status.ariaLabel}
        publishLabel={label}
        publishAriaLabel={state === 'published' ? 'Published' : 'Publish site'}
        publishTitle={state === 'published' ? 'Published' : 'Publish site'}
        publishState={state === 'publishing' ? 'busy' : state === 'published' ? 'success' : state}
        publishBusy={isPublishing}
        publishDisabled={disabled || state === 'published'}
        publishIcon={PublishIcon}
        onPublish={handlePublish}
        menuItems={menuItems}
      />
      {activePage && (
        <SchedulePublishDialog
          open={scheduleDialogOpen}
          onClose={() => setScheduleDialogOpen(false)}
          rowId={activePage.id}
          // The editor's in-memory Page shape doesn't carry the row's
          // scheduledPublishAt — that lives on the CMS row, not in the
          // site document. Future enhancement: read it from a
          // useCmsPageStatus(activePage.id) hook so re-opening the
          // dialog pre-fills with the current schedule. For now we
          // start fresh on every open.
          currentScheduledAt={null}
          entityLabel="page"
          onScheduled={() => {
            // Re-fetch publish status so the toolbar can transition out
            // of "Draft saved" / "Unsaved" into the published state if
            // the row picked up. Cheap call — the same endpoint the
            // mount-time useEffect uses.
            void getCmsPublishStatus().catch(() => undefined)
          }}
        />
      )}
      <input
        ref={siteImportInputRef}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={(event) => void handleSiteImportFileChange(event)}
      />
      <Dialog
        open={pendingSiteImport !== null}
        onClose={() => setPendingSiteImport(null)}
        title="Import site?"
        tone="danger"
        footer={
          <>
            <Button type="button" variant="secondary" size="sm" onClick={() => setPendingSiteImport(null)}>
              <span>Cancel</span>
            </Button>
            <Button type="button" variant="destructive" size="sm" onClick={confirmSiteImport}>
              <span>Replace draft with this file</span>
            </Button>
          </>
        }
      >
        <p>
          This replaces every page, style, and setting in your CURRENT draft with the ones in
          the imported file — {pendingSiteImport?.pages.length ?? 0} page
          {pendingSiteImport?.pages.length === 1 ? '' : 's'}. Nothing goes live until you hit
          Publish. If your current site has pages the import doesn&rsquo;t include, delete them
          yourself before publishing so they don&rsquo;t linger live.
        </p>
      </Dialog>
    </>
  )
}
