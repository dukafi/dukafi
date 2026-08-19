import { describe, expect, it } from 'bun:test'
import {
  isEditorAppPath,
  shouldProxyPublicSitePath,
} from '../../scripts/lib/publicSiteDevProxy'

describe('public-site Vite proxy routing', () => {
  it('forwards storefront HTML, hashed CSS, and runtime JS to Puma', () => {
    expect(shouldProxyPublicSitePath('/qa-shop')).toBe(true)
    expect(shouldProxyPublicSitePath('/assets/site-37ae156fc32a.css')).toBe(true)
    expect(shouldProxyPublicSitePath('/js/htmx.min.js')).toBe(true)
    expect(shouldProxyPublicSitePath('/js/dukafy-overlay.js')).toBe(true)
    expect(shouldProxyPublicSitePath('/_dukafi/css/site.css')).toBe(true)
  })

  it('leaves the admin SPA and Vite internals on Vite', () => {
    expect(isEditorAppPath('/admin')).toBe(true)
    expect(isEditorAppPath('/admin/assets/index.js')).toBe(true)
    expect(shouldProxyPublicSitePath('/admin')).toBe(false)
    expect(shouldProxyPublicSitePath('/src/main.tsx')).toBe(false)
    expect(shouldProxyPublicSitePath('/@vite/client')).toBe(false)
    expect(shouldProxyPublicSitePath('/assets/index-abc.js')).toBe(false)
    expect(shouldProxyPublicSitePath('/assets/site-notahash.css')).toBe(false)
  })
})
