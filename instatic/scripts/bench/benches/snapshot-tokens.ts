/**
 * Agent read-surface token benchmark — JSON snapshot vs read_document.
 *
 * Before the HTML read surface landed, the site-editor agent read a page as
 * structured JSON: `inspect_page` (the full node tree) + `list_classes` (CSS
 * classes) + `list_tokens` (design tokens), each `JSON.stringify`'d verbatim
 * into a tool_result. This bench measures the exact token cost of that legacy
 * payload against the surface that replaced it — the first size-budgeted
 * `read_document` result for the same page, rendered as clean HTML annotated with
 * `uid` on each tag plus page-relevant CSS — and stays on as a regression
 * guard so the win can't silently erode.
 *
 * Fairness guarantees:
 * - JSON side is rebuilt by a local `flattenForBench` that reproduces the old
 *   `buildPageSnapshot` mapping (the same node/class/token shapes the deleted
 *   JSON tools emitted) and assembled into the exact three tool payloads.
 * - read_document side uses `renderAgentDocument(...)` — the real `read_document` path,
 *   not an estimate.
 * - Tokens are counted with Anthropic `count_tokens` (model-accurate).
 *
 * Fixtures are the real seeded pages in `.tmp/dev.db` (the `bun run dev`
 * default), so the numbers reflect production payloads, not synthetic trees.
 */

import { resolve } from 'node:path'
import { existsSync } from 'node:fs'
import type { Page, SiteDocument } from '@core/page-tree'
import type { DataRow } from '@core/data/schemas'
import { describeFrameworkTokens } from '@core/framework'
import { describeFontTokens } from '@core/fonts'
import type { BenchModule, BenchResult, BenchRow, BenchSection, BenchContext } from '../lib/types'
import { fmtNum } from '../lib/stats'
import { log } from '../lib/log'
import { createTokenCounter, type TokenCounter } from '../lib/anthropicTokens'

const REPO_ROOT = resolve(import.meta.dir, '../../..')
const DEV_DB_PATH = resolve(REPO_ROOT, '.tmp/dev.db')

// Pacing between count_tokens calls so a big site doesn't trip provider rate limits.
const COUNT_DELAY_MS = 120

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

async function loadDeps() {
  // Register the base modules so read_document can render real pages.
  await import('../../../src/modules/base')
  const { createSqliteClient } = await import('../../../server/db/sqlite')
  const { getDraftSite } = await import('../../../server/repositories/site')
  const { listDataRows } = await import('../../../server/repositories/data/rows')
  const { pageFromRow } = await import('../../../src/core/data/pageFromRow')
  const { visualComponentFromRow } = await import('../../../src/core/data/componentFromRow')
  const { validateVisualComponents } = await import('../../../src/core/persistence/validate')
  const { renderAgentDocument } = await import('../../../src/core/ai')
  const { registry } = await import('../../../src/core/module-engine')
  return {
    createSqliteClient,
    getDraftSite,
    listDataRows,
    pageFromRow,
    visualComponentFromRow,
    validateVisualComponents,
    renderAgentDocument,
    registry,
  }
}

type Deps = Awaited<ReturnType<typeof loadDeps>>

// ---------------------------------------------------------------------------
// Local flattener — reproduces the deleted `buildPageSnapshot` mapping for the
// fields this bench counts (nodes / classes / tokens). Kept inline so the
// JSON-vs-HTML comparison survives the read-surface swap as a regression guard.
// ---------------------------------------------------------------------------

interface BenchSnapshot {
  pageId: string
  pageTitle: string
  rootNodeId: string
  selectedNodeId: string | null
  activeBreakpointId: string
  breakpoints: SiteDocument['breakpoints']
  nodes: Array<{
    id: string
    moduleId: string
    label?: string
    parentId: string | null
    children: string[]
    props: Record<string, unknown>
    breakpointOverrides: Record<string, Record<string, unknown>>
    classIds: string[]
  }>
  classes: Array<{
    id: string
    name: string
    styles: Record<string, unknown>
    breakpointStyles: Record<string, Record<string, unknown>>
    generated?: string
  }>
  tokens: ReturnType<typeof describeFrameworkTokens> & {
    fonts: ReturnType<typeof describeFontTokens>
  }
}

