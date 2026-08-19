/**
 * Which GET/HEAD requests the Vite dev server should forward to Puma as the
 * published storefront, rather than treating them as the admin SPA.
 *
 * Admin assets live under `/admin/` (`base: '/admin/'`). Storefront CSS is
 * `/assets/site-<hash>.css` and storefront JS is `/js/…`. Those used to be
 * skipped as "editor static", so http://localhost:5173/qa-shop served HTML
 * with a 404 stylesheet.
 */

const FILE_EXTENSION_RE = /\.[a-zA-Z0-9]+$/
const STOREFRONT_CSS_RE = /^\/assets\/site-[0-9a-f]{12}\.css$/
const STOREFRONT_JS_RE = /^\/js\/[\w.-]+\.js$/

export function isEditorAppPath(pathname: string): boolean {
  return (
    pathname === '/admin' ||
    pathname.startsWith('/admin/') ||
    pathname === '/index.html' ||
    pathname.startsWith('/@') ||
    pathname.startsWith('/__vite') ||
    pathname.startsWith('/src/') ||
    pathname.startsWith('/node_modules/') ||
    pathname.startsWith('/api/') ||
    pathname.startsWith('/uploads/')
  )
}

export function shouldProxyPublicSitePath(pathname: string, method = 'GET'): boolean {
  if (method !== 'GET' && method !== 'HEAD') return false
  if (isEditorAppPath(pathname)) return false

  // Backend routes whose URL ends with an extension would otherwise be
  // rejected by the fallthrough rule (which protects editor files).
  if (pathname.startsWith('/_dukafi/assets/')) return true
  if (pathname.startsWith('/_dukafi/css/')) return true
  if (STOREFRONT_CSS_RE.test(pathname)) return true
  if (STOREFRONT_JS_RE.test(pathname)) return true

  return pathname === '/' || !FILE_EXTENSION_RE.test(pathname)
}

export function shouldProxyPublicSiteRequest(req: { method?: string; url?: string }): boolean {
  if (!req.url) return false
  const { pathname } = new URL(req.url, 'http://localhost:9292')
  return shouldProxyPublicSitePath(pathname, req.method || 'GET')
}
