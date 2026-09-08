import { describe, it, expect, afterEach, mock } from 'bun:test'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { GenerateImageDialog } from '@admin/pages/media/components/GenerateImageDialog'

afterEach(() => {
  cleanup()
  mock.restore()
})

describe('GenerateImageDialog', () => {
  it('posts to /ai/images and calls onGenerated', async () => {
    const onGenerated = mock(() => {})
    const onClose = mock(() => {})

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('/admin/api/cms/ai/images')
      expect(init?.method).toBe('POST')
      const body = JSON.parse(String(init?.body))
      expect(body.prompt).toBe('a red bag')
      expect(body.size).toBe('1024x1024')
      return new Response(JSON.stringify({
        asset: {
          id: '42',
          filename: 'ai.png',
          mimeType: 'image/png',
          sizeBytes: 12,
          publicPath: '/uploads/ai.png',
          uploadedByUserId: null,
          createdAt: '2026-01-01T00:00:00Z',
          origin: 'ai',
        },
        provider: 'openrouter', model: 'img-1',
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }) as typeof fetch

    render(<GenerateImageDialog open onClose={onClose} onGenerated={onGenerated} />)
    fireEvent.change(screen.getByPlaceholderText('Describe the image you need…'), { target: { value: 'a red bag' } })
    fireEvent.click(screen.getByRole('button', { name: 'Generate' }))

    await waitFor(() => expect(onGenerated).toHaveBeenCalled())
    expect(onClose).toHaveBeenCalled()
  })
})
