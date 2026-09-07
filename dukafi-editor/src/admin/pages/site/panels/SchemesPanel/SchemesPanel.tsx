/**
 * Color schemes — combinations applied to a section, not a second palette.
 *
 * Generate a scheme from one picked color (that color becomes Accent). Role
 * pickers use the existing brand-color tokens and their shade / tint scales.
 */
import { useMemo, useState, type CSSProperties } from 'react'
import { useEditorStore } from '@site/store/store'
import type { ColorSchemeRole, FrameworkColorScheme, FrameworkColorToken } from '@core/framework-schema'
import { COLOR_SCHEME_ROLES } from '@core/framework-schema'
import {
  listSchemePaletteOptions,
  resolveColorSchemes,
  resolveSchemeRoleColor,
  schemeClassName,
} from '@core/framework'
import { Button } from '@ui/components/Button'
import { ColorInput } from '@ui/components/ColorInput'
import { Dialog } from '@ui/components/Dialog'
import { Input } from '@ui/components/Input'
import { Select, type SelectOption } from '@ui/components/Select'
import { FilePlusSolidIcon } from 'pixel-art-icons/icons/file-plus-solid'
import { CreateColorDialog } from '@site/panels/ColorsPanel/CreateColorDialog'
import { deriveCategoryLabels } from '@site/panels/ColorsPanel/helpers'
import dialogStyles from '../../../../shared/dialogs/SiteCreateDialog/SiteCreateDialog.module.css'
import styles from './SchemesPanel.module.css'

const ROLE_LABELS: Record<ColorSchemeRole, string> = {
  background: 'Background',
  secondary: 'Secondary',
  heading: 'Heading text',
  body: 'Body text',
  accent: 'Accent',
  border: 'Border',
}

const EMPTY_TOKENS: readonly FrameworkColorToken[] = []
const DEFAULT_SEED = '#2563eb'
const EMPTY_OPTIONS: SelectOption[] = []

type SwatchStyle = CSSProperties & { '--scheme-swatch'?: string }

export function SchemesPanel() {
  const tokens = useEditorStore((s) => s.site?.settings.framework?.colors?.tokens ?? EMPTY_TOKENS)
  const stored = useEditorStore((s) => s.site?.settings.framework?.colorSchemes)
  const generateColorSchemeFromColor = useEditorStore((s) => s.generateColorSchemeFromColor)
  const updateColorScheme = useEditorStore((s) => s.updateColorScheme)
  const deleteColorScheme = useEditorStore((s) => s.deleteColorScheme)
  const schemes = resolveColorSchemes(stored, tokens)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const editing = schemes.find((scheme) => scheme.id === editingId) ?? null

  return (
    <div className={styles.panel}>
      <div className={styles.actions}>
        <Button variant="secondary" size="sm" onClick={() => setGenerating(true)}>
          <FilePlusSolidIcon size={12} aria-hidden="true" />
          Add scheme
        </Button>
      </div>

      {schemes.length > 0 && (
        <div className={styles.grid} data-testid="color-schemes">
          {schemes.map((scheme) => (
            <button
              key={scheme.id}
              type="button"
              className={styles.card}
              onClick={() => setEditingId(scheme.id)}
              data-testid={`color-scheme-${scheme.slug}`}
            >
              <SchemePreview scheme={scheme} tokens={tokens} />
              <span className={styles.cardName}>{scheme.name}</span>
            </button>
          ))}
        </div>
      )}

      {generating && (
        <GenerateSchemeDialog
          onCancel={() => setGenerating(false)}
          onGenerate={(seed) => {
            const created = generateColorSchemeFromColor(seed)
            setGenerating(false)
            if (created) setEditingId(created.id)
          }}
        />
      )}

      {editing && (
        <SchemeEditor
          scheme={editing}
          tokens={tokens}
          onClose={() => setEditingId(null)}
          onRename={(name) => updateColorScheme(editing.id, { name })}
          onRole={(role, slug) => updateColorScheme(editing.id, { roles: { [role]: slug } })}
          onDelete={() => {
            deleteColorScheme(editing.id)
            setEditingId(null)
          }}
        />
      )}
    </div>
  )
}

const GENERATE_FORM_ID = 'generate-scheme-form'

