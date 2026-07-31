import { describe, expect, it } from 'bun:test'
import { userRefAt, type UserJoinColumns, type UserJoinPrefix } from '../shared'

/** A row with every user-ref column present but null (the LEFT-JOIN-miss shape). */
function emptyJoinRow(): UserJoinColumns {
  return {
    author_user_id: null,
    author_email: null,
    author_display_name: null,
    author_role_slug: null,
    author_role_name: null,
    created_by_user_id: null,
    created_by_email: null,
    created_by_display_name: null,
    created_by_role_slug: null,
    created_by_role_name: null,
    updated_by_user_id: null,
    updated_by_email: null,
    updated_by_display_name: null,
    updated_by_role_slug: null,
    updated_by_role_name: null,
    published_by_user_id: null,
    published_by_email: null,
    published_by_display_name: null,
    published_by_role_slug: null,
    published_by_role_name: null,
  }
}

const PREFIXES: UserJoinPrefix[] = ['author', 'created_by', 'updated_by', 'published_by']

describe('userRefAt', () => {
  it('reads the concrete columns for each of the four prefixes', () => {
    for (const prefix of PREFIXES) {
      const row = emptyJoinRow()
      row[`${prefix}_user_id`] = `user-${prefix}`
      row[`${prefix}_email`] = `${prefix}@example.com`
      row[`${prefix}_display_name`] = `Display ${prefix}`
      row[`${prefix}_role_slug`] = 'owner'
      row[`${prefix}_role_name`] = 'Owner'

      expect(userRefAt(row, prefix)).toEqual({
        id: `user-${prefix}`,
        email: `${prefix}@example.com`,
        displayName: `Display ${prefix}`,
        roleSlug: 'owner',
        roleName: 'Owner',
      })
    }
  })

  it('does not leak another prefix into the resolved reference', () => {
    // Only the `author` join matched; the others are null.
    const row = emptyJoinRow()
    row.author_user_id = 'user-author'
    row.author_email = 'author@example.com'
    row.author_display_name = 'Author Person'

    expect(userRefAt(row, 'author')).toEqual({
      id: 'user-author',
      email: 'author@example.com',
      displayName: 'Author Person',
      roleSlug: null,
      roleName: null,
    })
    expect(userRefAt(row, 'created_by')).toBeNull()
    expect(userRefAt(row, 'updated_by')).toBeNull()
    expect(userRefAt(row, 'published_by')).toBeNull()
  })

  it('returns null when the user id column is null for every prefix', () => {
    const row = emptyJoinRow()
    for (const prefix of PREFIXES) {
      expect(userRefAt(row, prefix)).toBeNull()
    }
  })

  it('falls back to email then user id when display name is null', () => {
    const withEmail = emptyJoinRow()
    withEmail.author_user_id = 'user-1'
    withEmail.author_email = 'only-email@example.com'
    expect(userRefAt(withEmail, 'author')?.displayName).toBe('only-email@example.com')

    const idOnly = emptyJoinRow()
    idOnly.author_user_id = 'user-2'
    // No email, no display name → empty-string email, displayName falls to ''.
    expect(userRefAt(idOnly, 'author')).toEqual({
      id: 'user-2',
      email: '',
      displayName: '',
      roleSlug: null,
      roleName: null,
    })
  })
})
