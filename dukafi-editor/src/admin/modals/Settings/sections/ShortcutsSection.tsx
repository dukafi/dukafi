/**
 * ShortcutsSection — keyboard shortcut reference.
 *
 * Renders <HelpKeybindingsList /> which is generated from the keybindings
 * registry (src/admin/spotlight/keybindings.ts).
 *
 * The previous hand-written SHORTCUTS table has been deleted. The registry
 * is the single source of truth — adding a new binding to keybindings.ts
 * automatically appears here.
 */
import { HelpKeybindingsList } from '@admin/spotlight/HelpKeybindingsList'
import s from '../SettingsModal.module.css'

export function ShortcutsSection() {
  return (
    <div>
      <p className={s.sectionDescription}>
        All keyboard shortcuts, organized by context. Platform-specific hints
        are shown automatically based on your operating system.
      </p>
      <HelpKeybindingsList />
    </div>
  )
}
