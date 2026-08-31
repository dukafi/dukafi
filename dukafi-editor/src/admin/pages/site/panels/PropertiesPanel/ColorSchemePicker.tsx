/**
 * Assign one color scheme to the selected node.
 *
 * Relume's right-rail control: pick Scheme 2 and the section remaps
 * --scheme-* for everything inside it. The scheme class is assignment-only —
 * it must not become the StyleSurface edit target (that would hide Layout /
 * Position / Spacing behind a locked utility card).
 */
import { useEditorStore } from '@site/store/store'
import {
  resolveColorSchemes,
  schemeClassId,
  schemeClassName,
  isSchemeClassName,
  isSchemeAssignmentClass,
} from '@core/framework'
import type { FrameworkColorToken } from '@core/framework-schema'
import { Select } from '@ui/components/Select'
import styles from './ColorSchemePicker.module.css'

const EMPTY_TOKENS: readonly FrameworkColorToken[] = []

export function ColorSchemePicker({ nodeId, classIds }: { nodeId: string; classIds: string[] }) {
  const tokens = useEditorStore((s) => s.site?.settings.framework?.colors?.tokens ?? EMPTY_TOKENS)
  const stored = useEditorStore((s) => s.site?.settings.framework?.colorSchemes)
  const styleRules = useEditorStore((s) => s.site?.styleRules)
  const addNodeClass = useEditorStore((s) => s.addNodeClass)
  const removeNodeClass = useEditorStore((s) => s.removeNodeClass)
  const setActiveClass = useEditorStore((s) => s.setActiveClass)
  const schemes = resolveColorSchemes(stored, tokens)
  if (schemes.length === 0) return null

  const assigned = classIds
    .map((id) => styleRules?.[id])
    .find((rule) => rule && isSchemeClassName(rule.name))
  const current = assigned?.name ?? ''

  function apply(nextName: string) {
    for (const id of classIds) {
      const rule = styleRules?.[id]
      if (rule && isSchemeClassName(rule.name)) removeNodeClass(nodeId, id)
    }
    if (nextName) {
      const scheme = schemes.find((row) => schemeClassName(row.slug) === nextName)
      if (scheme) addNodeClass(nodeId, schemeClassId(scheme.id))
    }
    const activeId = useEditorStore.getState().activeClassId
    const activeRule = activeId ? useEditorStore.getState().site?.styleRules[activeId] : null
    if (isSchemeAssignmentClass(activeRule)) setActiveClass(null)
  }

  return (
    <label className={styles.row} data-testid="color-scheme-picker">
      <span className={styles.label}>Color scheme</span>
      <Select
        className={styles.select}
        fieldSize="sm"
        value={current}
        aria-label="Color scheme"
        onChange={(event) => apply(event.currentTarget.value)}
        options={[
          { value: '', label: 'None' },
          ...schemes.map((scheme) => ({
            value: schemeClassName(scheme.slug),
            label: scheme.name,
          })),
        ]}
      />
    </label>
  )
}
