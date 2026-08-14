/**
 * HTTP latency + throughput benchmark.
 *
 * Spawns a production-mode Bun server on a free port (or uses the
 * caller-provided `--base-url`), then hammers a fixed set of endpoints
 * with both sequential and concurrent load.
 *
 * Endpoints exercised:
 *   - `/health`         — liveness ping, no DB, no auth
 *   - `/admin`          — HTML shell (static, no DB but more parsing)
 *   - `/assets/*.js`    — biggest first-paint JS chunk
 *   - `/assets/*.css`   — eager CSS
 *
 * Concurrent levels: c=1, 4, 16, 64. Higher concurrencies surface
 * contention in the event loop / GC; the cliff is informative.
 */
import { resolve } from 'node:path'
import { readFileSync, existsSync } from 'node:fs'
import { performance } from 'node:perf_hooks'
import type { BenchModule, BenchResult, BenchRow, BenchContext } from '../lib/types'
import { summarize, fmtMs, fmtNum } from '../lib/stats'
import { log } from '../lib/log'
import { startServer, type ServerHandle } from '../lib/server'

const REPO_ROOT = resolve(import.meta.dir, '../../..')
const DIST_INDEX_HTML = resolve(REPO_ROOT, 'dist/index.html')

interface Endpoint {
  label: string
  path: string
}

function readEagerEndpoints(): Endpoint[] {
  if (!existsSync(DIST_INDEX_HTML)) {
    return []
  }
  const html = readFileSync(DIST_INDEX_HTML, 'utf8')
  const find = (re: RegExp): string => html.match(re)?.[0] ?? ''
  const eager: Endpoint[] = []
  const indexJs = find(/\/assets\/index-[A-Za-z0-9_-]+\.js/)
  const indexCss = find(/\/assets\/index-[A-Za-z0-9_-]+\.css/)
  const reactVendor = find(/\/assets\/react-vendor-[A-Za-z0-9_-]+\.js/)
  if (indexJs) eager.push({ label: indexJs, path: indexJs })
  if (indexCss) eager.push({ label: indexCss, path: indexCss })
  if (reactVendor) eager.push({ label: reactVendor, path: reactVendor })
  return eager
}

async function sequential(baseUrl: string, ep: Endpoint, n: number): Promise<{ samples: number[]; lastStatus: number; bytes: number }> {
  // warmup
  for (let i = 0; i < Math.min(5, n); i++) {
    const r = await fetch(`${baseUrl}${ep.path}`)
    await r.arrayBuffer()
  }
  const samples: number[] = []
  let lastStatus = 0
  let bytes = 0
  for (let i = 0; i < n; i++) {
    const t0 = performance.now()
    const res = await fetch(`${baseUrl}${ep.path}`)
    const buf = await res.arrayBuffer()
    samples.push(performance.now() - t0)
    lastStatus = res.status
    bytes = buf.byteLength
  }
  return { samples, lastStatus, bytes }
}

async function concurrent(baseUrl: string, ep: Endpoint, total: number, concurrency: number): Promise<{ samples: number[]; wallMs: number }> {
  // warmup
  for (let i = 0; i < 5; i++) await fetch(`${baseUrl}${ep.path}`).then((r) => r.arrayBuffer())
  const samples: number[] = []
  let i = 0
  const t0 = performance.now()
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (true) {
        const my = i++
        if (my >= total) return
        const start = performance.now()
        const res = await fetch(`${baseUrl}${ep.path}`)
        await res.arrayBuffer()
        samples.push(performance.now() - start)
      }
    }),
  )
  const wallMs = performance.now() - t0
  return { samples, wallMs }
}

