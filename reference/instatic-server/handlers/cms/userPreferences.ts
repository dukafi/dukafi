/**
 * User preferences HTTP handler.
 *
 * Endpoints (all behind the authenticated admin session cookie):
 *
 *   GET    /admin/api/cms/me/preferences/:key
 *     → 200 { value }          — stored preference
 *     → 200 { value: null }    — never set (caller falls back to default)
 *
 *   PUT    /admin/api/cms/me/preferences/:key
 *     body: { value }
 *     → 200 { value }          — upserted, echoed back after validation
 *     → 400 { error }          — unknown key OR value fails per-key schema
 *
 *   DELETE /admin/api/cms/me/preferences/:key
 *     → 204                    — reset to default (or already absent)
 *
 * The `:key` is validated against `USER_PREFERENCE_KEYS` (whitelist).
 * Unknown keys are rejected with 400 — plugins / third-party code can't
 * squat arbitrary per-user keys through this surface. The whitelist also
 * gives us per-key schema validation at both read and write boundaries.
 */
import type { DbClient } from '../../db/client'
import { requireAuthenticatedUser } from '../../auth/authz'
import { badRequest, jsonResponse, methodNotAllowed, readValidatedBody } from '../../http'
import { CMS_API_PREFIX } from './shared'
import {
  USER_PREFERENCE_KEYS,
  USER_PREFERENCE_SCHEMAS,
  isUserPreferenceKey,
  type UserPreferenceKey,
} from '@core/persistence/userPreferences'
import { Type, parseValue, safeParseValue } from '@core/utils/typeboxHelpers'
import {
  deleteUserPreferenceRow,
  getUserPreferenceRow,
  upsertUserPreferenceRow,
} from '../../repositories/userPreferences'

const PREFIX = `${CMS_API_PREFIX}/me/preferences/`

/**
 * Incoming PUT body is `{ value }`. The handler then re-validates
 * `value` against the per-key schema — same shape the client validates
 * against on read. Two-step validation (outer envelope, then inner
 * value) sidesteps a TS generic-inference quirk and keeps the boundary
 * clean: malformed envelope → 400; malformed value → 400 with the
 * specific TypeBox error path.
 */
const PutBodyEnvelopeSchema = Type.Object({ value: Type.Unknown() })

export async function handleUserPreferencesRoutes(
  req: Request,
  db: DbClient,
): Promise<Response | null> {
  const url = new URL(req.url)
  if (!url.pathname.startsWith(PREFIX)) return null

  const rawKey = decodeURIComponent(url.pathname.slice(PREFIX.length))
  if (!rawKey || rawKey.includes('/')) {
    return badRequest('Preference key must be a single path segment')
  }
  if (!isUserPreferenceKey(rawKey)) {
    return badRequest(
      `Unknown preference key "${rawKey}". Known keys: ${USER_PREFERENCE_KEYS.join(', ')}.`,
    )
  }
  const key: UserPreferenceKey = rawKey

  const user = await requireAuthenticatedUser(req, db)
  if (user instanceof Response) return user

  if (req.method === 'GET') {
    const stored = await getUserPreferenceRow(db, user.id, key)
    if (stored === null) {
      // Not set yet → `{ value: null }`, NOT a 404. These prefs are all
      // optional (the client falls back to a default), so a 404 here is
      // just console noise that reads like a real failure. `null` is the
      // unambiguous "unset" signal — every pref value schema is an object,
      // never null.
      return jsonResponse({ value: null })
    }
    // Re-validate the stored value before returning — corruption in the
    // DB row (manual edit, version skew after a schema rename) shows up
    // as a 500 rather than silently shipping garbage to the client.
    const parsed = safeParseValue(USER_PREFERENCE_SCHEMAS[key], stored)
    if (!parsed.ok) {
      console.error(
        `[user-preferences] stored value for user=${user.id} key=${key} failed schema validation:`,
        parsed.errors,
      )
      return jsonResponse(
        { error: 'Stored preference is corrupted; reset and try again.' },
        { status: 500 },
      )
    }
    return jsonResponse({ value: parsed.value })
  }

  if (req.method === 'PUT') {
    const envelope = await readValidatedBody(req, PutBodyEnvelopeSchema)
    if (!envelope) return badRequest('Body must be { value: ... }')
    const value = parseValueOrBadRequest(USER_PREFERENCE_SCHEMAS[key], envelope.value)
    if (value instanceof Response) return value

    await upsertUserPreferenceRow(db, user.id, key, value)
    return jsonResponse({ value })
  }

  if (req.method === 'DELETE') {
    await deleteUserPreferenceRow(db, user.id, key)
    return new Response(null, { status: 204 })
  }

  return methodNotAllowed()
}

/**
 * Validate `raw` against `schema`, returning the parsed value on success
 * or a `Response` carrying a 400 with the TypeBox error path on failure.
 * Sugar over `safeParseValue` because every write path needs the same
 * "return-400-on-bad-shape" pattern.
 */
function parseValueOrBadRequest<S extends Parameters<typeof safeParseValue>[0]>(
  schema: S,
  raw: unknown,
): ReturnType<typeof parseValue> | Response {
  const parsed = safeParseValue(schema, raw)
  if (!parsed.ok) {
    return badRequest(
      `Invalid preference payload: ${parsed.errors[0]?.message ?? 'shape mismatch'}`,
    )
  }
  return parsed.value
}
