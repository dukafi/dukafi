import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import type { ControlProps } from './shared'
import { Input } from '@ui/components/Input'
import { ControlRow } from '@ui/components/ControlRow'
import { ContextMenu, ContextMenuItem } from '@ui/components/ContextMenu'
import { useEditorStore } from '@site/store/store'
import { useEditorPreference } from '@site/preferences/editorPreferences'
import { generateSiteFontsCss } from '@core/fonts'
import {
  fontFamilyStackForEntry,
  fontTokenValueExpr,
  resolveFontTokenStack,
  sortFontTokens,
} from '@core/fonts'
import type { FontEntry, FontToken } from '@core/fonts'
import styles from './FontFamilyControl.module.css'

const EMPTY_FONT_ENTRIES: FontEntry[] = []
const EMPTY_FONT_TOKENS: FontToken[] = []

interface FontFamilyControlProps extends ControlProps<string> {
  placeholder?: string
  onPreview?: (value: string | undefined) => void
  onClearPreview?: () => void
}

function useAdminFontFaces(fontsCss: string) {
  useEffect(() => {
    if (!fontsCss) return
    const styleEl = document.createElement('style')
    styleEl.setAttribute('data-source', 'instatic-admin-font-family-control')
    styleEl.textContent = fontsCss
    document.head.appendChild(styleEl)
    return () => {
      styleEl.remove()
    }
  }, [fontsCss])
}

export function FontFamilyControl({
  propKey,
  value,
  onChange,
  label,
  placeholder,
  isOverride,
  disabled,
  layout,
  onPreview,
  onClearPreview,
}: FontFamilyControlProps) {
  const fonts = useEditorStore((state) => state.site?.settings.fonts ?? null)
  const hoverPreviewEnabled = useEditorPreference('hoverPreview')
  const inputRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const tokens = sortFontTokens(fonts?.tokens ?? EMPTY_FONT_TOKENS)
  const entries = fonts?.items ?? EMPTY_FONT_ENTRIES
  const fontsCss = generateSiteFontsCss(fonts)

  useAdminFontFaces(fontsCss)

  useEffect(() => {
    if (!hoverPreviewEnabled) onClearPreview?.()
  }, [hoverPreviewEnabled, onClearPreview])

  const commit = (nextValue: string | undefined) => {
    onClearPreview?.()
    onChange(propKey, nextValue ?? '')
    setOpen(false)
  }

  const preview = (nextValue: string | undefined) => {
    if (!hoverPreviewEnabled || !onPreview) return
    onPreview(nextValue)
  }

  return (
    <ControlRow
      propKey={propKey}
      label={label}
      layout={layout}
      isOverride={isOverride}
      disabled={disabled}
    >
      <div className={styles.wrapper}>
        <Input
          ref={inputRef}
          id={`ctrl-${propKey}`}
          type="text"
          fieldSize="sm"
          value={value ?? ''}
          placeholder={placeholder}
          disabled={disabled}
          spellCheck={false}
          autoComplete="off"
          aria-label={label ?? propKey}
          onMouseDown={() => {
            if (!disabled) setOpen(true)
          }}
          onClick={() => {
            if (!disabled) setOpen(true)
          }}
          onFocus={() => {
            if (!disabled) setOpen(true)
          }}
          onChange={(event) => onChange(propKey, event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault()
              setOpen(false)
              onClearPreview?.()
            }
          }}
        />

        {open && !disabled &&
          createPortal(
            <ContextMenu
              anchorRef={inputRef}
              side="auto"
              align="start"
              offset={4}
              matchAnchorWidth
              minWidth={240}
              ariaLabel={`${label ?? propKey} choices`}
              triggerRef={inputRef}
              onClose={() => {
                setOpen(false)
                onClearPreview?.()
              }}
              onMouseLeave={() => onClearPreview?.()}
            >
              <div className={styles.menuHeader} aria-hidden="true">Base</div>
              <FontChoiceRow
                title="Inherit"
                meta="Use the parent font"
                value="inherit"
                onCommit={commit}
                onPreview={preview}
              />

              {tokens.length > 0 && (
                <div className={styles.menuHeader} aria-hidden="true">Font tokens</div>
              )}
              {tokens.map((token) => {
                const valueExpr = fontTokenValueExpr(token.variable)
                const stack = resolveFontTokenStack(token, fonts)
                const assigned = token.familyId
                  ? entries.find((entry) => entry.id === token.familyId)?.family
                  : undefined
                return (
                  <FontChoiceRow
                    key={token.id}
                    title={token.name}
                    meta={`${valueExpr}${assigned ? ` · ${assigned}` : ''}`}
                    value={valueExpr}
                    previewFamily={stack}
                    onCommit={commit}
                    onPreview={preview}
                  />
                )
              })}

              {entries.length > 0 && (
                <div className={styles.menuHeader} aria-hidden="true">Installed fonts</div>
              )}
              {entries.map((entry) => {
                const stack = fontFamilyStackForEntry(entry)
                return (
                  <FontChoiceRow
                    key={entry.id}
                    title={entry.family}
                    meta="Installed font"
                    value={stack}
                    previewFamily={stack}
                    onCommit={commit}
                    onPreview={preview}
                  />
                )
              })}
            </ContextMenu>,
            document.body,
          )}
      </div>
    </ControlRow>
  )
}

interface FontChoiceRowProps {
  title: string
  meta: string
  value: string
  previewFamily?: string
  onCommit: (value: string) => void
  onPreview: (value: string) => void
}

function FontChoiceRow({
  title,
  meta,
  value,
  previewFamily,
  onCommit,
  onPreview,
}: FontChoiceRowProps) {
  return (
    <ContextMenuItem
      className={styles.menuItem}
      onMouseDown={(event) => {
        event.preventDefault()
        onCommit(value)
      }}
      onMouseEnter={() => onPreview(value)}
    >
      <span
        className={styles.menuTitle}
        style={
          previewFamily
            ? ({ fontFamily: previewFamily } as CSSProperties)
            : undefined
        }
      >
        {title}
      </span>
      <span className={styles.menuMeta}>{meta}</span>
    </ContextMenuItem>
  )
}
