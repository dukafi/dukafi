/**
 * `AiEdit` — the one contract between "something produced a change" and "the
 * page changed".
 *
 * Nothing in this file mentions a model, a provider, or a prompt. That is the
 * point: the assistant is one producer of `AiEdit[]`, and a macro, a plugin, or
 * a different model later are others. They all reach the document through the
 * same validated envelope and the same apply function, so the risky part —
 * mutating a merchant's page — has exactly one implementation to get right.
 *
 * ── Why HTML rather than node JSON ───────────────────────────────────────────
 * `html` carries structure and styling because that is what language models
 * write well. Instatic reached the opposite design first and wrote up why they
 * abandoned it (`reference/instatic/.../docs/features/agent.md:604`): a tool
 * surface requiring internal module ids and hand-built node trees produced worse
 * results and a far larger prompt than plain semantic HTML. Dukafy gets the
 * trade even more cheaply — `importHtml` is the same pipeline the paste-HTML UI
 * uses, and Tailwind classes ride through verbatim onto `classIds`, so there is
 * no CSS for a producer to author.
 *
 * Commerce overlays travel as `data-dukafy-*` attributes inside that same HTML
 * (see `core/htmlImport/overlayAttributes.ts`), so one payload stays one
 * payload.
 *
 * Constraint #269: no imports from editor / editor-store here.
 */

import { Type, type Static } from '@core/utils/typeboxHelpers'
import { asPlainObject } from '@core/page-tree'

const InsertEditSchema = Type.Object({
  op: Type.Literal('insert'),
  /** Node to insert INTO. Omitted means the document root. */
  parentId: Type.Optional(Type.String({ minLength: 1 })),
  index: Type.Optional(Type.Number()),
  html: Type.String({ minLength: 1 }),
})

const ReplaceEditSchema = Type.Object({
  op: Type.Literal('replace'),
  nodeId: Type.String({ minLength: 1 }),
  html: Type.String({ minLength: 1 }),
})

const DeleteEditSchema = Type.Object({
  op: Type.Literal('delete'),
  nodeId: Type.String({ minLength: 1 }),
})

/**
 * A targeted prop change. Editing one string is a common ask ("make the heading
 * say X"), and re-emitting the element as HTML to change it would throw away
 * that node's identity, its classes and its overlays.
 */
const SetPropsEditSchema = Type.Object({
  op: Type.Literal('setProps'),
  nodeId: Type.String({ minLength: 1 }),
  props: Type.Record(Type.String(), Type.Unknown()),
})

/**
 * Restyle an existing node.
 *
 * The op this design was missing, and the most obvious thing anyone asks for.
 * Tailwind classes are NOT props — they live in `node.classIds`, pointing at
 * style rules — so `setProps` could never express a restyle. Asked to "style
 * this with Tailwind", a model reached for `setProps` with a `class` key, and
 * every one of those writes landed in `props.class`, where nothing renders it.
 * Twenty-two silent no-ops reported as twenty-two applied changes.
 */
const SetClassesEditSchema = Type.Object({
  op: Type.Literal('setClasses'),
  nodeId: Type.String({ minLength: 1 }),
  /** Space-separated utility names, exactly as they appear in `class=`. */
  classes: Type.String(),
})

export const AiEditSchema = Type.Union([
  InsertEditSchema,
  ReplaceEditSchema,
  DeleteEditSchema,
  SetPropsEditSchema,
  SetClassesEditSchema,
])

export type AiEdit = Static<typeof AiEditSchema>

/** How many edits one reply may carry. A runaway generation is not a plan. */
export const MAX_EDITS_PER_REPLY = 40

