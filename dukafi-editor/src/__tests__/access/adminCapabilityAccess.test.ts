import { describe, expect, it } from 'bun:test'
import type { CoreCapability } from '@core/capabilities'
import type { DataRow } from '@core/data/schemas'
import type { CmsCurrentUser } from '@core/persistence'
import {
  canAccessWorkspace,
  canCreateContent,
  canDeleteMedia,
  canEditAnyContent,
  canEditContent,
  canEditContentEntry,
  canEditStructure,
  canEditStyle,
  canExportData,
  canImportData,
  canManageContentCollections,
  canManageDataTables,
  canManageTable,
  canMoveDataRow,
  canPublishContentEntry,
  canReadDataTables,
  canReadTable,
  canReadMedia,
  canReplaceMedia,
  canSaveDraftSite,
  canWriteMedia,
  firstAccessibleWorkspace,
  hasCapability,
  workspacePath,
} from '../../admin/access'

function user(id: string, capabilities: CoreCapability[]): CmsCurrentUser {
  return {
    id,
    email: `${id}@example.com`,
    displayName: id,
    status: 'active',
    role: {
      id: `role-${id}`,
      slug: `role-${id}`,
      name: `Role ${id}`,
      description: '',
      isSystem: false,
      capabilities,
    },
    capabilities,
    lastLoginAt: null,
    failedLoginCount: 0,
    lockedUntil: null,
    passwordUpdatedAt: null,
    mfaEnabled: false,
    mfaEnabledAt: null,
    mfaRecoveryCodesRemaining: 0,
    stepUpAuthMode: 'required',
    stepUpWindowMinutes: 15,
    avatarMediaId: null,
    avatarUrl: null,
    gravatarHash: 'hash',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

function row(input: {
  id: string
  authorUserId: string | null
  createdByUserId: string | null
}): DataRow {
  return {
    id: input.id,
    tableId: 'posts',
    cells: {},
    slug: input.id,
    status: 'draft',
    authorUserId: input.authorUserId,
    createdByUserId: input.createdByUserId,
    updatedByUserId: input.createdByUserId,
    publishedByUserId: null,
    author: null,
    createdBy: null,
    updatedBy: null,
    publishedBy: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    publishedAt: null,
    scheduledPublishAt: null,
    deletedAt: null,
  }
}

describe('admin capability access helpers', () => {
  // Three workspaces, matching `docs/architecture/admin-store.md`: Site owns
  // presentation, Commerce owns catalogue data, Media owns uploads. Instatic's
  // dashboard / content / data / plugins / users / ai / account workspaces were
  // removed — none had a Ruby API behind it.
  it('maps capability families to the expected admin workspaces', () => {
    const operator = user('operator', ['site.read', 'site.content.edit', 'media.read'])
    expect(canAccessWorkspace(operator, 'site')).toBe(true)
    expect(canAccessWorkspace(operator, 'media')).toBe(true)
    // No `content.manage`, so the catalogue stays closed.
    expect(canAccessWorkspace(operator, 'dashboard')).toBe(false)
    expect(firstAccessibleWorkspace(operator)).toBe('site')

    const merchant = user('merchant', ['content.manage', 'media.read'])
    expect(canAccessWorkspace(merchant, 'dashboard')).toBe(true)
    expect(canAccessWorkspace(merchant, 'site')).toBe(false)
    expect(firstAccessibleWorkspace(merchant)).toBe('dashboard')

    const mediaOnly = user('media-only', ['media.read'])
    expect(firstAccessibleWorkspace(mediaOnly)).toBe('media')

    expect(firstAccessibleWorkspace(null)).toBeNull()
    expect(workspacePath('site')).toBe('/admin/editor')
    expect(workspacePath('media')).toBe('/admin/media')
    expect(workspacePath('dashboard')).toBe('/admin/dashboard')
  })

  it('keeps editor write modes independent in the UI policy layer', () => {
    const contentEditor = user('content-editor', ['site.read', 'site.content.edit'])
    expect(canEditContent(contentEditor)).toBe(true)
    expect(canEditStyle(contentEditor)).toBe(false)
    expect(canEditStructure(contentEditor)).toBe(false)
    expect(canSaveDraftSite(contentEditor)).toBe(true)

    const styleEditor = user('style-editor', ['site.read', 'site.style.edit'])
    expect(canEditContent(styleEditor)).toBe(false)
    expect(canEditStyle(styleEditor)).toBe(true)
    expect(canEditStructure(styleEditor)).toBe(false)
    expect(canSaveDraftSite(styleEditor)).toBe(true)

    const structureWithoutPages = user('structure-without-pages', ['site.read', 'site.structure.edit'])
    expect(canEditStructure(structureWithoutPages)).toBe(false)
    expect(canSaveDraftSite(structureWithoutPages)).toBe(true)

    const structureEditor = user('structure-editor', [
      'site.read',
      'site.structure.edit',
      'pages.edit',
    ])
    expect(canEditStructure(structureEditor)).toBe(true)
    expect(canEditContent(structureEditor)).toBe(false)
    expect(canEditStyle(structureEditor)).toBe(false)

    expect(canEditStructure(null)).toBe(true)
    expect(canEditContent(null)).toBe(true)
    expect(canEditStyle(null)).toBe(true)
    expect(canSaveDraftSite(null)).toBe(true)
  })

  it('applies content row ownership and any-scope grants without widening data/media gates', () => {
    const ownRow = row({ id: 'own', authorUserId: 'author', createdByUserId: 'creator' })
    const createdRow = row({ id: 'created', authorUserId: null, createdByUserId: 'author' })
    const otherRow = row({ id: 'other', authorUserId: 'other-author', createdByUserId: 'other' })

    const ownEditor = user('author', ['content.create', 'content.edit.own', 'content.publish.own'])
    expect(canCreateContent(ownEditor)).toBe(true)
    expect(canEditContentEntry(ownEditor, ownRow)).toBe(true)
    expect(canEditContentEntry(ownEditor, createdRow)).toBe(true)
    expect(canEditContentEntry(ownEditor, otherRow)).toBe(false)
    expect(canPublishContentEntry(ownEditor, ownRow)).toBe(true)
    expect(canPublishContentEntry(ownEditor, otherRow)).toBe(false)
    expect(canEditAnyContent(ownEditor)).toBe(false)

    const contentManager = user('content-manager', ['content.manage'])
    expect(canEditAnyContent(contentManager)).toBe(true)
    expect(canManageContentCollections(contentManager)).toBe(true)
    expect(canEditContentEntry(contentManager, otherRow)).toBe(true)
    expect(canPublishContentEntry(contentManager, otherRow)).toBe(false)

    const dataManager = user('data-manager', [
      'data.custom.tables.manage',
      'data.rows.move',
      'data.export',
      'data.import',
    ])
    expect(canReadDataTables(dataManager)).toBe(true)
    expect(canManageDataTables(dataManager)).toBe(true)
    expect(canManageContentCollections(dataManager)).toBe(true)
    expect(canMoveDataRow(dataManager)).toBe(true)
    expect(canExportData(dataManager)).toBe(true)
    expect(canImportData(dataManager)).toBe(true)
    expect(canReadMedia(dataManager)).toBe(false)

    // System tables are a separate family: custom-manage does not grant system
    // visibility, and a system-read persona never sees custom tables.
    expect(canReadTable(dataManager, { system: false })).toBe(true)
    expect(canReadTable(dataManager, { system: true })).toBe(false)
    expect(canManageTable(dataManager, { system: false })).toBe(true)
    expect(canManageTable(dataManager, { system: true })).toBe(false)

    const systemViewer = user('system-viewer', ['data.system.tables.read'])
    expect(canReadDataTables(systemViewer)).toBe(true)
    expect(canReadTable(systemViewer, { system: true })).toBe(true)
    expect(canReadTable(systemViewer, { system: false })).toBe(false)
    expect(canManageTable(systemViewer, { system: true })).toBe(false)

    const mediaOperator = user('media-operator', [
      'media.read',
      'media.write',
      'media.replace',
      'media.delete',
    ])
    expect(hasCapability(mediaOperator, 'media.read')).toBe(true)
    expect(canReadMedia(mediaOperator)).toBe(true)
    expect(canWriteMedia(mediaOperator)).toBe(true)
    expect(canReplaceMedia(mediaOperator)).toBe(true)
    expect(canDeleteMedia(mediaOperator)).toBe(true)
    expect(canReadDataTables(mediaOperator)).toBe(false)
  })
})
