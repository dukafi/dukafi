/**
 * SpotlightFooter — keyboard hint strip at the bottom of the palette.
 *
 * Phase 2: context-aware hints based on arg mode and scope stack depth.
 */

import type { ReactNode } from 'react'
import { Kbd } from '@ui/components/Kbd'
import styles from './Spotlight.module.css'

interface SpotlightFooterProps {
  isArgMode?: boolean
  hasScopeStack?: boolean
}

interface FooterHint {
  keys: string
  label: string
}

const ROOT_HINTS: FooterHint[] = [
  { keys: '↑↓', label: 'Navigate' },
  { keys: '⏎', label: 'Run' },
  { keys: 'Tab', label: 'Enter' },
  { keys: '⌫', label: 'Back' },
  { keys: 'esc', label: 'Close' },
]

const SCOPE_HINTS: FooterHint[] = [
  { keys: '↑↓', label: 'Navigate' },
  { keys: '⏎', label: 'Run' },
  { keys: '⌫', label: 'Back' },
  { keys: 'esc', label: 'Close' },
]

const ARG_HINTS: FooterHint[] = [
  { keys: '⏎', label: 'Next' },
  { keys: '⌫ empty', label: 'Back' },
  { keys: 'esc', label: 'Cancel' },
]

export function SpotlightFooter({ isArgMode, hasScopeStack }: SpotlightFooterProps): ReactNode {
  const hints = isArgMode ? ARG_HINTS : hasScopeStack ? SCOPE_HINTS : ROOT_HINTS

  return (
    <footer className={styles.footer} aria-hidden="true">
      {hints.map((hint, i) => (
        <span key={hint.keys} className={styles.footerHint}>
          {i > 0 && <span className={styles.footerSeparator}>·</span>}
          <Kbd>{hint.keys}</Kbd>
          <span>{hint.label}</span>
        </span>
      ))}
    </footer>
  )
}
