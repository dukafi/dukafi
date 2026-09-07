import { useState } from 'react'
import { Button } from '@ui/components/Button'
import { Dialog } from '@ui/components/Dialog'
import { getErrorMessage } from '@core/utils/errorMessage'

export function GenerateImageDialog({ open, onClose, onGenerated }: {
  open: boolean
  onClose: () => void
  onGenerated: () => void
}) {
  const [prompt, setPrompt] = useState('')
  const [size, setSize] = useState('1024x1024')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function generate() {
    setBusy(true)
    setError(null)
    try {
      const response = await fetch('/admin/api/cms/ai/images', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt.trim(), size, count: 1 }),
      })
      const payload = await response.json().catch(() => ({})) as { error?: string; message?: string }
      if (!response.ok) throw new Error(payload.message || payload.error || 'Image generation failed')
      onGenerated()
      onClose()
      setPrompt('')
    } catch (cause) {
      setError(getErrorMessage(cause, 'Image generation failed'))
    } finally {
      setBusy(false)
    }
  }

  return <Dialog open={open} onClose={onClose} title="Generate image" footer={<>
    <Button variant="secondary" onClick={onClose}>Cancel</Button>
    <Button variant="primary" disabled={busy || !prompt.trim()} onClick={() => void generate()}>{busy ? 'Generating…' : 'Generate'}</Button>
  </>}>
    <label htmlFor="image-prompt">Prompt</label>
    <textarea id="image-prompt" rows={5} value={prompt} onChange={(event) => setPrompt(event.currentTarget.value)} placeholder="Describe the image you need…" style={{ width: '100%', resize: 'vertical' }} />
    <label htmlFor="image-size">Size</label>
    <select id="image-size" value={size} onChange={(event) => setSize(event.currentTarget.value)} style={{ width: '100%' }}>
      <option value="1024x1024">Square</option>
      <option value="1536x1024">Landscape</option>
      <option value="1024x1536">Portrait</option>
    </select>
    {error && <p role="alert">{error}</p>}
  </Dialog>
}
