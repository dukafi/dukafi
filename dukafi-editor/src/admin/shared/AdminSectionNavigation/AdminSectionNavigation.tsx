import type { MouseEvent, ReactNode } from 'react'
import { ImagesSolidIcon } from 'pixel-art-icons/icons/images-solid'
import { LayoutSolidIcon } from 'pixel-art-icons/icons/layout-solid'
import { PackageSolidIcon } from 'pixel-art-icons/icons/package-solid'
import type { CmsCurrentUser } from '@core/persistence'
import { Link } from '@admin/lib/routing'
import { useAdminNavigate } from '@admin/lib/useAdminNavigate'
import type { AdminWorkspace } from '@admin/workspace'
import { cn } from '@ui/cn'
import styles from './AdminSectionNavigation.module.css'

const NAV_ICON_SIZE = 13

interface AdminSectionNavigationProps {
  section: AdminWorkspace
  currentUser?: CmsCurrentUser | null
  onWorkspaceNavigateStart?: () => unknown
}

export function AdminSectionNavigation({
  section,
  onWorkspaceNavigateStart,
}: AdminSectionNavigationProps) {
  // A <nav> of links, deliberately NOT role="tablist": these navigate to
  // separate routes, and the tab roles promise tabpanels in this document that
  // do not exist. The segmented look is styling; the semantics stay
  // navigation, with `aria-current` marking where you are.
  return (
    <nav className={styles.tabs} aria-label="Workspace">
      <NavItem
        to="/admin/dashboard"
        icon={<PackageSolidIcon size={NAV_ICON_SIZE} aria-hidden="true" />}
        label="Dashboard"
        active={section === 'dashboard'}
        onNavigateStart={onWorkspaceNavigateStart}
      />
      <NavItem
        to="/admin/site"
        icon={<LayoutSolidIcon size={NAV_ICON_SIZE} aria-hidden="true" />}
        label="Site"
        active={section === 'site'}
        onNavigateStart={onWorkspaceNavigateStart}
      />
      <NavItem
        to="/admin/media"
        icon={<ImagesSolidIcon size={NAV_ICON_SIZE} aria-hidden="true" />}
        label="Media"
        active={section === 'media'}
        onNavigateStart={onWorkspaceNavigateStart}
      />
    </nav>
  )
}

function NavItem({
  to, icon, label, active, onNavigateStart,
}: {
  to: string
  icon: ReactNode
  label: string
  active: boolean
  onNavigateStart?: () => unknown
}) {
  if (active) {
    return (
      <span className={cn(styles.tab, styles.tabActive)} aria-current="page">
        {icon}
        <span className={styles.label}>{label}</span>
      </span>
    )
  }
  return (
    <AdminRouteLink to={to} onNavigateStart={onNavigateStart}>
      {icon}
      <span className={styles.label}>{label}</span>
    </AdminRouteLink>
  )
}

function AdminRouteLink({
  to, children, onNavigateStart,
}: {
  to: string
  children: ReactNode
  onNavigateStart?: () => unknown
}) {
  const navigate = useAdminNavigate()

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    onNavigateStart?.()
    navigate(to)
  }

  return (
    <Link to={to} className={styles.tab} onClick={handleClick}>
      {children}
    </Link>
  )
}
