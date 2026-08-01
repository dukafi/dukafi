/**
 * Bundle composition benchmark.
 *
 * Reads `dist/` (assumes `bun run build` ran) and computes:
 *   - Total raw + gzipped + brotli'd JS / CSS
 *   - The eager first-paint payload (everything tagged as
 *     modulepreload/script/link in dist/index.html)
 *   - Top 10 heaviest chunks by raw bytes
 *   - Vite "lazy boundary" chunks (CodeMirror, AdminCanvasLayout, etc.)
 *     and how much they would have cost if eager
 *
 * Does NOT run the build itself — that's the job of the orchestrator
 * if/when the user opts into a build benchmark. Bench startup stays fast
 * if a recent dist is already on disk.
 */
import { resolve } from 'node:path'
import { readdirSync, statSync, existsSync, readFileSync } from 'node:fs'
import { gzipSync, brotliCompressSync } from 'node:zlib'
import type { BenchModule, BenchResult, BenchRow } from '../lib/types'
import { fmtBytes } from '../lib/stats'
import { log } from '../lib/log'

const REPO_ROOT = resolve(import.meta.dir, '../../..')
const DIST = resolve(REPO_ROOT, 'dist')
const DIST_ASSETS = resolve(DIST, 'assets')
const DIST_INDEX_HTML = resolve(DIST, 'index.html')

interface ChunkInfo {
  filename: string
  path: string
  raw: number
  gz: number
  br: number
  kind: 'js' | 'css' | 'other'
}

function listChunks(): ChunkInfo[] {
  if (!existsSync(DIST_ASSETS)) return []
  const out: ChunkInfo[] = []
  for (const name of readdirSync(DIST_ASSETS)) {
    const path = resolve(DIST_ASSETS, name)
    if (!statSync(path).isFile()) continue
    const buf = readFileSync(path)
    const kind: ChunkInfo['kind'] = name.endsWith('.js') ? 'js' : name.endsWith('.css') ? 'css' : 'other'
    out.push({
      filename: name,
      path,
      raw: buf.length,
      gz: gzipSync(buf).length,
      br: brotliCompressSync(buf).length,
      kind,
    })
  }
  return out
}

function findEagerPaths(): string[] {
  if (!existsSync(DIST_INDEX_HTML)) return []
  const html = readFileSync(DIST_INDEX_HTML, 'utf8')
  // Every modulepreload / script src / stylesheet href that points at /assets/
  const re = /(?:src|href)="([^"]+)"/g
  const paths = new Set<string>()
  for (const m of html.matchAll(re)) {
    if (m[1].startsWith('/assets/')) paths.add(m[1])
  }
  return [...paths]
}

export const bundleBench: BenchModule = {
  name: 'bundle',
  title: 'Bundle composition',
  description: 'Inspect dist/ — chunks, gzip/brotli sizes, eager first-paint payload, top heavies.',

  async run(): Promise<BenchResult> {
    if (!existsSync(DIST_ASSETS)) {
      log.warn('dist/assets/ not found — run `bun run build` first.')
      return {
        name: this.name,
        title: this.title,
        headline: { status: 'no build' },
        sections: [
          {
            title: 'Not run',
            rows: [{ label: 'dist/', metrics: { reason: 'dist/assets missing — run `bun run build` first.' } }],
          },
        ],
      }
    }

    const chunks = listChunks()
    const js = chunks.filter((c) => c.kind === 'js')
    const css = chunks.filter((c) => c.kind === 'css')

    const totals = (group: ChunkInfo[]): { raw: number; gz: number; br: number } => ({
      raw: group.reduce((s, c) => s + c.raw, 0),
      gz: group.reduce((s, c) => s + c.gz, 0),
      br: group.reduce((s, c) => s + c.br, 0),
    })
    const jsTotal = totals(js)
    const cssTotal = totals(css)

    // Eager paint = the set of chunks the browser pulls for the admin shell.
    const eagerPaths = findEagerPaths()
    const eagerChunks = chunks.filter((c) => eagerPaths.includes(`/assets/${c.filename}`))
    const eagerTotal = totals(eagerChunks)

    log.step(`dist/ scan: ${chunks.length} files (${js.length} js, ${css.length} css)`)
    log.step(`Eager first paint: ${fmtBytes(eagerTotal.raw)} raw / ${fmtBytes(eagerTotal.gz)} gzip`)

    const eagerRows: BenchRow[] = eagerChunks
      .sort((a, b) => b.raw - a.raw)
      .map((c) => ({
        label: c.filename,
        inputs: { kind: c.kind },
        metrics: {
          raw: fmtBytes(c.raw),
          gzip: fmtBytes(c.gz),
          brotli: fmtBytes(c.br),
        },
      }))
    eagerRows.push({
      label: 'TOTAL eager',
      inputs: {},
      metrics: {
        raw: fmtBytes(eagerTotal.raw),
        gzip: fmtBytes(eagerTotal.gz),
        brotli: fmtBytes(eagerTotal.br),
      },
      notes: 'Cost of opening any /admin route',
    })

    const topJsRows = js
      .sort((a, b) => b.raw - a.raw)
      .slice(0, 12)
      .map((c) => ({
        label: c.filename,
        metrics: {
          raw: fmtBytes(c.raw),
          gzip: fmtBytes(c.gz),
          brotli: fmtBytes(c.br),
          eager: eagerPaths.includes(`/assets/${c.filename}`) ? 'yes' : 'no',
        },
      }))

    const topCssRows = css
      .sort((a, b) => b.raw - a.raw)
      .slice(0, 8)
      .map((c) => ({
        label: c.filename,
        metrics: {
          raw: fmtBytes(c.raw),
          gzip: fmtBytes(c.gz),
          brotli: fmtBytes(c.br),
          eager: eagerPaths.includes(`/assets/${c.filename}`) ? 'yes' : 'no',
        },
      }))

    const totalsRows: BenchRow[] = [
      {
        label: 'JS (all chunks)',
        inputs: { files: js.length },
        metrics: { raw: fmtBytes(jsTotal.raw), gzip: fmtBytes(jsTotal.gz), brotli: fmtBytes(jsTotal.br) },
      },
      {
        label: 'CSS (all chunks)',
        inputs: { files: css.length },
        metrics: { raw: fmtBytes(cssTotal.raw), gzip: fmtBytes(cssTotal.gz), brotli: fmtBytes(cssTotal.br) },
      },
      {
        label: 'Eager first paint',
        inputs: { files: eagerChunks.length },
        metrics: { raw: fmtBytes(eagerTotal.raw), gzip: fmtBytes(eagerTotal.gz), brotli: fmtBytes(eagerTotal.br) },
      },
    ]

    return {
      name: this.name,
      title: this.title,
      headline: {
        'JS total (gz)': fmtBytes(jsTotal.gz),
        'CSS total (gz)': fmtBytes(cssTotal.gz),
        'Eager (gz)': fmtBytes(eagerTotal.gz),
      },
      sections: [
        {
          title: 'Totals',
          rows: totalsRows,
        },
        {
          title: 'Eager first-paint chunks',
          intro: 'These chunks are pulled on every admin first-paint. Anything here is "every visitor pays this" cost.',
          rows: eagerRows,
        },
        {
          title: 'Top 12 JS chunks (lazy + eager)',
          intro: 'Largest JS chunks by raw bytes. Lazy chunks are fine; eager chunks add to first-paint cost.',
          rows: topJsRows,
        },
        {
          title: 'Top 8 CSS chunks',
          rows: topCssRows,
        },
      ],
    }
  },
}