function parseAiEdit(raw: unknown): AiEdit | null {
  const r = asPlainObject(raw)
  if (!r) return null

  const html = typeof r.html === 'string' ? r.html : ''
  const nodeId = typeof r.nodeId === 'string' ? r.nodeId : ''

  switch (r.op) {
    case 'insert': {
      if (html.length === 0) return null
      const index = typeof r.index === 'number' && Number.isFinite(r.index) ? r.index : undefined
      return {
        op: 'insert',
        html,
        ...(typeof r.parentId === 'string' && r.parentId.length > 0 ? { parentId: r.parentId } : {}),
        ...(index !== undefined ? { index } : {}),
      }
    }
    case 'replace':
      return nodeId.length > 0 && html.length > 0 ? { op: 'replace', nodeId, html } : null
    case 'delete':
      return nodeId.length > 0 ? { op: 'delete', nodeId } : null
    case 'setProps': {
      const props = asPlainObject(r.props)
      return nodeId.length > 0 && props ? { op: 'setProps', nodeId, props } : null
    }
    case 'setClasses': {
      // An empty string is meaningful: it strips every class off the node.
      if (nodeId.length === 0 || typeof r.classes !== 'string') return null
      return { op: 'setClasses', nodeId, classes: r.classes }
    }
    default:
      return null
  }
}

/**
 * Tolerant parse of a whole batch.
 *
 * A malformed entry is DROPPED rather than failing the reply: a model that got
 * four edits right and one wrong should still move the page four steps, and the
 * caller reports what it applied. The same choice `parseBlockExport` makes for
 * a hand-pasted block.
 *
 * Returns `[]` for anything that is not a list of edits at all.
 */
export function parseAiEdits(raw: unknown): AiEdit[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((entry) => {
    const parsed = parseAiEdit(entry)
    return parsed ? [parsed] : []
  }).slice(0, MAX_EDITS_PER_REPLY)
}

/**
 * Pull the edit batch out of a model reply.
 *
 * Models wrap JSON in prose and fenced code blocks no matter how firmly the
 * prompt asks them not to, so the reply is scanned for the first ```json fence
 * and falls back to the first balanced `{...}` containing an `"edits"` key.
 * Everything outside that is the assistant's message to the merchant.
 */
export function extractEditsFromReply(reply: string): { edits: AiEdit[]; text: string } {
  const fence = /```(?:json)?\s*([\s\S]*?)```/g
  let match: RegExpExecArray | null
  while ((match = fence.exec(reply)) !== null) {
    const body = match[1]?.trim()
    if (!body) continue

    const parsed = parseJsonLoosely(body)
    if (parsed === undefined) continue

    const container = asPlainObject(parsed)
    const edits = parseAiEdits(Array.isArray(parsed) ? parsed : container?.edits)
    if (edits.length > 0) {
      // Strip the block we consumed; what remains is the human-readable part.
      const text = (reply.slice(0, match.index) + reply.slice(fence.lastIndex)).trim()
      return { edits, text }
    }
  }
  return { edits: [], text: reply.trim() }
}

/**
 * `JSON.parse`, with one repair for a failure mode small models make constantly.
 *
 * Asked for JSON containing a long HTML string, a 7B model will reach for a
 * JavaScript template literal instead of a JSON string:
 *
 *     { "op": "insert", "html": \`<div class="p-8">…</div>\` }
 *
 * Observed on the very first commerce prompt run against qwen2.5-coder — the
 * markup and the overlay attributes were entirely correct and the whole reply
 * was discarded over the quote character. Backticks have no meaning in JSON, so
 * re-quoting a backtick-delimited VALUE cannot change the meaning of a document
 * that would otherwise have parsed; it only rescues one that would not have.
 *
 * Returns `undefined` when the text is not JSON at all (a prose or HTML fence),
 * which is different from a document that legitimately parsed to `null`.
 */
function parseJsonLoosely(body: string): unknown | undefined {
  try {
    return JSON.parse(body)
  } catch {
    // Fall through to the repair.
  }

  // Only values in value position (`: \`…\``) are touched, so a backtick
  // inside an ordinary string is left alone.
  const repaired = body.replace(/:\s*`([\s\S]*?)`/g, (_whole, value: string) => `: ${JSON.stringify(value)}`)
  if (repaired === body) return undefined

  try {
    return JSON.parse(repaired)
  } catch {
    return undefined
  }
}
