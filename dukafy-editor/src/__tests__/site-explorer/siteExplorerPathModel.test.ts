import { describe, expect, it } from 'bun:test'
import { FileTextSolidIcon } from 'pixel-art-icons/icons/file-text-solid'
import { createDefaultSiteExplorerOrganization } from '@core/page-tree'
import { buildStructuralExplorerTreeSection } from '@site/panels/SiteExplorerPanel/siteExplorerModel'

describe('buildStructuralExplorerTreeSection', () => {
  it('builds recursive page folders from slash slugs', () => {
    const explorer = createDefaultSiteExplorerOrganization()
    const model = buildStructuralExplorerTreeSection(
      'pages',
      explorer.pages,
      [
        {
          id: 'home',
          label: 'Home',
          path: 'index',
          meta: '/',
          icon: FileTextSolidIcon,
          active: false,
          pinned: true,
          ariaLabel: 'Open page Home',
          target: { kind: 'page' as const, id: 'home' },
        },
        {
          id: 'docs',
          label: 'Docs',
          path: 'documentation',
          meta: '/documentation',
          icon: FileTextSolidIcon,
          active: false,
          ariaLabel: 'Open page Docs',
          target: { kind: 'page' as const, id: 'docs' },
        },
        {
          id: 'setup',
          label: 'Setup',
          path: 'documentation/setup',
          meta: '/documentation/setup',
          icon: FileTextSolidIcon,
          active: false,
          ariaLabel: 'Open page Setup',
          target: { kind: 'page' as const, id: 'setup' },
        },
      ],
    )

    expect(model.pinnedItems.map((item) => item.id)).toEqual(['home'])
    expect(model.rootEntries[0]).toMatchObject({
      kind: 'folder',
      folder: { path: 'documentation', name: 'documentation' },
    })
    const docs = model.rootEntries[0]
    if (!docs || docs.kind !== 'folder') throw new Error('Expected docs folder')
    expect(docs.landingItem?.id).toBe('docs')
    expect(docs.children.map((child) => child.kind === 'item' ? child.item.id : child.folder.path)).toEqual(['setup'])
  })

  it('builds script folders from file paths', () => {
    const explorer = createDefaultSiteExplorerOrganization()
    const model = buildStructuralExplorerTreeSection(
      'scripts',
      explorer.scripts,
      [
        {
          id: 'jquery',
          label: 'jquery.min.js',
          path: 'documentation/assets/js/vendor/jquery.min.js',
          meta: 'documentation/assets/js/vendor/jquery.min.js',
          icon: FileTextSolidIcon,
          active: false,
          ariaLabel: 'Open script jquery.min.js',
          target: { kind: 'file' as const, id: 'jquery' },
        },
      ],
    )

    expect(model.rootEntries[0]).toMatchObject({ kind: 'folder', folder: { path: 'documentation' } })
    const documentation = model.rootEntries[0]
    if (!documentation || documentation.kind !== 'folder') throw new Error('Expected documentation folder')
    expect(documentation.children[0]).toMatchObject({ kind: 'folder', folder: { path: 'documentation/assets' } })
  })
})