function serializableRecord(record: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(record)) out[k] = serializableValue(v)
  return out
}

function serializableValue(value: unknown): unknown {
  if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) return value
  if (Array.isArray(value)) return value.map(serializableValue)
  if (typeof value === 'object' && value) return serializableRecord(value as Record<string, unknown>)
  return String(value)
}

function serializableBreakpointRecords(
  records: Record<string, Partial<Record<string, unknown>>>,
): Record<string, Record<string, unknown>> {
  const out: Record<string, Record<string, unknown>> = {}
  for (const [bp, styles] of Object.entries(records)) {
    out[bp] = serializableRecord((styles ?? {}) as Record<string, unknown>)
  }
  return out
}

function flattenForBench(
  page: Page,
  site: SiteDocument,
  options: { selectedNodeId: string | null; activeBreakpointId: string },
): BenchSnapshot {
  const parentMap: Record<string, string | null> = {}
  for (const node of Object.values(page.nodes)) {
    for (const childId of node.children) parentMap[childId] = node.id
    if (!parentMap[node.id]) parentMap[node.id] = null
  }

  const nodes = Object.values(page.nodes).map((node) => ({
    id: node.id,
    moduleId: node.moduleId,
    label: node.label,
    parentId: parentMap[node.id] ?? null,
    children: node.children,
    props: node.props,
    breakpointOverrides: serializableBreakpointRecords(node.breakpointOverrides ?? {}),
    classIds: node.classIds ?? [],
  }))

  const breakpointIds = new Set(site.breakpoints.map((bp) => bp.id))
  const classes = Object.values(site.styleRules ?? {}).map((c) => {
    const breakpointStyles: Record<string, Record<string, unknown>> = {}
    for (const [contextId, bag] of Object.entries(c.contextStyles ?? {})) {
      if (breakpointIds.has(contextId)) breakpointStyles[contextId] = bag as Record<string, unknown>
    }
    return {
      id: c.id,
      name: c.name,
      styles: serializableRecord(c.styles ?? {}),
      breakpointStyles: serializableBreakpointRecords(breakpointStyles),
      ...(c.generated ? { generated: c.generated.family } : {}),
    }
  })

  return {
    pageId: page.id,
    pageTitle: page.title,
    rootNodeId: page.rootNodeId,
    selectedNodeId: options.selectedNodeId,
    activeBreakpointId: options.activeBreakpointId,
    breakpoints: site.breakpoints,
    nodes,
    classes,
    tokens: {
      ...describeFrameworkTokens(site.settings.framework),
      fonts: describeFontTokens(site.settings.fonts),
    },
  }
}

/** Assemble the full draft SiteDocument (shell + pages + VCs) from the dev DB. */
async function loadSeededSite(deps: Deps): Promise<SiteDocument | null> {
  const db = deps.createSqliteClient(DEV_DB_PATH)
  const shell = await deps.getDraftSite(db)
  if (!shell) return null
  const [pageRows, vcRows] = await Promise.all([
    deps.listDataRows(db, 'pages'),
    deps.listDataRows(db, 'components'),
  ])
  const pages = pageRows.map(deps.pageFromRow)
  const visualComponents = deps.validateVisualComponents(
    vcRows.flatMap((r: DataRow) => {
      const vc = deps.visualComponentFromRow(r)
      return vc ? [vc] : []
    }),
  )
  return { ...shell, pages, visualComponents }
}

/** Pick the editor's default active breakpoint id for a site. */
function defaultBreakpointId(site: SiteDocument): string {
  const ids = site.breakpoints.map((b) => b.id)
  return ids.includes('desktop') ? 'desktop' : (ids[ids.length - 1] ?? '')
}

