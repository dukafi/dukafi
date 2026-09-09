/**
 * AdminAppSidebar — grouped left navigation for every admin workspace.
 *
 * Workspace destinations (Dashboard / Editor / Media) live in the first group.
 * Callers pass extra groups for the page they are on (Store, Editor, Library).
 * Must not import `@site/store` — dashboard and media mount this from the
 * lightweight admin graph.
 *
 * A layout toggle at the bottom switches labeled / icons-only / hidden.
 */
import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { CloseIcon } from 'pixel-art-icons/icons/close'
import { Grid2x22SolidIcon } from 'pixel-art-icons/icons/grid-2x2-2-solid'
import { ImagesSolidIcon } from 'pixel-art-icons/icons/images-solid'
import { LayoutSolidIcon } from 'pixel-art-icons/icons/layout-solid'
import { PackageSolidIcon } from 'pixel-art-icons/icons/package-solid'
import { TextAlignJustifyIcon } from 'pixel-art-icons/icons/text-align-justify'
import type { IconComponent } from 'pixel-art-icons/types'
import { canAccessWorkspace, workspacePath } from '@admin/access'
import { Link } from '@admin/lib/routing'
import { useAdminNavigate } from '@admin/lib/useAdminNavigate'
import { useCurrentAdminUser } from '@admin/sessionContext'
import { useAdminNavChrome, type AdminNavMode } from '@admin/state/adminNavChrome'
import type { AdminWorkspace } from '@admin/workspace'
import { Button } from '@ui/components/Button'
import { ContextMenu, ContextMenuItem } from '@ui/components/ContextMenu'
import { cn } from '@ui/cn'
import styles from './AdminAppSidebar.module.css'

export interface AdminAppSidebarItem {
  id: string
  label: string
  icon: IconComponent
  active?: boolean
  href?: string
  onClick?: () => void
  testId?: string
}

export interface AdminAppSidebarGroup {
  id: string
  label: string
  items: AdminAppSidebarItem[]
}

interface AdminAppSidebarProps {
  /** Highlights the current top-level workspace in the Workspace group. */
  workspace: AdminWorkspace
  /** Optional store name shown above the groups. */
  brand?: string | null
  /** Extra groups rendered under Workspace (Store, Editor, Library, …). */
  groups?: AdminAppSidebarGroup[]
  ariaLabel?: string
  testId?: string
}

const WORKSPACE_ITEMS: ReadonlyArray<{
  id: AdminWorkspace
  label: string
  icon: IconComponent
}> = [
  { id: 'dashboard', label: 'Dashboard', icon: PackageSolidIcon },
  { id: 'site', label: 'Editor', icon: LayoutSolidIcon },
  { id: 'media', label: 'Media', icon: ImagesSolidIcon },
]

const MODE_OPTIONS: ReadonlyArray<{ value: AdminNavMode; label: string }> = [
  { value: 'expanded', label: 'Full' },
  { value: 'icons', label: 'Icons only' },
  { value: 'hidden', label: 'Hidden' },
]

