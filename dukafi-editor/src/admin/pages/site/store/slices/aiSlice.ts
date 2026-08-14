/**
 * The AI assistant: conversation state, and the one path its edits take into
 * the document.
 *
 * Two rules shape this file.
 *
 * **One reply is one undo step.** The merchant asked for a change and got it
 * without a confirmation dialog, so the only thing standing between a bad
 * generation and their page is Cmd+Z — and it has to undo the WHOLE reply, not
 * the last of five edits. That is why `applyAiEdits` runs every edit inside a
 * single `mutateActiveTreeAndSite` recipe instead of calling `insertImportedNodes`
 * and friends in a loop, which would record one history entry each.
 *
 * **The model's output is never trusted.** It arrives as text, is parsed into
 * `AiEdit[]` by the same tolerant validator a hand-pasted batch would use, and
 * its HTML goes through `importHtml` — the identical pipeline behind the
 * paste-HTML UI, including `stripUnsafe`. There is no path by which a reply
 * reaches the document that a merchant pasting markup does not also take.
 */

import { apiRequest, ApiError } from '@core/http'
import { Type } from '@core/utils/typeboxHelpers'
import { importHtml } from '@core/htmlImport'
import { collectSubtreeIds, reindexNodeParents } from '@core/page-tree'
import { registry } from '@core/module-engine'
import { extractEditsFromReply, type AiEdit } from '@core/ai'
import { getErrorMessage } from '@core/utils/errorMessage'
import { pushToast } from '@ui/components/Toast'
import type { EditorStoreSliceCreator } from '@site/store/types'
import { buildSiteHelpers } from './site/helpers'
import {
  createStyleRuleOrderAllocator,
  indexStyleRulesByName,
  linkImportedClassNames,
} from './site/importLinking'
import { buildAiContext, SYSTEM_PROMPT } from '@site/ai/context'

export interface AiMessage {
  role: 'user' | 'assistant'
  content: string
  /** How many edits this reply applied. Absent on user turns. */
  applied?: number
}

const ChatResponseSchema = Type.Object({ reply: Type.String() })

interface AiSlice {
  aiMessages: AiMessage[]
  aiPending: boolean
  /** Set when the model is not configured yet, so the panel can say so. */
  aiNotConfigured: boolean
  aiError: string | null

  sendAiMessage: (text: string) => Promise<void>
  /** Apply a batch as ONE undo step. Returns how many edits landed. */
  applyAiEdits: (edits: AiEdit[]) => number
  clearAiConversation: () => void
  /** Cleared by the settings popover the moment a model is saved. */
  setAiNotConfigured: (value: boolean) => void
}

declare module '@site/store/types' {
  interface EditorStore extends AiSlice {}
}

