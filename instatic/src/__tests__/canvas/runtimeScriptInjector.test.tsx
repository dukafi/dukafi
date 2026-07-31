import { afterEach, describe, expect, it } from 'bun:test'
import { cleanup, waitFor } from '@testing-library/react'
import { withCanvasDomReadyReplay } from '@admin/pages/site/canvas/canvasDomReadyReplay'

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
  delete document.body.dataset.domReadyFired
})

describe('RuntimeScriptInjector', () => {
  it('runs DOMContentLoaded handlers registered by scripts injected after the iframe is already ready', async () => {
    withCanvasDomReadyReplay(document, () => {
      document.addEventListener('DOMContentLoaded', () => {
        document.body.dataset.domReadyFired = 'yes'
      })
    })

    await waitFor(() => {
      expect(document.body.dataset.domReadyFired).toBe('yes')
    })
  })
})