export function AdminAppSidebar({
  workspace,
  brand,
  groups = [],
  ariaLabel = 'Admin',
  testId = 'admin-app-sidebar',
}: AdminAppSidebarProps) {
  const mode = useAdminNavChrome((state) => state.mode)
  const sheetOpen = useAdminNavChrome((state) => state.mobileSheetOpen)
  const setMobileSheetOpen = useAdminNavChrome((state) => state.setMobileSheetOpen)
  const currentUser = useCurrentAdminUser()
  const workspaceItems: AdminAppSidebarItem[] = WORKSPACE_ITEMS
    .filter((item) => canAccessWorkspace(currentUser, item.id))
    .map((item) => ({
      id: item.id,
      label: item.label,
      icon: item.icon,
      href: workspacePath(item.id),
      active: item.id === workspace,
      testId: `admin-sidebar-workspace-${item.id}`,
    }))

  const visibleGroups = [
    { id: 'workspace', label: 'Workspace', items: workspaceItems },
    ...groups.filter((group) => group.items.length > 0),
  ].filter((group) => group.items.length > 0)

  const brandLabel = brand?.trim() ?? ''
  const iconsOnly = mode === 'icons' && !sheetOpen

  useEffect(() => {
    if (!sheetOpen) return
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setMobileSheetOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sheetOpen, setMobileSheetOpen])

  return (
    <div
      className={styles.root}
      data-testid={testId}
      data-mode={mode}
      data-sheet-open={sheetOpen ? 'true' : undefined}
    >
      <div className={styles.hamburger}>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          iconOnly
          aria-label={sheetOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={sheetOpen}
          aria-controls="admin-nav-sheet"
          data-testid="admin-sidebar-hamburger"
          onClick={() => setMobileSheetOpen(!sheetOpen)}
        >
          {sheetOpen ? <CloseIcon size={16} aria-hidden="true" /> : <TextAlignJustifyIcon size={16} aria-hidden="true" />}
        </Button>
      </div>
      {sheetOpen ? (
        <button
          type="button"
          className={styles.backdrop}
          aria-label="Close menu"
          data-testid="admin-nav-sheet-backdrop"
          onClick={() => setMobileSheetOpen(false)}
        />
      ) : null}
      <div
        className={styles.pane}
        id="admin-nav-sheet"
        data-testid="admin-nav-sheet"
        hidden={mode === 'hidden' && !sheetOpen}
      >
        {brandLabel ? (
          <div className={styles.brand} title={brandLabel}>
            {brandLabel}
          </div>
        ) : null}
        <nav className={styles.nav} aria-label={ariaLabel}>
          {visibleGroups.map((group) => (
            <div key={group.id} className={styles.group} data-testid={`admin-sidebar-group-${group.id}`}>
              <div className={styles.groupLabel}>{group.label}</div>
              {group.items.map((item) => (
                <SidebarItem key={item.id} item={item} iconsOnly={iconsOnly} />
              ))}
            </div>
          ))}
        </nav>
      </div>
      <NavModeToggle />
    </div>
  )
}

function NavModeToggle() {
  const mode = useAdminNavChrome((state) => state.mode)
  const setMode = useAdminNavChrome((state) => state.setMode)
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const ToggleIcon = mode === 'icons' ? Grid2x22SolidIcon : LayoutSolidIcon

  return (
    <div className={styles.chrome}>
      <Button
        ref={triggerRef}
        type="button"
        variant="ghost"
        size="sm"
        iconOnly
        active={open}
        aria-label="Sidebar layout"
        aria-haspopup="menu"
        aria-expanded={open}
        tooltip="Sidebar layout"
        tooltipSide="right"
        data-testid="admin-sidebar-mode-toggle"
        onClick={() => setOpen((current) => !current)}
      >
        <ToggleIcon size={16} aria-hidden="true" />
      </Button>
      {open ? (
        <ContextMenu
          ariaLabel="Sidebar layout"
          onClose={() => setOpen(false)}
          anchorRef={triggerRef}
          side="right"
          align="end"
          width={160}
        >
          {MODE_OPTIONS.map((option) => (
            <ContextMenuItem
              key={option.value}
              pressed={mode === option.value}
              data-testid={`admin-sidebar-mode-${option.value}`}
              onClick={() => {
                setMode(option.value)
                setOpen(false)
              }}
            >
              {option.label}
            </ContextMenuItem>
          ))}
        </ContextMenu>
      ) : null}
    </div>
  )
}

function SidebarItem({ item, iconsOnly }: { item: AdminAppSidebarItem; iconsOnly: boolean }) {
  const Icon = item.icon
  const testId = item.testId ?? `admin-sidebar-${item.id}`
  const icon = <Icon size={16} aria-hidden="true" className={cn(styles.icon)} />
  const label = <span className={styles.itemLabel}>{item.label}</span>

  if (item.href) {
      if (item.active) {
        return (
          <span
            className={cn(styles.navLink, styles.navLinkActive)}
            aria-current="page"
            aria-label={item.label}
            title={iconsOnly ? item.label : undefined}
            data-testid={testId}
            onClick={() => useAdminNavChrome.getState().setMobileSheetOpen(false)}
          >
            {icon}
            {label}
          </span>
        )
      }
      return (
        <AdminRouteLink
          to={item.href}
          testId={testId}
          label={item.label}
          title={iconsOnly ? item.label : undefined}
        >
          {icon}
          {label}
        </AdminRouteLink>
      )
    }

  return (
    <Button
      type="button"
      variant="ghost"
      size="md"
      shape="flush"
      align={iconsOnly ? 'center' : 'start'}
      iconOnly={iconsOnly}
      fullWidth
      pressed={item.active}
      active={item.active}
      aria-label={item.label}
      tooltip={iconsOnly ? item.label : undefined}
      tooltipSide="right"
      onClick={() => {
        item.onClick?.()
        useAdminNavChrome.getState().setMobileSheetOpen(false)
      }}
      data-testid={testId}
      className={cn(styles.item)}
    >
      {icon}
      {iconsOnly ? null : label}
    </Button>
  )
}

function AdminRouteLink({
  to,
  testId,
  label,
  title,
  children,
}: {
  to: string
  testId: string
  label: string
  title?: string
  children: ReactNode
}) {
  const navigate = useAdminNavigate()

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return
    }
    event.preventDefault()
    navigate(to)
    useAdminNavChrome.getState().setMobileSheetOpen(false)
  }

  return (
    <Link
      to={to}
      className={cn(styles.navLink)}
      onClick={handleClick}
      data-testid={testId}
      aria-label={label}
      title={title}
    >
      {children}
    </Link>
  )
}
