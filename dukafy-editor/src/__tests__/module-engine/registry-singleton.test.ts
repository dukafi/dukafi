/**
 * ModuleRegistry singleton — tests for methods not covered by registry.test.ts
 *
 * The existing registry.test.ts uses a local `TestRegistry` class for isolation.
 * This file tests the actual singleton: `registerOrReplace`, `unregister`, `listByCategory`,
 * and `size` — all of which are used in the plugin module lifecycle (Phase 9).
 *
 * IMPORTANT: Each test uses unique module IDs (prefixed "reg-test.") to avoid
 * conflicts with the global registry populated by base module imports.
 */

import { describe, it, expect, beforeEach } from 'bun:test'
import { registry } from '@core/module-engine'
import type { AnyModuleDefinition } from '@core/module-engine'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let _counter = 0

/** Generate a unique test module ID to avoid registration conflicts */
function uniqueId(): string {
  return `reg-test.mod-${++_counter}`
}

function makeTestModule(id: string, category = 'Test'): AnyModuleDefinition {
  return {
    id,
    name: id,
    category,
    version: '1.0.0',
    trusted: true,
    canHaveChildren: false,
    schema: {},
    defaults: {},
    component: () => null as never,
    render: () => ({ html: `<div id="${id}"></div>` }),
  }
}

// ---------------------------------------------------------------------------
// registerOrReplace
// ---------------------------------------------------------------------------

describe('registry.registerOrReplace', () => {
  it('registers a new module without throwing', () => {
    const id = uniqueId()
    expect(() => registry.registerOrReplace(makeTestModule(id))).not.toThrow()
    expect(registry.has(id)).toBe(true)
  })

  it('replaces an already-registered module without throwing', () => {
    const id = uniqueId()
    const v1 = makeTestModule(id)
    const v2 = { ...makeTestModule(id), name: 'Updated v2' }

    registry.registerOrReplace(v1)
    expect(registry.get(id)?.name).toBe(id) // v1

    registry.registerOrReplace(v2)
    expect(registry.get(id)?.name).toBe('Updated v2') // replaced by v2
  })

  it('allows re-registration of a module after unregister', () => {
    const id = uniqueId()
    registry.registerOrReplace(makeTestModule(id))
    registry.unregister(id)
    expect(() => registry.registerOrReplace(makeTestModule(id))).not.toThrow()
  })

  it('throws for invalid (non-namespaced) id', () => {
    expect(() =>
      registry.registerOrReplace(makeTestModule('invalidid' as string))
    ).toThrow()
  })
})

// ---------------------------------------------------------------------------
// unregister
// ---------------------------------------------------------------------------

describe('registry.unregister', () => {
  it('removes a registered module', () => {
    const id = uniqueId()
    registry.registerOrReplace(makeTestModule(id))
    expect(registry.has(id)).toBe(true)

    registry.unregister(id)
    expect(registry.has(id)).toBe(false)
    expect(registry.get(id)).toBeUndefined()
  })

  it('is a no-op for a non-existent id (does not throw)', () => {
    expect(() => registry.unregister('reg-test.does-not-exist')).not.toThrow()
  })

  it('after unregister, getOrThrow throws', () => {
    const id = uniqueId()
    registry.registerOrReplace(makeTestModule(id))
    registry.unregister(id)
    expect(() => registry.getOrThrow(id)).toThrow()
  })

  it('allows re-registration after unregister via register()', () => {
    const id = uniqueId()
    registry.registerOrReplace(makeTestModule(id))
    registry.unregister(id)
    // register() (not registerOrReplace) should now work since it's gone
    expect(() => registry.register(makeTestModule(id))).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// listByCategory on the singleton
// ---------------------------------------------------------------------------

describe('registry.listByCategory', () => {
  it('returns modules grouped by category', () => {
    const layoutId1 = uniqueId()
    const layoutId2 = uniqueId()
    const typographyId = uniqueId()

    registry.registerOrReplace(makeTestModule(layoutId1, 'TestLayout'))
    registry.registerOrReplace(makeTestModule(layoutId2, 'TestLayout'))
    registry.registerOrReplace(makeTestModule(typographyId, 'TestTypography'))

    const byCategory = registry.listByCategory()

    expect(byCategory['TestLayout']).toBeInstanceOf(Array)
    expect(byCategory['TestLayout'].length).toBeGreaterThanOrEqual(2)

    // Our two layout modules should both be present
    const layoutIds = byCategory['TestLayout'].map((m) => m.id)
    expect(layoutIds).toContain(layoutId1)
    expect(layoutIds).toContain(layoutId2)

    expect(byCategory['TestTypography']).toBeInstanceOf(Array)
    expect(byCategory['TestTypography'].map((m) => m.id)).toContain(typographyId)
  })

  it('returns an empty object (or object without the key) for a category with no modules', () => {
    const byCategory = registry.listByCategory()
    // 'NonExistentCategory' should either be missing or empty
    const cat = byCategory['NonExistentCategory12345']
    expect(cat === undefined || cat.length === 0).toBe(true)
  })

  it('unregistered modules are removed from listByCategory', () => {
    const id = uniqueId()
    registry.registerOrReplace(makeTestModule(id, 'TempCategory'))

    const before = registry.listByCategory()
    expect(before['TempCategory']?.map((m) => m.id)).toContain(id)

    registry.unregister(id)

    const after = registry.listByCategory()
    const afterIds = after['TempCategory']?.map((m) => m.id) ?? []
    expect(afterIds).not.toContain(id)
  })
})

// ---------------------------------------------------------------------------
// size
// ---------------------------------------------------------------------------

describe('registry.size', () => {
  it('increases when modules are registered', () => {
    const before = registry.size
    const id = uniqueId()
    registry.registerOrReplace(makeTestModule(id))
    expect(registry.size).toBe(before + 1)
  })

  it('decreases when modules are unregistered', () => {
    const id = uniqueId()
    registry.registerOrReplace(makeTestModule(id))
    const after = registry.size
    registry.unregister(id)
    expect(registry.size).toBe(after - 1)
  })

  it('size is consistent with list().length', () => {
    expect(registry.size).toBe(registry.list().length)
  })
})
