import { describe, it, expect } from 'bun:test'
import { validateVisualComponents } from '@core/persistence/validate'

/**
 * ISS-026: slot-instance reconciliation only swept page trees, so a VC ref
 * nested inside ANOTHER Visual Component never had its base.slot-instance
 * children synced — a slot added to the inner VC left the nested ref with no
 * fill location. The load-time reconciler must heal VC trees too.
 */
const node = (id: string, moduleId: string, children: string[] = [], props: Record<string, unknown> = {}) => ({
  id,
  moduleId,
  props,
  children,
  breakpointOverrides: {},
  classIds: [],
})

const vc = (id: string, name: string, rootNodeId: string, nodes: Record<string, unknown>) => ({
  id,
  name,
  tree: { rootNodeId, nodes },
  params: [],
  breakpoints: [],
  classIds: [],
  createdAt: 0,
})

describe('nested VC slot-instance reconciliation (ISS-026)', () => {
  it('materializes the missing slot-instance for a ref nested inside another VC', () => {
    // VC-B declares a slot via a slot-outlet.
    const vcB = vc('vc-b', 'VCB', 'b-root', {
      'b-root': node('b-root', 'base.body', ['b-outlet']),
      'b-outlet': node('b-outlet', 'base.slot-outlet', [], { slotName: 'children' }),
    })
    // VC-A nests a ref to VC-B but the ref has NO slot-instance child (drift).
    const vcA = vc('vc-a', 'VCA', 'a-root', {
      'a-root': node('a-root', 'base.body', ['a-ref']),
      'a-ref': node('a-ref', 'base.visual-component-ref', [], { componentId: 'vc-b' }),
    })

    const healed = validateVisualComponents([vcA, vcB])
    const healedA = healed.find((v) => v.id === 'vc-a')
    expect(healedA).toBeDefined()

    const refNode = healedA!.tree.nodes['a-ref']
    expect(refNode!.children).toHaveLength(1)
    const instanceId = refNode!.children[0]!
    expect(healedA!.tree.nodes[instanceId]!.moduleId).toBe('base.slot-instance')
  })
})
