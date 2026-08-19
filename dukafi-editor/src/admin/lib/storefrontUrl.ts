import { pushToast } from '@ui/components/Toast'

/** Absolute storefront URL for a public path (`/`, `/about`, `/products/x`). */
export function storefrontUrl(path: string): string {
  const origin = window.location.origin.replace(/\/$/, '')
  if (!path || path === '/') return `${origin}/`
  return `${origin}${path.startsWith('/') ? path : `/${path}`}`
}

export async function copyStorefrontUrl(path: string, label = 'Copied URL'): Promise<boolean> {
  const value = storefrontUrl(path)
  try {
    await navigator.clipboard.writeText(value)
    pushToast({ kind: 'success', title: label, body: value })
    return true
  } catch {
    pushToast({ kind: 'error', title: 'Could not copy', body: value })
    return false
  }
}
