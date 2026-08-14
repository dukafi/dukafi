/**
 * Each Commerce area is its own page.
 *
 * The area used to live in `useState`, so every area shared one URL:
 * `/admin/dashboard`. That meant no linking to Orders, no bookmarking Import,
 * and a back button that left Commerce entirely instead of stepping back an
 * area. The area now comes from the path.
 *
 * Rendering the whole page needs the admin session provider, so this covers
 * the two things that actually carry the behaviour: the param → area mapping,
 * and the route existing to supply that param.
 */

import { describe, expect, it } from 'bun:test'
import { readFileSync } from 'fs'
import { join } from 'path'
import { sectionFromParam } from '@admin/pages/dashboard/DashboardPage'

describe('Commerce area from the URL', () => {
  it('opens the area named in the path', () => {
    expect(sectionFromParam('orders')).toBe('orders')
    expect(sectionFromParam('settings')).toBe('settings')
    expect(sectionFromParam('import')).toBe('import')
  })

  it('treats a bare /admin/dashboard as Products', () => {
    expect(sectionFromParam(undefined)).toBe('products')
  })

  it('falls back to Products rather than rendering an empty workspace', () => {
    // A stale bookmark or a typo must not leave the merchant staring at
    // a sidebar with no content beside it.
    expect(sectionFromParam('not-a-real-area')).toBe('products')
    expect(sectionFromParam('')).toBe('products')
  })
})

describe('Commerce routes', () => {
  const router = readFileSync(
    join(import.meta.dir, '../../admin/router.tsx'), 'utf8',
  )

  it('declares the per-area route that supplies the param', () => {
    expect(router).toContain('/admin/dashboard/:dashboardSection')
  })

  it('keeps the bare workspace route so /admin/dashboard still resolves', () => {
    expect(router).toContain('path="/admin/dashboard"')
  })
})
