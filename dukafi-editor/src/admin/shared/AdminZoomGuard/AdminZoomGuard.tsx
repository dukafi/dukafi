import { useEffect } from 'react'
import { installAdminZoomGuard } from './installAdminZoomGuard'

export function AdminZoomGuard() {
  useEffect(() => installAdminZoomGuard(document), [])
  return null
}
