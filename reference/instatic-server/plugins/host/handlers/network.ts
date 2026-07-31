/**
 * Outbound network handlers — implements network.fetch and network.abort
 * api-calls.
 *
 * `network.fetch` is gated by the `network.outbound` permission — enforced
 * centrally in apiDispatch.ts (via TARGET_PERMISSIONS) before this handler
 * runs — and delegates
 * the actual gated fetch (including the allowlist check against
 * `manifest.networkAllowedHosts`) to `host/network.ts`. The allowlist check
 * is fail-closed: if `networkAllowedHosts` is empty or missing, all outbound
 * is denied.
 *
 * `network.abort` is intentionally NOT permission-gated: a plugin without
 * `network.outbound` can never have registered a live abortId, so the lookup
 * simply no-ops. Treating it as a cheap correlation-id cancel avoids a second
 * permission on the teardown path.
 */

import type { ApiCallFor } from '../../protocol/apiCallSchema'
import type { DbClient } from '../../../db/client'
import { replyApiOk } from '../apiReplies'
import { performGatedFetch } from '../network'
import type { HostPluginRecord } from '../types'

export async function handleNetworkFetch(
  msg: ApiCallFor<'network.fetch'>,
  entry: HostPluginRecord,
  _db: DbClient,
): Promise<void> {
  const [urlString, init] = msg.args
  const result = await performGatedFetch(entry, urlString, init)
  replyApiOk(msg.pluginId, msg.correlationId, result as unknown)
}

export async function handleNetworkAbort(
  msg: ApiCallFor<'network.abort'>,
  entry: HostPluginRecord,
  _db: DbClient,
): Promise<void> {
  const [{ abortId }] = msg.args
  const controller = entry.inflightFetches.get(abortId)
  if (controller) {
    try {
      const err = new Error('AbortError')
      err.name = 'AbortError'
      controller.abort(err)
    } catch { /* ignore */ }
    entry.inflightFetches.delete(abortId)
  }
  replyApiOk(msg.pluginId, msg.correlationId)
}