export const httpBench: BenchModule = {
  name: 'http',
  title: 'HTTP latency + throughput',
  description: 'Sequential latency and concurrent throughput on /health, /admin, static assets. Auto-manages the prod server lifecycle.',

  async run(ctx: BenchContext): Promise<BenchResult> {
    let server: ServerHandle | null = null
    let baseUrl: string
    let bootMs = 0
    let bootRssMb: number | null = null
    let liveRssMb: number | null = null

    if (ctx.baseUrl) {
      baseUrl = ctx.baseUrl
      log.step(`Using external server at ${baseUrl}`)
      const probe = await fetch(`${baseUrl}/health`).catch(() => null)
      if (!probe || !probe.ok) throw new Error(`Server at ${baseUrl}/health did not respond OK`)
    } else {
      const staticDir = existsSync(resolve(REPO_ROOT, 'dist')) ? resolve(REPO_ROOT, 'dist') : undefined
      log.step('Spawning production server on a free port' + (staticDir ? ' (with STATIC_DIR=./dist)' : ' (no STATIC_DIR — static asset bench skipped)'))
      server = await startServer({ staticDir })
      baseUrl = server.baseUrl
      bootMs = server.bootMs
      bootRssMb = server.readRssMb()
      log.ok(`Server up in ${fmtMs(bootMs)} at ${baseUrl}`)
    }

    try {
      const baseEndpoints: Endpoint[] = [
        { label: '/health', path: '/health' },
        { label: '/admin', path: '/admin' },
        { label: '/admin/site', path: '/admin/site' },
      ]
      const eager = readEagerEndpoints()
      const endpoints = [...baseEndpoints, ...eager]

      // ---- Sequential latency ------------------------------------------
      const N = ctx.quick ? 30 : 100
      const seqRows: BenchRow[] = []
      for (const ep of endpoints) {
        const { samples, lastStatus, bytes } = await sequential(baseUrl, ep, N)
        const s = summarize(samples)
        seqRows.push({
          label: ep.label,
          inputs: { status: lastStatus, body_bytes: bytes },
          metrics: {
            mean: fmtMs(s.mean),
            p50: fmtMs(s.p50),
            p95: fmtMs(s.p95),
            p99: fmtMs(s.p99),
            max: fmtMs(s.max),
            seq_rps: fmtNum(Math.floor(1000 / s.mean)),
          },
        })
      }

      // ---- Concurrent throughput ---------------------------------------
      const concRows: BenchRow[] = []
      const concurrencyLevels = ctx.quick ? [4, 32] : [1, 4, 16, 64]
      const concEndpoints: Endpoint[] = [
        { label: '/health', path: '/health' },
        { label: '/admin', path: '/admin' },
        ...(eager[0] ? [eager[0]] : []),
      ]
      const total = ctx.quick ? 1000 : 3000
      for (const ep of concEndpoints) {
        for (const c of concurrencyLevels) {
          const { samples, wallMs } = await concurrent(baseUrl, ep, total, c)
          const s = summarize(samples)
          concRows.push({
            label: `${ep.label}  c=${c}`,
            inputs: { concurrency: c, total },
            metrics: {
              rps: fmtNum(Math.floor((total / wallMs) * 1000)),
              mean: fmtMs(s.mean),
              p50: fmtMs(s.p50),
              p95: fmtMs(s.p95),
              p99: fmtMs(s.p99),
              max: fmtMs(s.max),
            },
          })
        }
      }

      if (server) liveRssMb = server.readRssMb()

      const memRows: BenchRow[] = []
      if (server) {
        memRows.push({
          label: 'Server process',
          metrics: {
            boot_to_healthy: fmtMs(bootMs),
            rss_at_boot: bootRssMb !== null ? `${bootRssMb.toFixed(1)} MB` : '—',
            rss_after_load: liveRssMb !== null ? `${liveRssMb.toFixed(1)} MB` : '—',
          },
        })
      }

      const healthRow = seqRows.find((r) => r.label === '/health')
      // Pick the highest concurrency we actually tested for /admin
      const adminConcRows = concRows.filter((r) => r.label.startsWith('/admin  c='))
      const adminConc = adminConcRows[adminConcRows.length - 1] ?? null
      const adminConcLabel = adminConc
        ? `/admin rps (${adminConc.label.split('  ')[1]})`
        : '/admin rps'

      return {
        name: this.name,
        title: this.title,
        headline: {
          'cold start': server ? fmtMs(bootMs) : 'external',
          '/health p99 (seq)': healthRow?.metrics.p99 ?? '—',
          [adminConcLabel]: adminConc?.metrics.rps ?? '—',
        },
        sections: [
          ...(memRows.length
            ? [
                {
                  title: 'Server process resource usage',
                  rows: memRows,
                },
              ]
            : []),
          {
            title: 'Sequential latency (single connection)',
            intro: `${N} sequential requests per endpoint, warm. Surfaces per-request CPU + parsing overhead.`,
            rows: seqRows,
          },
          {
            title: 'Concurrent throughput',
            intro: `${total} requests at varying concurrency. Watch the rps curve: linear = headroom, flat = saturation.`,
            rows: concRows,
          },
        ],
      }
    } finally {
      if (server) await server.stop()
    }
  },
}
