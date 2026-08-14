/**
 * Does Site Import actually survive in CONNECTED mode?
 *
 * The unit tests for `parseSiteExport`/`importPageIntoSite` all run detached,
 * where `resetCollabDocsFromSite` seeds the local site into fresh Y docs. In
 * connected mode it instead binds to the PROVIDER's docs — the server's
 * content — and the projection then writes those docs back over `state.site`.
 * This test pins down what really happens to an imported site there.
 */
import { afterEach, describe, expect, it } from 'bun:test'
import * as Y from 'yjs'
import * as awarenessProtocol from 'y-protocols/awareness'
import {
  connectCollabProvider,
  disconnectCollabProvider,
} from '@site/store/slices/site/collabBinding'
import type {
  BoundCollabDoc,
  CollabProvider,
  CollabResetListener,
} from '@site/collab/collabProvider'
import { useEditorStore } from '@site/store/store'
import { buildSiteExport, parseSiteExport } from '@core/page-tree'
import { makeNode, makePage, makeSite } from '../fixtures'
import '@modules/base/index'

/** Provider whose docs sync immediately and start EMPTY, like a fresh server. */
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
    unbind: (docId) => {
      bound.get(docId)?.doc.destroy()
      bound.delete(docId)
    },
    awareness,
    status: () => 'connected',
    canSend: () => true,
    reconnectNow: () => {},
    onStatus: () => () => {},
    onReset: (listener) => {
      resetListeners.add(listener)
      return () => resetListeners.delete(listener)
    },
    destroy: () => {
      awareness.destroy()
      presenceDoc.destroy()
    },
  }
}

afterEach(() => {
  disconnectCollabProvider()
  useEditorStore.getState().clearSite()
})

describe('Site Import in connected mode', () => {
  // CHARACTERIZATION TEST — this documents a KNOWN BUG, not desired behavior.
  //
  // `loadSite` puts the import into `state.site`, then
  // `resetCollabDocsFromSite` binds a doc per page id. In connected mode those
  // bind to the PROVIDER, and the imported page ids are ids the server has
  // never seen — so every one of them binds to an EMPTY doc. The projection
  // then reads each empty doc, `rowFromDoc` returns null, and the `if (!row)`
  // branch of `projectDocIntoStore` deletes that page from the store.
  //
  // Net effect in the real editor: importing a site silently empties it.
  //
  // When Site Import is fixed to seed the imported content INTO the bound docs
  // (so it streams to the relay instead of being overwritten by it), this test
  // will fail — flip the assertion to `['Imported Home']` at that point.
  it('BUG: drops every imported page once the bound docs project', async () => {
    // A site the user is currently editing.
    useEditorStore.getState().createSite('Original Site')
    connectCollabProvider(syncedProvider())
    await new Promise((resolve) => setTimeout(resolve, 50))

    // An import file describing a DIFFERENT site.
    const imported = makeSite({
      name: 'Imported Site',
      pages: [
        makePage({
          id: 'imported-page',
          slug: 'index',
          title: 'Imported Home',
          rootNodeId: 'ir',
          nodes: { ir: makeNode({ id: 'ir', moduleId: 'base.body' }) },
        }),
      ],
    })
    const parsed = parseSiteExport(JSON.parse(JSON.stringify(buildSiteExport(imported))))
    expect(parsed).not.toBeNull()

    useEditorStore.getState().loadSite(parsed!.site)

    // Immediately after loadSite the store holds the import.
    expect(useEditorStore.getState().site?.name).toBe('Imported Site')

    // Let the provider's binds settle and every queued projection flush.
    await new Promise((resolve) => setTimeout(resolve, 100))

    const after = useEditorStore.getState().site
    // The shell survives (an empty shell doc makes the shell projection bail
    // early), which is exactly why this fails so quietly: the site still looks
    // named and configured, it just has no pages left.
    expect(after?.name).toBe('Imported Site')
    expect(after?.pages.map((p) => p.title)).toEqual([]) // ← should be ['Imported Home']
  })
})
