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
 *
 * Build is a second, optional path: plan JSON, merchant approval, then the
 * same `applyAiEdits`. Send (Assist) is unchanged. Neither path requires a
 * hosted Dukafi AI account — both use the merchant's configured model.
 */

import { apiRequest, ApiError } from '@core/http'
import { Type } from '@core/utils/typeboxHelpers'
import { streamAiRun } from '@site/ai/harnessRun'
import { refreshSiteFromServer } from '@site/sync/refreshSiteFromServer'
import {
  applyEditsToTree,
  compileBuildPlan,
  extractEditsFromReply,
  parseBuildPlan,
  resolvePlanMedia,
  type AiEdit,
  type BuildPlan,
  type LibraryAsset,
} from '@core/ai'
import { getErrorMessage } from '@core/utils/errorMessage'
import { pushToast } from '@ui/components/Toast'
import type { EditorStoreSliceCreator } from '@site/store/types'
import { buildSiteHelpers } from './site/helpers'
import { buildAiContext, SYSTEM_PROMPT } from '@site/ai/context'
import { BUILD_PROMPT } from '@site/ai/buildPrompt'

export interface AiMessage {
  role: 'user' | 'assistant'
  content: string
  kind?: 'activity' | 'reply'
  /** How many edits this reply applied. Absent on user turns. */
  applied?: number
}

export interface AiProfileDraft {
  startedOn: string
  audience: string
  difference: string
}

const ChatResponseSchema = Type.Object({ reply: Type.String() })
const AiConfigSchema = Type.Object({
  baseUrl: Type.String(),
  model: Type.String(),
  hasKey: Type.Boolean(),
  provider: Type.Optional(Type.String()),
  harnessUrl: Type.Optional(Type.String()),
  connected: Type.Optional(Type.Boolean()),
})
const ProfileEnvelopeSchema = Type.Object({
  profile: Type.Object({
    startedOn: Type.String(),
    audience: Type.String(),
    difference: Type.String(),
    thin: Type.Boolean(),
  }),
})
const MediaAssetSchema = Type.Object({
  id: Type.String(),
  path: Type.String(),
  filename: Type.String(),
  altText: Type.String(),
})
const StoreContextSchema = Type.Object({
  store: Type.Object({ name: Type.String(), currency: Type.String() }),
  profile: Type.Object({
    startedOn: Type.String(),
    audience: Type.String(),
    difference: Type.String(),
    thin: Type.Boolean(),
  }),
  products: Type.Object({
    total: Type.Number(),
    sample: Type.Array(Type.Object({
      slug: Type.String(),
      title: Type.String(),
      status: Type.String(),
      hasImage: Type.Boolean(),
    })),
  }),
  media: Type.Object({
    total: Type.Number(),
    sample: Type.Array(MediaAssetSchema),
  }),
}, { additionalProperties: true })
const MediaSearchSchema = Type.Object({ media: Type.Array(MediaAssetSchema) })

interface AiSlice {
  aiMessages: AiMessage[]
  aiPending: boolean
  aiNotConfigured: boolean
  aiError: string | null
  aiNeedProfile: boolean
  aiBuildRequest: string | null
  aiPlan: BuildPlan | null
  aiPlanNote: string | null
  aiProvider: string
  aiConnected: boolean

  refreshAiConfig: () => Promise<void>
  sendAiMessage: (text: string) => Promise<void>
  startAiBuild: (text: string) => Promise<void>
  submitAiProfile: (draft: AiProfileDraft) => Promise<void>
  applyAiPlan: () => void
  cancelAiPlan: () => void
  applyAiEdits: (edits: AiEdit[]) => number
  clearAiConversation: () => void
  setAiNotConfigured: (value: boolean) => void
}

declare module '@site/store/types' {
  interface EditorStore extends AiSlice {}
}

