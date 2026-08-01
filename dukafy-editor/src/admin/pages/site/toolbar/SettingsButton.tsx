/**
 * SettingsButton — opens the Settings modal.
 *
 * Reads from the tiny `adminUi` store (NOT the full editor store) so this
 * button can sit in `AdminPageLayout` without dragging the editor toolchain
 * into Plugins / Users / Account page bundles. The editor's settings slice
 * mirrors openSettings/closeSettings calls into adminUi (see the editor's
 * `settingsSlice.ts` + `uiSlice.ts`), so both stores stay in sync.
 */
import { useAdminUi } from '@admin/state/adminUi'
import { SettingsCogSolidIcon } from 'pixel-art-icons/icons/settings-cog-solid'
import { Button } from '@ui/components/Button'

export function SettingsButton() {
  const openSettings = useAdminUi((s) => s.openSettings)

  return (
    <Button
      variant="ghost"
      size="sm"
      iconOnly
      aria-label="Open settings"
      tooltip="Settings"
      onClick={() => openSettings('general')}
      data-testid="toolbar-settings-btn"
    >
      <SettingsCogSolidIcon size={16} aria-hidden="true" />
    </Button>
  )
}
