import { beforeEach, describe, expect, it } from 'bun:test'
import { useEditorStore } from '@site/store/store'
import { classKindSelector, type StyleRule } from '@core/page-tree'
import type { FontEntry } from '@core/fonts'
import { makeNode, makePage, makeSite, makeVC, makeVCNode } from '../fixtures'

const inter: FontEntry = {
  id: 'font-inter',
  source: 'google',
  family: 'Inter',
  variants: ['400'],
  subsets: ['latin'],
  files: [
    { variant: '400', subset: 'latin', path: '/uploads/fonts/inter/400-latin.woff2', format: 'woff2' },
  ],
  category: 'Sans Serif',
  createdAt: 1,
  updatedAt: 1,
}

const mono: FontEntry = {
  ...inter,
  id: 'font-mono',
  family: 'PP Lettra Mono',
  category: 'Monospace',
}

function makeClass(id: string, styles: Record<string, unknown>, contextStyles: StyleRule['contextStyles'] = {}): StyleRule {
  return {
    id,
    name: id,
    kind: 'class',
    selector: classKindSelector(id),
    order: 0,
    styles,
    contextStyles,
    createdAt: 1,
    updatedAt: 1,
  }
}

function freshStore(): void {
  useEditorStore.setState({
    site: null,
    activePageId: null,
    activeDocument: null,
    selectedNodeId: null,
    selectedNodeIds: [],
    hoveredNodeId: null,
    _historyPast: [],
    _historyFuture: [],
    canUndo: false,
    canRedo: false,
    hasUnsavedChanges: false,
  } as Parameters<typeof useEditorStore.setState>[0])
}

function loadFontTokenSite(): void {
  useEditorStore.getState().loadSite(
    makeSite({
      pages: [
        makePage({
          id: 'page-1',
          rootNodeId: 'root',
          nodes: {
            root: makeNode({ id: 'root', moduleId: 'base.body', children: ['text-1'] }),
            'text-1': {
              ...makeNode({
                id: 'text-1',
                moduleId: 'base.text',
              }),
              inlineStyles: {
                fontFamily: 'var(--font-primary)',
                color: 'var(--font-primary-color)',
              },
            },
          },
        }),
      ],
      visualComponents: [
        makeVC({
          id: 'vc-1',
          name: 'Card',
          tree: {
            rootNodeId: 'vc-root',
            nodes: {
              'vc-root': makeVCNode({
                id: 'vc-root',
                moduleId: 'base.container',
                inlineStyles: { fontFamily: 'var( --font-primary )' },
              }),
            },
          },
        }),
      ],
      settings: {
        shortcuts: {},
        fonts: {
          items: [inter, mono],
          tokens: [
            {
              id: 'token-primary',
              name: 'Primary',
              variable: 'font-primary',
              familyId: inter.id,
              fallback: 'sans-serif',
              order: 0,
              createdAt: 1,
              updatedAt: 1,
            },
          ],
        },
      },
      styleRules: {
        hero: makeClass(
          'hero',
          {
            fontFamily: 'var(--font-primary)',
            color: 'var(--font-primary-color)',
          },
          {
            mobile: {
              fontFamily: 'var( --font-primary )',
            },
          },
        ),
      },
    }),
  )
}

describe('font token store actions', () => {
  beforeEach(() => {
    freshStore()
    loadFontTokenSite()
  })

  it('creates a font token with a normalized unique variable', () => {
    const token = useEditorStore.getState().createFontToken({
      name: 'Editorial',
      variable: '--Font Primary',
      familyId: mono.id,
      fallback: 'monospace',
    })

    expect(token.variable).toBe('font-primary-2')
    expect(token.familyId).toBe(mono.id)
    expect(useEditorStore.getState().site?.settings.fonts?.tokens?.map((item) => item.id)).toContain(token.id)
  })

  it('rejects duplicate variables on update', () => {
    useEditorStore.getState().createFontToken({
      name: 'Secondary',
      variable: 'font-secondary',
      fallback: 'serif',
    })

    expect(() => {
      useEditorStore.getState().updateFontToken('token-primary', { variable: 'font-secondary' })
    }).toThrow(/already exists/)
  })

  it('renames exact font variable references across authored style bags', () => {
    useEditorStore.getState().updateFontToken('token-primary', { variable: 'font-brand' })

    const site = useEditorStore.getState().site!
    expect(site.settings.fonts?.tokens?.[0].variable).toBe('font-brand')
    expect(site.styleRules.hero.styles.fontFamily).toBe('var(--font-brand)')
    expect(site.styleRules.hero.styles.color).toBe('var(--font-primary-color)')
    expect(site.styleRules.hero.contextStyles.mobile.fontFamily).toBe('var(--font-brand)')
    expect(site.pages[0].nodes['text-1'].inlineStyles?.fontFamily).toBe('var(--font-brand)')
    expect(site.pages[0].nodes['text-1'].inlineStyles?.color).toBe('var(--font-primary-color)')
    expect(site.visualComponents[0].tree.nodes['vc-root'].inlineStyles?.fontFamily).toBe('var(--font-brand)')
  })

  it('changes the assigned family without rewriting authored declarations', () => {
    useEditorStore.getState().updateFontToken('token-primary', { familyId: mono.id })

    const site = useEditorStore.getState().site!
    expect(site.settings.fonts?.tokens?.[0].familyId).toBe(mono.id)
    expect(site.styleRules.hero.styles.fontFamily).toBe('var(--font-primary)')
  })

  it('deletes a token without rewriting existing declarations', () => {
    useEditorStore.getState().deleteFontToken('token-primary')

    const site = useEditorStore.getState().site!
    expect(site.settings.fonts?.tokens).toEqual([])
    expect(site.styleRules.hero.styles.fontFamily).toBe('var(--font-primary)')
  })

  it('blocks removing an installed family while a token references it', () => {
    const removed = useEditorStore.getState().removeFont(inter.id)

    expect(removed).toBe(false)
    expect(useEditorStore.getState().site?.settings.fonts?.items.map((item) => item.id)).toContain(inter.id)
  })
})
