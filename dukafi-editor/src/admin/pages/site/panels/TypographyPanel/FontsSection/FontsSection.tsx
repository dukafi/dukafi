/**
 * Installed fonts library — Google / custom families on the site.
 * Tokens live in FontTokensSection and are not created when a font is installed.
 */

import { useState } from 'react'
import type { CSSProperties } from 'react'
import { Button } from '@ui/components/Button'
import { SplitButton, type SplitButtonMenuItem } from '@ui/components/SplitButton'
import { EmptyState } from '@ui/components/EmptyState'
import { pushToast } from '@ui/components/Toast'
import { useEditorStore } from '@site/store/store'
import { useInstalledFontFaces } from '@site/hooks/useInstalledFontFaces'
import type { FontEntry } from '@core/fonts'
import { compareVariants } from '@core/fonts'
import { deleteCmsFontFamily } from '@core/persistence/cmsFonts'
import { EditSolidIcon } from 'pixel-art-icons/icons/edit-solid'
import { TrashSolidIcon } from 'pixel-art-icons/icons/trash-solid'
import { PlusIcon } from 'pixel-art-icons/icons/plus'
import { UploadIcon } from 'pixel-art-icons/icons/upload'
import { AddGoogleFontDialog } from './AddGoogleFontDialog'
import { AddCustomFontDialog } from './AddCustomFontDialog'
import styles from './FontsSection.module.css'
import { getErrorMessage } from '@core/utils/errorMessage'

const EMPTY_FONTS: FontEntry[] = []

export function FontsSection() {
  const fonts = useEditorStore((s) => s.site?.settings.fonts?.items ?? EMPTY_FONTS)
  const addFont = useEditorStore((s) => s.addFont)
  const removeFont = useEditorStore((s) => s.removeFont)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [customDialogOpen, setCustomDialogOpen] = useState(false)
  const [editEntry, setEditEntry] = useState<FontEntry | null>(null)

  useInstalledFontFaces(fonts, 'dukafi-admin-installed-fonts')

  const installedFamiliesLower = new Set(fonts.map((f) => f.family.toLowerCase()))
  const editInstalledFamilies = editEntry
    ? new Set([...installedFamiliesLower].filter((f) => f !== editEntry.family.toLowerCase()))
    : installedFamiliesLower

  function handleEdited(entry: FontEntry) {
    addFont(entry)
    setEditEntry(null)
  }

  function handleInstalled(entry: FontEntry) {
    addFont(entry)
  }

  async function handleRemove(entry: FontEntry) {
    const removed = removeFont(entry.id)
    if (!removed) {
      pushToast({
        kind: 'error',
        title: 'Could not remove font',
        body: 'The font is already gone.',
      })
      return
    }
    if (entry.source === 'google') {
      try {
        await deleteCmsFontFamily(entry.family)
      } catch (err) {
        console.error('[FontsSection] delete font files failed:', err)
        pushToast({
          kind: 'error',
          title: 'Could not delete font files',
          body: getErrorMessage(err, 'Unknown font deletion error'),
        })
      }
    }
  }

  const addFontMenuItems: SplitButtonMenuItem[] = [
    {
      id: 'google',
      label: 'Add Google font',
      icon: PlusIcon,
      onSelect: () => setDialogOpen(true),
      testId: 'fonts-add-google-font-item',
    },
    {
      id: 'custom',
      label: 'Upload custom font',
      icon: UploadIcon,
      onSelect: () => setCustomDialogOpen(true),
      testId: 'fonts-upload-custom-font-item',
    },
  ]

  const addFontButton = (
    <SplitButton
      label="Add Google font"
      onClick={() => setDialogOpen(true)}
      menuItems={addFontMenuItems}
      menuTriggerLabel="More font options"
      menuLabel="Add a font"
      primaryTestId="fonts-add-google-font-btn"
      menuTriggerTestId="fonts-add-font-trigger"
      menuTestId="fonts-add-font-menu"
    />
  )

  return (
    <div className={styles.section}>
      {fonts.length === 0 ? (
        <EmptyState
          plain
          compact
          title="No fonts installed yet."
          action={addFontButton}
        />
      ) : (
        <>
          <div className={styles.tokenToolbar}>
            <span className={styles.tokenToolbarTitle}>Library</span>
            {addFontButton}
          </div>
          <ul className={styles.assetList} aria-label="Installed fonts">
            {fonts.map((entry) => (
              <FontRow
                key={entry.id}
                entry={entry}
                onEdit={() => setEditEntry(entry)}
                onRemove={() => { void handleRemove(entry) }}
              />
            ))}
          </ul>
        </>
      )}

      {dialogOpen && (
        <AddGoogleFontDialog
          installedFamilies={installedFamiliesLower}
          onCancel={() => setDialogOpen(false)}
          onInstalled={(entry) => {
            handleInstalled(entry)
            setDialogOpen(false)
          }}
        />
      )}

      {customDialogOpen && (
        <AddCustomFontDialog
          installedFamilies={installedFamiliesLower}
          onCancel={() => setCustomDialogOpen(false)}
          onInstalled={(entry) => {
            handleInstalled(entry)
            setCustomDialogOpen(false)
          }}
        />
      )}

      {editEntry?.source === 'google' && (
        <AddGoogleFontDialog
          editEntry={editEntry}
          installedFamilies={editInstalledFamilies}
          onCancel={() => setEditEntry(null)}
          onInstalled={handleEdited}
        />
      )}

      {editEntry?.source === 'custom' && (
        <AddCustomFontDialog
          editEntry={editEntry}
          installedFamilies={editInstalledFamilies}
          onCancel={() => setEditEntry(null)}
          onInstalled={handleEdited}
        />
      )}
    </div>
  )
}

function FontRow({
  entry,
  onEdit,
  onRemove,
}: {
  entry: FontEntry
  onEdit: () => void
  onRemove: () => void
}) {
  const variants = entry.variants.toSorted(compareVariants)
  const variantSummary =
    variants.length === 0
      ? ''
      : variants.length <= 3
        ? variants.join(', ')
        : `${variants.slice(0, 3).join(', ')}, +${variants.length - 3}`

  return (
    <li className={styles.row}>
      <div className={styles.rowMain}>
        <span
          className={styles.rowFamily}
          style={{ fontFamily: `"${entry.family}", system-ui, sans-serif` } as CSSProperties}
        >
          {entry.family}
        </span>
        <span className={styles.rowMeta}>
          {entry.source === 'google' ? 'Google' : 'Custom'}
          {variantSummary && ` · ${variantSummary}`}
          {entry.subsets.length > 0 && ` · ${entry.subsets.length} subset${entry.subsets.length === 1 ? '' : 's'}`}
        </span>
      </div>
      <div className={styles.rowActions}>
        <Button
          variant="ghost"
          size="xs"
          iconOnly
          aria-label={`Edit ${entry.family}`}
          tooltip={`Edit ${entry.family}`}
          onClick={onEdit}
        >
          <EditSolidIcon size={12} aria-hidden="true" />
        </Button>
        <Button
          variant="ghost"
          size="xs"
          iconOnly
          aria-label={`Remove ${entry.family}`}
          tooltip={`Remove ${entry.family}`}
          onClick={onRemove}
        >
          <TrashSolidIcon size={12} aria-hidden="true" />
        </Button>
      </div>
    </li>
  )
}
