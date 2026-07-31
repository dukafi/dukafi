/**
 * Session-management endpoints — list this user's live sessions, revoke one,
 * and revoke every other session ("sign out everywhere"). Split out of
 * `auth.ts` (which owns login / MFA / step-up) so that file stays under its
 * size budget; these three handlers form one cohesive "manage my devices"
 * surface and share no local state with the login flow.
 */

import type { DbClient } from '../../db/client'
import {
  listSessionsForUser,
  revokeAllOtherSessions,
  revokeSessionByHashForUser,
} from '../../repositories/sessions'
import { requireAuthenticatedUser, requireStepUp, getSessionHash } from '../../auth/authz'
import { createAuditEvent } from '../../repositories/audit'
import { jsonResponse } from '../../http'
import { requestAuditContext } from './shared'
import type { RouteParams } from './routeTable'

/**
 * GET /auth/sessions — list this user's live sessions. Drives the Account →
 * Sessions tab. The current session is flagged via `isCurrent: true` so the
 * UI can pin it and disable its "Sign out" action.
 */
export async function handleListSessions(req: Request, db: DbClient): Promise<Response> {
  const user = await requireAuthenticatedUser(req, db)
  if (user instanceof Response) return user
  const currentSessionHash = await getSessionHash(req)
  const sessions = await listSessionsForUser(db, user.id, currentSessionHash)
  return jsonResponse({ sessions })
}

/**
 * DELETE /auth/sessions/:id — revoke one of the current user's sessions. The
 * `:id` segment IS the session hash. Cross-user revoke is blocked by the
 * repo's `user_id = $userId` predicate.
 *
 * Revoking the *current* session is rejected with 400 to nudge clients to
 * use the regular `/logout` endpoint, which also clears the cookie. The
 * current cookie would otherwise remain on the client until next request.
 *
 * Step-up gated: the user must have re-entered their password within their
 * configured window — kicking another device off your account is sensitive
 * enough that we don't want a stolen cookie alone to enable it.
 */
export async function handleRevokeSession(
  req: Request,
  db: DbClient,
  params: RouteParams,
): Promise<Response> {
  const user = await requireAuthenticatedUser(req, db)
  if (user instanceof Response) return user
  const stepUp = await requireStepUp(req, db, user)
  if (stepUp) return stepUp
  const targetHash = params.id
  if (!targetHash) return jsonResponse({ error: 'Invalid session id' }, { status: 400 })
  const currentSessionHash = await getSessionHash(req)
  if (currentSessionHash && currentSessionHash === targetHash) {
    return jsonResponse(
      { error: 'Use POST /logout to sign out the current session.' },
      { status: 400 },
    )
  }
  const revoked = await revokeSessionByHashForUser(db, targetHash, user.id)
  if (!revoked) return jsonResponse({ error: 'Session not found' }, { status: 404 })
  await createAuditEvent(db, {
    actorUserId: user.id,
    action: 'logout',
    targetType: 'user',
    targetId: user.id,
    metadata: { scope: 'device' },
    ...requestAuditContext(req),
  })
  return jsonResponse({ ok: true })
}

/**
 * POST /auth/logout-all — revoke every other live session for the current
 * user. The current cookie is intentionally preserved so the user issuing
 * the action stays signed in. Step-up gated — wholesale device wipe is the
 * highest-blast-radius session action we expose.
 */
export async function handleLogoutAll(req: Request, db: DbClient): Promise<Response> {
  const user = await requireAuthenticatedUser(req, db)
  if (user instanceof Response) return user
  const stepUp = await requireStepUp(req, db, user)
  if (stepUp) return stepUp
  const currentSessionHash = await getSessionHash(req)
  const revokedCount = await revokeAllOtherSessions(db, user.id, currentSessionHash)
  await createAuditEvent(db, {
    actorUserId: user.id,
    action: 'logout',
    targetType: 'user',
    targetId: user.id,
    metadata: { scope: 'all_other_devices', revokedCount },
    ...requestAuditContext(req),
  })
  return jsonResponse({ ok: true, revokedCount })
}
