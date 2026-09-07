import { useEffect, useState } from 'react'
import { Button } from '@ui/components/Button'
import { getCmsPublishStatus } from '@core/persistence/cmsPublish'
import type { CommerceData } from '../hooks/useCommerceData'

export function LaunchChecklist({ data, navigate }: { data: CommerceData; navigate: (path: string) => void }) {
  const [published, setPublished] = useState(false)
  useEffect(() => { getCmsPublishStatus().then((status) => setPublished(status.hasPublishedVersion)).catch(() => {}) }, [])
  const payment = data.plugins.some((plugin) => plugin.configured && plugin.paymentProviders.length > 0)
  const mail = data.plugins.some((plugin) => plugin.configured && (plugin.mailProviders?.length || 0) > 0)
  const items = [
    { done: data.products.length > 0, label: 'Add a product', path: '/admin/dashboard/products' },
    { done: payment, label: 'Connect a payment provider', path: '/admin/dashboard/plugins' },
    { done: mail, label: 'Connect email', path: '/admin/dashboard/plugins' },
    { done: published, label: 'Publish your storefront', path: '/admin/site' },
  ]
  if (items.every((item) => item.done)) return null
  return <aside aria-label="Launch checklist" style={{ border: '1px solid var(--border-subtle)', borderRadius: 8, padding: 16, marginBottom: 20 }}>
    <h2 style={{ marginTop: 0 }}>Launch your store</h2>
    {items.map((item) => <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
      <span aria-hidden="true">{item.done ? '✓' : '○'}</span>
      <Button variant="ghost" size="sm" disabled={item.done} onClick={() => navigate(item.path)}>{item.label}</Button>
    </div>)}
  </aside>
}
