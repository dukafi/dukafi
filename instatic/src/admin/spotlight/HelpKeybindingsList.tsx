/**
 * HelpKeybindingsList — generated keyboard shortcuts reference.
 *
 * Reads from KEYBINDINGS (keybindings.ts) and joins each entry to its
 * Command definition via getAllCommands(). Grouped by scope.
 *
 * This component replaces the hand-written SHORTCUTS table that used to live
 * in ShortcutsSection.tsx. Single source of truth: adding a new binding to
 * keybindings.ts automatically surfaces it here — no manual list maintenance.
 *
 * Used by: src/admin/modals/Settings/sections/ShortcutsSection.tsx
 */

import { type ReactNode } from 'react'
import { ShortcutKeys } from '@ui/components/Kbd'
import { KEYBINDINGS, isPlatformMac } from './keybindings'
import type { KeybindingDefinition } from './keybindings'
import { getAllCommands } from './commandRegistry'
import styles from './HelpKeybindingsList.module.css'

// ─── Scope grouping ───────────────────────────────────────────────────────────

type Scope = KeybindingDefinition['scope']

const SCOPE_ORDER: ReadonlyArray<Scope> = ['global', 'editor', 'canvas', 'panels']

const SCOPE_LABELS: Record<Scope, string> = {
  global:  'Global',
  editor:  'Editor',
  canvas:  'Canvas & Layers',
  panels:  'Panels',
}

// ─── HelpKeybindingsList ──────────────────────────────────────────────────────

export function HelpKeybindingsList(): ReactNode {
  const isMac = isPlatformMac()

  // Build commandId → title lookup once.
  const commandTitleMap = new Map<string, string>()
  for (const cmd of getAllCommands()) {
    commandTitleMap.set(cmd.id, cmd.title)
  }

  // Group bindings by scope in the defined order.
  const grouped = new Map<Scope, KeybindingDefinition[]>()
  for (const scope of SCOPE_ORDER) {
    grouped.set(scope, [])
  }
  for (const kb of KEYBINDINGS) {
    grouped.get(kb.scope)?.push(kb)
  }

  return (
    <div className={styles.list}>
      {SCOPE_ORDER.map((scope) => {
        const bindings = grouped.get(scope) ?? []
        if (bindings.length === 0) return null

        return (
          <section key={scope} className={styles.section}>
            <h4 className={styles.sectionTitle}>{SCOPE_LABELS[scope]}</h4>

            <div className={styles.cardGroup}>
              {bindings.map((kb) => {
                // Prefer the command title from the registry; fall back to
                // displayName (for virtual bindings like 'spotlight.open'), then
                // the raw commandId.
                const title =
                  commandTitleMap.get(kb.commandId) ??
                  kb.displayName ??
                  kb.commandId

                const shortcutLabel = isMac ? kb.shortcut.mac : kb.shortcut.win

                return (
                  <div key={kb.commandId} className={styles.row}>
                    <span className={styles.rowTitle}>{title}</span>
                    <ShortcutKeys label={shortcutLabel} className={styles.shortcutHint} />
                  </div>
                )
              })}
            </div>
          </section>
        )
      })}
    </div>
  )
}
