/**
 * PasteBlockModal — the paste surface for block subtrees.
 *
 * The reason this exists rather than a file picker is the SUMMARY: a block's
 * bindings, cart verbs, live regions and render conditions are invisible in a
 * node tree, so pasting blind tells you nothing about what you're inserting.
 * These tests pin that the summary reflects the real file and that an invalid
 * paste cannot be inserted.
 */

import { describe, expect, it } from 'bun:test'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { PasteBlockModal } from '@admin/modals/PasteBlock/PasteBlockModal'
import { buildBlockExport } from '@core/page-tree'
import type { PageNode } from '@core/page-tree'

function node(id: string, moduleId: string, children: string[] = [], extra: Partial<PageNode> = {}): PageNode {
  return { id, moduleId, props: {}, breakpointOverrides: {}, children, classIds: [], ...extra }
}

function blockJson(): string {
  const nodes: Record<string, PageNode> = {
    root: node('root', 'store.relationship-loop', ['region'], { props: { source: 'products' } }),
    region: node('region', 'base.container', ['add', 'qty'], { actions: { region: 'cart' } }),
    add: node('add', 'base.button', [], {
      actions: { click: { type: 'cart.addItem', quantity: 1 } },
      visibleWhen: { source: 'currentEntry', field: 'inCart', operator: 'isFalse' },
    }),
    qty: node('qty', 'base.text', [], {
      dynamicBindings: { text: { source: 'currentEntry', field: 'cartQuantity' } },
      visibleWhen: { source: 'currentEntry', field: 'inCart', operator: 'isTrue' },
    }),
  }
  return JSON.stringify(buildBlockExport('Product card', ['root'], nodes, {}))
}

function paste(text: string) {
  fireEvent.change(screen.getByLabelText('Block JSON'), { target: { value: text } })
}

function setup(onInsert: (block: unknown) => string | null = () => 'new-id') {
  cleanup()
  render(
    <PasteBlockModal
      open
      onClose={() => {}}
      onInsert={onInsert as Parameters<typeof PasteBlockModal>[0]['onInsert']}
    />,
  )
}

describe('PasteBlockModal', () => {
  it('reports what the pasted block actually carries', () => {
    setup()
    paste(blockJson())

    const preview = screen.getByTestId('paste-block-preview')
    expect(preview.textContent).toContain('Product card')
    // The counts that matter — the invisible overlays, not just node count.
    expect(preview.textContent).toContain('Cart actions')
    expect(preview.textContent).toContain('Live regions')
    expect(preview.textContent).toContain('Render conditions')
    expect(preview.textContent).toContain('Data bindings')
    expect(preview.textContent).toContain('Loops')
  })

  it('omits categories the block does not use', () => {
    setup()
    paste(JSON.stringify(buildBlockExport('Plain', ['a'], { a: node('a', 'base.container') }, {})))

    const preview = screen.getByTestId('paste-block-preview')
    expect(preview.textContent).toContain('Nodes')
    // A row of zeroes would be noise, not information.
    expect(preview.textContent).not.toContain('Cart actions')
    expect(preview.textContent).not.toContain('Live regions')
  })

  it('explains invalid JSON without offering to insert it', () => {
    setup()
    paste('{ not json')

    expect(screen.getByRole('alert').textContent).toContain('valid JSON')
    expect(screen.queryByTestId('paste-block-preview')).toBeNull()
    expect(screen.getByRole('button', { name: /insert block/i }).getAttribute('aria-disabled')).toBe('true')
  })

  it('distinguishes valid JSON that is not a block', () => {
    setup()
    paste('{"dukafyExport":"page","page":{}}')

    expect(screen.getByRole('alert').textContent).toContain('not a Dukafy block')
    expect(screen.queryByTestId('paste-block-preview')).toBeNull()
  })

  it('inserts exactly what the preview described', () => {
    let received: { block: { name: string; nodes: Record<string, unknown> } } | null = null
    setup((block) => {
      received = block as typeof received
      return 'new-id'
    })
    paste(blockJson())

    fireEvent.click(screen.getByRole('button', { name: /insert block/i }))

    expect(received).not.toBeNull()
    expect(received!.block.name).toBe('Product card')
    expect(Object.keys(received!.block.nodes).sort()).toEqual(['add', 'qty', 'region', 'root'])
  })

  it('starts empty, with nothing to insert', () => {
    setup()

    expect(screen.queryByTestId('paste-block-preview')).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByRole('button', { name: /insert block/i }).getAttribute('aria-disabled')).toBe('true')
  })
})
