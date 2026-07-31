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
  it('maps capability families to the expected admin workspaces', () => {
    const operator = user('operator', [
      'dashboard.read',
      'site.read',
      'site.content.edit',
      'content.create',
      'data.custom.tables.read',
      'media.read',
    ])
    expect(canAccessWorkspace(operator, 'dashboard')).toBe(true)
    expect(canAccessWorkspace(operator, 'site')).toBe(true)
    expect(canAccessWorkspace(operator, 'content')).toBe(true)
    expect(canAccessWorkspace(operator, 'data')).toBe(true)
    expect(canAccessWorkspace(operator, 'media')).toBe(true)
    expect(canAccessWorkspace(operator, 'plugins')).toBe(false)
    expect(canAccessWorkspace(operator, 'users')).toBe(false)
    expect(canAccessWorkspace(operator, 'ai')).toBe(false)
    expect(canAccessWorkspace(operator, 'account')).toBe(true)
    expect(firstAccessibleWorkspace(operator)).toBe('dashboard')

    const userManager = user('user-manager', ['users.manage'])
    expect(canAccessWorkspace(userManager, 'users')).toBe(true)
    expect(firstAccessibleWorkspace(userManager)).toBe('users')

    const pluginOperator = user('plugin-operator', ['plugins.lifecycle'])
    expect(canAccessWorkspace(pluginOperator, 'plugins')).toBe(true)
    expect(canAccessWorkspace(pluginOperator, 'pluginPage')).toBe(true)
    expect(firstAccessibleWorkspace(pluginOperator)).toBe('plugins')

    const aiAuditor = user('ai-auditor', ['ai.audit.read'])
    expect(canAccessWorkspace(aiAuditor, 'ai')).toBe(true)
    expect(firstAccessibleWorkspace(aiAuditor)).toBe('ai')

    expect(canAccessWorkspace(null, 'account')).toBe(false)
    expect(firstAccessibleWorkspace(null)).toBeNull()
    expect(workspacePath('pluginPage')).toBe('/admin/plugins')
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
