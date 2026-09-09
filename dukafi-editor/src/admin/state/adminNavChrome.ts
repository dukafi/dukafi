import { create } from 'zustand'

/**
 * How wide the shared admin nav is: labeled, icon rail, or gone.
 *
 * Lives outside the editor store so Dashboard / Media can read it without
 * pulling the canvas chunk. Persisted so a refresh keeps the last choice.
 */
export type AdminNavMode = 'expanded' | 'icons' | 'hidden'

export const ADMIN_NAV_RAIL_WIDTH: Record<AdminNavMode, number> = {
  expanded: 184,
  icons: 48,
  hidden: 0,
}

const STORAGE_KEY = 'dukafi-admin-nav-mode'

function readStoredMode(): AdminNavMode {
  if (typeof localStorage === 'undefined') return 'expanded'
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === 'icons' || raw === 'hidden' || raw === 'expanded') return raw
  } catch {
    // Quota / private mode — start expanded.
  }
  return 'expanded'
}

function writeStoredMode(mode: AdminNavMode) {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, mode)
  } catch {
    // Best-effort.
  }
}

interface AdminNavChromeState {
  mode: AdminNavMode
  setMode: (mode: AdminNavMode) => void
  mobileSheetOpen: boolean
  setMobileSheetOpen: (open: boolean) => void
}

export const useAdminNavChrome = create<AdminNavChromeState>((set, get) => ({
  mode: readStoredMode(),
  setMode: (mode) => {
    if (get().mode === mode) return
    writeStoredMode(mode)
    set({ mode })
  },
  mobileSheetOpen: false,
  setMobileSheetOpen: (open) => {
    if (get().mobileSheetOpen === open) return
    set({ mobileSheetOpen: open })
  },
}))

export function adminNavRailWidth(mode: AdminNavMode = useAdminNavChrome.getState().mode): number {
  return ADMIN_NAV_RAIL_WIDTH[mode]
}