export const createAiSlice: EditorStoreSliceCreator<AiSlice> = (set, get) => {
  const { mutateActiveTreeAndSite } = buildSiteHelpers(set, get)

  return {
    aiMessages: [],
    aiPending: false,
    aiNotConfigured: false,
    aiError: null,

    applyAiEdits: (edits) => {
      if (edits.length === 0) return 0

      let applied = 0
      mutateActiveTreeAndSite((tree, site) => {
        // Built once for the whole batch so two inserts naming the same
        // Tailwind class share one style rule instead of racing to create it.
        const classesByName = indexStyleRulesByName(site.styleRules)
        const allocateOrder = createStyleRuleOrderAllocator(site.styleRules)

        /** Merge an imported fragment's nodes in, linking its class names. */
        const absorb = (html: string): string[] => {
          const fragment = importHtml(html)
          if (fragment.rootIds.length === 0) return []
          for (const [id, node] of Object.entries(fragment.nodes)) {
            tree.nodes[id] = {
              ...node,
              classIds: linkImportedClassNames(
                node.classIds, site.styleRules, classesByName, allocateOrder,
              ),
            }
          }
          return fragment.rootIds
        }

        /** Turn a `class="…"` string into linked style-rule ids. */
        const linkClasses = (classes: string): string[] =>
          linkImportedClassNames(
            classes.split(/\s+/).filter(Boolean), site.styleRules, classesByName, allocateOrder,
          )

        /** Drop a node and everything under it, and unlink it from its parent. */
        const remove = (nodeId: string): boolean => {
          const node = tree.nodes[nodeId]
          // The root is the document; removing it would leave nothing to edit.
          if (!node || nodeId === tree.rootNodeId) return false
          const parent = Object.values(tree.nodes).find((c) => c.children.includes(nodeId))
          if (parent) parent.children = parent.children.filter((id) => id !== nodeId)
          for (const id of collectSubtreeIds(tree.nodes, nodeId)) delete tree.nodes[id]
          return true
        }

        for (const edit of edits) {
          switch (edit.op) {
            case 'insert': {
              const parentId = edit.parentId ?? tree.rootNodeId
              const parent = tree.nodes[parentId]
              if (!parent) break
              // Same rule the manual insert path applies: only the document
              // root and container-like modules accept children.
              const accepts =
                parentId === tree.rootNodeId ||
                registry.get(parent.moduleId)?.canHaveChildren === true
              if (!accepts) break

              const roots = absorb(edit.html)
              if (roots.length === 0) break
              const at = edit.index ?? parent.children.length
              parent.children.splice(Math.max(0, Math.min(at, parent.children.length)), 0, ...roots)
              applied += 1
              break
            }
            case 'replace': {
              const target = tree.nodes[edit.nodeId]
              if (!target || edit.nodeId === tree.rootNodeId) break
              const parent = Object.values(tree.nodes).find((c) => c.children.includes(edit.nodeId))
              if (!parent) break

              const roots = absorb(edit.html)
              if (roots.length === 0) break
              const at = parent.children.indexOf(edit.nodeId)
              parent.children.splice(at, 1, ...roots)
              for (const id of collectSubtreeIds(tree.nodes, edit.nodeId)) delete tree.nodes[id]
              applied += 1
              break
            }
            case 'delete':
              if (remove(edit.nodeId)) applied += 1
              break
            case 'setClasses': {
              const target = tree.nodes[edit.nodeId]
              if (!target) break
              target.classIds = linkClasses(edit.classes)
              applied += 1
              break
            }
            case 'setProps': {
              const target = tree.nodes[edit.nodeId]
              if (!target) break

              // A model asked to restyle reaches for `setProps` with a `class`
              // key no matter what the prompt says — it is what HTML looks
              // like. Written straight through it lands in `props.class`,
              // which nothing renders: a silent no-op counted as a change.
              // Routed here instead, so the obvious phrasing works.
              const { class: classProp, className, ...rest } = edit.props
              const classes = typeof classProp === 'string' ? classProp
                : typeof className === 'string' ? className : null
              if (classes !== null) target.classIds = linkClasses(classes)
              if (Object.keys(rest).length > 0) target.props = { ...target.props, ...rest }
              applied += 1
              break
            }
          }
        }

        if (applied === 0) return false
        // Nodes were bulk-merged rather than inserted one at a time, so derive
        // the parent index across the tree — the same choice
        // `insertImportedNodes` makes for the same reason.
        reindexNodeParents(tree.nodes)
        return true
      })

      return applied
    },

    sendAiMessage: async (text) => {
      const trimmed = text.trim()
      if (trimmed.length === 0 || get().aiPending) return

      const history = [...get().aiMessages, { role: 'user' as const, content: trimmed }]
      set({ aiMessages: history, aiPending: true, aiError: null, aiNotConfigured: false })

      try {
        const { reply } = await apiRequest('/admin/api/cms/ai/chat', {
          method: 'POST',
          body: {
            messages: [
              { role: 'system', content: SYSTEM_PROMPT },
              // The page snapshot rides on the latest user turn rather than the
              // system prompt so it reflects the document as it is NOW, after
              // any edits earlier in this conversation already landed.
              ...history.slice(0, -1).map((m) => ({ role: m.role, content: m.content })),
              { role: 'user', content: `${buildAiContext(get())}\n\n${trimmed}` },
            ],
          },
          schema: ChatResponseSchema,
          fallbackMessage: 'The assistant could not answer',
        })

        const { edits, text: prose } = extractEditsFromReply(reply)
        const applied = get().applyAiEdits(edits)

        set((state) => ({
          aiPending: false,
          aiMessages: [...state.aiMessages, {
            role: 'assistant',
            content: prose.length > 0 ? prose : 'Done.',
            ...(applied > 0 ? { applied } : {}),
          }],
        }))

        if (applied > 0) {
          pushToast({
            kind: 'success',
            title: applied === 1 ? 'Applied 1 change' : `Applied ${applied} changes`,
            body: 'Press Cmd+Z to undo.',
            location: 'site-editor',
          })
        }
      } catch (error) {
        // 409 is the one failure the merchant can fix themselves, so it gets
        // its own state rather than a generic error line.
        const notConfigured = error instanceof ApiError && error.status === 409
        set({
          aiPending: false,
          aiNotConfigured: notConfigured,
          aiError: notConfigured ? null : getErrorMessage(error, 'Something went wrong.'),
        })
      }
    },

    clearAiConversation: () => set({ aiMessages: [], aiError: null, aiNotConfigured: false }),

    setAiNotConfigured: (value) => set({ aiNotConfigured: value }),
  }
}
