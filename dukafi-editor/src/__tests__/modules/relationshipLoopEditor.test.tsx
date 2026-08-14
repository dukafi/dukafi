/**
 * The loop's canvas component must keep a STABLE hook count.
 *
 * It early-returns a placeholder when it has no children. The preview hooks
 * sat below that return, so a freshly inserted (empty) loop ran fewer hooks
 * than the same loop one render later, once a row was dropped in — React's
 * "Rendered more hooks than during the previous render", which blanks the
 * whole canvas. Inserting a loop and then filling it is the ordinary way to
 * build one, so this fired on the normal path.
 */
import { describe, it, expect, afterEach, mock } from 'bun:test'
import { render, cleanup, screen } from '@testing-library/react'
import { RelationshipLoopEditor } from '@modules/store/relationshipLoop/RelationshipLoopEditor'

afterEach(cleanup)

const PROPS = {
  source: 'products',
  relationship: 'products' as const,
  sourceSlug: '',
  perPage: 8,
  orderBy: 'manual' as const,
  direction: 'asc' as const,
  offset: 0,
}

function renderLoop(children: React.ReactNode) {
  globalThis.fetch = mock(async () => (
    { ok: true, json: async () => ({ products: [] }) } as unknown as Response
  )) as never
  return render(
    <RelationshipLoopEditor
      props={PROPS}
      children={children}
      mcClassName=""
      nodeWrapperProps={{}}
    /> as never,
  )
}

describe('RelationshipLoopEditor', () => {
  it('survives gaining its first child without a hook-count change', () => {
    const view = renderLoop(null)
    expect(screen.getByText(/drop a row template/i)).toBeDefined()

    // The exact sequence a user performs: insert the loop, then insert a row.
    // A hook below the early return throws here instead of re-rendering.
    expect(() => {
      view.rerender(
        <RelationshipLoopEditor
          props={PROPS}
          children={<div data-testid="row">row</div>}
          mcClassName=""
          nodeWrapperProps={{}}
        /> as never,
      )
    }).not.toThrow()

    expect(screen.getByTestId('row')).toBeDefined()
  })

  it('survives losing its last child too', () => {
    const view = renderLoop(<div data-testid="row">row</div>)
    expect(screen.getByTestId('row')).toBeDefined()

    expect(() => {
      view.rerender(
        <RelationshipLoopEditor
          props={PROPS}
          children={null}
          mcClassName=""
          nodeWrapperProps={{}}
        /> as never,
      )
    }).not.toThrow()

    expect(screen.getByText(/drop a row template/i)).toBeDefined()
  })
})
