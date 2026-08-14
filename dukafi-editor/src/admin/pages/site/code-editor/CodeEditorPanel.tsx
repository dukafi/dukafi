/**
 * CodeEditorPanel — a floating CodeMirror surface for editing ONE node prop.
 *
 * Opened by property controls that need more room than an input gives: the
 * `base.svg` control's "Edit code" (inline SVG markup) is the only caller
 * today, and pasted-HTML import mounts the same `CodeMirrorEditor` directly.
 *
 * It also still edits "site files" (the `files` array inside the site
 * document) as plain text, because the Site Explorer's Styles/Scripts rows
 * open them. What is GONE is the machinery around those files that Dukafi
 * cannot honour: asset/image previews, and the script/style settings panes
 * that configured runtime placement + timing — `build_runtime_preview` in
 * `dukafi/routes/admin_api.rb` returns `runtimeAssets: { scripts: [] }`, so
 * none of those settings ever reached a published page.
 *
 * CodeMirror 6 (~594 kB) sits behind a single `React.lazy` boundary, so the
 * cost is paid only when someone actually opens a buffer.
 *
 * Architecture:
 * - Floating panel: shared PanelHeader + useDraggablePanel (Guideline 410).
 * - Always mounted, CSS display:none when idle — preserves drag position.
 * - Content syncs straight through `updateNodeProps`.
 *
 * Security: buffer content is plaintext. No dangerouslySetInnerHTML, no eval.
 *
 * Guideline 410 — floating panels must use shared PanelHeader
 * Constraint 402 — no inline styles (except CSS-var panelPositionStyle)
 */

import { Suspense, lazy, useEffect, useRef } from 'react'
import { useEditorStore } from '@site/store/store'
import { PanelHeader } from '@admin/shared/PanelHeader'
import { useDraggablePanel } from '@admin/shared/FloatingWindow'
import { cn } from '@ui/cn'
import type { SiteFile } from '@core/files/schemas'
import type { CodeLanguage } from './CodeMirrorEditor'
import styles from './CodeEditorPanel.module.css'

/**
 * Highlighting for a site file. Only the languages the editor still bundles —
 * `lang-json`/`lang-markdown`/`lang-javascript` were dropped, so anything that
 * is not a stylesheet edits as plain text.
 */
function fileLanguage(file: SiteFile): CodeLanguage {
  return file.type === 'style' ? 'css' : 'text'
}

// ---------------------------------------------------------------------------
// Lazy-load CodeMirrorEditor — code-splits the heavy CodeMirror 6 bundle
// so it does not inflate the editor's startup chunk.
// ---------------------------------------------------------------------------
const CodeMirrorEditor = lazy(() => import('./CodeMirrorEditor'))

const PANEL_WIDTH = 800

/** Skeleton shown while the CodeMirror chunk is in flight. */
export function CodeEditorSkeleton() {
  return <div className={styles.skeleton} aria-busy="true" aria-label="Loading editor" />
}

export function CodeEditorPanel() {
  const activeCodeBuffer = useEditorStore((s) => s.activeCodeBuffer)
  const activeEditorFileId = useEditorStore((s) => s.activeEditorFileId)
  const codeEditorPanelOpen = useEditorStore((s) => s.codeEditorPanelOpen)
  const site = useEditorStore((s) => s.site)
  const closeEditor = useEditorStore((s) => s.closeEditor)
  const updateNodeProps = useEditorStore((s) => s.updateNodeProps)
  const updateFileContent = useEditorStore((s) => s.updateFileContent)

  // Asset files have no text to edit now that ImagePreview is gone, so they
  // are simply not openable here.
  const activeFile = activeEditorFileId && site
    ? (site.files.find((f) => f.id === activeEditorFileId && f.type !== 'asset') ?? null)
    : null

  // Read the buffer's value live from the page tree so the editor mounts with
  // the node's current markup rather than a stale snapshot.
  const bufferValue = useEditorStore((s) => {
    const buf = s.activeCodeBuffer
    if (!buf || !s.site) return ''
    const page = s.site.pages.find((p) => p.id === s.activePageId)
    const value = page?.nodes[buf.nodeId]?.props?.[buf.propKey]
    return typeof value === 'string' ? value : ''
  })

  // Default: center-stage per UX Spec (Contribution 612 §4), clear of the DOM panel.
  const { panelRef, setPanelRef, headerDragProps, panelPositionStyle } = useDraggablePanel(
    'codeeditor',
    () => ({
      x: typeof window !== 'undefined'
        ? Math.max(220, (window.innerWidth - PANEL_WIDTH) / 2)
        : 220,
      y: 80,
    }),
  )

  // Focus management (WCAG 2.4.3): on idle → open, move focus into the panel
  // so keyboard users aren't stranded on the button that opened it. Deferred a
  // frame to let `display: flex` settle, and skipped if the user already
  // clicked inside — the rAF would otherwise yank focus off their choice.
  const editorDoc = activeCodeBuffer
    ? {
        docKey: `prop:${activeCodeBuffer.nodeId}:${activeCodeBuffer.propKey}`,
        value: bufferValue,
        language: activeCodeBuffer.language as CodeLanguage,
        onChange: (content: string) =>
          updateNodeProps(activeCodeBuffer.nodeId, { [activeCodeBuffer.propKey]: content }),
      }
    : activeFile
      ? {
          docKey: activeFile.id,
          value: activeFile.content ?? '',
          language: fileLanguage(activeFile),
          onChange: (content: string) => updateFileContent(activeFile.id, content),
        }
      : null
  const docKey = editorDoc?.docKey ?? null
  const prevDocKeyRef = useRef<string | null>(null)
  useEffect(() => {
    const prev = prevDocKeyRef.current
    prevDocKeyRef.current = docKey
    if (prev === null && docKey !== null && codeEditorPanelOpen) {
      const handle = requestAnimationFrame(() => {
        const panel = panelRef.current
        if (!panel) return
        if (panel.contains(document.activeElement)) return
        panel.focus()
      })
      return () => cancelAnimationFrame(handle)
    }
    return undefined
  }, [docKey, codeEditorPanelOpen, panelRef])

  const visible = Boolean(editorDoc) && codeEditorPanelOpen

  return (
    <aside
      ref={setPanelRef}
      role="complementary"
      aria-label="Code Editor"
      data-panel="code-editor"
      tabIndex={-1}
      onClick={(e) => e.stopPropagation()}
      // panelPositionStyle injects --panel-x / --panel-y CSS vars (whitelisted)
      style={panelPositionStyle}
      className={cn(styles.panel, !visible && styles.panelHidden)}
    >
      <div className={styles.inner}>
        <PanelHeader
          panelId="code-editor"
          title={activeCodeBuffer?.title ?? (activeFile?.path.split('/').pop() ?? 'Code Editor')}
          onClose={closeEditor}
          dragHandleProps={headerDragProps}
        />

        <div className={styles.editorBody}>
          {editorDoc ? (
            <div className={styles.editorWorkspace}>
              <div className={styles.editorSurface}>
                <Suspense fallback={<CodeEditorSkeleton />}>
                  <CodeMirrorEditor
                    docKey={editorDoc.docKey}
                    value={editorDoc.value}
                    language={editorDoc.language}
                    onChange={editorDoc.onChange}
                  />
                </Suspense>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </aside>
  )
}
