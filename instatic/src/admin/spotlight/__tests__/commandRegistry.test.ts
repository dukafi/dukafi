/**
 * filterCommands tests — capability + workspace + when() gates.
 *
 * These exercise the three filtering rules in commandRegistry.ts:
 *   1. workspaces  — workspace must match (or include 'any')
 *   2. capability  — user must hold the named capability (string or any-of array)
 *   3. when()      — predicate returning false hides the command (throws too)
 *
 * The aim is to lock in the new capability gate. Previously every user saw
 * every command in the palette and only hit a 403 when running it — now the
 * unauthorised commands never appear in the first place.
 */

import { describe, it, expect } from 'bun:test'
import { filterCommands } from '../commandRegistry'
import type { Command, CommandContext } from '../types'
import type { CmsCurrentUser } from '@core/persistence'

// ─── Test helpers ─────────────────────────────────────────────────────────────

function makeUser(capabilities: string[]): CmsCurrentUser {
  return {
    id: 'user_1',
    email: 'user@example.com',
    displayName: 'User',
    status: 'active',
    role: {
      id: 'role_1',
      slug: 'role_1',
      name: 'Role',
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
    gravatarHash: '',
    createdAt: '2026-05-18T00:00:00.000Z',
    updatedAt: '2026-05-18T00:00:00.000Z',
  } as unknown as CmsCurrentUser
}

function makeCtx(capabilities: string[], workspace: CommandContext['workspace'] = 'site'): CommandContext {
  return {
    workspace,
    pathname: '/admin/site',
    user: makeUser(capabilities),
  }
}

function makeCmd(overrides: Partial<Command> = {}): Command {
  return {
    id: 'test.cmd',
    title: 'Test command',
    group: 'editor',
    run: () => {},
    ...overrides,
  }
}

// ─── Capability gate ──────────────────────────────────────────────────────────

describe('filterCommands — capability gate', () => {
  it('keeps commands with no capability declared', () => {
    const cmd = makeCmd({ capability: undefined })
    const result = filterCommands([cmd], makeCtx([]))
    expect(result).toEqual([cmd])
  })

  it('hides a single-capability command when the user lacks it', () => {
    const cmd = makeCmd({ capability: 'users.manage' })
    const result = filterCommands([cmd], makeCtx(['site.read']))
    expect(result).toEqual([])
  })

  it('keeps a single-capability command when the user holds it', () => {
    const cmd = makeCmd({ capability: 'users.manage' })
    const result = filterCommands([cmd], makeCtx(['users.manage']))
    expect(result).toEqual([cmd])
  })

  it('hides an array-capability command when the user has none of them', () => {
    const cmd = makeCmd({ capability: ['content.create', 'content.manage'] })
    const result = filterCommands([cmd], makeCtx(['users.manage']))
    expect(result).toEqual([])
  })

  it('keeps an array-capability command when the user holds at least one', () => {
    const cmd = makeCmd({ capability: ['content.create', 'content.manage'] })
    const result = filterCommands([cmd], makeCtx(['content.create']))
    expect(result).toEqual([cmd])
  })

  it('keeps a command when its capability array is empty', () => {
    // Defensive: an empty array means "no requirement" rather than "nothing satisfies."
    const cmd = makeCmd({ capability: [] })
    const result = filterCommands([cmd], makeCtx([]))
    expect(result).toEqual([cmd])
  })
})

// ─── Workspace gate ───────────────────────────────────────────────────────────

describe('filterCommands — workspace gate', () => {
  it('keeps commands targeting the current workspace', () => {
    const cmd = makeCmd({ workspaces: ['site'] })
    const result = filterCommands([cmd], makeCtx([], 'site'))
    expect(result).toEqual([cmd])
  })

  it('hides commands targeting a different workspace', () => {
    const cmd = makeCmd({ workspaces: ['content'] })
    const result = filterCommands([cmd], makeCtx([], 'site'))
    expect(result).toEqual([])
  })

  it("keeps commands with workspaces: ['any'] regardless of current workspace", () => {
    const cmd = makeCmd({ workspaces: ['any'] })
    const result = filterCommands([cmd], makeCtx([], 'content'))
    expect(result).toEqual([cmd])
  })

  it('keeps commands with no workspaces declared', () => {
    const cmd = makeCmd({ workspaces: undefined })
    const result = filterCommands([cmd], makeCtx([], 'media'))
    expect(result).toEqual([cmd])
  })
})

// ─── when() predicate ─────────────────────────────────────────────────────────

describe('filterCommands — when() predicate', () => {
  it('hides commands when when() returns false', () => {
    const cmd = makeCmd({ when: () => false })
    const result = filterCommands([cmd], makeCtx([]))
    expect(result).toEqual([])
  })

  it('keeps commands when when() returns true', () => {
    const cmd = makeCmd({ when: () => true })
    const result = filterCommands([cmd], makeCtx([]))
    expect(result).toEqual([cmd])
  })

  it('treats a thrown when() as "hide" — never crashes the palette', () => {
    const cmd = makeCmd({ when: () => { throw new Error('boom') } })
    const result = filterCommands([cmd], makeCtx([]))
    expect(result).toEqual([])
  })

  it('forwards the live context to when()', () => {
    const seen: CommandContext[] = []
    const cmd = makeCmd({
      when: (ctx) => {
        seen.push(ctx)
        return true
      },
    })
    const ctx = makeCtx(['site.read'])
    filterCommands([cmd], ctx)
    expect(seen).toHaveLength(1)
    expect(seen[0]).toBe(ctx)
  })
})

// ─── Combined gates ───────────────────────────────────────────────────────────

describe('filterCommands — combined gates', () => {
  it('all three gates must pass', () => {
    const cmd = makeCmd({
      workspaces: ['site'],
      capability: 'site.style.edit',
      when: (ctx) => Boolean(ctx.editor),
    })

    // Wrong workspace → hidden
    expect(filterCommands([cmd], { ...makeCtx(['site.style.edit'], 'content') })).toEqual([])

    // Right workspace, missing capability → hidden
    expect(filterCommands([cmd], makeCtx(['site.read']))).toEqual([])

    // Right workspace + capability but when() false (no editor ctx) → hidden
    expect(filterCommands([cmd], makeCtx(['site.style.edit']))).toEqual([])

    // All three pass → kept
    const ctxWithEditor: CommandContext = {
      ...makeCtx(['site.style.edit']),
      editor: {
        selectedNodeIds: [],
        activePageId: null,
        activeDocument: null,
        canUndo: false,
        canRedo: false,
        activeBreakpointId: 'desktop',
        activeInlineEdit: false,
      },
    }
    expect(filterCommands([cmd], ctxWithEditor)).toEqual([cmd])
  })
})
