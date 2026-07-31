/**
 * Shared mapper helpers for the data-row repositories.
 *
 * `userRefAt` extracts a `DataUserReference` from a row for one of the four
 * user-ref joins (author / created_by / updated_by / published_by). Each prefix
 * has its own accessor reading the concrete named columns, so the column access
 * is type-checked and an unknown prefix is a compile error. DB date columns are
 * coerced to ISO strings via `isoDate`/`isoDateOrNull` from `@core/utils/isoDate`
 * — the one server-wide date-coercion helper.
 */

import type { DataUserReference } from '@core/data/schemas'

export type UserJoinPrefix = 'author' | 'created_by' | 'updated_by' | 'published_by'

/**
 * Every column produced by a "<prefix>_*" user-ref join. The hydrated SELECT
 * (`mapper.ts`) emits all of these via LEFT JOINs, so each is always present —
 * `null` when the join found no user, never absent.
 */
export interface UserJoinColumns {
  author_user_id: string | null
  author_email: string | null
  author_display_name: string | null
  author_role_slug: string | null
  author_role_name: string | null
  created_by_user_id: string | null
  created_by_email: string | null
  created_by_display_name: string | null
  created_by_role_slug: string | null
  created_by_role_name: string | null
  updated_by_user_id: string | null
  updated_by_email: string | null
  updated_by_display_name: string | null
  updated_by_role_slug: string | null
  updated_by_role_name: string | null
  published_by_user_id: string | null
  published_by_email: string | null
  published_by_display_name: string | null
  published_by_role_slug: string | null
  published_by_role_name: string | null
}

/** Build a `DataUserReference` from one join's already-resolved columns. */
function buildUserRef(
  userId: string | null,
  email: string | null,
  displayName: string | null,
  roleSlug: string | null,
  roleName: string | null,
): DataUserReference | null {
  if (!userId) return null
  const resolvedEmail = email ?? ''
  return {
    id: userId,
    email: resolvedEmail,
    displayName: displayName ?? resolvedEmail ?? userId,
    roleSlug: roleSlug ?? null,
    roleName: roleName ?? null,
  }
}

/**
 * One accessor per join prefix, each reading the concrete named columns. The
 * `Record<UserJoinPrefix, …>` key set makes an unknown prefix a compile error
 * and the explicit column reads are type-checked against `UserJoinColumns`.
 */
const userRefAccessors: Record<
  UserJoinPrefix,
  (row: UserJoinColumns) => DataUserReference | null
> = {
  author: (row) =>
    buildUserRef(
      row.author_user_id,
      row.author_email,
      row.author_display_name,
      row.author_role_slug,
      row.author_role_name,
    ),
  created_by: (row) =>
    buildUserRef(
      row.created_by_user_id,
      row.created_by_email,
      row.created_by_display_name,
      row.created_by_role_slug,
      row.created_by_role_name,
    ),
  updated_by: (row) =>
    buildUserRef(
      row.updated_by_user_id,
      row.updated_by_email,
      row.updated_by_display_name,
      row.updated_by_role_slug,
      row.updated_by_role_name,
    ),
  published_by: (row) =>
    buildUserRef(
      row.published_by_user_id,
      row.published_by_email,
      row.published_by_display_name,
      row.published_by_role_slug,
      row.published_by_role_name,
    ),
}

export function userRefAt(
  row: UserJoinColumns,
  prefix: UserJoinPrefix,
): DataUserReference | null {
  return userRefAccessors[prefix](row)
}

// ---------------------------------------------------------------------------
// SQL fragment builders — the single source of the four user-ref joins
// ---------------------------------------------------------------------------
//
// Both the hydrated data-row SELECT (`rows/mapper.ts`) and the published-row
// read (`publish.ts`) splice these so the join shape + alias set live in exactly
// one place. Table aliases are `<prefix>_users` / `<prefix>_roles`, matching the
// aliases `userRefColumns` reads back into `UserJoinColumns`. The fragments are
// raw SQL text spliced into `db.unsafe()` strings — bind values still flow
// through positional `placeholder()` params, never through these constants.

/**
 * SELECT alias fragment for one user-ref prefix — the four
 * `<prefix>_email / _display_name / _role_slug / _role_name` columns that
 * `userRefAt` reads back.
 */
export function userRefColumns(prefix: UserJoinPrefix): string {
  return `${prefix}_users.email as ${prefix}_email,
       ${prefix}_users.display_name as ${prefix}_display_name,
       ${prefix}_roles.slug as ${prefix}_role_slug,
       ${prefix}_roles.name as ${prefix}_role_name`
}

/**
 * LEFT JOIN fragment for one user-ref prefix against a source id expression
 * (e.g. `data_rows.author_user_id` or `data_row_versions.published_by_user_id`).
 */
export function userRefJoin(prefix: UserJoinPrefix, sourceIdExpr: string): string {
  return `left join users ${prefix}_users on ${prefix}_users.id = ${sourceIdExpr}
    left join roles ${prefix}_roles on ${prefix}_roles.id = ${prefix}_users.role_id`
}
