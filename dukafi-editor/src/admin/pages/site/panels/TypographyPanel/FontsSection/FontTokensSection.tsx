/**
 * Font tokens — named CSS variables that point at an installed family.
 * Managed separately from the installed-font library.
 */
import { useState, type CSSProperties } from 'react'
import { Button } from '@ui/components/Button'
import { EmptyState } from '@ui/components/EmptyState'
import { useEditorStore } from '@site/store/store'
import type { FontEntry, FontToken } from '@core/fonts'
import { resolveFontTokenStack, sortFontTokens } from '@core/fonts'
import { EditSolidIcon } from 'pixel-art-icons/icons/edit-solid'
import { TrashSolidIcon } from 'pixel-art-icons/icons/trash-solid'
import { FontTokenDialog } from './FontTokenDialog'
import styles from './FontsSection.module.css'

const EMPTY_FONTS: FontEntry[] = []
const EMPTY_TOKENS: FontToken[] = []

export function FontTokensSection() {
  const fonts = useEditorStore((s) => s.site?.settings.fonts?.items ?? EMPTY_FONTS)
  const fontTokens = useEditorStore((s) => s.site?.settings.fonts?.tokens ?? EMPTY_TOKENS)
  const createFontToken = useEditorStore((s) => s.createFontToken)
  const updateFontToken = useEditorStore((s) => s.updateFontToken)
  const deleteFontToken = useEditorStore((s) => s.deleteFontToken)

  const [tokenDialogOpen, setTokenDialogOpen] = useState(false)
  const [editToken, setEditToken] = useState<FontToken | null>(null)
  const sortedTokens = sortFontTokens(fontTokens)

  function handleTokenSave(input: {
    name: string
    variable: string
    familyId?: string | null
    fallback: string
  }) {
    if (editToken) {
      updateFontToken(editToken.id, input)
      setEditToken(null)
    } else {
      createFontToken(input)
      setTokenDialogOpen(false)
    }
  }

  return (
    <div className={styles.section}>
      {sortedTokens.length === 0 ? (
        <EmptyState
          plain
          compact
          title="No font tokens yet."
          action={
            <Button
              variant="secondary"
              size="sm"
              type="button"
              onClick={() => {
                setEditToken(null)
                setTokenDialogOpen(true)
              }}
            >
              Create token
            </Button>
          }
        />
      ) : (
        <>
          <div className={styles.tokenToolbar}>
            <span className={styles.tokenToolbarTitle}>Tokens</span>
            <Button
              variant="secondary"
              size="sm"
              type="button"
              onClick={() => {
                setEditToken(null)
                setTokenDialogOpen(true)
              }}
            >
              Create token
            </Button>
          </div>
          <ul className={styles.list} aria-label="Font tokens">
            {sortedTokens.map((token) => (
              <FontTokenRow
                key={token.id}
                token={token}
                fonts={fonts}
                onEdit={() => setEditToken(token)}
                onRemove={() => { deleteFontToken(token.id) }}
              />
            ))}
          </ul>
        </>
      )}

      {(tokenDialogOpen || editToken) && (
        <FontTokenDialog
          token={editToken ?? undefined}
          fonts={fonts}
          onCancel={() => {
            setTokenDialogOpen(false)
            setEditToken(null)
          }}
          onSave={handleTokenSave}
        />
      )}
    </div>
  )
}

function FontTokenRow({
  token,
  fonts,
  onEdit,
  onRemove,
}: {
  token: FontToken
  fonts: FontEntry[]
  onEdit: () => void
  onRemove: () => void
}) {
  const familyStack = resolveFontTokenStack(token, { items: fonts, tokens: [token] })
  const assigned = token.familyId ? fonts.find((entry) => entry.id === token.familyId) : undefined
  const variable = `--${token.variable}`

  return (
    <li className={styles.row}>
      <div className={styles.rowMain}>
        <span
          className={styles.rowFamily}
          style={{ fontFamily: familyStack } as CSSProperties}
        >
          {token.name}
        </span>
        <span className={styles.rowMeta}>
          {variable}
          {' · '}
          {assigned?.family ?? token.fallback}
        </span>
      </div>
      <div className={styles.rowActions}>
        <Button
          variant="ghost"
          size="xs"
          iconOnly
          aria-label={`Edit ${token.name}`}
          tooltip={`Edit ${token.name}`}
          onClick={onEdit}
        >
          <EditSolidIcon size={12} aria-hidden="true" />
        </Button>
        <Button
          variant="ghost"
          size="xs"
          iconOnly
          aria-label={`Delete ${token.name}`}
          tooltip={`Delete ${token.name}`}
          onClick={onRemove}
        >
          <TrashSolidIcon size={12} aria-hidden="true" />
        </Button>
      </div>
    </li>
  )
}