export const createAiSlice: EditorStoreSliceCreator<AiSlice> = (set, get) => {
  const { mutateActiveTreeAndSite } = buildSiteHelpers(set, get)

  async function runBuildPlan(request: string) {
    const context = await apiRequest('/admin/api/cms/store-context', {
      schema: StoreContextSchema,
      fallbackMessage: 'Could not load the store',
    })
    const { reply } = await apiRequest('/admin/api/cms/ai/chat', {
      method: 'POST',
      body: {
        messages: [
          { role: 'system', content: BUILD_PROMPT },
          { role: 'user', content: `Store context:\n${JSON.stringify(context)}\n\nMerchant request:\n${request}` },
        ],
      },
      schema: ChatResponseSchema,
      fallbackMessage: 'The assistant could not answer',
    })
    const { plan, text } = parseBuildPlan(reply)
    if (!plan) {
      set({
        aiPending: false,
        aiError: 'The model did not return a usable plan. Try again, or use Send for a small edit.',
      })
      return
    }
    const library: LibraryAsset[] = context.media.sample.map((asset) => ({
      path: asset.path,
      filename: asset.filename,
      altText: asset.altText,
    }))
    const queries = [...new Set(plan.blocks.flatMap((block) => (block.media?.query ? [block.media.query] : [])))]
    for (const query of queries) {
      const { media } = await apiRequest('/admin/api/cms/store-media', {
        query: { q: query },
        schema: MediaSearchSchema,
        fallbackMessage: 'Could not search media',
      })
      for (const asset of media) {
        library.push({ path: asset.path, filename: asset.filename, altText: asset.altText })
      }
    }
    set({
      aiPending: false,
      aiPlan: resolvePlanMedia(plan, library),
      aiPlanNote: text,
    })
  }

  return {
    aiMessages: [],
    aiPending: false,
    aiNotConfigured: false,
    aiError: null,
    aiNeedProfile: false,
    aiBuildRequest: null,
    aiPlan: null,
    aiPlanNote: null,
    aiProvider: '',
    aiConnected: false,

    refreshAiConfig: async () => {
      try {
        const config = await apiRequest('/admin/api/cms/ai/config', {
          schema: AiConfigSchema,
          fallbackMessage: 'Could not read the AI settings',
        })
        set({
          aiProvider: config.provider || '',
          aiConnected: Boolean(config.connected),
        })
      } catch {
        // Send still works if this fails; the run endpoint reports the real reason.
      }
    },

    applyAiEdits: (edits) => {
      if (edits.length === 0) return 0

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

      if (await isDukafiProvider(get, set)) {
        await runHarnessWalk(get, set, trimmed, 'landing')
        return
      }

      try {
        const { reply } = await apiRequest('/admin/api/cms/ai/chat', {
          method: 'POST',
          body: {
            messages: [
              { role: 'system', content: SYSTEM_PROMPT },
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
        failAi(set, error)
      }
    },

    startAiBuild: async (text) => {
      const trimmed = text.trim()
      if (trimmed.length === 0 || get().aiPending) return

      const history = [...get().aiMessages, { role: 'user' as const, content: trimmed }]
      set({
        aiMessages: history,
        aiPending: true,
        aiError: null,
        aiNotConfigured: false,
        aiNeedProfile: false,
        aiPlan: null,
        aiPlanNote: null,
        aiBuildRequest: trimmed,
      })

      if (await isDukafiProvider(get, set)) {
        await runHarnessWalk(get, set, trimmed, 'landing')
        return
      }

      try {
        const { profile } = await apiRequest('/admin/api/cms/store-profile', {
          schema: ProfileEnvelopeSchema,
          fallbackMessage: 'Could not load the business profile',
        })
        if (profile.thin) {
          set({ aiPending: false, aiNeedProfile: true })
          return
        }
        await runBuildPlan(trimmed)
      } catch (error) {
        failAi(set, error)
      }
    },

    submitAiProfile: async (draft) => {
      const request = get().aiBuildRequest
      if (!request || get().aiPending) return
      set({ aiPending: true, aiError: null })
      try {
        await apiRequest('/admin/api/cms/store-profile', {
          method: 'PUT',
          body: draft,
          fallbackMessage: 'Could not save the business profile',
        })
        set({ aiNeedProfile: false })
        await runBuildPlan(request)
      } catch (error) {
        failAi(set, error)
      }
    },

    applyAiPlan: () => {
      const plan = get().aiPlan
      if (!plan || get().aiPending) return
      const applied = get().applyAiEdits(compileBuildPlan(plan))
      const note = get().aiPlanNote
      set((state) => ({
        aiPlan: null,
        aiPlanNote: null,
        aiBuildRequest: null,
        aiNeedProfile: false,
        aiMessages: [...state.aiMessages, {
          role: 'assistant',
          content: note && note.length > 0 ? note : 'Added the section.',
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
    },

    cancelAiPlan: () => set({
      aiNeedProfile: false,
      aiBuildRequest: null,
      aiPlan: null,
      aiPlanNote: null,
      aiError: null,
    }),

    clearAiConversation: () => set({
      aiMessages: [],
      aiError: null,
      aiNotConfigured: false,
      aiNeedProfile: false,
      aiBuildRequest: null,
      aiPlan: null,
      aiPlanNote: null,
    }),

    setAiNotConfigured: (value) => set({ aiNotConfigured: value }),
  }
}

async function isDukafiProvider(
  get: () => { aiProvider: string },
  set: (partial: { aiProvider?: string; aiConnected?: boolean }) => void,
): Promise<boolean> {
  if (get().aiProvider === 'dukafi') return true
  if (get().aiProvider) return false
  try {
    const config = await apiRequest('/admin/api/cms/ai/config', {
      schema: AiConfigSchema,
      fallbackMessage: 'Could not read the AI settings',
    })
    set({
      aiProvider: config.provider || '',
      aiConnected: Boolean(config.connected),
    })
    return config.provider === 'dukafi'
  } catch {
    return false
  }
}

async function runHarnessWalk(
  get: () => { site: { pages: Array<{ id: string; slug: string }> } | null; activePageId: string | null },
  set: (
    partial:
      | { aiPending: boolean; aiNotConfigured: boolean; aiError: string | null }
      | ((state: { aiMessages: AiMessage[] }) => { aiMessages: AiMessage[]; aiPending?: boolean }),
  ) => void,
  prompt: string,
  mode: string,
): Promise<void> {
  const page = get().site?.pages.find((candidate) => candidate.id === get().activePageId)
  const slug = page?.slug || 'index'
  try {
    const done = await streamAiRun({
      prompt,
      slug,
      mode,
      onActivity: (event) => {
        if (event.phase === 'gather' || event.phase === 'brief') return
        set((state) => ({
          aiMessages: [...state.aiMessages, {
            role: 'assistant',
            kind: 'activity',
            content: event.message,
          }],
        }))
      },
    })
    if (done.changed === false) {
      set((state) => ({
        aiPending: false,
        aiMessages: [...state.aiMessages, {
          role: 'assistant',
          kind: 'reply',
          content: done.reply?.trim()
            || 'Say what you want changed on this page.',
        }],
      }))
      return
    }
    await refreshSiteFromServer()
    set((state) => ({
      aiPending: false,
      aiMessages: [...state.aiMessages, {
        role: 'assistant',
        kind: 'reply',
        content: 'Draft updated. Publish when you are ready.',
      }],
    }))
  } catch (error) {
    failAi(set, error)
  }
}

function failAi(set: (partial: { aiPending: boolean; aiNotConfigured: boolean; aiError: string | null }) => void, error: unknown) {
  const notConfigured = error instanceof ApiError && error.status === 409
  set({
    aiPending: false,
    aiNotConfigured: notConfigured,
    aiError: notConfigured ? null : getErrorMessage(error, 'Something went wrong.'),
  })
}
