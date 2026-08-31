import { describe, it, expect, beforeEach } from 'bun:test'
import { useEditorStore } from '@site/store/store'

function freshStore() {
  useEditorStore.setState({
    site: null,
    activePageId: null,
    selectedNodeId: null,
    selectedNodeIds: [],
    hoveredNodeId: null,
    activeClassId: null,
    previewClassAssignment: null,
    propertiesPanel: { collapsed: false, x: 0, y: 0, width: 280 },
    _historyPast: [],
    _historyFuture: [],
    canUndo: false,
    canRedo: false,
    hasUnsavedChanges: false,
  } as Parameters<typeof useEditorStore.setState>[0])
}

beforeEach(freshStore)

describe('selectionSlice.selectNode', () => {
  it('activates the first assigned class when selecting a node with classes', () => {
    const store = useEditorStore.getState()
    const site = store.createSite('Selection Test')
    const rootId = site.pages[0].rootNodeId
    const nodeId = useEditorStore.getState().insertNode('base.text', {}, rootId)
    const cls = useEditorStore.getState().createClass('hero-title')
    useEditorStore.getState().addNodeClass(nodeId, cls.id)

    useEditorStore.getState().selectNode(nodeId)

    expect(useEditorStore.getState().activeClassId).toBe(cls.id)
  })

  it('does not activate a scheme class so Layout / Spacing stay editable', () => {
    const store = useEditorStore.getState()
    const site = store.createSite('Scheme Selection')
    const rootId = site.pages[0].rootNodeId
    const nodeId = useEditorStore.getState().insertNode('base.container', {}, rootId)
    const schemeId = 'framework:scheme:scope:scheme-3'
    const current = useEditorStore.getState().site!
    const page = current.pages[0]
    useEditorStore.setState({
      site: {
        ...current,
        pages: [{
          ...page,
          nodes: {
            ...page.nodes,
            [nodeId]: { ...page.nodes[nodeId]!, classIds: [schemeId] },
          },
        }],
        styleRules: {
          ...current.styleRules,
          [schemeId]: {
            id: schemeId,
            name: 'scheme-3',
            kind: 'class',
            selector: '.scheme-3, [data-scheme="scheme-3"]',
            order: 0,
            styles: { '--scheme-background': 'var(--dark)' },
            contextStyles: {},
            generated: {
              origin: 'framework',
              family: 'scheme',
              sourceId: 'scheme-3',
              tokenName: 'scheme-3',
              locked: true,
            },
            createdAt: 1,
            updatedAt: 1,
          },
        },
      },
      selectedNodeId: null,
      selectedNodeIds: [],
      activeClassId: null,
      inlineStyleEditing: false,
    } as Parameters<typeof useEditorStore.setState>[0])

    useEditorStore.getState().selectNode(nodeId)

    expect(useEditorStore.getState().activeClassId).toBeNull()
    expect(useEditorStore.getState().inlineStyleEditing).toBe(true)
  })
})
