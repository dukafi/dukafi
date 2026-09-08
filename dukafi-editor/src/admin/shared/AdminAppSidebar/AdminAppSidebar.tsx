/**
 * AdminAppSidebar — grouped left navigation for every admin workspace.
 *
 * Workspace destinations (Dashboard / Site / Media) live in the first group.
 * Callers pass extra groups for the page they are on (Store, Editor, Library).
 * Must not import `@site/store` — dashboard and media mount this from the
 * lightweight admin graph.
 */
import type { MouseEvent, ReactNode } from 'react'
import { ImagesSolidIcon } from 'pixel-art-icons/icons/images-solid'
import { LayoutSolidIcon } from 'pixel-art-icons/icons/layout-solid'
import { PackageSolidIcon } from 'pixel-art-icons/icons/package-solid'
import type { IconComponent } from 'pixel-art-icons/types'
import { canAccessWorkspace, workspacePath } from '@admin/access'
import { Link } from '@admin/lib/routing'
import { useAdminNavigate } from '@admin/lib/useAdminNavigate'
import { useCurrentAdminUser } from '@admin/sessionContext'
import type { AdminWorkspace } from '@admin/workspace'
import { Button } from '@ui/components/Button'
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
  { id: 'site', label: 'Site', icon: LayoutSolidIcon },
  { id: 'media', label: 'Media', icon: ImagesSolidIcon },
]

export function AdminAppSidebar({
  workspace,
  brand,
  groups = [],
  ariaLabel = 'Admin',
  testId = 'admin-app-sidebar',
}: AdminAppSidebarProps) {
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

  return (
    <div className={styles.root} data-testid={testId}>
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
              <SidebarItem key={item.id} item={item} />
            ))}
          </div>
        ))}
      </nav>
    </div>
  )
}

function SidebarItem({ item }: { item: AdminAppSidebarItem }) {
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
          data-testid={testId}
        >
          {icon}
          {label}
        </span>
      )
    }
    return (
      <AdminRouteLink to={item.href} testId={testId}>
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
      align="start"
      fullWidth
      pressed={item.active}
      active={item.active}
      onClick={item.onClick}
      data-testid={testId}
      className={cn(styles.item)}
    >
      {icon}
      {label}
    </Button>
  )
}

function AdminRouteLink({
  to,
  testId,
  children,
}: {
  to: string
  testId: string
  children: ReactNode
}) {
  const navigate = useAdminNavigate()

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return
    }
    event.preventDefault()
    navigate(to)
  }

  return (
    <Link to={to} className={cn(styles.navLink)} onClick={handleClick} data-testid={testId}>
      {children}
    </Link>
  )
}
