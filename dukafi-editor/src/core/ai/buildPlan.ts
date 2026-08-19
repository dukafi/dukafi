/**
 * Build plans — a structured proposal the merchant approves before any
 * HTML reaches the page.
 *
 * Assist still emits edits. Build emits this shape. Compilation to `AiEdit[]`
 * is code, so a rejected plan is cheap and a built section is not invented
 * twice. Media paths are filled by library search, never by the model.
 */

import { asPlainObject } from '@core/page-tree'
import type { AiEdit } from './editSchema'

export interface BuildMediaRef {
  description: string
  query: string
  path: string
  altText: string
  missed: boolean
}

export interface BuildBlock {
  heading: string
  body: string
  media: BuildMediaRef | null
}

export interface BuildPlan {
  title: string
  summary: string
  blocks: BuildBlock[]
}

export interface LibraryAsset {
  path: string
  filename: string
  altText: string
}

const MAX_BLOCKS = 4
const MAX_FIELD = 800

export function parseBuildPlan(reply: string): { plan: BuildPlan | null; text: string } {
  const fence = /```(?:json)?\s*([\s\S]*?)```/g
  let match: RegExpExecArray | null
  while ((match = fence.exec(reply)) !== null) {
    const body = match[1]?.trim()
    if (!body) continue
    const parsed = parseJson(body)
    const plan = planFromUnknown(parsed)
    if (plan) {
      const text = (reply.slice(0, match.index) + reply.slice(fence.lastIndex)).trim()
      return { plan, text }
    }
  }
  const loose = planFromUnknown(parseJson(reply))
  return { plan: loose, text: loose ? '' : reply.trim() }
}

export function matchLibraryAsset(query: string, library: LibraryAsset[]): LibraryAsset | null {
  const tokens = query.toLowerCase().split(/\s+/).filter((token) => token.length > 1)
  if (tokens.length === 0 || library.length === 0) return library[0] ?? null

  let best: LibraryAsset | null = null
  let bestScore = 0
  for (const asset of library) {
    const haystack = `${asset.filename} ${asset.altText} ${asset.path}`.toLowerCase()
    const score = tokens.reduce((sum, token) => sum + (haystack.includes(token) ? 1 : 0), 0)
    if (score > bestScore) {
      best = asset
      bestScore = score
    }
  }
  return bestScore > 0 ? best : null
}

export function resolvePlanMedia(plan: BuildPlan, library: LibraryAsset[]): BuildPlan {
  return {
    ...plan,
    blocks: plan.blocks.map((block) => {
      if (!block.media) return block
      const hit = matchLibraryAsset(block.media.query, library)
      if (!hit) return { ...block, media: { ...block.media, missed: true, path: '', altText: '' } }
      return {
        ...block,
        media: {
          ...block.media,
          path: hit.path,
          altText: hit.altText || block.media.description,
          missed: false,
        },
      }
    }),
  }
}

/** Compile an approved plan to one insert. The model never authors this HTML. */
export function compileBuildPlan(plan: BuildPlan): AiEdit[] {
  const parts = plan.blocks.map((block) => {
    const heading = block.heading ? `<h2 class="text-2xl font-semibold">${escapeHtml(block.heading)}</h2>` : ''
    const body = block.body ? `<p class="mt-3 text-base leading-relaxed text-gray-600">${escapeHtml(block.body)}</p>` : ''
    const image = block.media && !block.media.missed && block.media.path
      ? `<img src="${escapeHtml(block.media.path)}" alt="${escapeHtml(block.media.altText)}" class="mt-6 w-full">`
      : ''
    return `<div class="mt-10 first:mt-0">${heading}${body}${image}</div>`
  })
  const html = `<section class="mx-auto max-w-3xl px-6 py-16">${parts.join('')}</section>`
  return [{ op: 'insert', html }]
}

function planFromUnknown(raw: unknown): BuildPlan | null {
  const row = asPlainObject(raw)
  if (!row) return null
  const title = clip(row.title)
  const blocksRaw = Array.isArray(row.blocks) ? row.blocks : []
  const blocks = blocksRaw.slice(0, MAX_BLOCKS).map(blockFromUnknown).filter((block): block is BuildBlock => block !== null)
  if (title.length === 0 && blocks.length === 0) return null
  return {
    title: title || 'Section',
    summary: clip(row.summary),
    blocks,
  }
}

function blockFromUnknown(raw: unknown): BuildBlock | null {
  const row = asPlainObject(raw)
  if (!row) return null
  const heading = clip(row.heading)
  const body = clip(row.body)
  if (heading.length === 0 && body.length === 0) return null
  const mediaRow = asPlainObject(row.media)
  const media = mediaRow
    ? {
        description: clip(mediaRow.description),
        query: clip(mediaRow.query || mediaRow.description),
        path: '',
        altText: '',
        missed: true,
      }
    : null
  return { heading, body, media }
}

function clip(value: unknown): string {
  return typeof value === 'string' ? value.trim().slice(0, MAX_FIELD) : ''
}

function parseJson(body: string): unknown | undefined {
  try {
    return JSON.parse(body)
  } catch {
    return undefined
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
