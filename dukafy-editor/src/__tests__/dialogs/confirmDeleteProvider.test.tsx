import { afterEach, describe, expect, it } from 'bun:test'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ConfirmDeleteProvider, useConfirmDelete } from '@admin/shared/dialogs/ConfirmDeleteDialog'

afterEach(() => {
  cleanup()
  localStorage.clear()
})

function DeleteHarness({
  onCommit,
  alwaysConfirm,
}: {
  onCommit: () => void
  alwaysConfirm?: boolean
}) {
  const confirmDelete = useConfirmDelete()
  return (
    <button
      type="button"
      onClick={() => {
        confirmDelete({
          title: 'Delete page?',
          description: 'This removes the page from the site tree.',
          confirmLabel: 'Delete page',
          alwaysConfirm,
          commit: onCommit,
        })
      }}
    >
      Delete
    </button>
  )
}

describe('ConfirmDeleteProvider', () => {
  it('can force a confirmation even when the delete preference is off', () => {
    let committed = false

    render(
      <ConfirmDeleteProvider>
        <DeleteHarness
          alwaysConfirm
          onCommit={() => {
            committed = true
          }}
        />
      </ConfirmDeleteProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

    expect(committed).toBe(false)
    expect(screen.getByRole('alertdialog', { name: 'Delete page?' })).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: 'Delete page' }))

    expect(committed).toBe(true)
    expect(screen.queryByRole('alertdialog', { name: 'Delete page?' })).toBeNull()
  })
})