function GenerateSchemeDialog({
  onCancel,
  onGenerate,
}: {
  onCancel: () => void
  onGenerate: (seed: string) => void
}) {
  const [seed, setSeed] = useState(DEFAULT_SEED)
  const canGenerate = Boolean(seed.trim())

  return (
    <Dialog
      open
      title="Generate scheme"
      onClose={onCancel}
      size="sm"
      footer={
        <>
          <Button variant="secondary" size="sm" type="button" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            type="submit"
            form={GENERATE_FORM_ID}
            disabled={!canGenerate}
          >
            Generate scheme
          </Button>
        </>
      }
    >
      <form
        id={GENERATE_FORM_ID}
        className={dialogStyles.form}
        onSubmit={(event) => {
          event.preventDefault()
          if (canGenerate) onGenerate(seed)
        }}
      >
        <div className={dialogStyles.field}>
          <span className={dialogStyles.label}>Base color</span>
          <div className={styles.seedField}>
            <ColorInput
              value={seed}
              swatchValue={seed}
              fieldSize="sm"
              aria-label="Scheme seed color"
              onChange={(event) => setSeed(event.currentTarget.value)}
            />
            <Input
              value={seed}
              fieldSize="sm"
              monospace
              aria-label="Scheme seed hex"
              placeholder="#2563eb"
              spellCheck={false}
              onChange={(event) => setSeed(event.currentTarget.value)}
            />
          </div>
        </div>
      </form>
    </Dialog>
  )
}

function SchemePreview({
  scheme,
  tokens,
}: {
  scheme: FrameworkColorScheme
  tokens: readonly FrameworkColorToken[]
}) {
  const background = resolveSchemeRoleColor(tokens, scheme.roles.background)
  const heading = resolveSchemeRoleColor(tokens, scheme.roles.heading)
  const accent = resolveSchemeRoleColor(tokens, scheme.roles.accent)
  return (
    <span className={styles.preview} style={{ backgroundColor: background, color: heading }}>
      <span className={styles.previewAa} style={{ color: heading }}>Aa</span>
      <span className={styles.previewAccent} style={{ backgroundColor: accent }} />
    </span>
  )
}

function SchemeEditor({
  scheme,
  tokens,
  onClose,
  onRename,
  onRole,
  onDelete,
}: {
  scheme: FrameworkColorScheme
  tokens: readonly FrameworkColorToken[]
  onClose: () => void
  onRename: (name: string) => void
  onRole: (role: ColorSchemeRole, slug: string) => void
  onDelete: () => void
}) {
  const createFrameworkColorToken = useEditorStore((s) => s.createFrameworkColorToken)
  const [addingColor, setAddingColor] = useState(false)
  const categories = deriveCategoryLabels([...tokens])
  const options = useMemo(() => paletteSelectOptions(tokens), [tokens])

  return (
    <>
      <Dialog
        open
        title={scheme.name}
        onClose={onClose}
        size="md"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={onDelete}>Delete</Button>
            <Button variant="primary" size="sm" onClick={onClose}>Done</Button>
          </>
        }
      >
        <div className={styles.editor} data-testid="color-scheme-editor">
          <SchemePreview scheme={scheme} tokens={tokens} />
          <label className={styles.field}>
            <span>Name</span>
            <Input
              value={scheme.name}
              fieldSize="sm"
              aria-label="Scheme name"
              onChange={(event) => onRename(event.currentTarget.value)}
            />
          </label>
          {COLOR_SCHEME_ROLES.map((role) => (
            <label key={role} className={styles.field}>
              <span>{ROLE_LABELS[role]}</span>
              <Select
                value={scheme.roles[role]}
                options={options}
                fieldSize="sm"
                searchable
                searchPlaceholder="Search colors..."
                aria-label={ROLE_LABELS[role]}
                addItemLabel="+ Add brand color"
                onAddItem={() => setAddingColor(true)}
                onChange={(event) => onRole(role, event.currentTarget.value)}
              />
            </label>
          ))}
          <p className={styles.classHint}>
            Apply with <code>{schemeClassName(scheme.slug)}</code> plus
            {' '}<code>bg-scheme-background</code>, <code>text-scheme-heading</code>,
            {' '}<code>text-scheme-body</code>. On accent or secondary fills use
            {' '}<code>text-scheme-on-accent</code> / <code>text-scheme-on-secondary</code>
            {' '}— those pick Heading or Background for contrast.
          </p>
        </div>
      </Dialog>

      {addingColor && (
        <CreateColorDialog
          categories={categories}
          defaultCategory={categories[0] ?? ''}
          onCancel={() => setAddingColor(false)}
          onSubmit={(name, lightValue, category) => {
            createFrameworkColorToken({
              slug: name,
              lightValue,
              category,
              darkModeEnabled: false,
            })
            setAddingColor(false)
          }}
        />
      )}
    </>
  )
}

function paletteSelectOptions(tokens: readonly FrameworkColorToken[]): SelectOption[] {
  if (tokens.length === 0) return EMPTY_OPTIONS
  const options: SelectOption[] = []
  let lastGroup = ''
  for (const row of listSchemePaletteOptions(tokens)) {
    if (row.group !== lastGroup) {
      lastGroup = row.group
      options.push({
        value: `__group__:${row.group}`,
        label: row.group,
        header: true,
      })
    }
    options.push({
      value: row.slug,
      label: row.label,
      textValue: row.textValue,
      icon: (
        <span
          className={styles.swatch}
          style={{ '--scheme-swatch': row.swatch } as SwatchStyle}
        />
      ),
    })
  }
  return options
}

export { ROLE_LABELS }