interface PageSerializations {
  /** JSON.stringify of the three tool payloads, byte-accurate to the wire. */
  jsonTree: string
  jsonClasses: string
  jsonTokens: string
  /** JSON.stringify of the live read_document result, including pageInfo metadata. */
  readDocumentPayload: string
  /** Annotated body HTML from the returned read_document part. */
  htmlBody: string
  /**
   * The page-relevant CSS returned by `read_document`, wrapped in a `<style>`
   * block. Counting the wrapper keeps the read_document side honest: it is the
   * self-contained artifact the agent sees in the tool result.
   */
  css: string
  readDocumentParts: number
  readDocumentSerializedChars: number
  /** Fidelity findings for the report. */
  nodeCount: number
  annotatedTags: number
  nodesWithBreakpointOverrides: number
  /** `@media` breakpoint blocks present in the counted CSS (fairness evidence). */
  cssMediaBlocks: number
}

/** Build both representations for a single page. */
function serializePage(deps: Deps, site: SiteDocument, page: Page): PageSerializations {
  const snapshot = flattenForBench(page, site, {
    selectedNodeId: null,
    activeBreakpointId: defaultBreakpointId(site),
  })

  // JSON side — exactly the three tool payloads the deleted JSON read tools
  // stringified into tool_result blocks.
  const jsonTree = JSON.stringify({
    page: {
      pageId: snapshot.pageId,
      pageTitle: snapshot.pageTitle,
      rootNodeId: snapshot.rootNodeId,
      selectedNodeId: snapshot.selectedNodeId,
      activeBreakpointId: snapshot.activeBreakpointId,
      breakpoints: snapshot.breakpoints,
      nodes: snapshot.nodes,
    },
  })
  const jsonClasses = JSON.stringify({ classes: snapshot.classes })
  const jsonTokens = JSON.stringify({ tokens: snapshot.tokens })

  // read_document side — the live read_document path. It renders the body with uid
  // annotations, cleans pathological strings, applies the hard size budget,
  // and returns page-relevant CSS only.
  const readDocument = deps.renderAgentDocument(page, site, deps.registry)
  const { html: htmlBody, css, pageInfo } = readDocument
  const readDocumentPayload = JSON.stringify(readDocument)
  const cssMediaBlocks = (css.match(/@media/g) ?? []).length

  const annotatedTags = (htmlBody.match(/uid="/g) ?? []).length
  const nodesWithBreakpointOverrides = snapshot.nodes.filter(
    (n) => Object.keys(n.breakpointOverrides ?? {}).length > 0,
  ).length

  return {
    jsonTree,
    jsonClasses,
    jsonTokens,
    readDocumentPayload,
    htmlBody,
    css,
    readDocumentParts: pageInfo.totalParts,
    readDocumentSerializedChars: pageInfo.serializedChars,
    nodeCount: snapshot.nodes.length,
    annotatedTags,
    nodesWithBreakpointOverrides,
    cssMediaBlocks,
  }
}

interface PageTokenRow {
  title: string
  slug: string
  nodeCount: number
  jsonTreeTokens: number
  jsonClassesTokens: number
  jsonTokensTokens: number
  readDocumentTokens: number
  readDocumentParts: number
  readDocumentSerializedChars: number
  annotatedTags: number
  nodesWithBreakpointOverrides: number
  cssMediaBlocks: number
}

async function countPage(
  counter: TokenCounter,
  title: string,
  slug: string,
  s: PageSerializations,
): Promise<PageTokenRow> {
  // Sequential with pacing — respects provider rate limits; the counter caches
  // identical strings so repeats are free.
  const jsonTreeTokens = await counter.count(s.jsonTree)
  await sleep(COUNT_DELAY_MS)
  const jsonClassesTokens = await counter.count(s.jsonClasses)
  await sleep(COUNT_DELAY_MS)
  const jsonTokensTokens = await counter.count(s.jsonTokens)
  await sleep(COUNT_DELAY_MS)
  const readDocumentTokens = await counter.count(s.readDocumentPayload)
  await sleep(COUNT_DELAY_MS)
  return {
    title,
    slug,
    nodeCount: s.nodeCount,
    jsonTreeTokens,
    jsonClassesTokens,
    jsonTokensTokens,
    readDocumentTokens,
    readDocumentParts: s.readDocumentParts,
    readDocumentSerializedChars: s.readDocumentSerializedChars,
    annotatedTags: s.annotatedTags,
    nodesWithBreakpointOverrides: s.nodesWithBreakpointOverrides,
    cssMediaBlocks: s.cssMediaBlocks,
  }
}

function ratio(html: number, json: number): string {
  if (json === 0) return '—'
  return `${(html / json).toFixed(2)}×`
}

function buildReport(rows: PageTokenRow[], model: string): BenchResult {
  const totalJson = rows.reduce(
    (a, r) => a + r.jsonTreeTokens + r.jsonClassesTokens + r.jsonTokensTokens,
    0,
  )
  const totalReadDocument = rows.reduce((a, r) => a + r.readDocumentTokens, 0)

  const perPage: BenchRow[] = rows.map((r) => {
    const json = r.jsonTreeTokens + r.jsonClassesTokens + r.jsonTokensTokens
    const html = r.readDocumentTokens
    return {
      label: `${r.title} (/${r.slug})`,
      inputs: { nodes: r.nodeCount },
      metrics: {
        json: fmtNum(json),
        'json (tree/cls/tok)': `${fmtNum(r.jsonTreeTokens)}/${fmtNum(r.jsonClassesTokens)}/${fmtNum(r.jsonTokensTokens)}`,
        read_document: fmtNum(html),
        parts: fmtNum(r.readDocumentParts),
        chars: fmtNum(r.readDocumentSerializedChars),
        delta: fmtNum(html - json),
        ratio: ratio(html, json),
      },
      notes:
        r.nodesWithBreakpointOverrides > 0
          ? `${r.annotatedTags} tag(s) annotated; CSS carries ${r.cssMediaBlocks} @media block(s); ${r.nodesWithBreakpointOverrides} node(s) also carry per-node prop overrides only the JSON tree shows.`
          : `${r.annotatedTags} tag(s) annotated; CSS carries ${r.cssMediaBlocks} @media block(s).`,
    }
  })

  // Highlights: biggest win/loss + aggregate fidelity caveats.
  const byDelta = [...rows].sort(
    (a, b) =>
      a.readDocumentTokens - (a.jsonTreeTokens + a.jsonClassesTokens + a.jsonTokensTokens) -
      (b.readDocumentTokens - (b.jsonTreeTokens + b.jsonClassesTokens + b.jsonTokensTokens)),
  )
  const totalOverrides = rows.reduce((a, r) => a + r.nodesWithBreakpointOverrides, 0)
  const totalNodes = rows.reduce((a, r) => a + r.nodeCount, 0)
  const totalAnnotated = rows.reduce((a, r) => a + r.annotatedTags, 0)
  const totalMediaBlocks = rows.reduce((a, r) => a + r.cssMediaBlocks, 0)

  const highlights: string[] = [
    `Aggregate: read_document part 1 is ${ratio(totalReadDocument, totalJson)} the JSON token cost (${fmtNum(totalReadDocument)} vs ${fmtNum(totalJson)} across ${rows.length} page(s)).`,
  ]
  if (byDelta.length > 0) {
    const best = byDelta[0]
    const worst = byDelta[byDelta.length - 1]
    const bj = best.jsonTreeTokens + best.jsonClassesTokens + best.jsonTokensTokens
    const wj = worst.jsonTreeTokens + worst.jsonClassesTokens + worst.jsonTokensTokens
    highlights.push(
      `Biggest read_document win: ${best.title} (${ratio(best.readDocumentTokens, bj)}).`,
      `Smallest read_document win / biggest loss: ${worst.title} (${ratio(worst.readDocumentTokens, wj)}).`,
    )
  }
  highlights.push(
    `Fairness — read_document CSS is counted inside a <style> block with class rules AND ${totalMediaBlocks} @media breakpoint block(s) (per-page count, the import-engine representation); both sides therefore carry breakpoint styling.`,
    `Fidelity caveats — ${totalAnnotated}/${totalNodes} page nodes annotated in HTML (rest are base.body / hidden / dynamic / wrapper-less); ${totalOverrides} node(s) carry per-breakpoint prop overrides that live in the JSON tree but not in the read_document CSS (responsive styling that flows through included class @media blocks is counted).`,
  )

  const section: BenchSection = {
    title: 'Per-page token cost — JSON snapshot vs read_document',
    intro:
      'JSON = inspect_page + list_classes + list_tokens (exact tool_result bytes). read_document = the live size-budgeted part 1 tool result, including pageInfo metadata, annotated HTML, and page-relevant CSS. Lower read_document ratio means the first read is cheaper.',
    highlights,
    rows: perPage,
  }

  return {
    name: 'snapshot-tokens',
    title: 'Agent read-surface tokens (JSON vs read_document)',
    headline: {
      'JSON tokens (total)': fmtNum(totalJson),
      'read_document tokens (total)': fmtNum(totalReadDocument),
      'read_document/JSON ratio': ratio(totalReadDocument, totalJson),
      model,
    },
    sections: [section],
  }
}

function skippedResult(title: string, reason: string, instructions: string[]): BenchResult {
  log.warn(reason)
  return {
    name: 'snapshot-tokens',
    title: 'Agent read-surface tokens (JSON vs read_document)',
    headline: { status: 'skipped' },
    sections: [
      {
        title,
        intro: reason,
        rows: [],
        highlights: instructions,
      },
    ],
  }
}

export const snapshotTokensBench: BenchModule = {
  name: 'snapshot-tokens',
  title: 'Agent read-surface tokens (JSON vs read_document)',
  description:
    'Compares the token cost of the legacy JSON page snapshot against the live size-budgeted read_document result, using Anthropic count_tokens on real seeded pages.',

  async run(_ctx: BenchContext): Promise<BenchResult> {
    const counter = createTokenCounter()
    if (!counter.available) {
      return skippedResult(
        'Skipped — no ANTHROPIC_API_KEY',
        'count_tokens needs an Anthropic API key; the benchmark measures exact, model-accurate token counts.',
        [
          'Set ANTHROPIC_API_KEY in your environment, then re-run `bun run bench --only=snapshot-tokens`.',
        ],
      )
    }

    if (!existsSync(DEV_DB_PATH)) {
      return skippedResult(
        'Skipped — no seeded dev database',
        `Expected a SQLite dev DB at ${DEV_DB_PATH}.`,
        ['Run `bun run dev` once to seed a dev database, then re-run this bench.'],
      )
    }

    log.step('Loading base modules + seeded site from .tmp/dev.db')
    const deps = await loadDeps()
    const site = await loadSeededSite(deps)
    if (!site || site.pages.length === 0) {
      return skippedResult(
        'Skipped — empty dev database',
        'The dev DB has no draft site or no pages.',
        ['Open the editor (`bun run dev`) and create at least one page, then re-run this bench.'],
      )
    }

    log.ok(`Loaded ${site.pages.length} page(s) + ${site.visualComponents.length} visual component(s)`)
    const model = counter.model

    const rows: PageTokenRow[] = []
    for (const page of site.pages) {
      log.step(`Serializing + counting "${page.title}"`)
      const serial = serializePage(deps, site, page)
      const row = await countPage(counter, page.title, page.slug, serial)
      rows.push(row)
      const json = row.jsonTreeTokens + row.jsonClassesTokens + row.jsonTokensTokens
      const readDocument = row.readDocumentTokens
      log.detail(`json ${fmtNum(json)} tok · read_document ${fmtNum(readDocument)} tok · ${ratio(readDocument, json)}`)
    }

    log.ok(`Counted ${rows.length} page(s) against ${model}`)
    return buildReport(rows, model)
  },
}
