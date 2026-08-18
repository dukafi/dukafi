/**
 * The edit sidecar — the write half of MCP, running headless.
 *
 * Why this exists at all: `importHtml` is TypeScript. Ruby can turn nodes into
 * HTML (`RenderPage`) but has nothing that turns HTML into nodes, and writing a
 * second importer in Ruby would mean two parsers that must agree forever —
 * the exact failure mode that produced the `@font-face` and `base.svg` bugs
 * this project already paid for.
 *
 * The alternative was relaying writes to the merchant's open editor tab. That
 * works for someone sitting at their desk in Cursor, and is close to useless
 * for a cloud agent like Lovable working asynchronously: every write would fail
 * unless the merchant happened to have Dukafi open. A process in the same
 * container has no such condition.
 *
 * It is deliberately tiny and stateless. It holds no database handle and no
 * page identity — Ruby reads the document, sends it here, and persists whatever
 * comes back. That keeps ownership of the data in one place and makes this
 * process restartable at any moment.
 *
 * Production binds a Unix socket (`DUKAFI_SIDECAR_SOCKET`), not a second TCP
 * port: platforms like Railway detect listening ports, and a second bind can
 * steal the public one. Local `bin/dev` still uses loopback TCP. Either way
 * this process must never be reachable from outside the container — it applies
 * arbitrary edits with no authentication of its own beyond a shared token.
 */

import { unlinkSync } from 'node:fs'
import { GlobalWindow } from 'happy-dom'
import { applyEditsToTree, parseAiEdits } from '@core/ai'
import type { EditableSite, EditableTree } from '@core/ai'

// The single DOM API the import pipeline touches (`htmlImport/parseHtml.ts`).
// Bun has no DOMParser of its own, and pulling in a browser is not required —
// just this one constructor.
const window = new GlobalWindow()
;(globalThis as unknown as { DOMParser: unknown }).DOMParser = window.DOMParser

// Registering the modules is a side effect of importing them; the registry is
// what tells `applyEditsToTree` which modules accept children.
await import('@modules/base')
await import('@modules/store')

const SOCKET = process.env.DUKAFI_SIDECAR_SOCKET
const PORT = Number(process.env.DUKAFI_SIDECAR_PORT ?? 9293)
const TOKEN = process.env.DUKAFI_SIDECAR_TOKEN ?? ''

interface ApplyRequest {
  document: { rootNodeId: string; nodes: Record<string, unknown> } & Record<string, unknown>
  styleRules: Record<string, unknown>
  edits: unknown
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function authorized(request: Request): boolean {
  // An empty token means "not configured" and is refused rather than treated
  // as open — a misconfiguration should not silently remove the only lock.
  if (TOKEN.length === 0) return false
  return request.headers.get('authorization') === `Bearer ${TOKEN}`
}

async function applyEdits(request: Request): Promise<Response> {
  let payload: ApplyRequest
  try {
    payload = (await request.json()) as ApplyRequest
  } catch {
    return json({ error: 'invalid_json', message: 'Body must be JSON' }, 400)
  }

  const document = payload?.document
  if (!document || typeof document.rootNodeId !== 'string' || typeof document.nodes !== 'object') {
    return json({ error: 'invalid_document', message: 'document must carry rootNodeId and nodes' }, 422)
  }

  // The same tolerant validator a hand-pasted batch gets: unknown ops are
  // dropped rather than failing the whole call, so one malformed edit in five
  // does not discard the four good ones.
  const edits = parseAiEdits(payload.edits)
  if (edits.length === 0) {
    return json({ error: 'no_valid_edits', message: 'No usable edits in the request' }, 422)
  }

  // Mutated in place, then handed straight back — this process keeps nothing.
  const tree = document as unknown as EditableTree
  const site: EditableSite = { styleRules: (payload.styleRules ?? {}) as EditableSite['styleRules'] }

  let applied: number
  try {
    applied = applyEditsToTree(tree, site, edits)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[sidecar] applyEditsToTree threw:', message)
    return json({ error: 'apply_failed', message }, 500)
  }

  return json({ applied, received: edits.length, document, styleRules: site.styleRules })
}

async function handle(request: Request): Promise<Response> {
  const url = new URL(request.url)

  // Unauthenticated so a container healthcheck can use it, and it reveals
  // nothing beyond "the process is up".
  if (url.pathname === '/health') return json({ ok: true })

  if (!authorized(request)) {
    return json({ error: 'unauthorized', message: 'A valid sidecar token is required' }, 401)
  }

  if (url.pathname === '/apply-edits' && request.method === 'POST') {
    return applyEdits(request)
  }

  return json({ error: 'not_found' }, 404)
}

if (SOCKET) {
  try {
    unlinkSync(SOCKET)
  } catch (error) {
    if ((error as { code?: string }).code !== 'ENOENT') throw error
  }
}

const server = SOCKET
  ? Bun.serve({ unix: SOCKET, fetch: handle })
  : Bun.serve({
      port: PORT,
      hostname: '127.0.0.1',
      fetch: handle,
    })

console.log(
  SOCKET
    ? `[sidecar] listening on unix:${SOCKET}`
    : `[sidecar] listening on http://127.0.0.1:${server.port}`,
)
if (TOKEN.length === 0) {
  console.warn('[sidecar] DUKAFI_SIDECAR_TOKEN is not set — every request will be refused')
}
