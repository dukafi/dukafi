/**
 * Does PAGE import survive in CONNECTED mode?
 *
 * Site import does not — it rebinds every doc to the provider and the
 * projection then deletes the imported pages (see siteImportConnected.test).
 * Page import goes through `mutateSite` instead, the same path `addPage`
 * uses, so it should stream to the relay rather than be overwritten. This
 * pins that down rather than assuming it.
 */
import { afterEach, describe, expect, it } from 'bun:test'
import * as Y from 'yjs'
import * as awarenessProtocol from 'y-protocols/awareness'
import {
  connectCollabProvider,
  disconnectCollabProvider,
} from '@site/store/slices/site/collabBinding'
import type { BoundCollabDoc, CollabProvider, CollabResetListener } from '@site/collab/collabProvider'
import { useEditorStore } from '@site/store/store'
import { buildPageExport, parsePageExport } from '@core/page-tree'
import { makeNode, makePage } from '../fixtures'
import '@modules/base/index'

function syncedProvider(): CollabProvider {
  const presenceDoc = new Y.Doc()
  const awareness = new awarenessProtocol.Awareness(presenceDoc)
  const bound = new Map<string, BoundCollabDoc>()
  const resetListeners = new Set<CollabResetListener>()
  return {
    bind: (docId) => {
      let entry = bound.get(docId)
      if (!entry) {
        entry = { doc: new Y.Doc(), synced: true, whenSynced: Promise.resolve() }
        bound.set(docId, entry)
      }
      return entry
    },
    unbind: (docId) => { bound.get(docId)?.doc.destroy(); bound.delete(docId) },
    awareness,
    status: () => 'connected',
    canSend: () => true,
    reconnectNow: () => {},
    onStatus: () => () => {},
    onReset: (listener) => { resetListeners.add(listener); return () => resetListeners.delete(listener) },
    destroy: () => { awareness.destroy(); presenceDoc.destroy() },
  }
}

afterEach(() => {
  disconnectCollabProvider()
  useEditorStore.getState().clearSite()
})

describe('Page import in connected mode', () => {
  it('keeps the imported page after the docs settle', async () => {
    useEditorStore.getState().createSite('Live Site')
    connectCollabProvider(syncedProvider())
    await new Promise((resolve) => setTimeout(resolve, 50))

    const exported = buildPageExport(
      makePage({
        slug: 'landing',
        title: 'Imported Landing',
        rootNodeId: 'r',
        nodes: {
          r: makeNode({ id: 'r', moduleId: 'base.body', children: ['t'] }),
          t: makeNode({ id: 't', moduleId: 'base.text', props: { text: 'Hello', tag: 'h1' } }),
        },
      }),
      {},
    )
    const parsed = parsePageExport(JSON.parse(JSON.stringify(exported)))
    expect(parsed).not.toBeNull()

    const page = useEditorStore.getState().importPage(parsed!)
    expect(page.title).toBe('Imported Landing')

    // Let every bind settle and each queued projection flush.
    await new Promise((resolve) => setTimeout(resolve, 120))

    const after = useEditorStore.getState().site
    expect(after?.pages.map((p) => p.title)).toContain('Imported Landing')
    const imported = after?.pages.find((p) => p.id === page.id)
    expect(Object.keys(imported?.nodes ?? {}).length).toBe(2)
  })
})
