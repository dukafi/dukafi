import type { MouseEvent, ReactNode } from 'react'
import { ImagesSolidIcon } from 'pixel-art-icons/icons/images-solid'
import { LayoutSolidIcon } from 'pixel-art-icons/icons/layout-solid'
import type { CmsCurrentUser } from '@core/persistence'
import { Link } from '@admin/lib/routing'
import { useAdminNavigate } from '@admin/lib/useAdminNavigate'
import type { AdminWorkspace } from '@admin/workspace'
import toolbarStyles from '@site/toolbar/Toolbar.module.css'

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
  return (
    <>
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
    </>
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
      <span className={toolbarStyles.activeSection}>
        {icon}
        <span>{label}</span>
      </span>
    )
  }
  return (
    <AdminRouteLink to={to} onNavigateStart={onNavigateStart}>
      {icon}
      <span>{label}</span>
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

  return <Link to={to} onClick={handleClick}>{children}</Link>
}
