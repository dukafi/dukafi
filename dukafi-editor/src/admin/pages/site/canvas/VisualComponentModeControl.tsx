/**
 * VisualComponentModeControl — floating Visual Component edit-mode control.
 *
 * Renders below the canvas notch while the canvas is editing a Visual
 * Component: a "Back to page" exit plus a `DocumentSwitcher` to jump to any
 * page / template / component. Renaming lives in the Site panel (the switcher
 * replaces the old inline rename), so this control matches the template control
 * visually.
 */

import { type VisualComponent } from '@core/visualComponents'
import { useEditorStore } from '@site/store/store'
import { Button } from '@ui/components/Button'
import { ArrowLeftIcon } from 'pixel-art-icons/icons/arrow-left'
import { DocumentSwitcher } from './DocumentSwitcher'
import styles from './VisualComponentModeControl.module.css'

export default function VisualComponentModeControl() {
  const activeDocument = useEditorStore((s) => s.activeDocument)
  const exitVisualComponentMode = useEditorStore((s) => s.exitVisualComponentMode)
  const inlineEditingRefId = useEditorStore((s) => s.inlineEditingRefId)
  const endInlineComponentEdit = useEditorStore((s) => s.endInlineComponentEdit)
  const detachComponentRef = useEditorStore((s) => s.detachComponentRef)

  const vcId = activeDocument?.kind === 'visualComponent' ? activeDocument.vcId : null
  const inlineVcId = useEditorStore((s): string | null => {
    if (!s.inlineEditingRefId || !s.site) return null
    const pageId = s.activeDocument?.kind === 'page' ? s.activeDocument.pageId : s.activePageId
    const page = s.site.pages.find((entry) => entry.id === pageId)
    const ref = page?.nodes[s.inlineEditingRefId]
    return typeof ref?.props.componentId === 'string' ? ref.props.componentId : null
  })
  const resolvedVcId = vcId ?? inlineVcId
  const vc = useEditorStore(
    (s): VisualComponent | null =>
      s.site?.visualComponents?.find((component) => component.id === resolvedVcId) ?? null,
  )

  if (!vc) return null
  if (activeDocument?.kind !== 'visualComponent' && !inlineEditingRefId) return null

  const inline = Boolean(inlineEditingRefId)

  return (
    <div className={styles.control} data-testid="vc-mode-control">
      <Button
        variant="ghost"
        size="sm"
        shape="pill"
        className={styles.backButton}
        onClick={inline ? endInlineComponentEdit : exitVisualComponentMode}
        data-testid="vc-mode-control-back"
        aria-label={inline ? 'Done editing component' : 'Back to page'}
      >
        <ArrowLeftIcon size={12} aria-hidden="true" />
        {inline ? 'Done' : 'Back to page'}
      </Button>

      <span className={styles.divider} aria-hidden="true" />

      <span className={styles.modeLabel}>
        {inline
          ? `Editing ${vc.name} — changes update every page`
          : 'Editing component'}
      </span>

      {inline ? (
        <Button
          variant="ghost"
          size="sm"
          shape="pill"
          onClick={() => inlineEditingRefId && detachComponentRef(inlineEditingRefId)}
          tooltip="Turn this instance into an ordinary section"
        >
          Detach
        </Button>
      ) : (
        <DocumentSwitcher current={{ kind: 'component', id: vc.id, label: vc.name }} />
      )}
    </div>
  )
}
