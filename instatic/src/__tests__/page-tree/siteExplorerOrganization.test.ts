import { describe, expect, it } from 'bun:test'
import type { VisualComponent } from '@core/visualComponents'
import {
  createDefaultSiteExplorerOrganization,
  createExplorerFolder,
  moveExplorerItem,
  moveExplorerItems,
  parseSiteExplorerOrganization,
  reconcileSiteExplorerOrganization,
  wrapExplorerItemsInFolder,
} from '@core/page-tree'
import { makePage, makeSite } from '../fixtures'

function makeVisualComponent(id: string, name: string): VisualComponent {
  const rootNodeId = `${id}-root`
  return {
    id,
    name,
    tree: {
      rootNodeId,
      nodes: {
        [rootNodeId]: {
          id: rootNodeId,
          moduleId: 'base.body',
          props: {},
          children: [],
          breakpointOverrides: {},
          classIds: [],
        },
      },
    },
    params: [],
    classIds: [],
    createdAt: 1,
  }
}

describe('site explorer organization', () => {
  it('parses missing explorer data to empty sections', () => {
    expect(parseSiteExplorerOrganization(undefined).pages).toEqual({
      expandedFolders: [],
      emptyFolders: [],
      rowOrder: [],
    })
    expect(parseSiteExplorerOrganization(undefined).components).toEqual({
      folders: [],
      items: [],
    })
  })

  it('parses structural sections as path state and decorative sections as folder placements', () => {
    const parsed = parseSiteExplorerOrganization({
      pages: {
        expandedFolders: ['docs', '/docs/', 'bad\\path', '../bad'],
        emptyFolders: ['drafts', 'docs', 'drafts'],
        rowOrder: [
          { kind: 'folder', id: 'docs', order: 1 },
          { kind: 'item', id: 'intro', parentPath: 'docs', order: 0 },
          { kind: 'item', id: 'intro', parentPath: 'docs', order: 9 },
          { kind: 'folder', id: 'bad\\path', order: 2 },
          { kind: 'other', id: 'ignored', order: 3 },
        ],
      },
      components: {
        folders: [{ id: 'folder-1', name: 'Shared', order: 0 }],
        items: [{ id: 'hero', parentFolderId: 'folder-1', order: 0 }],
      },
    })

    expect(parsed.pages).toEqual({
      expandedFolders: ['docs'],
      emptyFolders: ['drafts'],
      rowOrder: [
        { kind: 'folder', id: 'docs', order: 1 },
        { kind: 'item', id: 'intro', parentPath: 'docs', order: 0 },
      ],
    })
    expect(parsed.components).toEqual({
      folders: [{ id: 'folder-1', name: 'Shared', order: 0 }],
      items: [{ id: 'hero', parentFolderId: 'folder-1', order: 0 }],
    })
  })

  it('reconciles page template component style and script placements from current site data', () => {
    const site = makeSite({
      pages: [
        makePage({ id: 'home', slug: 'index', title: 'Home' }),
        makePage({ id: 'pricing', slug: 'pricing', title: 'Pricing' }),
        makePage({
          id: 'post-template',
          slug: 'post-template',
          title: 'Post Template',
          template: {
            enabled: true,
            target: { kind: 'postTypes', tableSlugs: ['posts'] },
            priority: 0,
          },
        }),
      ],
      visualComponents: [makeVisualComponent('hero', 'Hero')],
      files: [
        {
          id: 'theme',
          path: 'src/styles/theme.css',
          type: 'style',
          content: '',
          createdAt: 1,
          updatedAt: 1,
        },
        {
          id: 'analytics',
          path: 'src/scripts/analytics.ts',
          type: 'script',
          content: '',
          createdAt: 1,
          updatedAt: 1,
        },
        {
          id: 'asset',
          path: 'public/logo.svg',
          type: 'asset',
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    })

    const explorer = reconcileSiteExplorerOrganization(
      createDefaultSiteExplorerOrganization(),
      site,
    )

    expect(explorer.pages).toEqual({
      expandedFolders: [],
      emptyFolders: [],
      rowOrder: [],
    })
    expect(explorer.templates.items.map((item) => item.id)).toEqual(['post-template'])
    expect(explorer.components.items.map((item) => item.id)).toEqual(['hero'])
    expect(explorer.styles).toEqual({
      expandedFolders: [],
      emptyFolders: [],
      rowOrder: [],
    })
    expect(explorer.scripts).toEqual({
      expandedFolders: [],
      emptyFolders: [],
      rowOrder: [],
    })
  })

  it('reconciles structural page rows against current slugs', () => {
    const site = makeSite({
      pages: [
        makePage({ id: 'home', slug: 'index' }),
        makePage({ id: 'docs', slug: 'docs' }),
        makePage({ id: 'intro', slug: 'docs/intro' }),
        makePage({ id: 'start', slug: 'docs/guides/start' }),
      ],
      explorer: {
        ...createDefaultSiteExplorerOrganization(),
        pages: {
          expandedFolders: ['docs', 'stale'],
          emptyFolders: ['drafts', 'docs'],
          rowOrder: [
            { kind: 'folder', id: 'docs', order: 1 },
            { kind: 'folder', id: 'docs/guides', parentPath: 'docs', order: 2 },
            { kind: 'item', id: 'intro', parentPath: 'docs', order: 0 },
            { kind: 'item', id: 'docs', parentPath: 'docs', order: 3 },
            { kind: 'item', id: 'home', order: 4 },
            { kind: 'folder', id: 'drafts', order: 5 },
            { kind: 'folder', id: 'stale', order: 6 },
          ],
        },
      },
    })

    const explorer = reconcileSiteExplorerOrganization(site.explorer, site)

    expect(explorer.pages).toEqual({
      expandedFolders: ['docs'],
      emptyFolders: ['drafts'],
      rowOrder: [
        { kind: 'folder', id: 'docs', order: 1 },
        { kind: 'folder', id: 'docs/guides', parentPath: 'docs', order: 2 },
        { kind: 'item', id: 'intro', parentPath: 'docs', order: 0 },
        { kind: 'folder', id: 'drafts', order: 5 },
      ],
    })
  })

  it('moves items into folders without changing site item arrays', () => {
    const site = makeSite({
      visualComponents: [
        makeVisualComponent('hero', 'Hero'),
        makeVisualComponent('footer', 'Footer'),
      ],
    })
    const explorer = reconcileSiteExplorerOrganization(
      createDefaultSiteExplorerOrganization(),
      site,
    )

    const folderId = createExplorerFolder(explorer, 'components', 'Marketing')
    moveExplorerItem(explorer, 'components', 'footer', folderId, 0)

    expect(explorer.components.items.find((item) => item.id === 'footer')?.parentFolderId).toBe(folderId)
    expect(site.visualComponents.map((component) => component.id)).toEqual(['hero', 'footer'])
  })

  it('wraps selected root items in a new folder at the first selected item position', () => {
    const explorer = createDefaultSiteExplorerOrganization()
    explorer.components = {
      folders: [{ id: 'folder-1', name: 'Existing', order: 2 }],
      items: [
        { id: 'hero', order: 0 },
        { id: 'pricing', order: 1 },
        { id: 'about', order: 3 },
      ],
    }

    const folderId = wrapExplorerItemsInFolder(explorer, 'components', ['pricing', 'about'], 'Marketing')

    expect(typeof folderId).toBe('string')
    expect(explorer.components.folders).toEqual([
      { id: folderId, name: 'Marketing', order: 1 },
      { id: 'folder-1', name: 'Existing', order: 2 },
    ])
    expect(explorer.components.items).toEqual([
      { id: 'hero', order: 0 },
      { id: 'pricing', parentFolderId: folderId, order: 0 },
      { id: 'about', parentFolderId: folderId, order: 1 },
    ])
  })

  it('moves selected items as one ordered group', () => {
    const explorer = createDefaultSiteExplorerOrganization()
    const folderId = createExplorerFolder(explorer, 'components', 'Marketing')
    explorer.components.folders[0].order = 4
    explorer.components.items = [
      { id: 'hero', order: 0 },
      { id: 'pricing', order: 1 },
      { id: 'about', order: 2 },
      { id: 'contact', order: 3 },
    ]

    moveExplorerItems(explorer, 'components', ['about', 'pricing'], folderId, 0)

    expect(explorer.components.items).toEqual([
      { id: 'hero', order: 0 },
      { id: 'contact', order: 1 },
      { id: 'pricing', parentFolderId: folderId, order: 0 },
      { id: 'about', parentFolderId: folderId, order: 1 },
    ])
  })

  it('moves root items before and after root folders in the same section order', () => {
    const explorer = createDefaultSiteExplorerOrganization()
    explorer.components = {
      folders: [{ id: 'folder-1', name: 'Marketing', order: 0 }],
      items: [
        { id: 'hero', parentFolderId: 'folder-1', order: 0 },
        { id: 'footer', order: 1 },
      ],
    }

    moveExplorerItem(explorer, 'components', 'hero', null, 0)

    expect(explorer.components.folders).toEqual([
      { id: 'folder-1', name: 'Marketing', order: 1 },
    ])
    expect(explorer.components.items).toEqual([
      { id: 'hero', order: 0 },
      { id: 'footer', order: 2 },
    ])

    moveExplorerItem(explorer, 'components', 'hero', null, 2)

    expect(explorer.components.folders).toEqual([
      { id: 'folder-1', name: 'Marketing', order: 0 },
    ])
    expect(explorer.components.items).toEqual([
      { id: 'footer', order: 1 },
      { id: 'hero', order: 2 },
    ])
  })

  it('drops stale placements and appends missing items in current item order', () => {
    const site = makeSite({
      visualComponents: [
        makeVisualComponent('hero', 'Hero'),
        makeVisualComponent('pricing', 'Pricing'),
        makeVisualComponent('about', 'About'),
      ],
      explorer: {
        ...createDefaultSiteExplorerOrganization(),
        components: {
          folders: [{ id: 'folder-1', name: 'Marketing', order: 0 }],
          items: [
            { id: 'missing', order: 0 },
            { id: 'about', parentFolderId: 'folder-1', order: 1 },
          ],
        },
      },
    })

    const explorer = reconcileSiteExplorerOrganization(site.explorer, site)

    expect(explorer.components.items).toEqual([
      { id: 'about', parentFolderId: 'folder-1', order: 0 },
      { id: 'hero', order: 1 },
      { id: 'pricing', order: 2 },
    ])
  })

  it('excludes the homepage from structural page row ordering', () => {
    const site = makeSite({
      pages: [
        makePage({ id: 'pricing', slug: 'pricing' }),
        makePage({ id: 'home', slug: 'index' }),
      ],
      explorer: {
        ...createDefaultSiteExplorerOrganization(),
        pages: {
          expandedFolders: [],
          emptyFolders: [],
          rowOrder: [
            { kind: 'item', id: 'pricing', order: 0 },
            { kind: 'item', id: 'home', parentPath: 'docs', order: 1 },
          ],
        },
      },
    })

    const explorer = reconcileSiteExplorerOrganization(site.explorer, site)

    expect(explorer.pages.rowOrder).toEqual([{ kind: 'item', id: 'pricing', order: 0 }])
  })
})
