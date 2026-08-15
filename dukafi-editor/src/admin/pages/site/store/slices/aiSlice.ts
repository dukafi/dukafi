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
import { applyEditsToTree, extractEditsFromReply, type AiEdit } from '@core/ai'
import { getErrorMessage } from '@core/utils/errorMessage'
import { pushToast } from '@ui/components/Toast'
import type { EditorStoreSliceCreator } from '@site/store/types'
import { buildSiteHelpers } from './site/helpers'
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

      // ONE `mutateActiveTreeAndSite` recipe for the whole batch, so a reply
      // that lands five edits is a single Cmd+Z rather than five. The edits
      // themselves are applied by `applyEditsToTree`, which is shared with the
      // headless write path and knows nothing about undo.
      let applied = 0
      mutateActiveTreeAndSite((tree, site) => {
        applied = applyEditsToTree(tree, site, edits)
        return applied > 0
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
