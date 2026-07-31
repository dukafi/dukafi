import { describe, expect, it, mock } from 'bun:test'
import {
  canAcceptDrop,
  canMoveFolderTo,
  commitDropPayload,
  type MediaDndTarget,
} from '@admin/pages/media/utils/mediaDnd'
import type { CmsMediaFolder } from '@core/persistence/cmsMedia'

function folder(overrides: Partial<CmsMediaFolder> = {}): CmsMediaFolder {
  return {
    id: 'folder_root',
    parentId: null,
    name: 'root',
    slug: 'root',
    sortOrder: 0,
    createdByUserId: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

// Tree: a (root) → b (child of a) → c (grandchild, child of b).
const FOLDER_A = folder({ id: 'a', parentId: null, name: 'a' })
const FOLDER_B = folder({ id: 'b', parentId: 'a', name: 'b' })
const FOLDER_C = folder({ id: 'c', parentId: 'b', name: 'c' })

function makeTarget(): MediaDndTarget & {
  moveAssetsToFolder: ReturnType<typeof mock>
  moveFolder: ReturnType<typeof mock>
} {
  const folders = [FOLDER_A, FOLDER_B, FOLDER_C]
  return {
    folders,
    folderById: new Map(folders.map((f) => [f.id, f])),
    moveAssetsToFolder: mock(async () => {}),
    moveFolder: mock(async () => null),
  }
}

describe('media DnD guards (single source for canvas + sidebar)', () => {
  it('rejects dropping a folder onto itself (self-drop)', () => {
    const target = makeTarget()
    expect(canMoveFolderTo(target, 'b', 'b')).toBe(false)
    expect(canAcceptDrop(target, { kind: 'folder', folderId: 'b' }, 'b')).toBe(false)
  })

  it('rejects dropping a folder onto its own parent (no-op move)', () => {
    const target = makeTarget()
    // b's parent is a → dropping b onto a changes nothing.
    expect(canMoveFolderTo(target, 'b', 'a')).toBe(false)
    expect(canAcceptDrop(target, { kind: 'folder', folderId: 'b' }, 'a')).toBe(false)
  })

  it('rejects dropping a folder into one of its own descendants (cycle)', () => {
    const target = makeTarget()
    // c is a descendant of a → moving a into c would create a cycle.
    expect(canMoveFolderTo(target, 'a', 'c')).toBe(false)
    expect(canAcceptDrop(target, { kind: 'folder', folderId: 'a' }, 'c')).toBe(false)
  })

  it('accepts a legal folder move and commits it via moveFolder', async () => {
    const target = makeTarget()
    // Move c out from under b to the root → not self, not own parent, not a cycle.
    expect(canMoveFolderTo(target, 'c', null)).toBe(true)
    expect(canAcceptDrop(target, { kind: 'folder', folderId: 'c' }, null)).toBe(true)

    await commitDropPayload(target, { kind: 'folder', folderId: 'c' }, null)
    expect(target.moveFolder).toHaveBeenCalledTimes(1)
    expect(target.moveFolder).toHaveBeenCalledWith('c', null)
    expect(target.moveAssetsToFolder).not.toHaveBeenCalled()
  })

  it('does not commit an illegal folder move even if commit is called directly', async () => {
    const target = makeTarget()
    await commitDropPayload(target, { kind: 'folder', folderId: 'b' }, 'b')
    expect(target.moveFolder).not.toHaveBeenCalled()
  })

  it('always accepts asset drops and commits them via moveAssetsToFolder', async () => {
    const target = makeTarget()
    expect(canAcceptDrop(target, { kind: 'assets', assetIds: ['x', 'y'] }, 'a')).toBe(true)

    await commitDropPayload(target, { kind: 'assets', assetIds: ['x', 'y'] }, 'a')
    expect(target.moveAssetsToFolder).toHaveBeenCalledTimes(1)
    expect(target.moveAssetsToFolder).toHaveBeenCalledWith(['x', 'y'], 'a')
    expect(target.moveFolder).not.toHaveBeenCalled()
  })
})
