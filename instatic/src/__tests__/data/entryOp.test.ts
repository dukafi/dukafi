import { describe, expect, it, mock } from 'bun:test'
import { runEntryOp, type EntryOpDeps } from '@content/utils/entryOp'
import type { SaveMessage } from '@content/hooks/useContentEntryDraft'

function makeDeps() {
  const saveMessages: SaveMessage[] = []
  const errors: (string | null)[] = []
  const deps: EntryOpDeps = {
    setSaveMessage: (m) => saveMessages.push(m),
    setError: (m) => errors.push(m),
  }
  return { deps, saveMessages, errors }
}

describe('runEntryOp — save-state machine', () => {
  it('runs saving → saved and applies the result on success', async () => {
    const { deps, saveMessages, errors } = makeDeps()
    const apply = mock((result: number) => { void result })

    await runEntryOp(deps, async () => 42, {
      permitted: true,
      fallback: 'Could not do thing',
      phase: { pending: 'saving', done: 'saved' },
      apply,
    })

    expect(saveMessages).toEqual(['saving', 'saved'])
    // setError(null) clears, no error message pushed afterwards.
    expect(errors).toEqual([null])
    expect(apply).toHaveBeenCalledWith(42)
  })

  it('a thrown op surfaces the error and leaves save-state coherent (not stuck on saving)', async () => {
    const { deps, saveMessages, errors } = makeDeps()

    await runEntryOp(deps, async () => { throw new Error('boom') }, {
      permitted: true,
      fallback: 'Could not do thing',
      phase: { pending: 'saving', done: 'saved' },
    })

    // 'saving' set on entry, then flipped to 'error' — never left on 'saving'.
    expect(saveMessages).toEqual(['saving', 'error'])
    expect(saveMessages[saveMessages.length - 1]).not.toBe('saving')
    expect(errors).toEqual([null, 'boom'])
  })

  it('falls back to the provided message when the op throws a non-Error', async () => {
    const { deps, errors } = makeDeps()

    await runEntryOp(deps, async () => { throw 'nope' }, {
      permitted: true,
      fallback: 'Could not do thing',
      phase: { pending: 'saving', done: 'saved' },
    })

    expect(errors[errors.length - 1]).toBe('Could not do thing')
  })

  it('skips the op and surfaces the permission message when not permitted', async () => {
    const { deps, saveMessages, errors } = makeDeps()
    const fn = mock(async () => 1)

    await runEntryOp(deps, fn, {
      permitted: false,
      permMsg: 'Your role cannot do that',
      fallback: 'Could not do thing',
      phase: { pending: 'saving', done: 'saved' },
    })

    expect(fn).not.toHaveBeenCalled()
    expect(saveMessages).toEqual([]) // never entered the save-state machine
    expect(errors).toEqual(['Your role cannot do that'])
  })

  it('omits the save toast for ops without a phase, still surfacing errors', async () => {
    const { deps, saveMessages, errors } = makeDeps()

    await runEntryOp(deps, async () => { throw new Error('delete failed') }, {
      permitted: true,
      fallback: 'Could not delete',
    })

    expect(saveMessages).toEqual([]) // no save-state machine for delete-style ops
    expect(errors).toEqual([null, 'delete failed'])
  })

  it('re-throws after surfacing when rethrow is set (so dialogs stay open)', async () => {
    const { deps } = makeDeps()

    await expect(
      runEntryOp(deps, async () => { throw new Error('rename failed') }, {
        permitted: true,
        fallback: 'Could not rename',
        rethrow: true,
      }),
    ).rejects.toThrow('rename failed')
  })
})
