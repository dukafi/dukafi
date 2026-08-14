/**
 * forEachVCRef / collectVCRefs — the single VC-ref predicate.
 *
 * "A VC reference is a `base.visual-component-ref` node whose
 * `props.componentId` names the VC" was previously re-encoded in the recursion
 * guard and both deletion-impact loops. These tests pin the consolidated
 * predicate: it finds exactly the refs the old hand-rolled scans did, tolerates
 * untyped/raw node maps, and `getReferencedComponentIds` (which now consumes it)
 * returns the same component-id set.
 */

import { describe, it, expect } from 'bun:test'
import { forEachVCRef, collectVCRefs, getReferencedComponentIds } from '@core/visualComponents'

/** Mixed node map: valid refs + every shape the predicate must reject. */
function mixedNodes(): Record<string, unknown> {
  return {
    'ref-a': { id: 'ref-a', moduleId: 'base.visual-component-ref', props: { componentId: 'vc-1' }, children: [] },
    'text-1': { id: 'text-1', moduleId: 'base.text', props: { text: 'hi' }, children: [] },
    'ref-b': { id: 'ref-b', moduleId: 'base.visual-component-ref', props: { componentId: 'vc-2' }, children: [] },
    // ref with a blank componentId → rejected
    'ref-blank': { id: 'ref-blank', moduleId: 'base.visual-component-ref', props: { componentId: '' }, children: [] },
    // ref with non-object props → rejected
    'ref-noprops': { id: 'ref-noprops', moduleId: 'base.visual-component-ref', props: 'nope', children: [] },
    // ref missing props entirely → rejected
    'ref-undef': { id: 'ref-undef', moduleId: 'base.visual-component-ref', children: [] },
    // non-object node → skipped
    'bad': null,
  }
}

describe('forEachVCRef / collectVCRefs', () => {
  it('collects exactly the valid VC refs with nodeId + componentId', () => {
    expect(collectVCRefs(mixedNodes())).toEqual([
      { nodeId: 'ref-a', componentId: 'vc-1' },
      { nodeId: 'ref-b', componentId: 'vc-2' },
    ])
  })

  it('forEachVCRef visits each valid ref once', () => {
    const seen: string[] = []
    forEachVCRef(mixedNodes(), ({ componentId }) => seen.push(componentId))
    expect(seen).toEqual(['vc-1', 'vc-2'])
  })

  it('tolerates non-object node maps without throwing', () => {
    expect(collectVCRefs(undefined)).toEqual([])
    expect(collectVCRefs(null)).toEqual([])
    expect(collectVCRefs([])).toEqual([])
    expect(collectVCRefs('nope')).toEqual([])
  })

  it('getReferencedComponentIds returns the same component-id set the scan finds', () => {
    const vc = { id: 'host', tree: { rootNodeId: 'ref-a', nodes: mixedNodes() } }
    const ids = getReferencedComponentIds(vc)
    expect(ids).toEqual(new Set(['vc-1', 'vc-2']))
    // Equivalent to deriving the set from collectVCRefs directly.
    expect(ids).toEqual(new Set(collectVCRefs(mixedNodes()).map((r) => r.componentId)))
  })

  it('getReferencedComponentIds tolerates a missing/blank tree', () => {
    expect(getReferencedComponentIds(undefined)).toEqual(new Set())
    expect(getReferencedComponentIds({})).toEqual(new Set())
    expect(getReferencedComponentIds({ tree: { nodes: {} } })).toEqual(new Set())
  })
})
